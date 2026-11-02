import { T, rng } from './world.js';
import { BLOCKS, growable } from './items.js';

export function makeTextures(scene) {
  const canvasTex = (key, w, h, draw) => {
    const t = scene.textures.createCanvas(key, w, h);
    draw(t.getContext(), w, h);
    t.refresh();
    return t;
  };
  const P = 2;
  const N = Object.keys(BLOCKS).length;

  // ---- tile blok ----
  const tiles = canvasTex('tiles', T * N, T, (c) => {
    const r = rng(42);
    const speck = (ox, cols, n) => {
      for (let i = 0; i < n; i++) {
        c.fillStyle = cols[Math.floor(r() * cols.length)];
        c.fillRect(ox + Math.floor(r() * 16) * P, Math.floor(r() * 16) * P, P, P);
      }
    };
    const fill = (ox, col) => { c.fillStyle = col; c.fillRect(ox, 0, T, T); };
    const dirt = (ox) => { fill(ox, '#8b5a2b'); speck(ox, ['#7a4d22', '#9c683a', '#6b4220'], 45); };
    dirt(0);
    fill(T, '#7d7d7d'); speck(T, ['#6e6e6e', '#8e8e8e', '#5f5f5f'], 60);
    c.fillStyle = '#5a5a5a';
    for (let i = 0; i < 5; i++) c.fillRect(T + (4 + i) * P, (3 + i) * P, P, P);
    for (let i = 0; i < 4; i++) c.fillRect(T + (10 - i) * P, (9 + i) * P, P, P);
    dirt(T * 2);
    for (let x = 0; x < 16; x++) {
      const d = 3 + (r() < 0.4 ? 1 : 0) + (r() < 0.2 ? 1 : 0);
      for (let y = 0; y < d; y++) {
        c.fillStyle = y === 0 ? '#79d06c' : y === d - 1 ? '#3b8f3f' : '#4caf50';
        c.fillRect(T * 2 + x * P, y * P, P, P);
      }
    }
    fill(T * 3, '#2b2b2b'); speck(T * 3, ['#1c1c1c', '#3d3d3d', '#4a4a4a'], 80);
    fill(T * 4, '#e3cf8e'); speck(T * 4, ['#d4be78', '#efdca0', '#c9b36a'], 55);
    for (let i = 0; i < N; i++) {
      c.fillStyle = 'rgba(0,0,0,0.28)';
      c.fillRect(i * T, T - P, T, P); c.fillRect(i * T + T - P, 0, P, T);
      c.fillStyle = 'rgba(255,255,255,0.10)';
      c.fillRect(i * T, 0, T, P / 2); c.fillRect(i * T, 0, P / 2, T);
    }
  });
  for (let i = 0; i < N; i++) tiles.add(i, 0, i * T, 0, T, T);

  // ---- serpihan, seed, pohon ----
  for (const k of Object.keys(BLOCKS)) {
    canvasTex('debris' + k, 5, 5, (c) => { c.fillStyle = BLOCKS[k].color; c.fillRect(0, 0, 5, 5); });
  }
  for (const b of growable) {
    const col = BLOCKS[b].color;
    canvasTex('seed' + b, T, T, (c) => {
      const R = (x, y, w, h, f) => { c.fillStyle = f; c.fillRect(x, y, w, h); };
      R(8, 12, 16, 16, '#d8b27a'); R(10, 10, 12, 4, '#d8b27a'); R(12, 6, 8, 5, '#b8925a');
      R(8, 26, 16, 2, '#b8925a');
      R(11, 15, 10, 9, '#222'); R(12, 16, 8, 7, col);
      R(14, 18, 2, 2, 'rgba(255,255,255,0.4)');
    });
    for (let s = 0; s < 4; s++) {
      canvasTex(`tree${b}_${s}`, T, T, (c) => {
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
      });
    }
  }

  // ---- pemain ----
  canvasTex('player', 20, 28, (c) => {
    const R = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x * 2, y * 2, w * 2, h * 2); };
    R(2, 0, 6, 2, '#5b3a1e'); R(2, 1, 6, 4, '#f1c27d'); R(2, 1, 6, 1, '#5b3a1e');
    R(4, 3, 1, 1, '#222'); R(7, 3, 1, 1, '#222');
    R(1, 5, 8, 5, '#3f7be0'); R(0, 5, 1, 4, '#3f7be0'); R(9, 5, 1, 4, '#3f7be0');
    R(0, 9, 1, 1, '#f1c27d'); R(9, 9, 1, 1, '#f1c27d');
    R(2, 10, 3, 3, '#2d3a8c'); R(5, 10, 3, 3, '#2d3a8c');
    R(2, 13, 3, 1, '#4a2c12'); R(5, 13, 3, 1, '#4a2c12');
  });

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
