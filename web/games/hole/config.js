// Sinkhole City — tuning + content tables
export const ROUND_TIME = 120;

// City grid (world units ~ metres)
export const CITY = {
  NX: 7, NZ: 7,
  BLOCK: 26,     // block (incl. sidewalk) size
  ROAD: 9,       // road width
  WALK: 3.2,     // sidewalk width inside a block
  CURB_H: 0.16,  // block raised height
  BORDER: 26,    // outer district ring (esplanade + landmark towers + set-pieces)
};
CITY.PITCH = CITY.BLOCK + CITY.ROAD;
CITY.SPAN = CITY.NX * CITY.PITCH + CITY.ROAD;          // road-to-road extent
CITY.X0 = -CITY.SPAN / 2;                              // first road starts here
CITY.HALF = CITY.SPAN / 2 + CITY.BORDER;               // platform half extent

// Hole growth: discrete levels, radius per level, mass needed per level
export const HOLE = {
  R0: 1.16,
  LEVEL_GROWTH: 1.1125,
  MAX_LEVEL: 30,
  GROW: 0.265,           // fraction of swallowed footprint area added to the hole's area
  FIT: 0.94,             // object size must be < r*FIT to fall in
  SPEED_BASE: 7.4,
  SPEED_PER_R: 0.30,
  EAT_HOLE_RATIO: 1.18,  // radius ratio required to eat another hole
  BOT_GROW: 1.0,         // bots grow exactly as fast as the player
  BOT_RUBBER: 0.55,      // extra growth for bots that are behind the leader
};
export function levelRadius(L) { return HOLE.R0 * Math.pow(HOLE.LEVEL_GROWTH, L - 1); }
export function levelMass(L) { const a = levelRadius(L), b = levelRadius(L + 1); return Math.PI * (b * b - a * a) / HOLE.GROW; }
export function objectMass(size) { return Math.max(0.32, 3.2 * size * size); }

// Skins: rim styles (style index used by the rim shader)
export const SKINS = [
  { id: 'classic', name: 'Classic', price: 0, a: '#2f8cff', b: '#8fd0ff', style: 0 },
  { id: 'sunset', name: 'Sunset', price: 400, a: '#ff6a3d', b: '#ffcf5a', style: 1 },
  { id: 'toxic', name: 'Toxic', price: 750, a: '#59e000', b: '#e9ff6a', style: 2 },
  { id: 'candy', name: 'Candy', price: 1100, a: '#ff4fa3', b: '#ffffff', style: 3 },
  { id: 'galaxy', name: 'Galaxy', price: 1600, a: '#6a3dff', b: '#ff7ae6', style: 4 },
  { id: 'lava', name: 'Lava', price: 2200, a: '#ff2a00', b: '#ffb000', style: 5 },
  { id: 'gold', name: 'Royal Gold', price: 3200, a: '#d9a521', b: '#fff1a8', style: 6 },
  { id: 'rainbow', name: 'Prism', price: 4500, a: '#ff3d6e', b: '#3dd6ff', style: 7 },
];

export const BOT_NAMES = ['Mango', 'Kraken', 'Zippy', 'Luna', 'Boltz', 'Pixel', 'Nova', 'Tacocat', 'Rubi', 'Gizmo', 'Yeti', 'Comet', 'Sushi', 'Wombat', 'Vortex', 'Pebble'];
export const BOT_COLORS = ['#ff4d4d', '#ffb02e', '#3ddc84', '#b46bff', '#ff5fb8', '#22d3ee', '#f5e04a', '#ff7a3d', '#8b9cff'];
export const NUM_BOTS = 7;

// Combo tiers — named, so a long chain reads as a rank instead of a meaningless number
export const COMBO_TIERS = [
  { n: 3, name: 'NICE', col: '#9fe8ff' },
  { n: 6, name: 'TASTY', col: '#7ef0a8' },
  { n: 10, name: 'FEEDING FRENZY', col: '#ffe14a' },
  { n: 16, name: 'DEVOURING', col: '#ffa23d' },
  { n: 24, name: 'UNSTOPPABLE', col: '#ff5f8f' },
  { n: 34, name: 'CITY EATER', col: '#c48bff' },
];
export function comboTier(n) { let t = null; for (const c of COMBO_TIERS) if (n >= c.n) t = c; return t; }

// ---------------- Maps / themes ----------------
// Each theme retints the whole world: sky, sun, water, palettes and grade.
export const THEMES = [
  {
    id: 'harbor', name: 'HARBOR CITY', sub: 'Sunny bayside blocks',
    sky: { top: [0.30, 0.56, 0.95], hor: [1.00, 0.92, 0.82], sun: [1.0, 0.85, 0.6] },
    fog: '#bfe0ee', sun: '#ffdcae', sunI: 3.9, hemiSky: '#cfe4ff', hemiGnd: '#c9a27a', hemiI: 0.95,
    sunDir: [-0.45, 0.68, 0.5],
    water: { shallow: [0.30, 0.80, 0.82], deep: [0.08, 0.45, 0.68] },
    grade: { sat: 1.2, con: 1.06, tint: [1.03, 1.0, 0.96] }, exposure: 1.0,
    walls: ['#f2a07b', '#f6c873', '#9fd8c8', '#b9a7e8', '#f4e3c3', '#ef8f8f', '#8ec5ef', '#f0b5cf', '#c9e08f', '#e9d1a6', '#ffd6a0', '#a5e0e4'],
    office: ['#7fb6e6', '#93c9d6', '#a7b9e8', '#c7d8e8', '#86c3b8'],
    roofs: ['#c75b4a', '#4f6ea8', '#6b7d5a', '#a8563f', '#5b5f73', '#d27a46'],
    foliage: ['#5fb83a', '#4ea832', '#78c443', '#3f9a3a', '#8acb4a', '#69b548'],
    grass: [[0.31, 0.58, 0.17], [0.50, 0.74, 0.26]],
  },
  {
    id: 'sunset', name: 'DUSK BAY', sub: 'Golden hour on the pier',
    sky: { top: [0.26, 0.33, 0.70], hor: [1.00, 0.70, 0.46], sun: [1.0, 0.62, 0.34] },
    fog: '#f0b894', sun: '#ffb06a', sunI: 4.2, hemiSky: '#9fb0ef', hemiGnd: '#d08b5a', hemiI: 0.85,
    sunDir: [-0.72, 0.30, 0.38],
    water: { shallow: [0.42, 0.52, 0.72], deep: [0.10, 0.20, 0.46] },
    grade: { sat: 1.26, con: 1.08, tint: [1.07, 0.99, 0.93] }, exposure: 1.02,
    walls: ['#f3a083', '#ffc98c', '#d4a1d8', '#b9a7e8', '#ffe0bd', '#ef8f8f', '#9ab6ef', '#f7b3c6', '#e0d08f', '#f0c8a0', '#ffc895', '#b2c9ea'],
    office: ['#8aa6d8', '#a88fc9', '#b7a3d6', '#d6c4d8', '#8fa9c0'],
    roofs: ['#b8504a', '#48558f', '#7a6a5a', '#9c4a3f', '#4e4a63', '#cf7046'],
    foliage: ['#4e9a44', '#3f8a3c', '#67ad4c', '#357f3a', '#7ab050', '#589b4e'],
    grass: [[0.27, 0.46, 0.18], [0.46, 0.63, 0.27]],
  },
  {
    id: 'spring', name: 'EMERALD KEY', sub: 'Pastel island town',
    sky: { top: [0.34, 0.68, 0.92], hor: [0.92, 0.98, 0.92], sun: [0.95, 1.0, 0.85] },
    fog: '#cdeee4', sun: '#fff3cf', sunI: 3.7, hemiSky: '#d6f2ff', hemiGnd: '#9fc49a', hemiI: 1.0,
    sunDir: [-0.30, 0.74, 0.60],
    water: { shallow: [0.42, 0.92, 0.86], deep: [0.07, 0.56, 0.68] },
    grade: { sat: 1.18, con: 1.05, tint: [0.99, 1.01, 0.99] }, exposure: 1.0,
    walls: ['#ffd9e0', '#d8f0c4', '#bfe6f2', '#f6e7b8', '#e4d6f5', '#ffc9b5', '#c5ead9', '#f7d9ef', '#e8f0b8', '#fdeedd', '#cfe3ff', '#b8ecd8'],
    office: ['#9cd6e6', '#a8d8c8', '#b6cdef', '#d4e8f0', '#8ed0bc'],
    roofs: ['#d9705c', '#5f84b8', '#74966a', '#bf6a52', '#6a7288', '#e08a52'],
    foliage: ['#64c845', '#53b93c', '#80d44e', '#46a944', '#92dd58', '#70c454'],
    grass: [[0.33, 0.64, 0.21], [0.56, 0.82, 0.32]],
  },
];
export function themeById(id) { return THEMES.find(t => t.id === id) || THEMES[0]; }

// Palette — live copy, swapped by applyTheme()
export const PAL = {
  walls: [], office: [], roofs: [], foliage: [],
  cars: ['#e8433f', '#2f7de1', '#f7c531', '#ffffff', '#3a3f4a', '#35b26b', '#ff8a2a', '#9b5de5', '#e5e5e5', '#18a7c9'],
  shirts: ['#ff5a5f', '#3fa7ff', '#ffd23f', '#43d17a', '#b06bff', '#ff8c42', '#ffffff', '#2b2d42', '#ff70a6', '#20c4b5'],
  pants: ['#2b3a67', '#3d3d3d', '#6b4f3a', '#1f4e79', '#4a4a6a', '#7a7a7a', '#22303c'],
};
export const THEME = { cur: THEMES[0] };
export function applyTheme(id) {
  const t = themeById(id); THEME.cur = t;
  PAL.walls = t.walls.slice(); PAL.office = t.office.slice(); PAL.roofs = t.roofs.slice(); PAL.foliage = t.foliage.slice();
  return t;
}
applyTheme('harbor');

// ---------------- Set-pieces ----------------
// Only a near-max hole can swallow these. Each one is an objective with its own callout.
export const MEGAS = [
  { id: 'spire', label: 'THE SPIRE', call: 'SWALLOW THE SPIRE!', size: 18.5, value: 2600, hint: 'A 140 m needle of glass' },
  { id: 'stadium', label: 'THE ARENA', call: 'SWALLOW THE ARENA!', size: 16.5, value: 2100, hint: 'Sunday\'s match is cancelled' },
  { id: 'wheel', label: 'THE BIG WHEEL', call: 'SWALLOW THE BIG WHEEL!', size: 13.5, value: 1600, hint: 'Last ride of the day' },
];
