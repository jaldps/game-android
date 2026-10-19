// Renderer, curved-world shader injection, lights, sky dome, mountains, time-of-day palettes, post FX.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const R = { renderer: null, scene: null, camera: null, sun: null, hemi: null, composer: null, quality: 'high', pr: 1, tod: 'golden', shake: 0, t: 0 };
// curved world: y -= d^2*bend.y ; x += d^2*bend.x  where d = distance ahead of the camera
export const CURVE = { uCurve: { value: new THREE.Vector2(0, 0.0011) }, uCurveO: { value: new THREE.Vector3() } };
export const GLOW = { value: 1.0 };   // emissive multiplier (windows, bulbs) by time of day

const CURVE_PARS = 'uniform vec2 uCurve; uniform vec3 uCurveO;\n';
const CURVE_PROJECT = `
vec4 cvW = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  cvW = batchingMatrix * cvW;
#endif
#ifdef USE_INSTANCING
  cvW = instanceMatrix * cvW;
#endif
cvW = modelMatrix * cvW;
float cvD = max( uCurveO.z - cvW.z, 0.0 );
cvW.y -= cvD * cvD * uCurve.y;
cvW.x += cvD * cvD * uCurve.x;
vec4 mvPosition = viewMatrix * cvW;
gl_Position = projectionMatrix * mvPosition;
`;
export const CURVE_GLSL = { pars: CURVE_PARS, fn: `vec3 curveIt(vec3 w){ float d = max(uCurveO.z - w.z, 0.0); w.y -= d*d*uCurve.y; w.x += d*d*uCurve.x; return w; }` };

/** Patch a built-in material so it follows the curved world. extra(shader) may further edit it. */
export function curved(mat, extra) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    sh.uniforms.uCurve = CURVE.uCurve; sh.uniforms.uCurveO = CURVE.uCurveO;
    sh.vertexShader = CURVE_PARS + sh.vertexShader.replace('#include <project_vertex>', CURVE_PROJECT);
    if (extra) extra(sh, r);
  };
  mat.customProgramCacheKey = () => 'curved' + (extra ? extra.toString().length : '') + (mat.userData.key || '');
  return mat;
}

export const TODS = {
  day: {
    top: '#3f86de', mid: '#86bdf2', hor: '#e4f1ff', fog: '#d8eaff', fogN: 70, fogF: 230,
    sun: '#fff1dc', sunI: 3.1, sunDir: [-0.55, 0.85, 0.55], sunSky: [-0.3, 0.55, -0.8],
    hemiS: '#d4e8ff', hemiG: '#8fa9cf', hemiI: 1.35, glow: 0.55, exp: 1.0, stars: 0, moon: 0, sunDisc: 1.0, aur: 0,
    mtn: '#9fb9df', mtn2: '#c7d9f2', snowTint: '#ffffff',
  },
  golden: {
    top: '#3c5ea8', mid: '#e98a7b', hor: '#ffc988', fog: '#f6c9a2', fogN: 60, fogF: 220,
    sun: '#ffb873', sunI: 3.0, sunDir: [-0.65, 0.55, 0.45], sunSky: [0.25, 0.12, -0.96],
    hemiS: '#ffd9bf', hemiG: '#7d7fb8', hemiI: 1.25, glow: 1.0, exp: 1.0, stars: 0, moon: 0, sunDisc: 1.6, aur: 0,
    mtn: '#a77fa6', mtn2: '#e4a9a0', snowTint: '#fff4ea',
  },
  night: {
    top: '#081236', mid: '#1b3170', hor: '#3d5c9e', fog: '#2c4580', fogN: 55, fogF: 210,
    sun: '#a8c0ff', sunI: 1.25, sunDir: [-0.5, 0.8, 0.5], sunSky: [-0.35, 0.42, -0.84],
    hemiS: '#6f8ee0', hemiG: '#223064', hemiI: 1.15, glow: 2.1, exp: 1.1, stars: 1, moon: 1, sunDisc: 0, aur: 1,
    mtn: '#1d2d5e', mtn2: '#33508f', snowTint: '#dfe8ff',
  },
};

let sky, mtn, gradePass, bloomPass;
export function initRender(canvas, quality) {
  R.quality = quality;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  R.pr = Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1.25 : 2);
  renderer.setPixelRatio(R.pr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  R.renderer = renderer;
  const scene = new THREE.Scene(); R.scene = scene;
  scene.fog = new THREE.Fog('#ffffff', 60, 220);
  R.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.3, 1400);
  R.hemi = new THREE.HemisphereLight('#fff', '#888', 1); scene.add(R.hemi);
  const sun = new THREE.DirectionalLight('#fff', 3);
  sun.castShadow = true;
  const sm = quality === 'low' ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 2.5;
  const sc = sun.shadow.camera; sc.left = -15; sc.right = 15; sc.top = 26; sc.bottom = -16; sc.near = 1; sc.far = 120;
  scene.add(sun, sun.target); R.sun = sun;
  buildSky(scene); buildMountains(scene);
  setupPost();
  resize();
  return R;
}

function buildSky(scene) {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() }, sunCol: { value: new THREE.Color() }, sunDisc: { value: 1 }, stars: { value: 0 }, moon: { value: 0 }, aur: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 top, mid, hor, sunDir, sunCol; uniform float sunDisc, stars, moon, aur, uTime; varying vec3 vD;
      float h3(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); float a=h3(vec3(i,1.)), b=h3(vec3(i+vec2(1,0),1.)), c=h3(vec3(i+vec2(0,1),1.)), d=h3(vec3(i+vec2(1,1),1.)); return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
      void main(){
        vec3 d = normalize(vD); float h = d.y;
        vec3 c = h > 0.0 ? mix(hor, mid, smoothstep(0.0, 0.22, h)) : hor;
        c = mix(c, top, smoothstep(0.18, 0.75, h));
        float sd = max(dot(d, normalize(sunDir)), 0.0);
        c += sunCol * (pow(sd, 8.0) * 0.22 + pow(sd, 90.0) * 0.45) * sunDisc;
        c = mix(c, vec3(1.0, 0.97, 0.9) * 3.0, smoothstep(0.9986, 0.9992, sd) * sunDisc);
        // moon
        float md = dot(d, normalize(vec3(0.35, 0.33, -0.88)));
        float mdisc = smoothstep(0.99935, 0.9995, md);
        vec2 mq = d.xy*80.0; float crater = n2(mq*1.5)*0.25;
        c = mix(c, vec3(1.0, 0.98, 0.9) * (1.6 - crater), mdisc * moon);
        c += vec3(0.5, 0.6, 1.0) * pow(max(md, 0.0), 220.0) * 0.8 * moon + vec3(0.3,0.4,0.8)*pow(max(md,0.0),18.0)*0.12*moon;
        // stars
        if (stars > 0.0 && h > 0.02) {
          vec3 sp = d * 220.0; vec3 ip = floor(sp); float r = h3(ip);
          float tw = 0.6 + 0.4*sin(uTime*3.0 + r*40.0);
          float s = step(0.985, r) * smoothstep(0.42, 0.0, length(fract(sp) - 0.5)) * tw;
          c += vec3(0.9, 0.95, 1.0) * s * stars * smoothstep(0.02, 0.2, h) * 1.5;
        }
        // aurora ribbons
        if (aur > 0.0 && h > 0.05) {
          vec2 q = d.xz / (h + 0.25);
          float band = n2(vec2(q.x*1.3 + uTime*0.04, q.y*0.35)) ;
          float rib = smoothstep(0.35, 0.0, abs(band - 0.5 + 0.15*sin(q.x*2.0 + uTime*0.2)));
          float vert = smoothstep(0.05, 0.25, h) * smoothstep(0.7, 0.3, h);
          vec3 ac = mix(vec3(0.15, 1.0, 0.6), vec3(0.5, 0.3, 1.0), smoothstep(0.2, 0.6, h));
          c += ac * rib * vert * 0.35 * aur;
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), m);
  sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
}

// distant ridge silhouettes (two layers) on a band that follows the camera
function buildMountains(scene) {
  const segs = 220, pos = [], col = [], idx = [];
  const layers = [{ r: 720, h: 150, base: -140, seed: 1.3, k: 0 }, { r: 560, h: 105, base: -130, seed: 7.1, k: 1 }];
  const ridge = (x, s) => { let v = 0, a = 1, f = 1; for (let o = 0; o < 5; o++) { v += a * (1 - Math.abs(Math.sin(x * f * 2.3 + s * (o + 1) * 1.7) * Math.cos(x * f * 1.1 + s * 3.1 * o))); a *= 0.5; f *= 2.1; } return v / 1.9; };
  for (const L of layers) {
    const v0 = pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const a = -Math.PI * 0.62 + (i / segs) * Math.PI * 1.24; // arc in front (-Z)
      const x = Math.sin(a) * L.r, z = -Math.cos(a) * L.r;
      const hh = L.h * (0.35 + 0.65 * ridge(i / segs * 6 + L.seed, L.seed));
      pos.push(x, L.base, z, x, L.base + 140 + hh, z);
      col.push(L.k, 0, 0, L.k, 1, hh / L.h);
    }
    for (let i = 0; i < segs; i++) { const a = v0 + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    depthWrite: false, fog: false, transparent: false,
    uniforms: { cA: { value: new THREE.Color() }, cB: { value: new THREE.Color() }, fog: { value: new THREE.Color() }, sunCol: { value: new THREE.Color() } },
    vertexShader: 'attribute vec3 color; varying vec3 vC; varying vec3 vP; void main(){ vC = color; vP = position; vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; gl_Position.z = gl_Position.w*0.99999; }',
    fragmentShader: `uniform vec3 cA, cB, fog, sunCol; varying vec3 vC; varying vec3 vP;
      void main(){
        float layer = vC.x, t = vC.y;
        vec3 base = mix(cA, cB, layer*0.0 + 0.0);
        vec3 c = mix(cB, cA, layer);
        // snowcaps near the top of each ridge + streaks
        float cap = smoothstep(0.78, 0.95, t) ;
        float streak = smoothstep(0.55, 0.9, t) * (0.5 + 0.5*sin(vP.x*0.09 + vP.z*0.05));
        c = mix(c, mix(vec3(1.0), sunCol, 0.25), clamp(cap + streak*0.35, 0.0, 1.0) * (0.55 + 0.3*layer));
        // haze toward the base
        c = mix(fog, c, smoothstep(0.0, 0.85, t) * (0.55 + 0.35*layer));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  mtn = new THREE.Mesh(g, m); mtn.frustumCulled = false; mtn.renderOrder = -9; scene.add(mtn);
}

export function applyTod(name) {
  const T = TODS[name] || TODS.golden; R.tod = name; R.T = T;
  const u = sky.material.uniforms;
  u.top.value.set(T.top); u.mid.value.set(T.mid); u.hor.value.set(T.hor); u.sunDir.value.set(...T.sunSky).normalize(); u.sunCol.value.set(T.sun);
  u.sunDisc.value = T.sunDisc; u.stars.value = T.stars; u.moon.value = T.moon; u.aur.value = T.aur;
  const mu = mtn.material.uniforms; mu.cA.value.set(T.mtn); mu.cB.value.set(T.mtn2); mu.fog.value.set(T.fog); mu.sunCol.value.set(T.sun);
  R.scene.fog.color.set(T.fog); R.scene.fog.near = T.fogN; R.scene.fog.far = T.fogF;
  R.scene.background = new THREE.Color(T.hor);
  R.sun.color.set(T.sun); R.sun.intensity = T.sunI;
  R.hemi.color.set(T.hemiS); R.hemi.groundColor.set(T.hemiG); R.hemi.intensity = T.hemiI;
  R.renderer.toneMappingExposure = T.exp;
  GLOW.value = T.glow;
  if (bloomPass) { bloomPass.strength = name === 'night' ? 0.75 : name === 'golden' ? 0.5 : 0.32; bloomPass.threshold = name === 'night' ? 0.62 : 0.82; }
  if (gradePass) { gradePass.uniforms.uWarm.value = name === 'golden' ? 0.05 : name === 'night' ? -0.02 : 0.0; gradePass.uniforms.uSat.value = name === 'night' ? 1.12 : 1.18; }
  // environment map from the sky palette for glossy materials (ice, coins)
  const pm = new THREE.PMREMGenerator(R.renderer); const es = new THREE.Scene();
  const em = sky.material.clone(); em.uniforms = THREE.UniformsUtils.clone(sky.material.uniforms); em.uniforms.stars.value = 0;
  em.vertexShader = 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }';
  es.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), em));
  const lower = new THREE.Mesh(new THREE.SphereGeometry(9, 32, 16, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.48), new THREE.MeshBasicMaterial({ color: new THREE.Color(T.snowTint).multiplyScalar(name === 'night' ? 0.25 : 0.8), side: THREE.BackSide }));
  es.add(lower);
  if (R.scene.environment) R.scene.environment.dispose();
  R.scene.environment = pm.fromScene(es, 0.03).texture; R.scene.environmentIntensity = name === 'night' ? 0.6 : 0.85;
  pm.dispose(); em.dispose();
}

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uSat: { value: 1.18 }, uCon: { value: 1.05 }, uWarm: { value: 0.0 }, uVig: { value: 0.32 }, uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color(1, 1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uSat, uCon, uWarm, uVig, uFlash; uniform vec3 uFlashCol; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = max(vec3(0.0), (c - 0.18) * uCon + 0.18);
      c *= vec3(1.0 + uWarm, 1.0, 1.0 - uWarm);
      vec2 q = vUv - 0.5; q.x *= 0.8;
      c *= mix(1.0, smoothstep(0.85, 0.2, length(q)), uVig);
      c = mix(c, uFlashCol, uFlash);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

function setupPost() {
  const r = R.renderer;
  if (R.quality === 'low') { R.composer = null; return; }
  const sz = r.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(sz.x, sz.y, { type: THREE.HalfFloatType, samples: 4 });
  const comp = new EffectComposer(r, rt);
  comp.addPass(new RenderPass(R.scene, R.camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(sz.x / 2, sz.y / 2), 0.5, 0.55, 0.8);
  comp.addPass(bloomPass);
  gradePass = new ShaderPass(GradeShader); comp.addPass(gradePass);
  comp.addPass(new OutputPass());
  R.composer = comp; R.grade = gradePass;
}
export function setQuality(q) {
  R.quality = q;
  R.pr = Math.min(window.devicePixelRatio || 1, q === 'low' ? 1.25 : 2);
  R.renderer.setPixelRatio(R.pr);
  if (R.composer) { R.composer.dispose?.(); R.composer = null; }
  bloomPass = null; gradePass = null; R.grade = null;
  setupPost(); resize(); applyTod(R.tod);
}
export function flash(amount, col) { if (R.grade) { R.grade.uniforms.uFlash.value = amount; if (col) R.grade.uniforms.uFlashCol.value.set(col); } R.flash = amount; }

export function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  R.renderer.setSize(w, h, false);
  const cam = R.camera; cam.aspect = w / h;
  // keep the three lanes in view in portrait: derive vertical FOV from a target horizontal FOV
  const hf = THREE.MathUtils.degToRad(w < h ? 41 : 62);
  let vf = 2 * Math.atan(Math.tan(hf / 2) / cam.aspect);
  vf = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(vf), 48, 86);
  R.baseFov = vf; cam.fov = vf; cam.updateProjectionMatrix();
  if (R.composer) { R.composer.setPixelRatio(R.pr); R.composer.setSize(w, h); }
}

export function renderFrame(dt) {
  R.t += dt;
  sky.material.uniforms.uTime.value = R.t;
  const cam = R.camera;
  sky.position.copy(cam.position); mtn.position.set(cam.position.x * 0.9, 0, cam.position.z);
  CURVE.uCurveO.value.copy(cam.position);
  if (R.flash > 0) { R.flash = Math.max(0, R.flash - dt * 2.5); if (R.grade) R.grade.uniforms.uFlash.value = R.flash; }
  if (R.composer) R.composer.render(dt); else R.renderer.render(R.scene, cam);
}
export function followShadow(x, z) {
  const T = R.T || TODS.golden; const s = R.sun;
  s.target.position.set(x * 0.5, 0, z - 8);
  s.position.set(s.target.position.x + T.sunDir[0] * 50, T.sunDir[1] * 50, s.target.position.z + T.sunDir[2] * 50);
}
