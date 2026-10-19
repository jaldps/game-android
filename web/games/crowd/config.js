// Mob Rush — tuning + content tables
export const ROUND_TIME = 120;

// City grid (world units; a person is ~1.15 tall)
export const GRID = {
  NB: 7,          // walkable blocks per side
  BLOCK: 28,      // block size incl. sidewalk
  ROAD: 10,       // road width
  WALK: 3.0,      // sidewalk width
  CURB: 0.16,     // sidewalk raise
  RING: 2,        // decorative (non-walkable) block rings outside the playfield
};
GRID.PITCH = GRID.BLOCK + GRID.ROAD;
GRID.SPAN = GRID.NB * GRID.PITCH + GRID.ROAD;     // walkable extent (road to road)
GRID.X0 = -GRID.SPAN / 2;
GRID.HALF = GRID.SPAN / 2;

export const SIM = {
  MAX: 3400,          // agent capacity
  NEUTRAL0: 1500,     // neutrals at round start
  R: 0.3,             // body radius
  SEP: 0.58,          // preferred spacing
  CONTACT: 0.66,      // team vs team contact distance
  RECRUIT: 0.78,      // follower -> neutral recruit distance
  LEADER_SPEED: 7.4,
  FOLLOW_SPEED: 8.6,
  NEUTRAL_SPEED: 1.3,
  STEP: 0.5,          // max climb per move
  ABSORB_T: 0.07,     // contact time before a rival member flips
};

export const BOT_NAMES = ['Blaze', 'Mochi', 'Kingpin', 'Zara', 'Turbo', 'Nimbus', 'Pepper', 'Ozzy', 'Lulu', 'Rocco', 'Juno', 'Biscuit', 'Viper', 'Momo', 'Ace', 'Fizz', 'Gus', 'Tango'];
// rival colours (player colour excluded at runtime)
export const TEAM_COLORS = ['#ff4b55', '#ffb21f', '#2fd36d', '#a160ff', '#ff5fbf', '#ff7b2e', '#f2dc2a', '#1fc7c0', '#3f6dff', '#8a4b2d'];

// Player crowd colours (skins)
export const SKINS = [
  { id: 'sky', name: 'Sky', price: 0, color: '#2f9bff' },
  { id: 'mint', name: 'Mint', price: 120, color: '#20c997' },
  { id: 'grape', name: 'Grape', price: 220, color: '#8e5cff' },
  { id: 'coral', name: 'Coral', price: 320, color: '#ff6a5a' },
  { id: 'lemon', name: 'Lemon', price: 420, color: '#ffd21f' },
  { id: 'hot', name: 'Hot Pink', price: 560, color: '#ff3fa4' },
  { id: 'ink', name: 'Midnight', price: 720, color: '#2e3a66' },
  { id: 'lime', name: 'Lime', price: 900, color: '#8ee000' },
];
// Leader hats
export const HATS = [
  { id: 'none', name: 'Crown', price: 0 },
  { id: 'cap', name: 'Cap', price: 150 },
  { id: 'tophat', name: 'Top Hat', price: 300 },
  { id: 'party', name: 'Party', price: 450 },
  { id: 'viking', name: 'Viking', price: 650 },
  { id: 'halo', name: 'Halo', price: 900 },
];

// Cities: layout seed + palette + light
export const CITIES = [
  {
    id: 'pastel', name: 'Pastel Bay', price: 0, bots: 7, botSkill: 0.6,
    sky: ['#9fd3ff', '#eaf6ff'], fog: '#d9ecf8', sun: '#fff1dc', sunI: 3.6, hemiSky: '#dcecff', hemiGround: '#c8b9a6', hemiI: 1.15, exposure: 1.0,
    sunDir: [-0.5, 0.78, 0.38],
    road: [0.66, 0.68, 0.74], walk: [0.93, 0.92, 0.9], walk2: [0.86, 0.87, 0.9], grass: [0.47, 0.78, 0.38], grass2: [0.62, 0.86, 0.42],
    plazaA: [0.96, 0.9, 0.82], plazaB: [0.98, 0.72, 0.62], roof: [0.82, 0.84, 0.88], line: [1, 1, 1], lineY: [1.0, 0.8, 0.25],
    walls: ['#ffb5b0', '#ffd59e', '#a8e6cf', '#b8d8ff', '#d7c3ff', '#fff1c4', '#ffc6e0', '#9ee3e8', '#cfe8a8', '#f9c9a6'],
    office: ['#8ec8ff', '#9fe0e8', '#b6c3ff', '#a7e8cf'],
    foliage: ['#5fc24a', '#79cf4d', '#4fb44a', '#8fd65a'], blossom: false,
    sat: 1.12, warm: [1.02, 1.0, 0.98],
  },
  {
    id: 'sunset', name: 'Sunset Harbor', price: 600, bots: 8, botSkill: 0.75,
    sky: ['#ff9f7a', '#ffe1b8'], fog: '#ffd6b8', sun: '#ffc48a', sunI: 3.9, hemiSky: '#ffd8c0', hemiGround: '#9a7aa0', hemiI: 1.0, exposure: 1.02,
    sunDir: [-0.75, 0.42, 0.25],
    road: [0.62, 0.6, 0.66], walk: [0.95, 0.88, 0.8], walk2: [0.9, 0.82, 0.76], grass: [0.52, 0.72, 0.32], grass2: [0.7, 0.8, 0.36],
    plazaA: [0.98, 0.86, 0.72], plazaB: [0.9, 0.55, 0.45], roof: [0.86, 0.8, 0.78], line: [1, 0.97, 0.92], lineY: [1.0, 0.78, 0.3],
    walls: ['#ffb38a', '#ffd38a', '#f6a6a6', '#c9a6e8', '#ffe2b0', '#e8a0b8', '#a8d8d0', '#ffc8a0', '#d8b8f0', '#f0d0a0'],
    office: ['#f0b890', '#c8a8e0', '#e8c8a0', '#a8c8e0'],
    foliage: ['#6aa83a', '#8ab840', '#5a9a3a', '#9ac04a'], blossom: false,
    sat: 1.1, warm: [1.05, 0.99, 0.94],
  },
  {
    id: 'blossom', name: 'Blossom Hills', price: 1400, bots: 9, botSkill: 0.9,
    sky: ['#b8c8ff', '#fbefff'], fog: '#efe4fa', sun: '#fff4f0', sunI: 3.4, hemiSky: '#efe2ff', hemiGround: '#c0b0b8', hemiI: 1.2, exposure: 1.0,
    sunDir: [0.45, 0.8, 0.42],
    road: [0.7, 0.68, 0.76], walk: [0.96, 0.93, 0.95], walk2: [0.9, 0.86, 0.92], grass: [0.5, 0.8, 0.5], grass2: [0.66, 0.88, 0.55],
    plazaA: [0.98, 0.92, 0.94], plazaB: [0.95, 0.66, 0.78], roof: [0.86, 0.84, 0.9], line: [1, 1, 1], lineY: [1.0, 0.75, 0.6],
    walls: ['#ffc2d6', '#ffe0ea', '#c8e8ff', '#e0d0ff', '#fff0d0', '#b0e8d8', '#ffd0c0', '#d8f0c0', '#f8c8f0', '#c0d8ff'],
    office: ['#c8d8ff', '#e8c8f0', '#b8e8f0', '#d0c8ff'],
    foliage: ['#ff9ec4', '#ffb8d4', '#f58bb8', '#7ccf5a'], blossom: true,
    sat: 1.08, warm: [1.02, 0.99, 1.02],
  },
];
