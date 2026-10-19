import * as THREE from 'three';
import { initRender, applyTod, renderFrame, R, followShadow } from './render.js';
import { initMaterials, updateGlow } from './materials.js';
import { World } from './world.js';
import { buildRider, buildSled, poseRider, buildYeti, poseYeti } from './character.js';
import { CHARACTERS, SLEDS } from './config.js';
const q = new URLSearchParams(location.search);
initRender(document.getElementById('gl'), 'high');
initMaterials();
applyTod(q.get('tod') || 'golden'); updateGlow();
const w = new World(R.scene); w.reset(+(q.get('seed') || 1));
const z = -(+(q.get('z') || 10));
w.update(z);
const ci = +(q.get('c') || 0);
const rig = buildRider(CHARACTERS[ci]); const sled = buildSled(SLEDS[+(q.get('s') || 0)]);
const P = new THREE.Group(); P.add(sled, rig.root); R.scene.add(P); P.position.set(0, 0, z);
const front = q.get('front');
poseRider(rig, { t: 1, lean: +(q.get('lean') || 0), speed: 20, idle: !!front, reset: true, air: q.get('air'), vy: 3, duck: +(q.get('duck') || 0) }, 0.016);
for (let i = 0; i < 20; i++) poseRider(rig, { t: 1 + i * 0.016, lean: +(q.get('lean') || 0), speed: 20, idle: !!front, air: q.get('air'), vy: 3, duck: +(q.get('duck') || 0) }, 0.016);
const y = buildYeti(); y.root.position.set(-2.1, 0, z + 2.5); R.scene.add(y.root); poseYeti(y, { t: 0.3 }, 0.016);
if (front) { R.camera.position.set(1.2, 1.6, z - 3.4); R.camera.lookAt(0, 0.9, z); }
else { R.camera.position.set(0, 4.4, z + 6.4); R.camera.lookAt(0, 0.9, z - 7); }
followShadow(0, z);
if (q.get('sunI')) R.sun.intensity = +q.get('sunI');
if (q.get('nosh')) R.sun.castShadow = false;
renderFrame(0.016);
window.__fps = 1;
