import { seedId } from './items.js';

export const T = 32, W = 80, H = 50;
const SAVE_KEY = 'growgame-save-v3';

export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function generateWorld() {
  const r = rng(1234);
  const surf = [];
  for (let x = 0; x < W; x++) surf.push(Math.round(20 + 2 * Math.sin(x * 0.15) + 1.5 * Math.sin(x * 0.37 + 1)));
  const w = [];
  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) {
      const s = surf[x];
      let v;
      if (y === H - 1) v = 4;
      else if (y < s) v = 0;
      else if (y === s) v = 3;
      else if (y < s + 8 + Math.floor(r() * 2)) v = 1;
      else v = r() < 0.04 ? 1 : 2;
      row.push(v);
    }
    w.push(row);
  }
  for (let i = 0; i < 3; i++) { // hamparan pasir
    const cx = 8 + Math.floor(r() * (W - 16)), half = 3 + Math.floor(r() * 3);
    for (let x = cx - half; x <= cx + half; x++) for (let y = surf[x]; y < surf[x] + 3; y++) w[y][x] = 5;
  }
  for (let i = 0; i < 7; i++) { // gua kecil
    const cx = Math.floor(r() * W), cy = 30 + Math.floor(r() * 14);
    const rx = 3 + Math.floor(r() * 3), ry = 2 + Math.floor(r() * 2);
    for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
      if (x < 0 || x >= W || y < 0 || y >= H - 1) continue;
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) w[y][x] = 0;
    }
  }
  return w;
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && d.v === 3 && Array.isArray(d.world) && d.world.length === H && d.world[0].length === W) {
        return { world: d.world, trees: d.trees || {}, inv: d.inv || {} };
      }
    }
  } catch (e) { /* abaikan */ }
  return { world: generateWorld(), trees: {}, inv: { [seedId(1)]: 3 } }; // awal: 3 seed tanah
}

export function saveGame({ world, trees, inv }) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 3, world, trees, inv })); } catch (e) { /* abaikan */ }
}
