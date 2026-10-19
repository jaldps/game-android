// Static game data: biomes, career courses, upgrades, outfits, rivals, tuning.

export const BIOMES = {
  pine: {
    name: 'Alpine Pines', trail: 'dirt', width: 5.0,
    skyTop: '#3f7fd0', skyHor: '#cfe2ea', skyGround: '#8a9a80', fog: '#c6dae0', fogNear: 45, fogFar: 340,
    sun: '#fff0d8', sunI: 3.4, sunEl: 34, sunAz: 40, hemiSky: '#d4e8ff', hemiGnd: '#56663a', hemiI: 1.05, exposure: 1.0,
    hills: 16, wall: 4, clouds: 0.55, mountains: 'alpine', grade: [-0.13, -0.2],
    grass: ['#5e7e2e', '#4f6c26', '#6f8c38', '#80943f', '#3f5a20'], blade: ['#87aa45', '#a2c058', '#4b6a25', '#6c8f35', '#b5c46a'],
    dirt: ['#8a6440', '#7a5534', '#9a7048', '#6e4a2c', '#a47c52'], rock: ['#8d8c86', '#7a7a76', '#a3a29b', '#68686a'],
    trees: 'pine', grassTuft: 'green', flowers: true,
  },
  village: {
    name: 'Cliff Village', trail: 'cobble', width: 4.4,
    skyTop: '#2f7ee0', skyHor: '#d6ecf6', skyGround: '#c8d4d8', fog: '#d4e8f2', fogNear: 60, fogFar: 420,
    sun: '#fff6e6', sunI: 3.7, sunEl: 48, sunAz: -35, hemiSky: '#dbeeff', hemiGnd: '#b7a58a', hemiI: 1.15, exposure: 1.0,
    hills: 6, wall: 0, clouds: 0.25, mountains: 'sea', grade: [-0.12, -0.18],
    grass: ['#9a9a5a', '#86884c', '#aaa468', '#b3a273', '#7a7e44'], blade: ['#a8a85c', '#c2b86e', '#8a9248', '#d0c27c'],
    dirt: ['#cfc8bc', '#bdb5a8', '#ddd6ca', '#aaa294'], rock: ['#d8cdb8', '#c4b8a0', '#e6dcc8', '#b0a48c'],
    trees: 'olive', grassTuft: 'dry', flowers: true, houses: true,
  },
  desert: {
    name: 'Red Canyon', trail: 'sand', width: 5.4,
    skyTop: '#2c6bc4', skyHor: '#f2cfa6', skyGround: '#b07050', fog: '#e9c39c', fogNear: 50, fogFar: 380,
    sun: '#ffd9a8', sunI: 3.6, sunEl: 26, sunAz: 60, hemiSky: '#cfe0ff', hemiGnd: '#a85a34', hemiI: 0.95, exposure: 1.02,
    hills: 10, wall: 26, clouds: 0.18, mountains: 'mesa', grade: [-0.12, -0.19],
    grass: ['#c0703e', '#b0623a', '#cf8250', '#a85a34', '#d69460'], blade: ['#a29452', '#b8a25e', '#86803f', '#c9b070'],
    dirt: ['#c9784a', '#b86a40', '#d68a58', '#a85c36', '#e09a66'], rock: ['#b45a34', '#c8703e', '#9c4a2a', '#d88a56'],
    trees: 'cactus', grassTuft: 'sage', flowers: false,
  },
  autumn: {
    name: 'Autumn Woods', trail: 'dirt', width: 4.8,
    skyTop: '#5b8fcf', skyHor: '#f0dcbc', skyGround: '#8a6a4a', fog: '#dcc7a6', fogNear: 35, fogFar: 300,
    sun: '#ffd8a0', sunI: 3.3, sunEl: 24, sunAz: -50, hemiSky: '#e8dcc8', hemiGnd: '#6a4a2a', hemiI: 1.0, exposure: 1.02,
    hills: 14, wall: 3, clouds: 0.45, mountains: 'hills', grade: [-0.12, -0.19],
    grass: ['#8a6a2e', '#9a5a26', '#7a6a30', '#b0702a', '#6a5a2a'], blade: ['#a69a48', '#b8a452', '#7f8a3a', '#c48a3a', '#d0a040'],
    dirt: ['#6e4c30', '#5f4028', '#7d583a', '#4e3420', '#8a6442'], rock: ['#7f7a70', '#6d6a62', '#938d80', '#5a5852'],
    trees: 'autumn', grassTuft: 'fern', flowers: false, leaves: true,
  },
};

export const COURSES = [
  { id: 'pine1', biome: 'pine', name: 'Pine Ridge', sub: 'Alpine singletrack', seed: 11, len: 1450, skill: 0.84, feat: 1.0 },
  { id: 'cliff1', biome: 'village', name: 'Whitecliff Steps', sub: 'Cobbles & stairs', seed: 23, len: 1350, skill: 0.87, feat: 1.0 },
  { id: 'canyon1', biome: 'desert', name: 'Red Canyon', sub: 'Desert slickrock', seed: 37, len: 1550, skill: 0.9, feat: 1.1 },
  { id: 'ember1', biome: 'autumn', name: 'Ember Woods', sub: 'Roots & berms', seed: 41, len: 1550, skill: 0.92, feat: 1.1 },
  { id: 'pine2', biome: 'pine', name: 'Glacier Line', sub: 'Pro · alpine', seed: 53, len: 1750, skill: 0.95, feat: 1.25 },
  { id: 'cliff2', biome: 'village', name: 'Harbor Plunge', sub: 'Pro · cliff village', seed: 67, len: 1600, skill: 0.97, feat: 1.25 },
  { id: 'canyon2', biome: 'desert', name: 'Mesa Drop', sub: 'Pro · canyon', seed: 71, len: 1800, skill: 0.99, feat: 1.35 },
  { id: 'ember2', biome: 'autumn', name: 'Hollow Falls', sub: 'Pro · woods', seed: 83, len: 1800, skill: 1.01, feat: 1.35 },
];

export const UPGRADES = [
  { id: 'speed', name: 'FRAME', desc: 'Top speed', icon: 'speed' },
  { id: 'grip', name: 'TYRES', desc: 'Cornering grip', icon: 'grip' },
  { id: 'armor', name: 'ARMOR', desc: 'Crash damage', icon: 'armor' },
  { id: 'boost', name: 'BOOST', desc: 'Power gain', icon: 'boost' },
];
export const UP_COST = [120, 260, 450, 700, 1000];
export const UP_MAX = 5;

// Rider kits: jersey, jersey accent, pants, helmet, helmet accent, skin
export const KITS = [
  { name: 'Ember', cost: 0, jersey: '#ff6a1a', acc: '#1d2230', pants: '#2b313d', helmet: '#f2f2f2', hacc: '#ff6a1a', num: 7 },
  { name: 'Glacier', cost: 300, jersey: '#2aa7ff', acc: '#ffffff', pants: '#1c2a44', helmet: '#16243a', hacc: '#2aa7ff', num: 21 },
  { name: 'Venom', cost: 450, jersey: '#b7ff2a', acc: '#151515', pants: '#151515', helmet: '#151515', hacc: '#b7ff2a', num: 13 },
  { name: 'Royal', cost: 600, jersey: '#7b3cff', acc: '#ffd23a', pants: '#2a1f44', helmet: '#ffd23a', hacc: '#7b3cff', num: 1 },
  { name: 'Rally', cost: 800, jersey: '#e8203a', acc: '#ffffff', pants: '#f0f0f0', helmet: '#e8203a', hacc: '#ffffff', num: 33 },
  { name: 'Stealth', cost: 1100, jersey: '#2a2d33', acc: '#ff3b8d', pants: '#1a1b1f', helmet: '#2a2d33', hacc: '#ff3b8d', num: 99 },
];
export const PAINTS = [
  { name: 'Lava', cost: 0, frame: '#e53b1e', acc: '#1a1a1a', fork: '#f2b632', rim: '#1a1a1a' },
  { name: 'Ice', cost: 250, frame: '#e9eef2', acc: '#2aa7ff', fork: '#2aa7ff', rim: '#2aa7ff' },
  { name: 'Toxic', cost: 400, frame: '#9be81e', acc: '#111', fork: '#111', rim: '#9be81e' },
  { name: 'Midnight', cost: 550, frame: '#1f2a44', acc: '#ff7a1a', fork: '#ff7a1a', rim: '#111' },
  { name: 'Bubblegum', cost: 750, frame: '#ff5fb0', acc: '#ffffff', fork: '#ffffff', rim: '#ff5fb0' },
  { name: 'Carbon', cost: 1000, frame: '#26282c', acc: '#f2c230', fork: '#f2c230', rim: '#f2c230' },
];

export const RIVALS = [
  { name: 'Kai', kit: { jersey: '#20c4b0', acc: '#103a3a', pants: '#1d2a2a', helmet: '#20c4b0', hacc: '#ffffff', num: 4 }, paint: { frame: '#1aa894', acc: '#fff', fork: '#222', rim: '#222' }, skill: 1.0 },
  { name: 'Mila', kit: { jersey: '#ffd12a', acc: '#222', pants: '#2a2a2a', helmet: '#222222', hacc: '#ffd12a', num: 18 }, paint: { frame: '#ffd12a', acc: '#222', fork: '#222', rim: '#222' }, skill: 0.98 },
  { name: 'Jonas', kit: { jersey: '#3b6cff', acc: '#fff', pants: '#1b2240', helmet: '#ffffff', hacc: '#3b6cff', num: 26 }, paint: { frame: '#3b6cff', acc: '#fff', fork: '#ddd', rim: '#222' }, skill: 0.96 },
  { name: 'Rita', kit: { jersey: '#ff3d6e', acc: '#fff', pants: '#2b1b24', helmet: '#ff3d6e', hacc: '#222', num: 9 }, paint: { frame: '#f2f2f2', acc: '#ff3d6e', fork: '#ff3d6e', rim: '#222' }, skill: 0.94 },
];

export const TUNE = {
  G: 9.81,
  drag: 0.0042,         // aero drag coefficient (per m)
  roll: 0.35,           // rolling resistance m/s^2
  pedalV: 9.5,          // rider pedals below this speed
  pedalA: 2.2,
  brakeA: 8.5,
  boostA: 6.5, boostT: 2.3, boostV: 1.32,
  latAcc: 8.2,          // grip limit (m/s^2) before drifting wide
  yawRate: 2.1,         // steering yaw rate rad/s at full input
  assist: 0.86,         // automatic curvature following
  offTrailA: 3.2,
  hop: 3.4, pop: 2.6,
  trickT: 0.62,
};

export const POS_NAMES = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH'];
