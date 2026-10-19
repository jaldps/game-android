// Tuning constants for Frostline Dash
export const LANE_W = 2.1;
export const LANES = [-LANE_W, 0, LANE_W];
export const TRACK_HALF = 3.55;          // half-width of the packed sled track
export const CHUNK = 40;                 // world chunk length (units, along -Z)
export const AHEAD = 250;                // how far ahead the world is built
export const BEHIND = 30;
export const SPEED0 = 15.5, SPEEDMAX = 31, SPEED_TAU = 160;   // speed(t) = 15.5 + (31-15.5)*(1-exp(-t/160))
export const GRAV = 34, JUMP_V = 10.6, SUPER_JUMP_V = 17.5, FASTFALL_V = -24;
export const DUCK_TIME = 0.62;
export const LANE_TIME = 0.15;           // approx lane switch time
export const PLAYER_HALF_W = 0.42;
export const STUMBLE_WINDOW = 7.5;       // seconds the pursuer stays close after a stumble
export const POWER_TIME = { magnet: 11, kite: 8, x2: 14, boots: 12, shield: 999 };
export const KITE_Y = 6.2;
export const COIN_SPACING = 2.4;
export const REBASE = 3000;
export const START_MULT = 1;
// characters + sleds (unlockables)
export const CHARACTERS = [
  { id: 'pip',   name: 'Pip',    price: 0,    parka: '#e8443a', parka2: '#b52a26', hat: '#ffcf3a', hat2: '#ffffff', scarf: '#2fb7c9', skin: '#ffd2b0', hair: '#6b3a22', pants: '#33426b', hatType: 'beanie', bag: '#3e8f4f' },
  { id: 'juno',  name: 'Juno',   price: 600,  parka: '#22b3a6', parka2: '#147a72', hat: '#ff7eb6', hat2: '#ffe3f0', scarf: '#ffd23f', skin: '#f2c19d', hair: '#2a1a14', pants: '#4a3a6b', hatType: 'muffs', bag: '#ff8a3d' },
  { id: 'bram',  name: 'Bram',   price: 1500, parka: '#ff9a2e', parka2: '#c4661a', hat: '#7a4a2a', hat2: '#f4e2c8', scarf: '#d93a4b', skin: '#c98a62', hair: '#1c120c', pants: '#2c3b52', hatType: 'aviator', bag: '#3a6fd8' },
  { id: 'yuki',  name: 'Yuki',   price: 3000, parka: '#f4f1ff', parka2: '#b9b0e6', hat: '#ffffff', hat2: '#ffb3d1', scarf: '#8b5cf6', skin: '#ffe0c7', hair: '#1a1a2a', pants: '#6b4fb8', hatType: 'bunny', bag: '#ff5d8f' },
  { id: 'rex',   name: 'Rex',    price: 6000, parka: '#5cc24a', parka2: '#3a8a2e', hat: '#5cc24a', hat2: '#ffe066', scarf: '#ff6b3d', skin: '#ffd2b0', hair: '#5a3a1a', pants: '#2f5a3a', hatType: 'dino', bag: '#ffe066' },
];
export const SLEDS = [
  { id: 'classic', name: 'Toboggan',      price: 0,    wood: '#c98a4e', trim: '#8a5a2e', runner: '#d23b3b', glow: null },
  { id: 'racer',   name: 'Red Racer',     price: 900,  wood: '#e03a3a', trim: '#ffffff', runner: '#ffd34a', glow: null },
  { id: 'glacier', name: 'Glacier Board', price: 2500, wood: '#8fe3ff', trim: '#e8fbff', runner: '#4fc3ff', glow: '#5fd8ff' },
  { id: 'comet',   name: 'Golden Comet',  price: 5000, wood: '#ffcc3d', trim: '#fff1b8', runner: '#ff7a1a', glow: '#ffb02e' },
];
export const MISSIONS = [
  { k: 'coins',   n: [60, 150, 300, 500],     t: 'Collect {n} coins in one run' },
  { k: 'jumps',   n: [15, 30, 50],            t: 'Jump {n} times' },
  { k: 'rolls',   n: [10, 25, 40],            t: 'Duck under {n} times' },
  { k: 'dist',    n: [500, 1200, 2500],       t: 'Sled {n} m in one run' },
  { k: 'powers',  n: [2, 4, 7],               t: 'Grab {n} power-ups' },
  { k: 'tops',    n: [3, 8, 15],              t: 'Ride on top of {n} sleigh-carts' },
  { k: 'score',   n: [5000, 15000, 40000],    t: 'Score {n} in one run' },
  { k: 'kites',   n: [1, 3],                  t: 'Glide with the kite {n} times' },
  { k: 'lanes',   n: [60, 150],               t: 'Switch lanes {n} times' },
];
