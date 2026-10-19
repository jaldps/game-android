// Renderer, lights, sky dome (gradient + sun + clouds), distant mountain rings, sea, post grade pass.
import * as THREE from 'three';
import { noiseTexture } from './textures.js';
import { makeNoise } from './rng.js';

export const R = { renderer: null, scene: null, camera: null, sun: null, hemi: null, quality: 'high', basePR: 1, prScale: 1, sky: null, mountains: [], sea: null, sunDir: new THREE.Vector3(), post: null, fx: { speed: 0, blur: 0, flash: 0, sat: 1.12, con: 1.06, warm: new THREE.Vector3(1.03, 1, 0.96), vig: 0.32 } };

export function initRender(canvas, quality) {
  R.quality = quality;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  R.basePR = Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1.25 : 2);
  renderer.setPixelRatio(R.basePR);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  R.renderer = renderer;
  R.scene = new THREE.Scene();
  R.camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.15, 5000);
  R.hemi = new THREE.HemisphereLight('#cfe4ff', '#5a6b3a', 1.0); R.scene.add(R.hemi);
  const sun = new THREE.DirectionalLight('#fff0d8', 3.4);
  sun.castShadow = true;
  const sm = quality === 'low' ? 1024 : 2048; sun.shadow.mapSize.set(sm, sm);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.035; sun.shadow.radius = 2.5;
  const sc = sun.shadow.camera; sc.near = 1; sc.far = 260; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34;
  R.scene.add(sun); R.scene.add(sun.target); R.sun = sun;
  setupPost();
  return R;
}

// ------------------------------------------------------------------ biome atmosphere
export function applyBiome(b, seed) {
  const s = R.scene;
  const fog = new THREE.Color(b.fog);
  s.fog = new THREE.Fog(fog, b.fogNear, b.fogFar);
  s.background = fog.clone();
  R.hemi.color.set(b.hemiSky); R.hemi.groundColor.set(b.hemiGnd); R.hemi.intensity = b.hemiI;
  R.sun.color.set(b.sun); R.sun.intensity = b.sunI;
  const el = THREE.MathUtils.degToRad(b.sunEl), az = THREE.MathUtils.degToRad(b.sunAz);
  R.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
  R.renderer.toneMappingExposure = b.exposure;
  // env map for glossy bike paint / helmets
  if (R.envRT) R.envRT.dispose();
  const pm = new THREE.PMREMGenerator(R.renderer);
  const es = new THREE.Scene();
  es.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMaterial(b, true)));
  R.envRT = pm.fromScene(es, 0.03); s.environment = R.envRT.texture; s.environmentIntensity = 0.6; pm.dispose();
  // sky dome
  if (R.sky) { s.remove(R.sky); R.sky.geometry.dispose(); R.sky.material.dispose(); }
  R.sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), skyMaterial(b, false));
  R.sky.renderOrder = -10; R.sky.frustumCulled = false; s.add(R.sky);
  // mountains
  for (const m of R.mountains) { s.remove(m); m.geometry.dispose(); m.material.dispose(); }
  R.mountains = buildMountains(b, seed);
  R.mountains.forEach(m => s.add(m));
  if (R.sea) { s.remove(R.sea); R.sea = null; }
  if (b.mountains === 'sea') { R.sea = buildSea(b); s.add(R.sea); }
  R.fx.sat = b.mountains === 'mesa' ? 1.1 : 1.14; R.fx.con = 1.07;
  R.fx.warm.set(...(b.mountains === 'mesa' ? [1.05, 1.0, 0.93] : b.mountains === 'hills' ? [1.05, 1.0, 0.94] : b.mountains === 'sea' ? [1.0, 1.0, 1.01] : [1.02, 1.0, 0.98]));
  if (R.post) { const u = R.post.mat.uniforms; u.uSat.value = R.fx.sat; u.uCon.value = R.fx.con; u.uWarm.value.copy(R.fx.warm); }
}

function skyMaterial(b, env) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color(b.skyTop) }, uHor: { value: new THREE.Color(b.skyHor) }, uGnd: { value: new THREE.Color(b.fog) }, uSun: { value: R.sunDir.clone() }, uSunCol: { value: new THREE.Color(b.sun) }, uClouds: { value: env ? 0 : b.clouds }, tNoise: { value: noiseTexture() }, uTime: { value: 0 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w*0.99999; }',
    fragmentShader: `uniform vec3 uTop, uHor, uGnd, uSun, uSunCol; uniform float uClouds, uTime; uniform sampler2D tNoise; varying vec3 vD;
      void main(){
        vec3 d = normalize(vD); float h = d.y;
        vec3 c = h > 0.0 ? mix(uHor, uTop, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uHor, uGnd, smoothstep(0.0, 0.08, -h));
        float sd = max(dot(d, normalize(uSun)), 0.0);
        c += uSunCol * (pow(sd, 6.0) * 0.18 + pow(sd, 60.0) * 0.5) * (0.6 + 0.4 * smoothstep(-0.05, 0.2, h));
        if (uClouds > 0.0 && h > 0.0) {
          vec2 p = d.xz / (h + 0.12) * 0.22 + vec2(uTime * 0.002, 0.0);
          float n = texture2D(tNoise, p).r * 0.6 + texture2D(tNoise, p * 2.7 + 0.3).r * 0.3 + texture2D(tNoise, p * 6.1).r * 0.1;
          float cl = smoothstep(0.62 - uClouds * 0.28, 0.85, n) * smoothstep(0.0, 0.25, h);
          vec3 cc = mix(vec3(1.0), uSunCol, 0.25) * (0.85 + 0.25 * sd) - vec3(0.12) * smoothstep(0.75, 0.95, n);
          c = mix(c, cc, cl * 0.85);
        }
        c += uSunCol * pow(sd, 900.0) * 6.0; // sun disc
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

function buildMountains(b, seed) {
  const N = makeNoise(seed * 5 + 9); const out = [];
  const layers = b.mountains === 'sea' ? [[2600, 0.9, 120]] : [[1500, 0.55, 1], [2200, 0.75, 1], [3100, 0.88, 1]];
  layers.forEach(([rad, haze], li) => {
    const seg = 320, g = new THREE.BufferGeometry(); const pos = [], hf = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * Math.PI * 2; const cx = Math.cos(a) * 3, cz = Math.sin(a) * 3;
      let h;
      if (b.mountains === 'alpine') h = 260 + 520 * Math.pow(N.ridge(cx + li * 7, cz, 5), 2.2) * (0.6 + 0.4 * N.n2(cx * 0.5 + li, cz * 0.5));
      else if (b.mountains === 'mesa') { const v = N.fbm(cx * 1.3 + li * 5, cz * 1.3, 4); h = 70 + 260 * (v > 0.05 ? 0.75 + 0.1 * N.n2(cx * 5, cz * 5) : Math.max(0, (v + 0.25) * 2.2) * 0.75); }
      else if (b.mountains === 'hills') h = 130 + 260 * (0.5 + 0.5 * N.fbm(cx * 0.9 + li * 3, cz * 0.9, 4));
      else h = Math.max(0, N.fbm(cx * 2.2, cz * 2.2, 4) - 0.18) * 520;
      h *= rad / 2200;
      pos.push(Math.cos(a) * rad, -500, Math.sin(a) * rad, Math.cos(a) * rad, h, Math.sin(a) * rad);
      hf.push(0, h / (rad / 2200) / 700, 0, h / (rad / 2200) / 700);
      if (i < seg) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('hf', new THREE.Float32BufferAttribute(hf, 2)); g.setIndex(idx);
    const rock = b.mountains === 'mesa' ? '#b65a34' : b.mountains === 'hills' ? '#7a6a48' : b.mountains === 'sea' ? '#8a8a70' : '#5a6a7a';
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
      fog: false, side: THREE.DoubleSide, depthWrite: true,
      uniforms: { uRock: { value: new THREE.Color(rock) }, uHaze: { value: new THREE.Color(b.skyHor) }, uFog: { value: new THREE.Color(b.fog) }, uK: { value: haze }, uSnow: { value: b.mountains === 'alpine' ? 1 : 0 }, uMesa: { value: b.mountains === 'mesa' ? 1 : 0 }, uSun: { value: R.sunDir.clone() }, tNoise: { value: noiseTexture() } },
      vertexShader: 'attribute vec2 hf; varying float vH; varying float vY; varying vec3 vP; void main(){ vH = hf.y; vec4 w = modelMatrix*vec4(position,1.0); vP = position; vY = position.y; vec4 p = viewMatrix*w; gl_Position = projectionMatrix*p; gl_Position.z = min(gl_Position.z, gl_Position.w*0.99998); }',
      fragmentShader: `uniform vec3 uRock, uHaze, uFog, uSun; uniform float uK, uSnow, uMesa; uniform sampler2D tNoise; varying float vH; varying float vY; varying vec3 vP;
        void main(){
          vec2 q = vec2(atan(vP.z, vP.x) * 40.0, vY * 0.02);
          float n = texture2D(tNoise, q * vec2(0.05, 0.4)).r;
          float n2 = texture2D(tNoise, q * vec2(0.25, 1.6)).r;
          vec3 c = uRock * (0.75 + 0.5 * n2);
          float ridge = n2 - 0.5;
          float lit = 0.75 + 0.5 * ridge * (dot(normalize(vec3(vP.x, 0.0, vP.z)), -uSun) * -0.6 + 0.6);
          c *= lit;
          if (uSnow > 0.5) { float sn = smoothstep(0.55, 0.62, vH + (n - 0.5) * 0.25 + ridge * 0.15); c = mix(c, vec3(0.93, 0.95, 1.0) * (0.85 + 0.25 * n2), sn); }
          if (uMesa > 0.5) { float band = fract(vY * 0.025 + n * 0.3); c *= 0.85 + 0.25 * smoothstep(0.3, 0.6, band); }
          float hz = clamp(uK + (1.0 - uK) * (1.0 - smoothstep(-40.0, 240.0, vY)) * 0.9, 0.0, 1.0);
          c = mix(c, uHaze, hz);
          c = mix(c, uFog, smoothstep(30.0, -120.0, vY));
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    m.frustumCulled = false; m.renderOrder = -5 + li; m.userData.layer = li;
    out.push(m);
  });
  return out;
}

function buildSea(b) {
  const g = new THREE.PlaneGeometry(9000, 9000, 1, 1); g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
    fog: false,
    uniforms: { uTime: { value: 0 }, uFog: { value: new THREE.Color(b.skyHor) }, uCam: { value: new THREE.Vector3() }, uSun: { value: R.sunDir.clone() }, tNoise: { value: noiseTexture() } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: `uniform float uTime; uniform vec3 uFog, uCam, uSun; uniform sampler2D tNoise; varying vec3 vW;
      void main(){
        vec2 p = vW.xz;
        float w1 = texture2D(tNoise, p * 0.004 + vec2(uTime * 0.004, 0.0)).r, w2 = texture2D(tNoise, p * 0.011 - vec2(0.0, uTime * 0.006)).r;
        vec3 deep = vec3(0.04, 0.27, 0.52), shal = vec3(0.12, 0.5, 0.68);
        vec3 c = mix(deep, shal, w1 * 0.6 + w2 * 0.4);
        vec3 v = normalize(vW - uCam); vec3 r = reflect(v, normalize(vec3((w1 - 0.5) * 0.25, 1.0, (w2 - 0.5) * 0.25)));
        c += vec3(1.0, 0.9, 0.7) * pow(max(dot(r, normalize(uSun)), 0.0), 60.0) * 1.5;
        float d = length(vW.xz - uCam.xz);
        c = mix(c, uFog, smoothstep(300.0, 3000.0, d));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  m.frustumCulled = false; m.renderOrder = -4;
  return m;
}

export function updateAtmosphere(cam, t) {
  if (R.sky) { R.sky.position.copy(cam.position); R.sky.material.uniforms.uTime.value = t; }
  for (const m of R.mountains) m.position.set(cam.position.x, cam.position.y - 160 - m.userData.layer * 40, cam.position.z);
  if (R.sea) { R.sea.material.uniforms.uTime.value = t; R.sea.material.uniforms.uCam.value.copy(cam.position); }
}
export function setSeaLevel(y) { if (R.sea) R.sea.position.y = y; }

/** keep the sun's shadow frustum tight around the focus point */
export function updateSun(focus) {
  const s = R.sun;
  s.target.position.copy(focus);
  s.position.copy(focus).addScaledVector(R.sunDir, 120);
  s.target.updateMatrixWorld();
}

// ------------------------------------------------------------------ post: MSAA HDR target -> grade, vignette, speed lines, radial blur -> ACES -> sRGB
function setupPost() {
  const sz = new THREE.Vector2(); R.renderer.getDrawingBufferSize(sz);
  const rt = new THREE.WebGLRenderTarget(sz.x, sz.y, { type: THREE.HalfFloatType, samples: R.quality === 'low' ? 0 : 4 });
  const mat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: rt.texture }, uSat: { value: 1.12 }, uCon: { value: 1.06 }, uWarm: { value: new THREE.Vector3(1.03, 1, 0.96) }, uVig: { value: 0.32 }, uSpeed: { value: 0 }, uBlur: { value: 0 }, uFlash: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 1 }, uFlashCol: { value: new THREE.Color(1, 1, 1) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uSat, uCon, uVig, uSpeed, uBlur, uFlash, uTime, uAspect; uniform vec3 uWarm, uFlashCol; varying vec2 vUv;
      float h1(float n){ return fract(sin(n) * 43758.5453); }
      void main(){
        vec2 cc = vec2(0.5, 0.56); vec2 dv = vUv - cc;
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        if (uBlur > 0.001) {
          float r = length(dv * vec2(uAspect, 1.0)); float k = uBlur * smoothstep(0.15, 0.7, r) * 0.06;
          c += texture2D(tDiffuse, vUv - dv * k).rgb + texture2D(tDiffuse, vUv - dv * k * 2.0).rgb + texture2D(tDiffuse, vUv - dv * k * 3.0).rgb;
          c *= 0.25;
        }
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, uSat);
        c = max(vec3(0.0), (c - 0.18) * uCon + 0.18);
        c *= uWarm;
        // speed lines
        if (uSpeed > 0.001) {
          vec2 p = dv * vec2(uAspect, 1.0); float ang = atan(p.y, p.x); float rad = length(p);
          float seg = floor(ang * 38.0); float rnd = h1(seg + floor(uTime * 14.0) * 7.13);
          float line = step(0.82, rnd) * smoothstep(0.32, 0.75, rad) * (1.0 - smoothstep(0.3, 0.5, abs(fract(ang * 38.0) - 0.5)));
          c = mix(c, vec3(1.0), line * uSpeed * 0.32);
        }
        float v = length(dv * vec2(uAspect * 0.9, 1.0));
        c *= 1.0 - uVig * smoothstep(0.35, 0.95, v);
        c = mix(c, uFlashCol, uFlash);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    depthTest: false, depthWrite: false,
  });
  mat.toneMapped = true;
  const scene = new THREE.Scene(); scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  R.post = { rt, mat, scene, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
}
const _sz = new THREE.Vector2();
export function renderFrame(t) {
  const r = R.renderer, P = R.post;
  r.getDrawingBufferSize(_sz);
  if (P.rt.width !== _sz.x || P.rt.height !== _sz.y) P.rt.setSize(_sz.x, _sz.y);
  const u = P.mat.uniforms; u.uSpeed.value = R.fx.speed; u.uBlur.value = R.fx.blur; u.uFlash.value = R.fx.flash; u.uTime.value = t; u.uAspect.value = _sz.x / _sz.y; u.uVig.value = R.fx.vig;
  r.setRenderTarget(P.rt); r.render(R.scene, R.camera);
  r.setRenderTarget(null); r.render(P.scene, P.cam);
}
export function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  R.renderer.setPixelRatio(R.basePR * R.prScale);
  R.renderer.setSize(w, h, false); R.camera.aspect = w / h; R.camera.updateProjectionMatrix();
}
// adaptive resolution
let ftAcc = 0, ftN = 0;
export function adaptResolution(dt, headless) {
  if (headless) return;
  ftAcc += dt; ftN++;
  if (ftN >= 45) {
    const ft = ftAcc / ftN; ftAcc = 0; ftN = 0;
    let s = R.prScale;
    if (ft > 1 / 42 && s > 0.6) s = Math.max(0.6, s - 0.1); else if (ft < 1 / 57 && s < 1) s = Math.min(1, s + 0.05);
    if (s !== R.prScale) { R.prScale = s; resize(); }
  }
}
