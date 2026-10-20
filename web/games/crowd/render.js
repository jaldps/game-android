// Renderer, lights, environment, camera rig, colour-grade pass.
import * as THREE from 'three';
import { GRID } from './config.js';

export const R = { renderer: null, scene: null, camera: null, sun: null, hemi: null, pr: 1, quality: 'high', camD: 30, camTarget: new THREE.Vector3(), shake: 0, pitch: 52, yaw: 0, grade: false, gradeMat: null, sunDir: new THREE.Vector3(-0.5, 0.78, 0.38) };

export function initRender(canvas, quality) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === 'low', powerPreference: 'high-performance', stencil: false });
  R.quality = quality;
  R.pr = Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1.25 : 2);
  renderer.setPixelRatio(R.pr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;   // PCFSoft was removed in r186; asking for it only logs a warning
  R.renderer = renderer;
  const scene = new THREE.Scene(); R.scene = scene;
  scene.background = new THREE.Color('#d9ecf8');
  scene.fog = new THREE.Fog(new THREE.Color('#d9ecf8'), 120, 400);
  R.camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 1, 1500);
  R.hemi = new THREE.HemisphereLight('#dcecff', '#c8b9a6', 1.1); scene.add(R.hemi);
  const sun = new THREE.DirectionalLight('#fff1dc', 3.6);
  sun.castShadow = true;
  const sm = quality === 'low' ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05; sun.shadow.radius = 4;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 500;
  scene.add(sun); scene.add(sun.target); R.sun = sun;
  // fill light from the opposite side (cool), no shadows
  R.fill = new THREE.DirectionalLight('#cfe0ff', 0.55); R.fill.position.set(60, 40, -50); scene.add(R.fill);
  return R;
}

export function applyCityLook(P) {
  const s = R.scene;
  s.background = skyTexture(P.sky[0], P.sky[1]);
  s.fog.color.set(P.fog);
  R.hemi.color.set(P.hemiSky); R.hemi.groundColor.set(P.hemiGround); R.hemi.intensity = P.hemiI;
  R.sun.color.set(P.sun); R.sun.intensity = P.sunI;
  R.sunDir.set(...P.sunDir).normalize();
  R.renderer.toneMappingExposure = P.exposure;
  // environment for glossy bits
  const pm = new THREE.PMREMGenerator(R.renderer);
  const envScene = new THREE.Scene();
  const top = new THREE.Color(P.sky[0]), hor = new THREE.Color(P.sky[1]);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: { uTop: { value: top }, uHor: { value: hor }, uSun: { value: R.sunDir.clone() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uSun; varying vec3 vP; void main(){ vec3 d = normalize(vP); float h = d.y;
      vec3 c = h > 0.0 ? mix(uHor, uTop, pow(h, 0.6)) : mix(uHor, vec3(0.6,0.58,0.55), pow(-h, 0.5));
      c += vec3(1.0,0.9,0.7) * pow(max(dot(d, normalize(uSun)), 0.0), 48.0) * 5.0;
      gl_FragColor = vec4(c, 1.0); }`,
  }));
  envScene.add(sky);
  if (s.environment) s.environment.dispose();
  s.environment = pm.fromScene(envScene, 0.02).texture; s.environmentIntensity = 0.6;
  pm.dispose(); sky.geometry.dispose(); sky.material.dispose();
  if (R.gradeMat) { R.gradeMat.uniforms.uSat.value = P.sat; R.gradeMat.uniforms.uWarm.value.set(...P.warm); }
}

function skyTexture(a, b) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// camera framing: follow (x,z) with a view radius `rad` (world units visible across the short side)
export function frameCamera(x, y, z, want, dt, snap = false) {
  const cam = R.camera; const aspect = cam.aspect;
  const vf = THREE.MathUtils.degToRad(cam.fov);
  const hf = 2 * Math.atan(Math.tan(vf / 2) * Math.min(1, aspect));
  const D = want / (2 * Math.tan(hf / 2));
  R.camD = snap ? D : R.camD + (D - R.camD) * Math.min(1, dt * 1.6);
  const tz = z - 2.0; // look slightly ahead (crowd sits a bit below centre)
  if (snap) R.camTarget.set(x, y, tz); else { const k = Math.min(1, dt * 5); R.camTarget.x += (x - R.camTarget.x) * k; R.camTarget.y += (y - R.camTarget.y) * k * 0.5; R.camTarget.z += (tz - R.camTarget.z) * k; }
  const pitch = THREE.MathUtils.degToRad(R.pitch); const d = R.camD;
  let sx = 0, sy = 0;
  if (R.shake > 0) { sx = (Math.random() - 0.5) * R.shake * d * 0.01; sy = (Math.random() - 0.5) * R.shake * d * 0.01; R.shake = Math.max(0, R.shake - dt * 2.5); }
  const cy = Math.cos(R.yaw), syw = Math.sin(R.yaw);
  cam.position.set(R.camTarget.x + sx + Math.cos(pitch) * d * syw, R.camTarget.y + Math.sin(pitch) * d + sy, R.camTarget.z + Math.cos(pitch) * d * cy);
  cam.lookAt(R.camTarget.x + sx, R.camTarget.y, R.camTarget.z);
  // near MUST stay constant: a distance-scaled near plane slices foreground buildings open
  // with a hard horizontal seam across the frame. 0.6 .. ~900 is well within 24-bit depth.
  cam.near = 0.6; cam.far = d * 5 + 300; cam.updateProjectionMatrix();
  R.scene.fog.near = d * 1.6; R.scene.fog.far = d * 4.5 + 60;
  // shadow frustum follows the view
  const sun = R.sun; const ext = d * 0.72 + 12;
  sun.target.position.set(R.camTarget.x, 0, R.camTarget.z - d * 0.15);
  sun.position.copy(sun.target.position).addScaledVector(R.sunDir, 160);
  const sc = sun.shadow.camera;
  if (Math.abs(sc.right - ext) > 0.5) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix(); }
}

export function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  R.renderer.setSize(w, h, false); R.camera.aspect = w / h; R.camera.updateProjectionMatrix();
}

// ground-plane footprint of the camera frustum
const _ray = new THREE.Vector3(), _ndc = new THREE.Vector3();
export function viewBounds(out, pad = 3) {
  const cam = R.camera; cam.updateMatrixWorld(); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const [nx, ny] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    _ndc.set(nx, ny, 0.5).unproject(cam); _ray.copy(_ndc).sub(cam.position).normalize();
    let t = _ray.y < -0.05 ? -cam.position.y / _ray.y : 600; t = Math.min(t, 600);
    const x = cam.position.x + _ray.x * t, z = cam.position.z + _ray.z * t;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  out.x0 = x0 - pad; out.x1 = x1 + pad; out.z0 = z0 - pad - 4; out.z1 = z1 + pad; return out;
}

// colour grade: MSAA HalfFloat RT -> saturation / contrast / warmth / vignette -> ACES -> sRGB
let gradeRT = null, gradeScene = null, gradeCam = null;
const _sz = new THREE.Vector2();
export function setupGrade(on) {
  R.grade = on; if (!on) return;
  R.renderer.getDrawingBufferSize(_sz);
  if (!gradeRT) {
    gradeRT = new THREE.WebGLRenderTarget(_sz.x, _sz.y, { type: THREE.HalfFloatType, samples: 4 });
    gradeScene = new THREE.Scene(); gradeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const m = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: gradeRT.texture }, uSat: { value: 1.12 }, uCon: { value: 1.05 }, uWarm: { value: new THREE.Vector3(1.02, 1, 0.98) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uSat; uniform float uCon; uniform vec3 uWarm; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(l), c, uSat);
          c = max(vec3(0.0), (c - 0.18) * uCon + 0.18);
          c *= uWarm;
          vec2 q = vUv - 0.5; c *= 1.0 - 0.28*dot(q*vec2(1.2,0.9), q*vec2(1.2,0.9));
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      depthTest: false, depthWrite: false,
    });
    m.toneMapped = true; R.gradeMat = m;
    gradeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m));
  } else gradeRT.setSize(_sz.x, _sz.y);
}
export function renderFrame() {
  const r = R.renderer;
  if (!R.grade || !gradeRT) { r.render(R.scene, R.camera); return; }
  r.getDrawingBufferSize(_sz);
  if (gradeRT.width !== _sz.x || gradeRT.height !== _sz.y) gradeRT.setSize(_sz.x, _sz.y);
  r.setRenderTarget(gradeRT); r.render(R.scene, R.camera);
  r.setRenderTarget(null); r.render(gradeScene, gradeCam);
}
