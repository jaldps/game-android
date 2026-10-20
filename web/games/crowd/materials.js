// Materials: MeshStandardMaterial patched via onBeforeCompile.
//  ground — procedural streets / sidewalks / parks / plazas / rooftops / ramps with baked contact AO
//  facade — procedural building facades + roofs
//  paint  — vertex-coloured props with height AO and optional wind sway
//  people — instanced crowd: per-instance position/yaw/colour/anim, vertex-shader run cycle
import * as THREE from 'three';
import { GRID } from './config.js';

export const U = {
  uTime: { value: 0 },
  uTypes: { value: null },
  uAO: { value: null },
  uRoad: { value: new THREE.Color() }, uWalk: { value: new THREE.Color() }, uWalk2: { value: new THREE.Color() },
  uGrass: { value: new THREE.Color() }, uGrass2: { value: new THREE.Color() }, uPlazaA: { value: new THREE.Color() }, uPlazaB: { value: new THREE.Color() },
  uRoof: { value: new THREE.Color() }, uLine: { value: new THREE.Color() }, uLineY: { value: new THREE.Color() },
};
export function setPalette(c) {
  // palette values are authored in sRGB-ish 0..1 and converted in shader with pow 2.2
  U.uRoad.value.setRGB(...c.road); U.uWalk.value.setRGB(...c.walk); U.uWalk2.value.setRGB(...c.walk2);
  U.uGrass.value.setRGB(...c.grass); U.uGrass2.value.setRGB(...c.grass2); U.uPlazaA.value.setRGB(...c.plazaA); U.uPlazaB.value.setRGB(...c.plazaB);
  U.uRoof.value.setRGB(...c.roof); U.uLine.value.setRGB(...c.line); U.uLineY.value.setRGB(...c.lineY);
}

const f = n => (Math.round(n * 10000) / 10000).toFixed(4);
const TOTAL = GRID.SPAN + 2 * GRID.RING * GRID.PITCH;   // ground extent incl. decor ring
export const GROUND = { TOTAL, X0: -TOTAL / 2 };

const COMMON = /* glsl */`
uniform float uTime;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float hash13(vec3 p3){ p3 = fract(p3*.1031); p3 += dot(p3, p3.zyx+31.32); return fract((p3.x+p3.y)*p3.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1.,0.)),f.x),mix(hash12(i+vec2(0.,1.)),hash12(i+vec2(1.,1.)),f.x),f.y); }
float fbm(vec2 p){ return vnoise(p)*.5 + vnoise(p*2.03+7.1)*.3 + vnoise(p*4.11+3.7)*.2; }
float aaw(float x){ float w = fwidth(x); return min(w, 0.25); }
float band(float x, float a, float b){ float w = aaw(x)*0.75 + 1e-4; return smoothstep(a-w,a+w,x) - smoothstep(b-w,b+w,x); }
float box2(vec2 p, vec2 a, vec2 b){ return band(p.x,a.x,b.x)*band(p.y,a.y,b.y); }
`;

// ---------------- GROUND ----------------
const GROUND_FN = /* glsl */`
uniform sampler2D uTypes; uniform sampler2D uAO;
uniform vec3 uRoad, uWalk, uWalk2, uGrass, uGrass2, uPlazaA, uPlazaB, uRoof, uLine, uLineY;
#define PITCH ${f(GRID.PITCH)}
#define ROADW ${f(GRID.ROAD)}
#define BLOCKW ${f(GRID.BLOCK)}
#define WALKW ${f(GRID.WALK)}
#define GX0 ${f(GROUND.X0)}
#define GTOT ${f(TOTAL)}
#define TN ${f(GRID.NB + 2 * GRID.RING)}
#define CURB ${f(GRID.CURB)}
vec3 pavers(vec2 p, vec2 sz, vec3 c0, vec3 c1, float grout, float stagger){
  vec2 t = p / sz; t.x += stagger * floor(t.y) * 0.5; vec2 id = floor(t); vec2 fr = fract(t);
  vec3 c = mix(c0, c1, hash12(id));
  float g = min(min(fr.x, 1.-fr.x)*sz.x, min(fr.y, 1.-fr.y)*sz.y);
  c *= 0.86 + 0.14*smoothstep(0.0, grout, g);
  c *= 0.97 + 0.05*vnoise(p*2.7);
  return c;
}
vec3 grass(vec2 p){
  float n = fbm(p*0.28);
  vec3 c = mix(uGrass, uGrass2, smoothstep(0.25, 0.8, n));
  c *= 0.93 + 0.1*step(0.5, fract((p.x + p.y)*0.18));       // mowing stripes
  c *= 0.92 + 0.12*vnoise(p*5.0);
  float fl = step(0.988, hash12(floor(p*3.0)));
  c = mix(c, mix(vec3(1.0,0.97,0.7), vec3(1.0,0.75,0.88), hash12(floor(p*3.0)+3.)), fl*0.8);
  return c;
}
vec3 asphalt(vec2 p){
  vec3 c = uRoad;
  c *= 0.94 + 0.09*fbm(p*0.5);
  c += (hash12(floor(p*20.0)) - 0.5)*0.025;
  return c;
}
vec3 road(vec2 p, vec2 l, bool rx, bool rz){
  vec3 c = asphalt(p);
  vec3 W = uLine * (0.92 + 0.08*vnoise(p*3.0));
  if (rx && rz) {
    // intersection: subtle darker patch, central diamond
    vec2 q = l - vec2(ROADW*0.5);
    c *= 0.97 + 0.04*vnoise(p*0.25);
    float r = length(q - vec2(2.6, 2.6));
    c = mix(c, c*0.7*(0.85+0.3*step(0.5, fract(r*9.0))), 1.0 - smoothstep(0.45, 0.5, r));
    return c;
  }
  float u = rx ? l.x : l.y;              // across road 0..ROADW
  float s = (rx ? l.y : l.x) - ROADW;    // along segment 0..BLOCKW
  float along = rx ? p.y : p.x;
  float gut = 1.0 - smoothstep(0.0, 0.9, min(u, ROADW - u));
  c *= 1.0 - 0.22*gut;
  c *= 1.0 - 0.05*(band(u, 1.8, 3.4) + band(u, ROADW-3.4, ROADW-1.8))*vnoise(p*vec2(0.4,3.0));
  float m = 0.0; vec3 mc = W;
  bool cross = s < 3.4 || s > BLOCKW - 3.4;
  if (cross) {
    float zs = band(fract(u/1.25), 0.12, 0.62) * band(u, 0.6, ROADW-0.6) * (band(s, 0.5, 3.0) + band(s, BLOCKW-3.0, BLOCKW-0.5));
    m = zs;
  } else {
    float dash = band(u, ROADW*0.5-0.13, ROADW*0.5+0.13) * band(fract(along/4.0), 0.0, 0.55);
    float edge = band(u, 0.7, 0.85) + band(u, ROADW-0.85, ROADW-0.7);
    float stop = band(s, 3.6, 4.0) * band(u, 0.85, ROADW*0.5) + band(s, BLOCKW-4.0, BLOCKW-3.6) * band(u, ROADW*0.5, ROADW-0.85);
    m = clamp(dash + edge + stop, 0., 1.);
  }
  m *= 0.85 + 0.15*vnoise(p*8.0);
  return mix(c, mc, m);
}
// rooftop: light tiles + yellow/black safety border; vTile = (u, v, W, D)
vec3 rooftop(vec2 p, vec4 rt){
  // bitumen-felt rolls (1.25m) with overlap seams, gravel grain and weathering patches:
  // a roof must never read as a blank light-grey plane next to a white sidewalk.
  float roll = fract(p.y / 1.25);
  vec3 c = uRoof * 0.70;
  c *= 0.88 + 0.15*smoothstep(0.0, 0.07, min(roll, 1.0 - roll));       // seam shadow between rolls
  c *= 0.90 + 0.18*fbm(p*0.55);                                         // weathering / patch repairs
  c += (hash12(floor(p*12.0)) - 0.5)*0.05;                              // gravel grain
  float e = min(min(rt.x, rt.y), min(rt.z - rt.x, rt.w - rt.y));
  // pale concrete service walkway ringing the roof, inset from the parapet
  vec3 walkC = uRoof*1.14*(0.96 + 0.06*vnoise(p*3.0));
  walkC *= 0.93 + 0.08*smoothstep(0.0, 0.05, abs(fract((p.x + p.y)/1.4) - 0.5));
  c = mix(c, walkC, band(e, 1.7, 3.1)*0.85);
  // duct runs across the field
  float duct = band(abs(fract(rt.y/9.0) - 0.5)*9.0, 0.0, 0.42) * band(rt.x, 3.4, rt.z - 3.4);
  c = mix(c, vec3(0.70,0.72,0.76)*(0.9 + 0.12*step(0.5, fract(rt.x*1.2))), duct*0.9);
  // roof drains
  vec2 dq = (fract(rt.xy/7.5) - 0.5)*7.5; float dr = length(dq);
  c = mix(c, vec3(0.30,0.31,0.35), (1.0 - smoothstep(0.24, 0.32, dr))*0.8);
  c *= 1.0 - 0.10*(1.0 - smoothstep(0.32, 0.72, dr));
  // yellow/black hazard border + deep parapet AO
  float hz = step(0.5, fract((p.x + p.y) * 0.9));
  vec3 haz = mix(vec3(0.16,0.16,0.18), vec3(1.0,0.78,0.15), hz);
  c = mix(c, haz, band(e, 0.0, 0.55));
  c *= 1.0 - 0.34*(1.0 - smoothstep(0.5, 2.4, e));
  // painted circle
  vec2 q = vec2(rt.x - rt.z*0.5, rt.y - rt.w*0.5); float r = length(q);
  c = mix(c, vec3(0.97), band(r, 4.0, 4.4)*0.9);
  return c;
}
vec3 rampCol(vec4 rt){
  // rt.x along (0..L), rt.y across (0..Wd)
  vec3 c = vec3(0.8, 0.8, 0.82) * (0.95 + 0.06*vnoise(rt.xy*2.0));
  c *= 0.9 + 0.1*smoothstep(0.0, 0.08, abs(fract(rt.x/0.8) - 0.5));    // grip grooves
  float chev = band(abs(fract((rt.x - abs(rt.y - rt.w*0.5)*0.8)/3.0) - 0.5), 0.0, 0.12) * band(abs(rt.y - rt.w*0.5), 0.0, 1.4);
  c = mix(c, vec3(1.0), chev*0.9);
  float edge = band(rt.y, 0.0, 0.45) + band(rt.y, rt.w - 0.45, rt.w);
  vec3 haz = mix(vec3(0.16,0.16,0.18), vec3(1.0,0.78,0.15), step(0.5, fract(rt.x*0.7)));
  return mix(c, haz, clamp(edge, 0., 1.));
}
vec3 groundColor(vec2 p, float up, float wy, float gk, vec4 rt){
  if (gk > 0.5 && gk < 1.5) return rooftop(p, rt);
  if (gk > 1.5 && gk < 2.5) return rampCol(rt);
  vec2 g = p - vec2(GX0);
  vec2 cell = floor(g / PITCH);
  vec2 l = g - cell*PITCH;
  bool rx = l.x < ROADW, rz = l.y < ROADW;
  if (cell.x >= TN) rx = true; if (cell.y >= TN) rz = true;
  if (up < 0.5) {
    // curb face: light stone, darker toward the street
    vec3 c = uWalk * 0.92 * (0.92 + 0.08*vnoise(p*3.0));
    return c * mix(0.72, 1.0, clamp(wy / CURB, 0., 1.));
  }
  if (rx || rz) return road(p, l, rx, rz);
  vec2 bl = l - ROADW;
  float e = min(min(bl.x, bl.y), min(BLOCKW-bl.x, BLOCKW-bl.y));
  float type = floor(texture2D(uTypes, (cell + 0.5) / TN).r * 255.0 + 0.5);
  if (e < 0.35) {                    // curb stone cap
    vec3 c = uWalk * 1.04 * (0.95 + 0.05*vnoise(p*4.0));
    float seg = fract((bl.x + bl.y)/1.4);
    c *= 0.92 + 0.08*smoothstep(0.0, 0.05, min(seg, 1.-seg));
    return c;
  }
  if (e < WALKW) {                   // sidewalk
    vec2 q = p; if (min(bl.x, BLOCKW-bl.x) < min(bl.y, BLOCKW-bl.y)) q = p.yx;
    vec3 c = pavers(q, vec2(1.0, 1.0), uWalk*0.97, uWalk*1.02, 0.05, 0.0);
    c = mix(c, uWalk2, band(e, WALKW-0.5, WALKW)*0.8);
    return c;
  }
  vec2 lp = bl - WALKW; float LOT = BLOCKW - 2.0*WALKW; vec2 cq = lp - vec2(LOT*0.5);
  if (type < 0.5 || type > 4.5) {    // building lot: courtyard pavers
    return pavers(p, vec2(1.2, 0.6), uWalk2*0.96, uWalk2*1.03, 0.05, 1.0);
  } else if (type < 1.5) {           // park
    vec3 c = grass(p);
    float rr = length(cq);
    float path = max(band(abs(cq.x), -1.0, 1.3), band(abs(cq.y), -1.0, 1.3));
    path = max(path, band(rr, 6.0, 7.8));
    float plaza = 1.0 - smoothstep(3.9, 4.0, rr);
    vec3 grav = mix(vec3(0.93,0.86,0.72), vec3(0.88,0.8,0.66), vnoise(p*5.0));
    float edge = max(band(abs(cq.x), 1.3, 1.7), band(abs(cq.y), 1.3, 1.7));
    edge = max(edge, max(band(rr, 5.6, 6.0), band(rr, 7.8, 8.2)));
    c *= 1.0 - 0.15*edge*(1.0-path);
    c = mix(c, grav, path);
    c = mix(c, pavers(p, vec2(0.8), uPlazaA*0.95, uPlazaA*1.03, 0.07, 0.0), plaza);
    return c;
  } else if (type < 2.5) {           // plaza: concentric stone rings
    float rr = length(cq); float ang = atan(cq.y, cq.x);
    float ring = floor(rr / 1.5);
    float nseg = 8.0 + ring*5.0;
    float seg = floor((ang + 3.14159) / 6.28318 * nseg);
    vec3 c = mix(uPlazaA, uPlazaB, step(0.5, mod(ring, 2.0)) * 0.75);
    c *= 0.94 + 0.07*hash12(vec2(ring, seg));
    float fr = fract(rr/1.5); c *= 0.86 + 0.14*smoothstep(0.0, 0.05, min(fr, 1.-fr));
    float fs = fract((ang + 3.14159) / 6.28318 * nseg); c *= 0.88 + 0.12*smoothstep(0.0, 0.04, min(fs, 1.-fs));
    // fine square paver grid under the rings so the stone reads as laid, not painted
    vec2 pv = fract(p / 0.9);
    c *= 0.90 + 0.10*smoothstep(0.0, 0.055, min(min(pv.x, 1.-pv.x), min(pv.y, 1.-pv.y)));
    c *= 0.97 + 0.05*vnoise(p*2.3);
    if (max(abs(cq.x), abs(cq.y)) > 9.6) c = pavers(p, vec2(1.0), uPlazaA*0.97, uPlazaA*1.03, 0.05, 0.0);
    // dark granite inlay band where the rings meet the outer paving
    c *= 1.0 - 0.3*band(max(abs(cq.x), abs(cq.y)), 9.2, 9.6);
    // drain grate near the centre-edge
    vec2 gq = cq - vec2(0.0, 6.6);
    c = mix(c, vec3(0.34,0.35,0.38)*(0.8 + 0.3*step(0.5, fract(gq.x*3.2))), box2(gq, vec2(-0.45,-0.3), vec2(0.45,0.3))*0.9);
    return c;
  } else if (type < 3.5) {
    return pavers(p, vec2(1.0), uWalk2, uWalk2*1.03, 0.05, 0.0);
  } else {                           // parking lot
    vec3 c = asphalt(p) * 1.04;
    float stall = band(abs(fract((lp.x - 0.2) / 2.8) - 0.5)*2.8, 1.3, 1.42) * (band(lp.y, 0.6, 5.4) + band(lp.y, LOT-5.4, LOT-0.6));
    float mid = band(lp.y, LOT*0.5-0.1, LOT*0.5+0.1) * band(fract(lp.x/2.5), 0.0, 0.55);
    c = mix(c, uLine, clamp(stall + mid, 0., 1.) * 0.9);
    return c;
  }
}
`;

// ---------------- FACADE ----------------
const FACADE_FN = /* glsl */`
varying vec4 vFac;   // u, v (m), kind (0 wall, 1 roof), W (wall width)
varying vec4 vFsz;   // W, D, H, floorH
varying vec4 vSty;   // style, seed, colW, 0
vec3 glassCol(float t, float n){ return mix(vec3(0.36,0.55,0.74), vec3(0.78,0.9,0.98), clamp(t,0.,1.)) + n*0.05; }
void facade(vec3 wall, out vec3 col, out float rough, out float metal, out vec3 emis){
  rough = 0.85; metal = 0.0; emis = vec3(0.0);
  float style = vSty.x, seed = vSty.y;
  if (vFac.z > 0.5) {
    // roof: parapet cap + membrane with tiles, AO inside parapet
    vec2 q = vFac.xy; float e = min(min(q.x, q.y), min(vFsz.x - q.x, vFsz.y - q.y));
    float rk = hash12(vec2(seed, 3.0));
    vec3 mem = rk < 0.4 ? vec3(0.84,0.85,0.87) : rk < 0.7 ? vec3(0.74,0.76,0.8) : mix(wall, vec3(0.8), 0.5);
    mem *= 0.93 + 0.08*vnoise(q*1.5 + seed);
    vec2 gq = fract(q / 2.0); mem *= 0.92 + 0.08*smoothstep(0.0, 0.04, min(min(gq.x,1.-gq.x),min(gq.y,1.-gq.y)));
    mem *= mix(0.7, 1.0, smoothstep(0.45, 1.8, e));
    col = e < 0.45 ? wall*1.12 : mem;
    rough = 0.9; return;
  }
  float u = vFac.x, v = vFac.y, Wd = vFac.w, H = vFsz.z, fh = vFsz.w, colW = vSty.z;
  float fl = floor(v / fh), fv = fract(v / fh);
  float ncol = max(1.0, floor(Wd / colW + 0.5)); float cw = Wd / ncol;
  float cu = fract(u / cw), ci = floor(u / cw);
  float h = hash13(vec3(fl, ci, seed*13.0 + floor(Wd)));
  float nR = vnoise(vec2(u*0.12 + seed, v*0.05));
  vec3 c = wall * (0.96 + 0.05*vnoise(vec2(u, v)*0.9 + seed));
  vec3 trim = vec3(0.98, 0.97, 0.95);
  if (style < 0.5 || (style > 3.5 && style < 4.5)) {
    if (style > 3.5) {   // brick
      float row = floor(v/0.32); float bx = fract(u/0.7 + 0.5*mod(row,2.0)); float by = fract(v/0.32);
      c *= 0.88 + 0.12*smoothstep(0.0,0.1,min(min(bx,1.-bx),min(by,1.-by)));
      c *= 0.93 + 0.1*hash12(vec2(floor(u/0.7 + 0.5*mod(row,2.0)), row));
    }
    float frame = box2(vec2(cu, fv), vec2(0.18, 0.2), vec2(0.82, 0.86));
    float win = box2(vec2(cu, fv), vec2(0.25, 0.27), vec2(0.75, 0.8));
    float sill = box2(vec2(cu, fv), vec2(0.15, 0.14), vec2(0.85, 0.21));
    c *= 1.0 - 0.1*band(fv, 0.0, 0.06);
    c = mix(c, trim, max(frame, sill));
    vec3 gl = glassCol(fv*0.8 + nR*0.35, nR);
    if (h < 0.2) gl = mix(vec3(1.0,0.93,0.8), vec3(0.98,0.78,0.7), hash12(vec2(h*91.,2.))) * mix(0.85, 1.0, fv);
    else if (h < 0.3) gl *= 0.62;
    gl *= 1.0 - 0.45*band(cu, 0.485, 0.515);
    c = mix(c, gl, win);
    if (win > 0.5) { rough = 0.15; metal = 0.1; }
    if (fract(seed*7.3) > 0.45 && fl > 0.5 && mod(ci + fl, 2.0) > 0.5) {
      float bal = box2(vec2(cu, fv), vec2(0.1, 0.0), vec2(0.9, 0.26));
      c = mix(c, wall*0.8, bal*0.85);
      c = mix(c, trim, box2(vec2(cu, fv), vec2(0.1, 0.24), vec2(0.9, 0.29)));
    }
  } else if (style < 1.5) {
    // office glass curtain wall
    float spand = band(fv, 0.0, 0.18);
    float mull = band(cu, 0.0, 0.05) + band(cu, 0.95, 1.0);
    vec3 gl = glassCol(fract(v / (H*0.7))*0.5 + nR*0.5 + cu*0.12, nR) * mix(vec3(1.0), wall*1.15, 0.4);
    float fr = clamp(spand + mull, 0., 1.);
    c = mix(gl, mix(wall, trim, 0.55), fr);
    rough = mix(0.06, 0.6, fr); metal = mix(0.3, 0.05, fr);
  } else if (style < 2.5) {
    // low-rise shop: windows above, sign band
    float win = box2(vec2(cu, fv), vec2(0.18, 0.3), vec2(0.82, 0.8));
    c = mix(c, trim, box2(vec2(cu, fv), vec2(0.14, 0.26), vec2(0.86, 0.84)));
    vec3 gl = glassCol(fv, nR); if (h < 0.25) gl = vec3(1.0,0.93,0.8);
    c = mix(c, gl, win); if (win > 0.5) rough = 0.15;
  } else {
    // platform / mall: horizontal stripes + big shopfronts
    c = mix(c, trim, band(fract(v/1.2), 0.0, 0.12)*0.6);
  }
  // ground-floor storefronts with awnings
  if (fl < 0.5 && style < 3.5) {
    float sf = box2(vec2(cu, fv), vec2(0.07, 0.04), vec2(0.93, 0.74));
    vec3 inside = mix(vec3(1.0,0.9,0.7), vec3(0.65,0.85,0.98), step(0.5, fract(h*5.0))) * mix(0.75, 1.0, fv);
    c = mix(c, vec3(0.22,0.24,0.3), box2(vec2(cu, fv), vec2(0.05, 0.0), vec2(0.95, 0.77)));
    c = mix(c, inside, sf);
    if (sf > 0.5) { rough = 0.12; emis = inside*0.1; }
    float aw = band(fv, 0.77, 0.93);
    vec3 awc = mix(vec3(0.95,0.32,0.35), vec3(0.2,0.65,0.6), step(0.5, fract(seed*5.1 + ci*0.37)));
    awc = mix(awc, vec3(0.99), step(0.5, fract(u/0.55))*0.9);
    c = mix(c, awc, aw);
  }
  if (style > 2.5 && style < 3.5) {
    // mall: shopfront band near the bottom, sign band above
    float sf = band(v, 0.25, 2.3) * band(fract(u/4.0), 0.06, 0.94);
    vec3 inside = mix(vec3(1.0,0.92,0.75), vec3(0.7,0.88,1.0), step(0.5, hash12(vec2(floor(u/4.0), seed)))) ;
    c = mix(c, vec3(0.22,0.24,0.3), band(v, 0.15, 2.4));
    c = mix(c, inside * mix(0.75, 1.0, v/2.3), sf);
    if (sf > 0.5) { rough = 0.1; emis = inside*0.08; }
    float sign = band(v, 2.6, 3.3);
    vec3 sc = mix(vec3(1.0,0.45,0.45), vec3(0.3,0.7,1.0), step(0.5, hash12(vec2(floor(u/8.0), seed+1.0))));
    c = mix(c, mix(sc, vec3(1.0), band(fract(u/8.0), 0.3, 0.7)*band(v, 2.8, 3.1)*0.9), sign);
  }
  // cornice
  c = mix(c, trim, band(v, H - 0.45, H + 1.0));
  c *= 1.0 - 0.3*band(v, H - 0.62, H - 0.45);
  c *= mix(0.8, 1.0, smoothstep(0.0, 0.6, min(u, Wd - u)));   // corner AO
  col = c;
}
`;

function patch(mat, o) {
  const key = 'crowd-' + JSON.stringify(o);
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    let vs = sh.vertexShader, fs = sh.fragmentShader;
    let vdecl = `uniform float uTime;\nvarying vec3 vHW; varying float vAO; varying float vUp; varying vec3 vOP;\n`;
    if (o.kind === 'ground') vdecl += 'attribute float gk; attribute vec4 rtile; varying float vGK; varying vec4 vRT;\n';
    if (o.kind === 'facade') vdecl += 'attribute vec4 fac; attribute vec4 fsz; attribute vec4 fsty; varying vec4 vFac; varying vec4 vFsz; varying vec4 vSty;\n';
    if (o.kind === 'paint') vdecl += 'attribute float sway; attribute float tint;\n';
    vs = vs.replace('#include <common>', '#include <common>\n' + vdecl);
    let anim = 'vOP = position;\n';
    if (o.kind === 'paint' && o.wind) anim += `
{
  vec3 ip = vec3(0.0);
#ifdef USE_INSTANCING
  ip = instanceMatrix[3].xyz;
#endif
  float k = sway * 0.06;
  transformed.x += sin(uTime*1.7 + ip.x*0.37 + ip.z*0.21) * k;
  transformed.z += cos(uTime*1.3 + ip.z*0.29) * k * 0.7;
}`;
    vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + anim);
    if (o.kind === 'paint') vs = vs.replace('#include <color_vertex>', 'vColor = vec4(color.rgb, 1.0);\n#ifdef USE_INSTANCING_COLOR\nif (tint > 0.5) vColor.rgb *= instanceColor.rgb;\n#endif\n');
    let post = `
{
  vec4 hw = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  hw = instanceMatrix * hw;
#endif
  hw = modelMatrix * hw; vHW = hw.xyz;
  vUp = normal.y;
  vAO = mix(${f(o.aoMin ?? 0.65)}, 1.0, smoothstep(0.0, ${f(o.aoH ?? 0.9)}, position.y));
}`;
    if (o.kind === 'ground') post += 'vGK = gk; vRT = rtile;\n';
    if (o.kind === 'facade') post += 'vFac = fac; vFsz = fsz; vSty = fsty; vAO = fac.z > 0.5 ? 1.0 : mix(0.6, 1.0, smoothstep(0.0, 2.5, fac.y));\n';
    vs = vs.replace('#include <project_vertex>', '#include <project_vertex>\n' + post);
    let fdecl = COMMON + 'varying vec3 vHW; varying float vAO; varying float vUp; varying vec3 vOP;\n';
    if (o.kind === 'ground') fdecl += 'varying float vGK; varying vec4 vRT;\n' + GROUND_FN;
    if (o.kind === 'facade') fdecl += FACADE_FN;
    fs = fs.replace('#include <common>', '#include <common>\n' + fdecl);
    fs = fs.replace('void main() {', 'void main() {\nfloat gRough = 0.85; float gMetal = 0.0; vec3 gEmis = vec3(0.0);\n');
    if (o.kind === 'ground') {
      fs = fs.replace('#include <color_fragment>', `
{
  vec3 gc = groundColor(vHW.xz, vUp, vHW.y, vGK, vRT);
  float ao = 1.0;
  if (vUp > 0.5 && vGK < 0.5) {
    vec2 auv = (vHW.xz - vec2(GX0)) / GTOT;
    float a = texture2D(uAO, auv).r;
    ao = 1.0 - 0.42*a;
  }
  diffuseColor.rgb = pow(max(gc, vec3(0.0)), vec3(2.2)) * ao;
  gRough = 0.88;
}`);
    } else if (o.kind === 'facade') {
      fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n{ vec3 fc; facade(pow(diffuseColor.rgb, vec3(1.0/2.2)), fc, gRough, gMetal, gEmis); diffuseColor.rgb = pow(max(fc, vec3(0.0)), vec3(2.2)) * vAO; gEmis = pow(gEmis, vec3(2.2)); }\n');
    } else {
      fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vAO;\n');
    }
    if (o.kind === 'ground' || o.kind === 'facade') {
      fs = fs.replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;');
      fs = fs.replace('#include <metalnessmap_fragment>', 'float metalnessFactor = gMetal;');
      fs = fs.replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += gEmis;');
    }
    sh.vertexShader = vs; sh.fragmentShader = fs;
  };
  return mat;
}

export function groundMaterial() { return patch(new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, envMapIntensity: 0.5 }), { kind: 'ground', aoH: 0.001, aoMin: 1 }); }
export function facadeMaterial() { return patch(new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, vertexColors: true, envMapIntensity: 0.6 }), { kind: 'facade' }); }
export function paintMaterial(o = {}) {
  return patch(new THREE.MeshStandardMaterial({ roughness: o.rough ?? 0.7, metalness: o.metal ?? 0, vertexColors: true, envMapIntensity: o.env ?? 0.7 }), { kind: 'paint', wind: !!o.wind, aoH: o.aoH ?? 0.9, aoMin: o.aoMin ?? 0.65 });
}

// ---------------- PEOPLE ----------------
// Geometry attributes: position, normal, color (part shade), limb (0 body,1 Lleg,2 Rleg,3 Larm,4 Rarm, 5 head)
// Instance attributes: iPos (x,y,z,yaw), iCol (r,g,b,flash), iAnim (phase, run, scale, hop)
export function peopleMaterial() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0, vertexColors: true, envMapIntensity: 0.9 });
  m.customProgramCacheKey = () => 'crowd-people';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime;
    let vs = sh.vertexShader;
    vs = vs.replace('#include <common>', `#include <common>
uniform float uTime;
attribute float limb;
attribute vec4 iPos; attribute vec4 iCol; attribute vec4 iAnim;
varying float vFlash; varying float vRim;
mat3 rotY(float a){ float c = cos(a), s = sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
`);
    // pose: limbs swing around pivots, lean forward when running, hop on recruit
    const pose = `
  float ph = iAnim.x, run = iAnim.y, sc = iAnim.z, hop = iAnim.w;
  float sw = sin(ph);
  vec3 P = position; vec3 N = normal;
  if (limb > 0.5 && limb < 2.5) {
    float a = (limb < 1.5 ? sw : -sw) * (0.25 + 0.75*run) * 0.95;
    vec3 piv = vec3(0.0, 0.46, 0.0); mat3 R = rotX(a); P = piv + R*(P - piv); N = R*N;
  } else if (limb > 2.5 && limb < 4.5) {
    float a = (limb < 3.5 ? -sw : sw) * (0.2 + 0.8*run) * 1.0;
    float raise = hop * 2.6;      // arms up when cheering/hopping
    vec3 piv = vec3(0.0, 0.86, 0.0); mat3 R = rotX(a - raise) ; P = piv + R*(P - piv); N = R*N;
  }
  // lean + bob
  float lean = 0.18 * run;
  mat3 L = rotX(lean); P = L*P; N = L*N;
  P.y += abs(cos(ph)) * 0.07 * (0.3 + run) + hop * 0.55;
  // squash/stretch on hop
  float st = 1.0 + hop*0.25; P.y *= st; P.xz *= 1.0/sqrt(st);
  mat3 Y = rotY(iPos.w);
  P = Y*(P*sc); N = Y*N;
  P += iPos.xyz;
`;
    vs = vs.replace('#include <beginnormal_vertex>', `vec3 objectNormal; vec3 _Pp;\n{ ${pose} objectNormal = N; _Pp = P; }\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(1.0,0.0,0.0);\n#endif\n`);
    vs = vs.replace('#include <begin_vertex>', 'vec3 transformed = _Pp;\n');
    vs = vs.replace('#include <color_vertex>', `vColor = vec4(color.rgb * iCol.rgb, 1.0); vFlash = iCol.w;`);
    sh.vertexShader = vs;
    let fs = sh.fragmentShader;
    fs = fs.replace('#include <common>', '#include <common>\nvarying float vFlash;\n');
    fs = fs.replace('#include <opaque_fragment>', `#include <opaque_fragment>
{
  // soft rim to separate bodies inside a packed crowd
  float rim = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), 2.5);
  gl_FragColor.rgb += diffuseColor.rgb * rim * 0.35 + vec3(rim * 0.06);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.6), vFlash);
}`);
    sh.fragmentShader = fs;
  };
  return m;
}
// depth material for shadow casting of instanced people (same pose transform, simplified)
export function blobMaterial() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.MeshBasicMaterial({ color: 0x1a2040, transparent: true, opacity: 0.32, depthWrite: false, alphaMap: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.customProgramCacheKey = () => 'crowd-blob';
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 iPos; attribute vec4 iAnim;\n')
      .replace('#include <begin_vertex>', 'vec3 transformed = position * iAnim.z * (1.0 - iAnim.w*0.4) + vec3(iPos.x + 0.12, iPos.y + 0.02, iPos.z + 0.1);\n');
  };
  return m;
}
