import { seedId, LOCK_ID } from './items.js';

export const T = 32, W = 80, H = 50;
const KEY = 'growgame-save-v4';
const OLD_KEY = 'growgame-save-v3';

export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function hashName(str) { // nama world yang sama selalu menghasilkan dunia yang sama
  let h = 2166136261 >>> 0;
  for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

export const playerName = (id) => 'Pemain ' + id;
export const normalizeName = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
export const emptyLock = () => ({ owner: null, ownerName: '', publicBuild: false, pos: null });

export function generateWorld(name) {
  const r = rng(hashName(name));
  const surf = [];
  const ph = r() * 6.28;
  for (let x = 0; x < W; x++) surf.push(Math.round(20 + 2 * Math.sin(x * 0.15 + ph) + 1.5 * Math.sin(x * 0.37 + 1 + ph)));
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
  const dx = Math.floor(W / 2); // pintu di tengah, berdiri di atas batuan dasar
  w[surf[dx]][dx] = 4;
  return { tiles: w, door: { x: dx, y: surf[dx] - 1 } };
}

export function newWorld(name) {
  const { tiles, door } = generateWorld(name);
  return { name, tiles, trees: {}, door, lock: emptyLock() };
}

function migrateWorld(name, tiles, trees) { // dunia lama (v3) dijadikan world START
  const dx = Math.floor(W / 2);
  let r = 0;
  while (r < H - 1 && !tiles[r][dx]) r++;
  tiles[r][dx] = 4;
  delete trees[dx + ',' + (r - 1)];
  return { name, tiles, trees, door: { x: dx, y: r - 1 }, lock: emptyLock() };
}

function freshSave() {
  return {
    v: 4, player: { id: 'A' }, worlds: {},
    inv: { [seedId(1)]: 3, [seedId(2)]: 2, [LOCK_ID]: 1 }, // awal: seed tanah & batu + 1 World Lock
    discovered: {}, quick: null, quickSel: 0,
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && d.v === 4 && d.worlds && d.player) return d;
    }
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const d = JSON.parse(old);
      if (d && d.v === 3 && Array.isArray(d.world) && d.world.length === H && d.world[0].length === W) {
        const s = freshSave();
        s.inv = d.inv || {};
        if (!s.inv[LOCK_ID]) s.inv[LOCK_ID] = 1;
        s.discovered = d.discovered || {};
        s.quick = d.quick || null;
        s.quickSel = d.quickSel || 0;
        s.worlds.START = migrateWorld('START', d.world, d.trees || {});
        persist(s);
        return s;
      }
    }
  } catch (e) { /* abaikan */ }
  return freshSave();
}

export function persist(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* abaikan */ }
}

export function getWorld(save, name) {
  if (!save.worlds[name]) save.worlds[name] = newWorld(name);
  return save.worlds[name];
}
