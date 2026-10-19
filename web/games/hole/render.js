// Renderer, lights, sky/env, sea, ground platform, camera rig.
import * as THREE from 'three';
import { CITY, THEME } from './config.js';
import { groundMaterial, U } from './materials.js';

export const R = { renderer: null, scene: null, camera: null, sun: null, hemi: null, water: null, ground: null, pr: 1, quality: 'high', camD: 40, camTarget: new THREE.Vector3(), shake: 0, pitchTan: 1 };
const FOG_COL = new THREE.Color('#bfe0ee');
const SKY_U = { top: { value: new THREE.Vector3(0.32, 0.58, 0.95) }, hor: { value: new THREE.Vector3(1.0, 0.92, 0.82) }, sun: { value: new THREE.Vector3(1.0, 0.85, 0.6) }, dir: { value: new THREE.Vector3(-0.45, 0.6, 0.55) } };
let PM = null, ENV_SCENE = null;

export function initRender(canvas, quality) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance', stencil: false });
  R.quality = quality;
  R.pr = Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1.25 : 2);
  renderer.setPixelRatio(R.pr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  R.renderer = renderer;
  const scene = new THREE.Scene(); R.scene = scene;
  scene.background = FOG_COL.clone();
  scene.fog = new THREE.Fog(FOG_COL.clone(), 120, 400);
  R.camera = new THREE.PerspectiveCamera(CAM.FOV, window.innerWidth / window.innerHeight, 1, 1500);
  // lights
  R.hemi = new THREE.HemisphereLight('#cfe4ff', '#c9a27a', 0.95); scene.add(R.hemi);
  const sun = new THREE.DirectionalLight('#ffdcae', 3.9);
  sun.castShadow = true;
  const sm = quality === 'low' ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 900;
  scene.add(sun); scene.add(sun.target); R.sun = sun;
  // environment for glossy materials: gradient sky (rebuilt per theme)
  PM = new THREE.PMREMGenerator(renderer);
  ENV_SCENE = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uTop: SKY_U.top, uHor: SKY_U.hor, uSun: SKY_U.sun, uDir: SKY_U.dir },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uSun; uniform vec3 uDir;
      void main(){ vec3 d = normalize(vP); float h = d.y;
      vec3 gnd = vec3(0.55,0.5,0.45);
      vec3 c = h > 0.0 ? mix(uHor, uTop, pow(h, 0.6)) : mix(uHor, gnd, pow(-h, 0.4));
      vec3 sd = normalize(uDir); c += uSun * pow(max(dot(d, sd), 0.0), 64.0) * 6.0;
      gl_FragColor = vec4(c, 1.0); }`,
  }));
  ENV_SCENE.add(sky);
  scene.environmentIntensity = 0.55;
  buildGround(scene);
  buildWater(scene);
  applyRenderTheme(THEME.cur);
  return R;
}

// Retint the whole world for the selected map.
export function applyRenderTheme(t) {
  SKY_U.top.value.fromArray(t.sky.top); SKY_U.hor.value.fromArray(t.sky.hor); SKY_U.sun.value.fromArray(t.sky.sun);
  SKY_U.dir.value.fromArray(t.sunDir).normalize();
  R.sunDir = t.sunDir;
  FOG_COL.set(t.fog);
  R.scene.background.set(t.fog); R.scene.fog.color.set(t.fog);
  R.sun.color.set(t.sun); R.sun.intensity = t.sunI;
  R.hemi.color.set(t.hemiSky); R.hemi.groundColor.set(t.hemiGnd); R.hemi.intensity = t.hemiI;
  R.renderer.toneMappingExposure = t.exposure;
  const wu = R.water.material.uniforms;
  wu.uShallow.value.fromArray(t.water.shallow); wu.uDeep.value.fromArray(t.water.deep); wu.uFog.value.copy(FOG_COL);
  U.uGrassA.value.fromArray(t.grass[0]); U.uGrassB.value.fromArray(t.grass[1]);
  if (R.grade && R.gradeU) { R.gradeU.uSat.value = t.grade.sat; R.gradeU.uCon.value = t.grade.con; R.gradeU.uTint.value.fromArray(t.grade.tint); }
  if (R.env) R.env.dispose();
  R.env = PM.fromScene(ENV_SCENE, 0.02);
  R.scene.environment = R.env.texture;
}

function buildGround(scene) {
  const gm = groundMaterial();
  const H = CITY.HALF;
  // platform (roads level y=0, sea wall sides)
  const plat = new THREE.Mesh(new THREE.BoxGeometry(H * 2, 3.2, H * 2, 1, 1, 1), gm);
  plat.position.y = -1.6; plat.receiveShadow = true; scene.add(plat);
  // raised blocks + promenade strips
  const slabs = [];
  for (let j = 0; j < CITY.NZ; j++) for (let i = 0; i < CITY.NX; i++) {
    const x = CITY.X0 + i * CITY.PITCH + CITY.ROAD + CITY.BLOCK / 2, z = CITY.X0 + j * CITY.PITCH + CITY.ROAD + CITY.BLOCK / 2;
    slabs.push([x, z, CITY.BLOCK, CITY.BLOCK]);
  }
  const S = CITY.SPAN / 2, Bw = H - S;
  slabs.push([0, -(S + Bw / 2), H * 2, Bw], [0, S + Bw / 2, H * 2, Bw], [-(S + Bw / 2), 0, Bw, S * 2], [S + Bw / 2, 0, Bw, S * 2]);
  const sg = new THREE.BoxGeometry(1, CITY.CURB_H, 1); sg.translate(0, CITY.CURB_H / 2, 0);
  const inst = new THREE.InstancedMesh(sg, gm, slabs.length);
  const m = new THREE.Matrix4();
  slabs.forEach(([x, z, w, d], k) => { m.makeScale(w, 1, d); m.setPosition(x, 0, z); inst.setMatrixAt(k, m); });
  inst.receiveShadow = true; inst.frustumCulled = false; scene.add(inst);
  R.ground = { plat, inst, gm };
}

function buildWater(scene) {
  const g = new THREE.PlaneGeometry(3000, 3000, 1, 1); g.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uHalf: { value: CITY.HALF }, uFog: { value: FOG_COL.clone() }, uFogNear: { value: 100 }, uFogFar: { value: 400 }, uCam: { value: new THREE.Vector3() }, uShallow: { value: new THREE.Vector3(0.30, 0.80, 0.82) }, uDeep: { value: new THREE.Vector3(0.08, 0.45, 0.68) } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: `uniform float uTime; uniform float uHalf; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar; uniform vec3 uCam; uniform vec3 uShallow; uniform vec3 uDeep; varying vec3 vW;
      float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h12(i),h12(i+vec2(1,0)),f.x),mix(h12(i+vec2(0,1)),h12(i+vec2(1,1)),f.x),f.y); }
      void main(){
        vec2 p = vW.xz;
        float e = max(abs(p.x), abs(p.y)) - uHalf;   // distance from the sea wall
        if (e < -0.05) discard;
        vec3 c = mix(uShallow, uDeep, smoothstep(0.0, 60.0, e));
        float w1 = vn(p*0.18 + vec2(uTime*0.25, uTime*0.1)), w2 = vn(p*0.42 - vec2(uTime*0.18, -uTime*0.3));
        float waves = w1*0.6 + w2*0.4;
        c *= 0.9 + 0.2*waves;
        // caustic-like light lines
        float cl = smoothstep(0.46, 0.5, abs(fract(waves*4.0) - 0.5));
        c += cl * 0.05;
        // sparkles
        vec2 sc = p*0.9; vec2 sf = fract(sc) - 0.5; float sp = step(0.992, h12(floor(sc) + floor(uTime*1.5))) * smoothstep(0.2, 0.0, length(sf)) * smoothstep(0.55, 0.75, waves);
        c += sp * 0.45;
        // foam at the wall
        float foam = smoothstep(2.2, 0.0, e + (w2 - 0.5)*1.5);
        foam += smoothstep(0.6, 0.0, abs(e - 3.5 - sin(uTime*1.2 + p.x*0.05 + p.y*0.05)*0.8)) * 0.35;
        c = mix(c, vec3(0.97,0.99,1.0), clamp(foam, 0., 1.) * 0.85);
        float dist = length(vW - uCam);
        c = mix(c, uFog, smoothstep(uFogNear, uFogFar, dist));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const w = new THREE.Mesh(g, mat); w.position.y = -1.1; scene.add(w); R.water = w;
}

// Camera framing for a hole of radius r at (x,z).
// Deliberately close and wide-angle: the pit has to own the frame and the perspective has to be
// strong enough that you read building FRONTS and parallax, not a flat plan view of rooftops.
export const CAM = { FOV: 56, PITCH: 45, BASE: 13.5, PER_D: 3.05, PULL: 0 };
export function frameCamera(x, z, r, dt, snap = false) {
  const cam = R.camera; const aspect = cam.aspect;
  const land = aspect > 1;
  // Visible ground width at the focus point. The hole's diameter is ~20% of the screen at LV1 and
  // creeps to ~31% at max size: close enough to read building fronts, never so close that the pit
  // swallows the frame (critic fix 4).
  const want = (CAM.BASE + Math.max(0, 2 * r - 2.32) * CAM.PER_D) * (land ? 1.9 : 1) * (1 + CAM.PULL);
  const vf = THREE.MathUtils.degToRad(cam.fov);
  const hf = 2 * Math.atan(Math.tan(vf / 2) * Math.min(1, aspect));
  const D = want / (2 * Math.tan(hf / 2));
  R.camD = snap ? D : R.camD + (D - R.camD) * Math.min(1, dt * 1.8);
  const reach = want * (land ? 1.1 : 2.4);
  const climX = Math.max(0, CITY.HALF - want * 0.5), climZ = Math.max(0, CITY.HALF - reach * 0.35);
  const tx = Math.max(-climX, Math.min(climX, x)), tz = Math.max(-climZ, Math.min(climZ, z - r * 0.5 - 1.2));
  if (snap) R.camTarget.set(tx, 0, tz); else { const k = Math.min(1, dt * 6); R.camTarget.x += (tx - R.camTarget.x) * k; R.camTarget.z += (tz - R.camTarget.z) * k; }
  const pitch = THREE.MathUtils.degToRad(R.pitch ?? CAM.PITCH);
  R.pitchTan = Math.tan(pitch);
  const d = R.camD;
  let sx = 0, sy = 0;
  if (R.shake > 0) { sx = (Math.random() - 0.5) * R.shake * d * 0.03; sy = (Math.random() - 0.5) * R.shake * d * 0.03; R.shake = Math.max(0, R.shake - dt * 2.5); }
  cam.position.set(R.camTarget.x + sx, Math.sin(pitch) * d + sy, R.camTarget.z + Math.cos(pitch) * d);
  cam.lookAt(R.camTarget.x + sx, 0, R.camTarget.z);
  cam.near = Math.max(0.35, d * 0.035); cam.far = d * 14 + 400; cam.updateProjectionMatrix();
  // fog + shadows follow the zoom
  R.scene.fog.near = d * 2.6; R.scene.fog.far = d * 9.5;
  const wu = R.water.material.uniforms; wu.uFogNear.value = R.scene.fog.near; wu.uFogFar.value = R.scene.fog.far; wu.uCam.value.copy(cam.position);
  const sun = R.sun; const ext = d * 1.5 + 24;
  const sd = R.sunDir || [-0.45, 0.68, 0.5];
  sun.target.position.set(R.camTarget.x, 0, R.camTarget.z - d * 0.35);
  sun.position.set(sun.target.position.x + sd[0] * 190, sd[1] * 190, sun.target.position.z + sd[2] * 190);
  const sc = sun.shadow.camera;
  if (Math.abs(sc.right - ext) > 0.5) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix(); }
}

export function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  R.renderer.setSize(w, h, false); R.camera.aspect = w / h; R.camera.updateProjectionMatrix();
}

// Ground footprint (AABB) of the camera frustum
const _ray = new THREE.Vector3(), _ndc = new THREE.Vector3();
export function viewBounds(out) {
  const cam = R.camera; cam.updateMatrixWorld(); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const [nx, ny] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    _ndc.set(nx, ny, 0.5).unproject(cam); _ray.copy(_ndc).sub(cam.position).normalize();
    let t = _ray.y < -0.05 ? -cam.position.y / _ray.y : 600;
    t = Math.min(t, 600);
    const x = cam.position.x + _ray.x * t, z = cam.position.z + _ray.z * t;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  out.x0 = x0 - 4; out.x1 = x1 + 4; out.z0 = z0 - 4; out.z1 = z1 + 4;
  return out;
}

// ---- colour grade pass (High quality): MSAA render target -> saturation/contrast/warmth -> ACES -> sRGB
let gradeRT = null, gradeScene = null, gradeCam = null;
export function setupGrade(on) {
  R.grade = on;
  if (!on) return;
  const sz = new THREE.Vector2(); R.renderer.getDrawingBufferSize(sz);
  if (!gradeRT) {
    gradeRT = new THREE.WebGLRenderTarget(sz.x, sz.y, { type: THREE.HalfFloatType, samples: 4 });
    gradeScene = new THREE.Scene(); gradeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const t = THEME.cur;
    const u = { tDiffuse: { value: gradeRT.texture }, uSat: { value: t.grade.sat }, uCon: { value: t.grade.con }, uTint: { value: new THREE.Vector3().fromArray(t.grade.tint) } };
    R.gradeU = u;
    const m = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uSat; uniform float uCon; uniform vec3 uTint; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(l), c, uSat);
          c = max(vec3(0.0), (c - 0.18) * uCon + 0.18);
          c *= uTint;
          // gentle corner darkening keeps the eye on the pit
          vec2 q = vUv - 0.5;
          c *= 1.0 - 0.26 * dot(q, q) * 1.6;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      depthTest: false, depthWrite: false,
    });
    m.toneMapped = true;
    gradeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m));
  } else gradeRT.setSize(sz.x, sz.y);
}
// Compile every program up-front so the first frames of a round never hitch.
export function precompile() {
  try {
    R.renderer.compile(R.scene, R.camera);
    if (R.grade && gradeRT) { R.renderer.setRenderTarget(gradeRT); R.renderer.compile(gradeScene, gradeCam); R.renderer.setRenderTarget(null); }
  } catch (e) { /* compile is a hint, never fatal */ }
}
export function renderFrame() {
  const r = R.renderer;
  if (!R.grade || !gradeRT) { r.render(R.scene, R.camera); return; }
  const sz = new THREE.Vector2(); r.getDrawingBufferSize(sz);
  if (gradeRT.width !== sz.x || gradeRT.height !== sz.y) gradeRT.setSize(sz.x, sz.y);
  r.setRenderTarget(gradeRT); r.render(R.scene, R.camera);
  r.setRenderTarget(null); r.render(gradeScene, gradeCam);
}
