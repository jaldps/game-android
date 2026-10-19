// Shared materials: every surface is a MeshStandardMaterial patched via onBeforeCompile.
// - ground: procedural city surface (roads, markings, crosswalks, curbs, pavers, grass, plazas) + hole cut-out discard
// - facade: procedural building facades (windows, frames, storefronts, curtain walls, rooftops)
// - paint: vertex colours + per-instance tints, walk/wind animation, height AO
// All surfaces darken as they sink below ground (y<0) so things falling into a hole fade into the void.
import * as THREE from 'three';
import { CITY } from './config.js';

export const MAX_HOLES = 10;
export const U = {
  uTime: { value: 0 },
  uHoles: { value: Array.from({ length: MAX_HOLES }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uHoleN: { value: 0 },
  uBlocks: { value: null },
  // excavation mask over the whole platform (R8). Painted as things are swallowed.
  uDamage: { value: null },
  // screen-space window cut through buildings that stand between the camera and the player's hole
  uCut: { value: new THREE.Vector4(0, 0, 1, 0) },
  // theme grass ramp
  uGrassA: { value: new THREE.Vector3(0.31, 0.58, 0.17) },
  uGrassB: { value: new THREE.Vector3(0.50, 0.74, 0.26) },
};

const f = n => (Math.round(n * 10000) / 10000).toFixed(4);

const GLSL_COMMON = /* glsl */`
uniform float uTime;
varying vec3 vHW;
varying float vDark;
varying float vAO;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float hash13(vec3 p3){ p3 = fract(p3*.1031); p3 += dot(p3, p3.zyx+31.32); return fract((p3.x+p3.y)*p3.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  float a=hash12(i), b=hash12(i+vec2(1.,0.)), c=hash12(i+vec2(0.,1.)), d=hash12(i+vec2(1.,1.));
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
float fbm(vec2 p){ return vnoise(p)*.5 + vnoise(p*2.03+7.1)*.3 + vnoise(p*4.11+3.7)*.2; }
float safeW(float x){ float w = fwidth(x); return (w < 0.25) ? w : 0.02; }
float band(float x, float a, float b){ float w = min(safeW(x)*0.8, 0.08)+1e-4; return smoothstep(a-w,a+w,x) - smoothstep(b-w,b+w,x); }
float box2(vec2 p, vec2 a, vec2 b){ return band(p.x,a.x,b.x)*band(p.y,a.y,b.y); }
`;

const HOLE_DISCARD = /* glsl */`
uniform vec4 uHoles[${MAX_HOLES}];
uniform int uHoleN;
void holeDiscard(){
  for (int i = 0; i < ${MAX_HOLES}; i++) {
    if (i >= uHoleN) break;
    vec2 d = vHW.xz - uHoles[i].xy;
    if (dot(d,d) < uHoles[i].z*uHoles[i].z) discard;
  }
}
`;

// Nothing that has sunk below street level may be seen outside a hole's mouth.
// This is what makes the pit read as a real opening instead of a decal.
const BELOW_CLIP = /* glsl */`
uniform vec4 uHoles[${MAX_HOLES}];
uniform int uHoleN;
void belowClip(){
  if (vHW.y > -0.002) return;
  for (int i = 0; i < ${MAX_HOLES}; i++) {
    if (i >= uHoleN) break;
    vec2 d = vHW.xz - uHoles[i].xy;
    float rr = uHoles[i].z * 1.085;
    if (dot(d,d) < rr*rr) return;
  }
  discard;
}
`;

// ---------- GROUND ----------
const GROUND_FN = /* glsl */`
uniform sampler2D uBlocks;
#define PITCH ${f(CITY.PITCH)}
#define ROADW ${f(CITY.ROAD)}
#define BLOCKW ${f(CITY.BLOCK)}
#define WALKW ${f(CITY.WALK)}
#define X0 ${f(CITY.X0)}
#define NXB ${f(CITY.NX)}
#define SPANE ${f(CITY.SPAN)}
#define HALFP ${f(CITY.HALF)}
#define CURBH ${f(CITY.CURB_H)}
vec3 pavers(vec2 p, float sz, vec3 c0, vec3 c1, float grout){
  vec2 t = p / sz; vec2 id = floor(t); vec2 fr = fract(t);
  float h = hash12(id);
  vec3 c = mix(c0, c1, h);
  float gx = min(fr.x, 1.-fr.x), gy = min(fr.y, 1.-fr.y);
  float g = smoothstep(0.0, grout, min(gx, gy) + safeW(t.x)*0.5);
  c *= 0.84 + 0.16*g;
  c *= 0.97 + 0.06*vnoise(p*3.0);
  return c;
}
uniform vec3 uGrassA; uniform vec3 uGrassB;
vec3 grassCol(vec2 p){
  float n = fbm(p*0.35);
  vec3 c = mix(uGrassA, uGrassB, n);
  float stripe = step(0.5, fract((p.x+p.y*0.0)/3.0));
  c *= 0.95 + 0.08*stripe;
  c *= 0.92 + 0.12*vnoise(p*4.5);
  // tiny flower speckles
  float fl = step(0.985, hash12(floor(p*3.0)));
  c = mix(c, mix(vec3(1.0,0.95,0.6), vec3(1.0,0.75,0.85), hash12(floor(p*3.0)+3.)), fl*0.7);
  return c;
}
vec3 asphaltCol(vec2 p){
  vec3 c = vec3(0.36,0.365,0.39);
  c *= 0.9 + 0.16*fbm(p*0.6);
  c += (hash12(floor(p*24.0))-0.5)*0.035;
  return c;
}
vec3 roadCol(vec2 p, vec2 l, bool rx, bool rz, out float rough){
  rough = 0.92;
  vec3 c = asphaltCol(p);
  vec3 paintW = vec3(0.93,0.93,0.9) * (0.88 + 0.12*vnoise(p*2.0));
  vec3 paintY = vec3(0.98,0.76,0.18) * (0.9 + 0.1*vnoise(p*2.0));
  if (rx && rz) {
    // intersection: subtle patch + manhole
    c *= 0.96 + 0.05*vnoise(p*0.3+11.);
    vec2 q = l - vec2(ROADW*0.5);
    float r = length(q - vec2(1.6,-1.6));
    float mh = 1.0 - smoothstep(0.42, 0.46, r);
    c = mix(c, vec3(0.2,0.2,0.22)*(0.8+0.3*step(0.5,fract(r*12.))), mh);
    return c;
  }
  float u = rx ? l.x : l.y;               // across the road
  float s = (rx ? l.y : l.x) - ROADW;     // along the segment, 0..BLOCKW
  float along = rx ? p.y : p.x;
  // tyre wear
  float wear = band(u, 1.6, 3.2) + band(u, ROADW-3.2, ROADW-1.6);
  c *= 1.0 - 0.07*wear*(0.6+0.4*vnoise(p*vec2(0.3,3.0)));
  // curb gutter shadow
  float gut = 1.0 - smoothstep(0.0, 0.7, min(u, ROADW-u));
  c *= 1.0 - 0.35*gut;
  bool cross = (s < 3.6) || (s > BLOCKW - 3.6);
  float m = 0.0; vec3 mc = paintW;
  if (cross) {
    float zs = band(fract(u/1.15), 0.0, 0.55) * band(u, 0.75, ROADW-0.75) * (band(s,0.5,3.2) + band(s,BLOCKW-3.2,BLOCKW-0.5));
    m = zs;
  } else {
    // double yellow centre line
    float cy = band(u, ROADW*0.5-0.32, ROADW*0.5-0.14) + band(u, ROADW*0.5+0.14, ROADW*0.5+0.32);
    // edge lines
    float ew = band(u, 0.75, 0.92) + band(u, ROADW-0.92, ROADW-0.75);
    // stop lines (approach lane only)
    float st = band(s, 3.9, 4.35) * band(u, 0.9, ROADW*0.5-0.4) + band(s, BLOCKW-4.35, BLOCKW-3.9) * band(u, ROADW*0.5+0.4, ROADW-0.9);
    // lane arrows-ish dash markers mid segment
    float dash = band(u, ROADW*0.25-0.08, ROADW*0.25+0.08)*band(fract(along/6.0),0.0,0.45) + band(u, ROADW*0.75-0.08, ROADW*0.75+0.08)*band(fract(along/6.0),0.0,0.45);
    dash *= 0.0;
    if (cy > 0.01) { m = cy; mc = paintY; }
    else m = max(ew + st, dash);
  }
  m *= 0.82 + 0.18*vnoise(p*7.0);
  c = mix(c, mc, clamp(m,0.,1.));
  rough = mix(0.92, 0.6, clamp(m,0.,1.));
  return c;
}
// Outer district: a wide esplanade ring that wraps the grid — boardwalk, promenade pavers,
// a landscaped green belt with a jogging loop, then a tiled civic plaza where the ring towers stand.
vec3 promenade(vec2 p, out float rough){
  rough = 0.85;
  float e0 = HALFP - max(abs(p.x), abs(p.y));   // distance to platform edge
  float along = abs(p.x) > abs(p.y) ? p.y : p.x;
  float across = abs(p.x) > abs(p.y) ? p.x : p.y;
  // Landscaping meanders. Ruler-straight bands running the whole waterfront read as painted
  // racing stripes; a couple of octaves of wobble turn them into planting that was laid out.
  float wob = (vnoise(vec2(along*0.032, 3.7)) - 0.5)*5.4 + (vnoise(vec2(along*0.115, 8.1)) - 0.5)*1.8;
  float e = e0 + wob * smoothstep(4.5, 9.5, e0);
  vec3 c;
  if (e < 0.9) {
    c = vec3(0.90,0.88,0.84)*(0.95+0.07*vnoise(p*2.0));
    c *= 0.9 + 0.12*smoothstep(0.0, 0.05, abs(fract(along/2.4)-0.5));
    rough = 0.6;
  } else if (e < 5.0) {                                   // timber boardwalk
    float plank = fract(along / 0.55);
    float id = floor(along/0.55);
    vec3 w = mix(vec3(0.62,0.42,0.26), vec3(0.74,0.52,0.32), hash12(vec2(id, floor(across/3.0))));
    w *= 0.86 + 0.14*smoothstep(0.0, 0.08, min(plank, 1.0-plank));
    w *= 0.93 + 0.1*vnoise(vec2(along*0.6, across*8.0));
    c = w; rough = 0.75;
  } else if (e < 11.0) {                                  // promenade pavers with a banded inlay
    c = pavers(p, 1.4, vec3(0.86,0.80,0.70), vec3(0.93,0.88,0.78), 0.06);
    float inlay = band(e, 7.2, 8.0);
    c = mix(c, vec3(0.72,0.47,0.36)*(0.92+0.1*vnoise(p*3.0)), inlay);
    float seat = band(fract(along/7.0), 0.0, 0.1) * band(e, 5.6, 6.6);
    c = mix(c, vec3(0.78,0.74,0.68), seat*0.7);
    rough = 0.8;
  } else if (e < 18.0) {                                  // green belt + jogging loop
    c = grassCol(p*0.9 + 41.0);
    float trk = band(e, 13.1, 14.3);
    vec3 track = vec3(0.70,0.45,0.37)*(0.92+0.1*vnoise(p*5.0));
    c *= 1.0 - 0.2*(band(e, 12.7, 13.1) + band(e, 14.3, 14.7));
    c = mix(c, track, trk);
    float hedge = band(e, 11.0, 11.6);
    c = mix(c, uGrassA*0.78, hedge*0.85);
    // planting beds dotted through the lawn so it is never one flat field of green
    vec2 bid = vec2(floor(along/9.0), floor((e - 11.0)/3.4));
    float bh = hash12(bid);
    float bd = step(0.58, bh) * (1.0 - smoothstep(0.42, 0.9, length(vec2(fract(along/9.0), fract((e-11.0)/3.4)) - 0.5)*2.0));
    bd *= 1.0 - trk;
    c = mix(c, vec3(0.44,0.31,0.21)*(0.9+0.2*vnoise(p*6.0)), bd*0.85);
    vec3 bloom = bh > 0.84 ? vec3(0.92,0.46,0.56) : (bh > 0.72 ? vec3(0.95,0.78,0.34) : vec3(0.76,0.52,0.90));
    c = mix(c, bloom, bd*0.5*step(0.55, vnoise(p*9.0)));
    rough = 1.0;
  } else {                                                // civic plaza: large stone tiles + tree pits
    vec2 t = p / 3.2; vec2 id = floor(t); vec2 fr = fract(t);
    float h = hash12(id);
    c = mix(vec3(0.80,0.78,0.74), vec3(0.90,0.88,0.84), h);
    c *= 0.9 + 0.1*vnoise(p*1.4);
    float g = smoothstep(0.0, 0.035, min(min(fr.x,1.-fr.x), min(fr.y,1.-fr.y)));
    c *= 0.86 + 0.14*g;
    // gravel tree pits with a kerb ring — dark mud discs read as stains on a pale plaza
    float rr = length(fr-0.5)*2.0;
    float pitOn = step(0.5, mod(id.x+id.y, 2.0)) * step(0.64, h);
    float pit = (1.0 - smoothstep(0.58, 0.66, rr)) * pitOn;
    c = mix(c, vec3(0.60,0.53,0.43)*(0.9+0.16*vnoise(p*9.0)), pit*0.85);
    c *= 1.0 - 0.22*band(rr, 0.58, 0.72)*pitOn;
    // kerb where the plaza meets the green belt
    c *= 1.0 - 0.18*band(e, 18.0, 18.5);
    rough = 0.7;
  }
  return c;
}
vec3 groundColorBase(vec2 p, float up, float wy, out float rough){
  rough = 0.9;
  // platform side walls (sea wall)
  if (up < 0.5 && wy < -0.05 && max(abs(p.x),abs(p.y)) > HALFP - 0.2) {
    float along = abs(p.x) > abs(p.y) ? p.y : p.x;
    float row = floor(wy / 0.55);
    float bx = fract(along/1.3 + 0.5*mod(row,2.0));
    float by = fract(wy/0.55);
    vec3 c = mix(vec3(0.72,0.66,0.58), vec3(0.82,0.76,0.66), hash12(vec2(floor(along/1.3 + 0.5*mod(row,2.0)), row)));
    c *= 0.82 + 0.18*smoothstep(0.0,0.08,min(min(bx,1.-bx),min(by,1.-by)));
    c *= mix(0.55, 1.0, smoothstep(-2.6, -0.4, wy));
    return c;
  }
  vec2 g = p - vec2(X0);
  if (g.x < 0. || g.y < 0. || g.x > SPANE || g.y > SPANE) return promenade(p, rough);
  vec2 cell = floor(g / PITCH);
  vec2 l = g - cell*PITCH;
  bool rx = l.x < ROADW, rz = l.y < ROADW;
  if (cell.x >= NXB) rx = true;
  if (cell.y >= NXB) rz = true;
  if (rx || rz) {
    if (up < 0.5) { return vec3(0.7,0.68,0.64); }
    return roadCol(p, l, rx, rz, rough);
  }
  vec2 bl = l - ROADW;
  float e = min(min(bl.x, bl.y), min(BLOCKW-bl.x, BLOCKW-bl.y));
  if (up < 0.5) {
    // curb face
    vec3 c = vec3(0.80,0.78,0.74) * (0.9 + 0.1*vnoise(p*3.0));
    return c * mix(0.65, 1.0, clamp(wy / CURBH, 0., 1.));
  }
  if (e < 0.38) {
    rough = 0.8;
    float seg = fract((bl.x + bl.y)/1.2);
    vec3 c = vec3(0.88,0.86,0.82) * (0.94 + 0.06*vnoise(p*4.0));
    c *= 0.92 + 0.08*smoothstep(0.0,0.05,min(seg,1.-seg));
    c *= 1.0 - 0.18*smoothstep(0.28, 0.38, e);
    return c;
  }
  float type = floor(texture2D(uBlocks, (cell + 0.5) / NXB).r * 255.0 + 0.5);
  if (e < WALKW) {
    rough = 0.85;
    vec3 c = pavers(p + vec2(0.25), 0.9, vec3(0.84,0.77,0.66), vec3(0.91,0.85,0.74), 0.07);
    if (type > 0.5 && type < 1.5) c = pavers(p, 0.6, vec3(0.80,0.70,0.60), vec3(0.88,0.78,0.66), 0.08);
    // inner edge of sidewalk: soft shadow line next to lot
    c *= 1.0 - 0.1*band(e, WALKW-0.15, WALKW);
    return c;
  }
  vec2 lp = bl - WALKW;           // 0..LOT
  float LOT = BLOCKW - 2.0*WALKW;
  vec2 cq = lp - vec2(LOT*0.5);
  if (type < 0.5) {               // building lot: four paved parcels + green cross courtyard
    rough = 0.85;
    vec2 pq = abs(cq);
    float gap = 1.0 - step(1.15, min(pq.x, pq.y));           // cross-shaped courtyard
    vec3 c = pavers(p, 1.1, vec3(0.83,0.79,0.72), vec3(0.89,0.85,0.78), 0.06);
    // parcel border ring (foundation outline)
    vec2 pc = pq - vec2(4.9);
    float ring = band(max(abs(pc.x), abs(pc.y)), 3.9, 4.25);
    c = mix(c, vec3(0.70,0.66,0.60), ring * 0.8);
    float inner = 1.0 - step(3.9, max(abs(pc.x), abs(pc.y)));
    c = mix(c, pavers(p + 0.5, 2.0, vec3(0.78,0.76,0.73), vec3(0.84,0.82,0.78), 0.03), inner);
    vec3 g = grassCol(p);
    float gravel = band(min(pq.x, pq.y), -1.0, 0.45);
    g = mix(g, vec3(0.88,0.80,0.66)*(0.9+0.12*vnoise(p*6.0)), gravel);
    return mix(c, g, gap);
  } else if (type < 1.5) {        // park
    rough = 1.0;
    vec3 c = grassCol(p);
    float rr = length(cq);
    float path = max(band(abs(cq.x), -1.0, 1.1), band(abs(cq.y), -1.0, 1.1));
    path = max(path, band(rr, 5.6, 7.4));
    path *= 1.0 - step(rr, 3.6);   // fountain plaza centre handled below
    float plaza = 1.0 - smoothstep(3.55, 3.65, rr);
    vec3 gravel = vec3(0.90,0.82,0.66)*(0.9+0.12*vnoise(p*6.0));
    float edge = max(band(abs(cq.x), 1.1, 1.6), band(abs(cq.y), 1.1, 1.6));
    edge = max(edge, max(band(rr, 5.1, 5.6), band(rr, 7.4, 7.9)));
    c *= 1.0 - 0.18*edge*(1.0-path);
    c = mix(c, gravel, path);
    vec3 pz = pavers(p, 0.7, vec3(0.86,0.78,0.68), vec3(0.94,0.88,0.78), 0.08);
    c = mix(c, pz, plaza);
    return c;
  } else if (type < 2.5) {        // plaza: decorative stone rings
    rough = 0.7;
    float rr = length(cq);
    float ang = atan(cq.y, cq.x);
    float ring = floor(rr / 1.6);
    float seg = floor((ang + 3.14159) / 6.28318 * (8.0 + ring*6.0));
    vec3 a = vec3(0.92,0.86,0.76), b = vec3(0.78,0.55,0.44);
    vec3 c = mix(a, b, mod(ring, 2.0)*0.85);
    c *= 0.93 + 0.08*hash12(vec2(ring, seg));
    float fr = fract(rr/1.6);
    c *= 0.88 + 0.12*smoothstep(0.0, 0.04, min(fr, 1.-fr));
    float fs = fract((ang + 3.14159) / 6.28318 * (8.0 + ring*6.0));
    c *= 0.9 + 0.1*smoothstep(0.0, 0.03, min(fs,1.-fs));
    float sq = max(abs(cq.x), abs(cq.y));
    if (rr > 9.0 || sq > 8.6) c = pavers(p, 1.2, vec3(0.88,0.84,0.78), vec3(0.94,0.90,0.84), 0.05);
    return c;
  } else if (type < 3.5) {        // residential: lawns + paths
    rough = 1.0;
    vec3 c = grassCol(p*1.1 + 13.0) * vec3(1.02,1.0,0.95);
    float path = band(abs(cq.x), -1.0, 0.9) + band(abs(cq.y), -1.0, 0.9);
    vec3 pv = pavers(p, 0.5, vec3(0.80,0.74,0.66), vec3(0.86,0.80,0.72), 0.1);
    float edge = band(abs(cq.x), 0.9, 1.3) + band(abs(cq.y), 0.9, 1.3);
    c *= 1.0 - 0.15*clamp(edge,0.,1.);
    return mix(c, pv, clamp(path,0.,1.));
  } else {                        // parking lot
    rough = 0.9;
    vec3 c = asphaltCol(p) * 1.08;
    float stall = band(fract(lp.x / 2.8), 0.0, 0.04) * (band(lp.y, 0.8, 5.8) + band(lp.y, LOT-5.8, LOT-0.8));
    float mid = band(lp.y, 9.6, 10.0) * band(fract(lp.x/3.0), 0.0, 0.5);
    float m = clamp(stall + mid, 0., 1.) * (0.85 + 0.15*vnoise(p*6.0));
    c = mix(c, vec3(0.92,0.92,0.88), m);
    return c;
  }
}
// ---- excavation: ground that has been eaten away turns into a dig site
uniform sampler2D uDamage;
vec3 groundColor(vec2 p, float up, float wy, out float rough){
  vec3 c = groundColorBase(p, up, wy, rough);
  if (up < 0.5) return c;
  float dmg = texture2D(uDamage, (p + HALFP) / (2.0*HALFP)).r;
  if (dmg < 0.10) return c;
  // Low-frequency centred noise: breaks the mask's soft discs into irregular dig sites that
  // merge into each other, instead of stamping a field of identical brown polka dots.
  float n = fbm(p*0.19 + 3.3)*0.68 + fbm(p*0.62 + 9.1)*0.32;
  float n2 = vnoise(p*2.6);
  float d = clamp((dmg - 0.10)*1.04 + (n - 0.5)*0.46, 0.0, 1.0);
  if (d <= 0.01) return c;
  // 1) where the hole merely rolled through: a film of dust that dirties whatever was there.
  //    Tinting towards brown instead would paint a mud stripe over clean paving.
  float dust = smoothstep(0.0, 0.22, d);
  c *= mix(vec3(1.0), vec3(0.90,0.845,0.775) * (0.90 + 0.16*vnoise(p*1.6)), dust);
  c = mix(c, c*0.80, dust*0.42*vnoise(p*0.9));
  // 2) where a building actually came out: a real excavation.
  float dig = smoothstep(0.46, 0.86, d);
  if (dig > 0.002) {
    vec3 dirt = mix(vec3(0.34,0.25,0.17), vec3(0.55,0.43,0.30), n2);
    dirt *= 0.86 + 0.26*vnoise(p*7.0);
    float grit = step(0.90, hash12(floor(p*2.6)));
    dirt = mix(dirt, vec3(0.60,0.57,0.52)*(0.82+0.36*hash12(floor(p*2.6)+9.)), grit*0.7);
    float tread = band(fract(p.x*0.7 + p.y*0.7), 0.0, 0.18)*0.5 + band(fract((p.x-p.y)*0.55), 0.0, 0.14)*0.4;
    dirt *= 1.0 - 0.16*tread;
    c = mix(c, dirt, dig);
    c *= 1.0 - 0.40*smoothstep(0.74, 1.0, d);
    c = mix(c, vec3(0.24,0.25,0.27), smoothstep(0.90, 1.0, d)*0.4*smoothstep(0.45, 0.7, n2));
  }
  // torn lip where the paving gives way to open earth
  c = mix(c, c*0.52, band(d, 0.42, 0.52)*0.85);
  rough = mix(rough, 1.0, max(dust*0.4, dig));
  return c;
}
`;

// ---------- FACADE ----------
const FACADE_FN = /* glsl */`
varying vec4 vFac;   // u (m), v (m), kind, wall width
varying vec4 vSty;   // style, floorH, colW, seed
varying vec3 vSize;
vec3 skyRefl(float t, float n){
  return mix(vec3(0.13,0.22,0.34), vec3(0.52,0.68,0.84), clamp(t,0.,1.)*clamp(t,0.,1.)) + n*0.05;
}
void facade(vec3 wall, out vec3 col, out float rough, out float metal, out vec3 emis){
  rough = 0.82; metal = 0.0; emis = vec3(0.0);
  float kind = vFac.z; float style = vSty.x; float seed = vSty.w;
  if (kind > 0.5) {
    // roof
    vec2 q = vFac.xy; float e;
    if (kind > 1.5) { e = vSize.x*0.5 - length(q - vSize.xz*0.5); }
    else e = min(min(q.x, q.y), min(vSize.x - q.x, vSize.z - q.y));
    float rk = hash12(vec2(seed*7.0, 1.0));
    vec3 membrane = rk < 0.3 ? vec3(0.62,0.62,0.64) : rk < 0.55 ? vec3(0.74,0.70,0.64) : rk < 0.75 ? vec3(0.48,0.50,0.54) : rk < 0.88 ? mix(wall, vec3(0.55), 0.55) : vec3(0.70,0.52,0.42);
    if (style > 1.5 && style < 2.5) membrane = wall*0.75;
    membrane *= 0.9 + 0.12*vnoise(q*2.0 + seed*13.0);
    membrane *= 0.96 + 0.06*vnoise(q*9.0 + seed);
    vec2 gq = fract(q / (rk < 0.55 ? 1.2 : 3.0));
    membrane *= 0.9 + 0.1*smoothstep(0.0, 0.04, min(min(gq.x,1.-gq.x),min(gq.y,1.-gq.y)));
    // drains / stains
    membrane *= 1.0 - 0.12*smoothstep(1.2, 0.0, length(fract(q/6.0)-0.5)*6.0) * step(0.5, rk);
    float ao = mix(0.72, 1.0, smoothstep(0.35, 1.6, e));
    col = membrane * ao;
    if (e < 0.35) col = wall * 1.08;
    rough = 0.9;
    return;
  }
  float u = vFac.x, v = vFac.y, W = vFac.w, H = vSize.y;
  float fh = vSty.y; float colW = vSty.z;
  float fl = floor(v / fh); float fv = fract(v / fh);
  float ncol = max(1.0, floor(W / colW + 0.5)); float cw = W / ncol;
  float cu = fract(u / cw); float ci = floor(u / cw);
  float cornerAO = (style > 4.5) ? 1.0 : mix(0.82, 1.0, smoothstep(0.0, 0.7, min(u, W - u)));
  float h = hash13(vec3(fl, ci, seed*31.0 + floor(W)));
  vec3 c = wall * (0.95 + 0.05*vnoise(vec2(u, v)*1.3 + seed));
  float nRef = vnoise(vec2(u*0.15 + seed, v*0.05));
  bool top = v > H - 0.5;
  if (style < 0.5 || (style > 3.5 && style < 4.5)) {
    // residential / brick: punched windows with frames, sills, balconies
    if (style > 3.5) {
      float row = floor(v/0.28); float bx = fract(u/0.6 + 0.5*mod(row,2.0)); float by = fract(v/0.28);
      c *= 0.9 + 0.1*smoothstep(0.0,0.12,min(min(bx,1.-bx),min(by,1.-by)));
      c *= 0.93 + 0.1*hash12(vec2(floor(u/0.6 + 0.5*mod(row,2.0)), row));
    }
    float frame = box2(vec2(cu, fv), vec2(0.20, 0.20), vec2(0.80, 0.86));
    float win = box2(vec2(cu, fv), vec2(0.26, 0.26), vec2(0.74, 0.80));
    float sill = box2(vec2(cu, fv), vec2(0.17, 0.15), vec2(0.83, 0.21));
    float slab = band(fv, 0.0, 0.07);
    c *= 1.0 - 0.12*slab;
    vec3 trim = vec3(0.96,0.95,0.92);
    c = mix(c, trim, max(frame, sill));
    vec3 glass = skyRefl(fv*0.9 + nRef*0.3, nRef);
    if (h < 0.22) glass = mix(vec3(0.95,0.85,0.70), vec3(0.9,0.6,0.5), hash12(vec2(h*91.,2.))) * mix(0.85,1.0,fv);  // curtains
    else if (h < 0.34) glass *= 0.55;
    float mull = band(cu, 0.49, 0.51);
    glass *= 1.0 - 0.5*mull;
    glass *= 1.0 - 0.35*smoothstep(0.6, 0.8, fv) * 0.5;
    c = mix(c, glass, win);
    if (win > 0.5) { rough = 0.18; metal = 0.15; if (h > 0.96) emis = vec3(1.0,0.8,0.45)*0.35; }
    // balconies every other column on some buildings
    if (fract(seed*7.3) > 0.5 && fl > 0.5) {
      float bal = box2(vec2(cu, fv), vec2(0.12, 0.0), vec2(0.88, 0.22)) * step(0.5, mod(ci + fl, 2.0));
      c = mix(c, wall * 0.78, bal * 0.9);
      float rail = box2(vec2(cu, fv), vec2(0.12, 0.2), vec2(0.88, 0.24)) * step(0.5, mod(ci + fl, 2.0));
      c = mix(c, vec3(0.95), rail);
    }
  } else if (style < 1.5 || style > 4.5) {
    // office curtain wall
    float mullW = (style > 4.5) ? 0.06 : 0.035;
    float spandrel = band(fv, 0.0, 0.16);
    float mull = band(cu, 0.0, mullW) + band(cu, 1.0-mullW, 1.0);
    vec3 glass = skyRefl(fract(v / (H*0.6)) * 0.6 + nRef*0.5 + cu*0.1, nRef) * vec3(0.82,0.92,1.02);
    glass *= mix(vec3(1.0), wall*1.2, 0.35);
    if (h < 0.08) glass = mix(glass, vec3(1.0,0.86,0.6), 0.35);
    c = mix(glass, wall * 0.85, clamp(spandrel + mull, 0., 1.));
    rough = mix(0.08, 0.7, clamp(spandrel + mull, 0., 1.));
    metal = mix(0.35, 0.1, clamp(spandrel + mull, 0., 1.));
    if (style > 4.5) {
      float fin = band(fract(u / 1.5), 0.0, 0.1);
      c = mix(c, wall * 1.1, fin); rough = mix(rough, 0.5, fin);
    }
  } else if (style < 2.5) {
    // house: siding + shuttered windows + door
    float sid = fract(v / 0.3);
    c *= 0.93 + 0.07*smoothstep(0.0, 0.12, sid);
    float win = box2(vec2(cu, fv), vec2(0.32, 0.32), vec2(0.68, 0.78));
    float frame = box2(vec2(cu, fv), vec2(0.28, 0.28), vec2(0.72, 0.82));
    float shut = box2(vec2(cu, fv), vec2(0.18, 0.3), vec2(0.28, 0.8)) + box2(vec2(cu, fv), vec2(0.72, 0.3), vec2(0.82, 0.8));
    vec3 shc = mix(vec3(0.22,0.38,0.32), vec3(0.45,0.25,0.22), step(0.5, fract(seed*3.7)));
    c = mix(c, shc, clamp(shut,0.,1.));
    c = mix(c, vec3(0.97), frame);
    vec3 glass = skyRefl(fv, nRef);
    if (h < 0.3) glass = vec3(0.95,0.88,0.72);
    c = mix(c, glass, win);
    if (win > 0.5) { rough = 0.2; }
    if (fl < 0.5 && abs(ci - floor(ncol*0.5)) < 0.5) {
      float door = box2(vec2(cu, fv), vec2(0.3, 0.0), vec2(0.7, 0.8));
      c = mix(c, mix(vec3(0.97), shc * 0.9, box2(vec2(cu, fv), vec2(0.34, 0.0), vec2(0.66, 0.76))), door);
    }
  } else {
    // shop / lowrise: storefront ground floor, windows above
    float win = box2(vec2(cu, fv), vec2(0.18, 0.3), vec2(0.82, 0.8));
    vec3 glass = skyRefl(fv, nRef);
    if (h < 0.25) glass = vec3(0.98,0.9,0.75);
    c = mix(c, vec3(0.97,0.96,0.93), box2(vec2(cu, fv), vec2(0.14, 0.26), vec2(0.86, 0.84)));
    c = mix(c, glass, win);
    if (win > 0.5) rough = 0.2;
  }
  // ground floor storefronts on apartments / shops / offices
  if (fl < 0.5 && style != 2.0 && (style < 1.5 || style > 2.5)) {
    float sf = box2(vec2(cu, fv), vec2(0.06, 0.04), vec2(0.94, 0.78));
    vec3 inside = mix(vec3(0.95,0.85,0.62), vec3(0.55,0.75,0.9), step(0.5, fract(h*5.0))) * mix(0.7, 1.0, fv);
    c = mix(c, vec3(0.2,0.2,0.24), box2(vec2(cu, fv), vec2(0.04, 0.0), vec2(0.96, 0.82)));
    c = mix(c, inside, sf);
    if (sf > 0.5) { rough = 0.15; emis = inside * 0.12; }
    // awning band
    float aw = band(fv, 0.8, 0.95);
    vec3 awc = mix(vec3(0.9,0.25,0.22), vec3(0.15,0.55,0.45), step(0.5, fract(seed*5.1+ci*0.37)));
    awc = mix(awc, vec3(0.98), step(0.5, fract(u/0.5)) * 0.85);
    c = mix(c, awc, aw);
  }
  if (top) c = mix(c, wall * 1.06, 1.0);
  if (v > H - 0.62 && v < H - 0.5) c *= 0.7;
  c *= cornerAO;
  col = c;
}
`;

function patch(mat, o) {
  const key = JSON.stringify(o);
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTime: U.uTime, uHoles: U.uHoles, uHoleN: U.uHoleN, uBlocks: U.uBlocks, uDamage: U.uDamage, uCut: U.uCut, uGrassA: U.uGrassA, uGrassB: U.uGrassB });
    let vs = sh.vertexShader, fs = sh.fragmentShader;
    // ---- vertex
    let vdecl = GLSL_COMMON.replace(/float hash12[\s\S]*$/, '') + `
attribute float paint;
#ifdef USE_INSTANCING
attribute vec3 tint2;
attribute vec3 aAnim;
#endif
attribute float limb;
attribute vec4 facade;
#ifdef USE_INSTANCING
attribute vec4 aSty;
attribute float aFade;
#endif
varying float vFade;
varying vec4 vFac; varying vec4 vSty; varying vec3 vSize; varying float vUp; varying vec3 vOP;
`;
    vs = vs.replace('#include <common>', '#include <common>\n' + vdecl);
    let anim = '';
    if (o.anim === 'walk') anim = /* glsl */`
#ifdef USE_INSTANCING
{
  float ph = aAnim.x, mode = aAnim.y, spd = aAnim.z;
  float tt = uTime * spd + ph;
  float s = sin(tt);
  if (limb > 0.5) {
    float ang; float py;
    if (limb < 2.5) { py = 0.82; ang = (limb < 1.5 ? s : -s) * 0.65; if (mode > 0.5) ang = sin(tt*2.3 + limb) * 1.1; }
    else { py = 1.36; ang = (limb < 3.5 ? -s : s) * 0.55; if (mode > 0.5) ang = 2.7 + sin(tt*3.0 + limb*1.7) * 0.5; }
    float y0 = transformed.y - py; float z0 = transformed.z;
    float ca = cos(ang), sa = sin(ang);
    transformed.y = py + y0*ca - z0*sa;
    transformed.z = y0*sa + z0*ca;
  }
  transformed.y += abs(s) * 0.06 * (1.0 - mode) * step(0.01, spd);
}
#endif
`;
    if (o.anim === 'wind') anim = /* glsl */`
#ifdef USE_INSTANCING
if (paint > 0.5) {
  vec2 ip = instanceMatrix[3].xz;
  float k = max(position.y - 1.2, 0.0) * 0.035;
  transformed.x += sin(uTime*1.6 + ip.x*0.35 + ip.y*0.2) * k;
  transformed.z += cos(uTime*1.3 + ip.y*0.31) * k * 0.6;
}
#endif
`;
    vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position;\n#ifdef USE_INSTANCING\nvFade = aFade;\n#else\nvFade = 0.0;\n#endif\n' + anim);
    let facadeV = '';
    if (o.kind === 'facade') facadeV = /* glsl */`
#ifdef USE_INSTANCING
  vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  vSty = aSty;
#else
  vec3 sc = vec3(1.0); vSty = vec4(0.0,3.0,2.0,0.0);
#endif
  vSize = sc;
  if (facade.w > 0.5) {
    vFac = vec4(facade.x * sc.x, facade.y * sc.z, facade.w, 0.0);
  } else {
    float W = facade.z < 0.5 ? sc.x : (facade.z < 1.5 ? 3.14159 * sc.x : sc.z);
    vFac = vec4(facade.x * W, facade.y * sc.y, 0.0, W);
  }
  vAO = facade.w > 0.5 ? 1.0 : mix(0.62, 1.0, smoothstep(0.0, 2.6, facade.y * sc.y));
`;
    vs = vs.replace('#include <project_vertex>', `#include <project_vertex>
{
  vec4 hw = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  hw = instanceMatrix * hw;
#endif
  hw = modelMatrix * hw; vHW = hw.xyz;
  vDark = hw.y < 0.0 ? exp(hw.y * ${f(o.darkK ?? 0.3)}) : 1.0;
  vUp = normal.y;
  vAO = mix(${f(o.aoMin ?? 0.62)}, 1.0, smoothstep(0.0, ${f(o.aoH ?? 0.9)}, position.y));
  ${facadeV}
}`);
    if (o.kind === 'paint') {
      vs = vs.replace('#include <color_vertex>', /* glsl */`
vColor = vec4(1.0);
vColor.rgb = color.rgb;
#ifdef USE_INSTANCING_COLOR
if (paint > 0.5 && paint < 1.5) vColor.rgb = color.rgb * instanceColor.rgb;
#endif
#ifdef USE_INSTANCING
if (paint > 1.5) vColor.rgb = color.rgb * tint2;
#endif
`);
    }
    // ---- fragment
    const DITHER = `
float bayer2(vec2 a){ a = floor(a); return fract(a.x*0.5 + a.y*a.y*0.75); }
float bayer4(vec2 a){ return bayer2(0.5*a)*0.25 + bayer2(a); }
float bayer8(vec2 a){ return bayer4(0.5*a)*0.25 + bayer2(a); }
uniform vec4 uCut;   // xy = hole centre in device pixels, z = window radius, w = enabled
`;
    let fdecl = GLSL_COMMON + (o.discard ? HOLE_DISCARD : '') + (o.belowClip && !o.discard ? BELOW_CLIP : '')
      + `varying float vUp; varying vec3 vOP; varying float vFade;\n` + DITHER;
    if (o.kind === 'ground') fdecl += GROUND_FN;
    if (o.kind === 'facade') fdecl += FACADE_FN;
    fs = fs.replace('#include <common>', '#include <common>\n' + fdecl);
    // Occluders are not screen-doored away wholesale any more: a soft circular window is punched
    // through them around the player's hole, so the rest of the building stays solid and readable.
    const CUT = `
if (vFade > 0.01 && uCut.w > 0.5) {
  float cd = length(gl_FragCoord.xy - uCut.xy);
  float a = vFade * smoothstep(uCut.z, uCut.z*0.60, cd);
  if (a > 0.02 && bayer8(gl_FragCoord.xy) < a) discard;
}
`;
    fs = fs.replace('void main() {', 'void main() {\n' + CUT + (o.discard ? 'holeDiscard();\n' : (o.belowClip ? 'belowClip();\n' : '')) + 'float gRough = 0.8; float gMetal = 0.0; vec3 gEmis = vec3(0.0);\n');
    if (o.kind === 'ground') {
      fs = fs.replace('#include <map_fragment>', 'diffuseColor.rgb = pow(groundColor(vHW.xz, vUp, vHW.y, gRough), vec3(2.2));\n');
      fs = fs.replace('#include <color_fragment>', '');
    } else if (o.kind === 'facade') {
      fs = fs.replace('#include <map_fragment>', '');
      fs = fs.replace('#include <color_fragment>', '{ vec3 fc; facade(pow(vColor.rgb, vec3(1.0/2.2)), fc, gRough, gMetal, gEmis); diffuseColor.rgb = pow(max(fc, vec3(0.0)), vec3(2.2)) * vAO; gEmis = pow(gEmis, vec3(2.2)); }\n');
    } else {
      let extra = '';
      // roof tiles: visible courses with a shaded lower edge and per-tile colour variation,
      // so a close-up roof is never one flat slab of colour
      if (o.shingles) extra = `{
        float row = vOP.y*4.4; float sh = fract(row);
        diffuseColor.rgb *= 0.76 + 0.24*smoothstep(0.0, 0.30, sh) * smoothstep(1.0, 0.80, sh);
        vec2 tid = floor(vec2(vOP.x*2.6 + mod(floor(row), 2.0)*0.5, row));
        diffuseColor.rgb *= 0.90 + 0.17*hash12(tid);
        diffuseColor.rgb *= 1.0 - 0.18*smoothstep(0.055, 0.0, abs(fract(vOP.x*2.6 + mod(floor(row), 2.0)*0.5) - 0.5)*2.0);
      }\n`;
      fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vAO;\n' + extra);
    }
    if (o.kind === 'ground' || o.kind === 'facade') {
      fs = fs.replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;');
      fs = fs.replace('#include <metalnessmap_fragment>', 'float metalnessFactor = gMetal;');
      fs = fs.replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += gEmis;');
    }
    fs = fs.replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.rgb *= vDark;\n');
    sh.vertexShader = vs; sh.fragmentShader = fs;
  };
  return mat;
}

export function groundMaterial() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, envMapIntensity: 0.6 });
  return patch(m, { kind: 'ground', discard: true, aoH: 0.0001, aoMin: 1 });
}
export function facadeMaterial() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, vertexColors: false, envMapIntensity: 0.55 });
  return patch(m, { kind: 'facade', darkK: 0.22, belowClip: true });
}
export function paintMaterial(o = {}) {
  const m = new THREE.MeshStandardMaterial({ roughness: o.rough ?? 0.7, metalness: o.metal ?? 0, vertexColors: true, envMapIntensity: o.env ?? 0.7, flatShading: false });
  return patch(m, { kind: 'paint', anim: o.anim || null, aoH: o.aoH ?? 0.9, aoMin: o.aoMin ?? 0.62, shingles: !!o.shingles, darkK: o.darkK ?? 0.3, discard: !!o.discard, belowClip: true });
}

// Excavation mask over the platform; painted wherever something has been swallowed.
// 256 across ~334 m of city is ~1.3 m per texel — fine enough that a dig site has an edge.
export const DMG = { size: 256, data: null, tex: null, dirty: false, half: 0 };
export function initDamage(half) {
  const n = DMG.size;
  DMG.half = half;
  DMG.data = new Uint8Array(n * n);
  const t = new THREE.DataTexture(DMG.data, n, n, THREE.RedFormat, THREE.UnsignedByteType);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  if (DMG.tex) DMG.tex.dispose();
  DMG.tex = t; U.uDamage.value = t; DMG.dirty = false;
}
export function clearDamage() { if (DMG.data) { DMG.data.fill(0); DMG.dirty = true; } }
// Splat a soft disc of excavation at a world position.
export function paintDamage(x, z, r, amount = 1) {
  if (!DMG.data) return;
  const n = DMG.size, half = DMG.half, scale = n / (half * 2);
  const cx = (x + half) * scale, cz = (z + half) * scale, rr = Math.max(0.8, r * scale);
  const i0 = Math.max(0, Math.floor(cx - rr)), i1 = Math.min(n - 1, Math.ceil(cx + rr));
  const j0 = Math.max(0, Math.floor(cz - rr)), j1 = Math.min(n - 1, Math.ceil(cz + rr));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const d = Math.hypot(i + 0.5 - cx, j + 0.5 - cz) / rr;
    if (d > 1) continue;
    const v = (1 - d * d) * 255 * amount;
    const k = j * n + i;
    if (v > DMG.data[k]) { DMG.data[k] = Math.min(255, v | 0); DMG.dirty = true; }
  }
}
export function flushDamage() { if (DMG.dirty && DMG.tex) { DMG.tex.needsUpdate = true; DMG.dirty = false; } }

// Soft contact shadow / AO decal texture (rounded rect with gaussian falloff)
export function decalTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  g.filter = 'blur(14px)';
  g.fillStyle = '#fff';
  const r = 24; const x = 30, y = 30, w = 68, h = 68;
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace;
  return t;
}

export function decalMaterial() {
  const m = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false, alphaMap: decalTexture(), opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.customProgramCacheKey = () => 'decal';
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uHoles: U.uHoles, uHoleN: U.uHoleN });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHW;').replace('#include <project_vertex>', `#include <project_vertex>
{ vec4 hw = vec4(transformed,1.0);
#ifdef USE_INSTANCING
hw = instanceMatrix * hw;
#endif
vHW = (modelMatrix * hw).xyz; }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vHW;\n' + HOLE_DISCARD).replace('void main() {', 'void main() {\nholeDiscard();\n');
  };
  return m;
}
