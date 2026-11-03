import { T, rng } from './world.js';
import { BLOCKS, growable } from './items.js';

// Folder PNG 32x32 (relatif terhadap index.html). Di repo: public/textures
export const TEX_BASE = 'textures/';
const P = 2; // ukuran "piksel" gaya lama (16x16 digandakan jadi 32x32)

// ---------- gambar bawaan (dipakai kalau PNG kustom belum ada) ----------
const speck = (c, r, cols, n) => {
  for (let i = 0; i < n; i++) {
    c.fillStyle = cols[Math.floor(r() * cols.length)];
    c.fillRect(Math.floor(r() * 16) * P, Math.floor(r() * 16) * P, P, P);
  }
};
const fill = (c, col) => { c.fillStyle = col; c.fillRect(0, 0, T, T); };
const dirtBase = (c, r) => { fill(c, '#8b5a2b'); speck(c, r, ['#7a4d22', '#9c683a', '#6b4220'], 45); };
const edges = (c) => { // bayangan tepi supaya tiap blok terlihat
  c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(0, T - P, T, P); c.fillRect(T - P, 0, P, T);
  c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(0, 0, T, P / 2); c.fillRect(0, 0, P / 2, T);
};

export function drawBlock(c, id) {
  const r = rng(1000 + Number(id));
  switch (BLOCKS[id].file) {
    case 'dirt': dirtBase(c, r); break;
    case 'stone':
      fill(c, '#7d7d7d'); speck(c, r, ['#6e6e6e', '#8e8e8e', '#5f5f5f'], 60);
      c.fillStyle = '#5a5a5a';
      for (let i = 0; i < 5; i++) c.fillRect((4 + i) * P, (3 + i) * P, P, P);
      for (let i = 0; i < 4; i++) c.fillRect((10 - i) * P, (9 + i) * P, P, P);
      break;
    case 'grass':
      dirtBase(c, r);
      for (let x = 0; x < 16; x++) {
        const d = 3 + (r() < 0.4 ? 1 : 0) + (r() < 0.2 ? 1 : 0);
        for (let y = 0; y < d; y++) {
          c.fillStyle = y === 0 ? '#79d06c' : y === d - 1 ? '#3b8f3f' : '#4caf50';
          c.fillRect(x * P, y * P, P, P);
        }
      }
      break;
    case 'bedrock': fill(c, '#2b2b2b'); speck(c, r, ['#1c1c1c', '#3d3d3d', '#4a4a4a'], 80); break;
    case 'sand': fill(c, '#e3cf8e'); speck(c, r, ['#d4be78', '#efdca0', '#c9b36a'], 55); break;
    case 'gravel': fill(c, '#8f8a82'); speck(c, r, ['#a39d94', '#78736b', '#b3aca0', '#6a655e'], 70); break;
    case 'wood':
      fill(c, '#b5803f'); speck(c, r, ['#a5702f', '#c18d4c'], 25);
      c.fillStyle = '#8a5a28';
      for (const y of [10, 21]) c.fillRect(0, y, T, 2);
      c.fillRect(6, 3, 2, 2); c.fillRect(24, 14, 2, 2); c.fillRect(8, 25, 2, 2);
      break;
    case 'glass':
      c.fillStyle = 'rgba(190,235,250,0.35)'; c.fillRect(0, 0, T, T);
      c.fillStyle = 'rgba(255,255,255,0.75)';
      c.fillRect(0, 0, T, 2); c.fillRect(0, 0, 2, T); c.fillRect(0, T - 2, T, 2); c.fillRect(T - 2, 0, 2, T);
      for (let i = 0; i < 5; i++) c.fillRect(7 + i * 3, 19 - i * 3, 3, 3);
      break;
    case 'brick':
      fill(c, '#b5503a'); speck(c, r, ['#a3452f', '#c25d46'], 30);
      c.fillStyle = '#d8c9b8';
      for (let k = 0; k < 4; k++) {
        c.fillRect(0, k * 8 + 6, T, 2);
        for (const x of (k % 2 === 0 ? [15] : [7, 23])) c.fillRect(x, k * 8, 2, 6);
      }
      break;
    case 'world_lock':
      fill(c, '#d4a017');
      c.fillStyle = '#f6d35a'; c.fillRect(4, 4, T - 8, T - 8);
      c.strokeStyle = '#5a3b00'; c.lineWidth = 3; c.beginPath(); c.arc(16, 13, 5, Math.PI, Math.PI * 2); c.stroke();
      c.fillStyle = '#5a3b00'; c.fillRect(10, 13, 12, 10);
      c.fillStyle = '#f6d35a'; c.beginPath(); c.arc(16, 17, 2, 0, Math.PI * 2); c.fill(); c.fillRect(15, 18, 2, 4);
      break;
    default: fill(c, '#ff00ff');
  }
  edges(c);
}

export function drawSeed(c, id) {
  const col = BLOCKS[id].color;
  const R = (x, y, w, h, f) => { c.fillStyle = f; c.fillRect(x, y, w, h); };
  R(8, 12, 16, 16, '#d8b27a'); R(10, 10, 12, 4, '#d8b27a'); R(12, 6, 8, 5, '#b8925a');
  R(8, 26, 16, 2, '#b8925a');
  R(11, 15, 10, 9, '#222'); R(12, 16, 8, 7, col);
  R(14, 18, 2, 2, 'rgba(255,255,255,0.4)');
}

export function drawTree(c, id, s) {
  const col = BLOCKS[id].color;
  const R = (x, y, w, h, f) => { c.fillStyle = f; c.fillRect(x, y, w, h); };
  if (s === 0) {
    R(15, 26, 2, 6, '#3b8f3f'); R(12, 24, 4, 3, '#4caf50'); R(17, 23, 4, 3, '#4caf50');
  } else if (s === 1) {
    R(15, 16, 3, 16, '#6b4220'); R(9, 12, 8, 6, '#4caf50'); R(16, 9, 9, 7, '#4caf50'); R(11, 12, 3, 2, '#79d06c');
  } else {
    R(14, 12, 4, 20, '#6b4220'); R(3, 1, 26, 15, '#3b8f3f'); R(5, 3, 22, 11, '#4caf50');
    R(8, 4, 5, 3, '#79d06c'); R(19, 8, 5, 3, '#79d06c');
  }
  if (s === 3) {
    for (const [x, y] of [[6, 5], [14, 2], [22, 5], [10, 10], [19, 11]]) { R(x, y, 5, 5, '#222'); R(x + 1, y + 1, 3, 3, col); }
  }
}

// Pemain 32x32: kaki menyentuh tepi bawah, badan di tengah (hitbox game 20x28).
export function drawPlayer(c) {
  c.save(); c.translate(6, 4);
  const R = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x * 2, y * 2, w * 2, h * 2); };
  R(2, 0, 6, 2, '#5b3a1e'); R(2, 1, 6, 4, '#f1c27d'); R(2, 1, 6, 1, '#5b3a1e');
  R(4, 3, 1, 1, '#222'); R(7, 3, 1, 1, '#222');
  R(1, 5, 8, 5, '#3f7be0'); R(0, 5, 1, 4, '#3f7be0'); R(9, 5, 1, 4, '#3f7be0');
  R(0, 9, 1, 1, '#f1c27d'); R(9, 9, 1, 1, '#f1c27d');
  R(2, 10, 3, 3, '#2d3a8c'); R(5, 10, 3, 3, '#2d3a8c');
  R(2, 13, 3, 1, '#4a2c12'); R(5, 13, 3, 1, '#4a2c12');
  c.restore();
}

export function drawDoor(c) {
  const R = (x, y, w, h, f) => { c.fillStyle = f; c.fillRect(x, y, w, h); };
  R(3, 0, 26, 32, '#9a9a9a'); R(5, 2, 22, 30, '#ffffff');
  R(8, 5, 16, 11, '#6ec6ff'); R(8, 5, 16, 2, '#bfe6ff'); R(15, 5, 2, 11, '#ffffff');
  R(8, 19, 16, 10, '#e4e4e4'); R(22, 20, 3, 3, '#555');
}

export function drawFist(c) { // sarung tinju di tengah kanvas
  const R = (x, y, w, h, f) => { c.fillStyle = f; c.fillRect(x, y, w, h); };
  R(7, 9, 18, 16, '#a93226'); R(9, 11, 12, 4, '#e57368'); R(23, 13, 5, 8, '#f1c27d'); R(7, 21, 18, 4, '#7b241c');
}

const CRACKS = [
  [[16, 6, 14, 14], [14, 14, 18, 20]],
  [[14, 14, 6, 18], [18, 20, 24, 26], [14, 14, 10, 8]],
  [[16, 6, 24, 4], [6, 18, 4, 26], [18, 20, 26, 16], [24, 26, 28, 30]],
];
export function drawCrack(c, s) {
  c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 2; c.beginPath();
  for (let k = 0; k <= s; k++) for (const [x1, y1, x2, y2] of CRACKS[k]) { c.moveTo(x1, y1); c.lineTo(x2, y2); }
  c.stroke();
}

// ---------- daftar semua file tekstur 32x32 ----------
// key = nama tekstur di game, path = lokasi PNG (tanpa .png) di folder textures
export function textureManifest() {
  const list = [];
  for (const id of Object.keys(BLOCKS)) {
    list.push({ key: 'block' + id, path: `blocks/${BLOCKS[id].file}`, draw: (c) => drawBlock(c, id) });
  }
  for (const id of growable) {
    const f = BLOCKS[id].file;
    list.push({ key: 'seed' + id, path: `seeds/${f}`, draw: (c) => drawSeed(c, id) });
    for (let s = 0; s < 4; s++) list.push({ key: `tree${id}_${s}`, path: `trees/${f}_${s}`, draw: (c) => drawTree(c, id, s) });
  }
  list.push({ key: 'player', path: 'player/body', draw: drawPlayer });
  list.push({ key: 'door', path: 'misc/door', draw: drawDoor });
  list.push({ key: 'fist', path: 'misc/fist', draw: drawFist });
  for (let s = 0; s < 3; s++) list.push({ key: 'crack' + s, path: `misc/crack_${s}`, draw: (c) => drawCrack(c, s) });
  return list;
}

// Dipanggil di BootScene.preload: coba muat PNG kustom. File yang tidak ada dilewati begitu saja.
export function preloadTextures(scene) {
  if (typeof location !== 'undefined' && location.protocol === 'file:') return; // browser memblokir gambar dari file://
  for (const e of textureManifest()) scene.load.image('png:' + e.key, TEX_BASE + e.path + '.png');
}

export function makeTextures(scene) {
  if (scene.textures.exists('tiles')) return; // dibuat sekali saja (scene bisa dimulai ulang)
  const canvasTex = (key, w, h, draw) => {
    const t = scene.textures.createCanvas(key, w, h);
    draw(t.getContext(), w, h);
    t.refresh();
    return t;
  };
  const custom = (key) => (scene.textures.exists('png:' + key) ? scene.textures.get('png:' + key).getSourceImage() : null);
  const paint = (c, key, draw) => { // PNG kustom kalau ada, kalau tidak gambar bawaan
    const img = custom(key);
    if (img) { c.imageSmoothingEnabled = false; c.drawImage(img, 0, 0, T, T); } else draw(c);
  };
  const list = textureManifest();

  // blok -> satu atlas 'tiles' (tiap blok 32x32)
  const ids = Object.keys(BLOCKS);
  const tiles = canvasTex('tiles', T * ids.length, T, (c) => {
    for (const e of list) {
      if (!e.key.startsWith('block')) continue;
      c.save(); c.translate(BLOCKS[e.key.slice(5)].tex * T, 0);
      paint(c, e.key, e.draw);
      c.restore();
    }
  });
  for (const id of ids) tiles.add(BLOCKS[id].tex, 0, BLOCKS[id].tex * T, 0, T, T);

  // serpihan blok (kecil, warna dari blok)
  for (const id of ids) canvasTex('debris' + id, 5, 5, (c) => { c.fillStyle = BLOCKS[id].color; c.fillRect(0, 0, 5, 5); });

  // seed, pohon, pemain, pintu, tinju, retakan
  for (const e of list) {
    if (e.key.startsWith('block')) continue;
    canvasTex(e.key, T, T, (c) => paint(c, e.key, e.draw));
  }

  // ---- latar & UI ----
  canvasTex('sky', 800, 450, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 450);
    g.addColorStop(0, '#3f9ae6'); g.addColorStop(1, '#c4e8ff');
    c.fillStyle = g; c.fillRect(0, 0, 800, 450);
  });
  canvasTex('clouds', 800, 150, (c) => {
    const cloud = (x, y, s) => {
      c.fillStyle = 'rgba(255,255,255,0.92)';
      c.fillRect(x, y + 8 * s, 80 * s, 16 * s); c.fillRect(x + 12 * s, y, 40 * s, 16 * s); c.fillRect(x + 40 * s, y + 4 * s, 32 * s, 14 * s);
      c.fillStyle = 'rgba(200,225,245,0.9)'; c.fillRect(x, y + 20 * s, 80 * s, 4 * s);
    };
    cloud(40, 30, 1); cloud(280, 80, 1.2); cloud(520, 20, 0.9); cloud(680, 85, 1);
  });
  canvasTex('hills', 800, 200, (c) => {
    const TAU = Math.PI * 2;
    for (let x = 0; x < 800; x++) {
      let y = 110 + 30 * Math.sin(TAU * 2 * x / 800) + 10 * Math.sin(TAU * 5 * x / 800);
      c.fillStyle = '#8fd0a8'; c.fillRect(x, y, 1, 200 - y);
      y = 150 + 18 * Math.sin(TAU * 3 * x / 800 + 1) + 6 * Math.sin(TAU * 7 * x / 800);
      c.fillStyle = '#6dbb8e'; c.fillRect(x, y, 1, 200 - y);
    }
  });
  canvasTex('vignette', 800, 450, (c) => {
    const g = c.createRadialGradient(400, 225, 170, 400, 225, 520);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
    c.fillStyle = g; c.fillRect(0, 0, 800, 450);
  });
  canvasTex('btn', 80, 80, (c) => {
    c.beginPath(); c.arc(40, 40, 36, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,0.28)'; c.fill();
    c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.75)'; c.stroke();
  });
}
