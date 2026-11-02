import Phaser from 'phaser';

const T = 32, W = 80, H = 50;
const SAVE_KEY = 'growgame-world-v2';
// nilai dunia: 0 kosong, 1 tanah, 2 batu, 3 rumput, 4 batuan dasar (tidak bisa dihancurkan)
const BLOCKS = {
  1: { name: 'Tanah', tex: 0, debris: '#8b5a2b' },
  2: { name: 'Batu', tex: 1, debris: '#808080' },
  3: { name: 'Rumput', tex: 2, debris: '#4caf50' },
  4: { name: 'Dasar', tex: 3, debris: '#333333' },
};
const HOTBAR = [1, 2]; // blok yang bisa dipasang

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

class GameScene extends Phaser.Scene {
  create() {
    this.makeTextures();
    this.world = this.loadWorld();
    this.inv = { 1: 0, 2: 0, 3: 0, 4: 0 };
    this.sel = 1;
    this.keys = { left: false, right: false, jump: false };
    this.facing = 1;

    // latar
    this.add.image(0, 0, 'sky').setOrigin(0).setScrollFactor(0).setDepth(-10);
    this.clouds = this.add.tileSprite(0, 0, 800, 150, 'clouds').setOrigin(0).setScrollFactor(0).setDepth(-9);
    this.hills = this.add.tileSprite(0, 0, 800, 200, 'hills').setOrigin(0).setScrollFactor(0).setDepth(-8);

    // dunia (tilemap)
    const data = this.world.map((r) => r.map((v) => (v ? BLOCKS[v].tex : -1)));
    this.map = this.make.tilemap({ data, tileWidth: T, tileHeight: T });
    const ts = this.map.addTilesetImage('tiles', 'tiles', T, T, 0, 0);
    this.layer = this.map.createLayer(0, ts, 0, 0).setDepth(0);

    // partikel serpihan blok
    this.fx = {};
    for (const k of Object.keys(BLOCKS)) {
      this.fx[k] = this.add.particles(0, 0, 'debris' + k, {
        speed: { min: 60, max: 200 }, angle: { min: 200, max: 340 }, gravityY: 700,
        lifespan: 600, scale: { start: 1.3, end: 0.2 }, emitting: false,
      }).setDepth(3);
    }

    // pemain
    let sy = 0;
    const cx = Math.floor(W / 2);
    while (sy < H && !this.world[sy][cx]) sy++;
    this.p = { x: cx * T + 6, y: sy * T - 30, w: 20, h: 28, vx: 0, vy: 0, ground: false };
    this.sprite = this.add.image(0, 0, 'player').setOrigin(0.5, 1).setDepth(2);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, W * T, H * T);
    cam.startFollow(this.sprite, true, 0.1, 0.1);
    cam.roundPixels = true;

    // vignette
    this.add.image(0, 0, 'vignette').setOrigin(0).setScrollFactor(0).setDepth(5);

    // kontrol sentuh
    this.input.addPointer(2);
    this.makeButton(60, 390, '◀', 'left');
    this.makeButton(160, 390, '▶', 'right');
    this.makeButton(740, 390, '▲', 'jump');

    // hotbar
    this.slots = HOTBAR.map((id, i) => {
      const x = 360 + i * 80, y = 400;
      const bg = this.add.rectangle(x, y, 64, 64, 0x000000, 0.5).setStrokeStyle(3, 0xffffff, 0.5)
        .setScrollFactor(0).setDepth(10).setInteractive();
      this.add.image(x, y - 4, 'tiles', BLOCKS[id].tex).setScale(1.3).setScrollFactor(0).setDepth(11);
      const txt = this.add.text(x + 26, y + 26, '0', { fontSize: '18px', color: '#fff', stroke: '#000', strokeThickness: 4 })
        .setOrigin(1, 1).setScrollFactor(0).setDepth(12);
      bg.on('pointerdown', () => { this.sel = id; this.updateHud(); });
      return { id, bg, txt };
    });
    this.hint = this.add.text(400, 16, 'Tap blok = hancurkan  |  Tap kosong = pasang', {
      fontSize: '16px', color: '#fff', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(10);
    this.tweens.add({ targets: this.hint, alpha: 0, delay: 6000, duration: 800 });
    this.updateHud();

    this.input.on('pointerdown', (ptr, over) => {
      if (over.length) return;
      this.tapWorld(ptr.worldX, ptr.worldY);
    });
  }

  // ---------- tekstur buatan kode ----------
  canvasTex(key, w, h, draw) {
    const t = this.textures.createCanvas(key, w, h);
    draw(t.getContext(), w, h);
    t.refresh();
    return t;
  }

  makeTextures() {
    const P = 2; // ukuran "piksel" pada tile 16x16
    const tiles = this.canvasTex('tiles', T * 4, T, (c) => {
      const r = rng(42);
      const speck = (ox, cols, n, bias = 1) => {
        for (let i = 0; i < n; i++) {
          c.fillStyle = cols[Math.floor(r() * cols.length)];
          c.fillRect(ox + Math.floor(r() * 16) * P, Math.floor(r() * 16 * bias) * P, P, P);
        }
      };
      const fill = (ox, col) => { c.fillStyle = col; c.fillRect(ox, 0, T, T); };
      const dirt = (ox) => { fill(ox, '#8b5a2b'); speck(ox, ['#7a4d22', '#9c683a', '#6b4220'], 45); };
      dirt(0); // 0 tanah
      fill(T, '#7d7d7d'); speck(T, ['#6e6e6e', '#8e8e8e', '#5f5f5f'], 60); // 1 batu
      c.fillStyle = '#5a5a5a';
      for (let i = 0; i < 5; i++) c.fillRect(T + (4 + i) * P, (3 + i) * P, P, P);
      for (let i = 0; i < 4; i++) c.fillRect(T + (10 - i) * P, (9 + i) * P, P, P);
      dirt(T * 2); // 2 rumput
      for (let x = 0; x < 16; x++) {
        const d = 3 + (r() < 0.4 ? 1 : 0) + (r() < 0.2 ? 1 : 0);
        for (let y = 0; y < d; y++) {
          c.fillStyle = y === 0 ? '#79d06c' : y === d - 1 ? '#3b8f3f' : '#4caf50';
          c.fillRect(T * 2 + x * P, y * P, P, P);
        }
      }
      fill(T * 3, '#2b2b2b'); speck(T * 3, ['#1c1c1c', '#3d3d3d', '#4a4a4a'], 80); // 3 batuan dasar
      for (let i = 0; i < 4; i++) { // bayangan tepi supaya tiap blok terlihat
        c.fillStyle = 'rgba(0,0,0,0.28)';
        c.fillRect(i * T, T - P, T, P); c.fillRect(i * T + T - P, 0, P, T);
        c.fillStyle = 'rgba(255,255,255,0.10)';
        c.fillRect(i * T, 0, T, P / 2); c.fillRect(i * T, 0, P / 2, T);
      }
    });
    for (let i = 0; i < 4; i++) tiles.add(i, 0, i * T, 0, T, T);

    for (const k of Object.keys(BLOCKS)) {
      this.canvasTex('debris' + k, 5, 5, (c) => { c.fillStyle = BLOCKS[k].debris; c.fillRect(0, 0, 5, 5); });
    }

    // pemain 10x14 grid, tiap sel 2px
    this.canvasTex('player', 20, 28, (c) => {
      const R = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x * 2, y * 2, w * 2, h * 2); };
      R(2, 0, 6, 2, '#5b3a1e');   // rambut
      R(2, 1, 6, 4, '#f1c27d');   // wajah
      R(2, 1, 6, 1, '#5b3a1e');
      R(4, 3, 1, 1, '#222'); R(7, 3, 1, 1, '#222'); // mata (menghadap kanan)
      R(1, 5, 8, 5, '#3f7be0');   // baju
      R(0, 5, 1, 4, '#3f7be0'); R(9, 5, 1, 4, '#3f7be0');
      R(0, 9, 1, 1, '#f1c27d'); R(9, 9, 1, 1, '#f1c27d'); // tangan
      R(2, 10, 3, 3, '#2d3a8c'); R(5, 10, 3, 3, '#2d3a8c'); // celana
      R(2, 13, 3, 1, '#4a2c12'); R(5, 13, 3, 1, '#4a2c12'); // sepatu
    });

    // langit
    this.canvasTex('sky', 800, 450, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 450);
      g.addColorStop(0, '#3f9ae6'); g.addColorStop(1, '#c4e8ff');
      c.fillStyle = g; c.fillRect(0, 0, 800, 450);
    });
    // awan (mulus horizontal)
    this.canvasTex('clouds', 800, 150, (c) => {
      const cloud = (x, y, s) => {
        c.fillStyle = 'rgba(255,255,255,0.92)';
        c.fillRect(x, y + 8 * s, 80 * s, 16 * s); c.fillRect(x + 12 * s, y, 40 * s, 16 * s); c.fillRect(x + 40 * s, y + 4 * s, 32 * s, 14 * s);
        c.fillStyle = 'rgba(200,225,245,0.9)'; c.fillRect(x, y + 20 * s, 80 * s, 4 * s);
      };
      cloud(40, 30, 1); cloud(280, 80, 1.2); cloud(520, 20, 0.9); cloud(680, 85, 1);
    });
    // bukit
    this.canvasTex('hills', 800, 200, (c) => {
      const TAU = Math.PI * 2;
      for (let x = 0; x < 800; x++) {
        let y = 110 + 30 * Math.sin(TAU * 2 * x / 800) + 10 * Math.sin(TAU * 5 * x / 800);
        c.fillStyle = '#8fd0a8'; c.fillRect(x, y, 1, 200 - y);
        y = 150 + 18 * Math.sin(TAU * 3 * x / 800 + 1) + 6 * Math.sin(TAU * 7 * x / 800);
        c.fillStyle = '#6dbb8e'; c.fillRect(x, y, 1, 200 - y);
      }
    });
    // vignette
    this.canvasTex('vignette', 800, 450, (c) => {
      const g = c.createRadialGradient(400, 225, 170, 400, 225, 520);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
      c.fillStyle = g; c.fillRect(0, 0, 800, 450);
    });
    // tombol bulat
    this.canvasTex('btn', 80, 80, (c) => {
      c.beginPath(); c.arc(40, 40, 36, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.28)'; c.fill();
      c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.75)'; c.stroke();
    });
  }

  makeButton(x, y, label, key) {
    const b = this.add.image(x, y, 'btn').setScrollFactor(0).setDepth(10).setInteractive();
    this.add.text(x, y, label, { fontSize: '30px', color: '#fff', stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5).setScrollFactor(0).setDepth(11);
    b.on('pointerdown', () => { this.keys[key] = true; b.setAlpha(0.6); });
    const off = () => { this.keys[key] = false; b.setAlpha(1); };
    b.on('pointerup', off); b.on('pointerout', off);
  }

  // ---------- dunia ----------
  generateWorld() {
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

  loadWorld() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const w = JSON.parse(raw);
        if (Array.isArray(w) && w.length === H && w[0].length === W) return w;
      }
    } catch (e) { /* abaikan */ }
    return this.generateWorld();
  }

  saveWorld() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.world)); } catch (e) { /* abaikan */ }
  }

  solid(px, py) {
    const tx = Math.floor(px / T), ty = Math.floor(py / T);
    if (tx < 0 || tx >= W || ty >= H) return true;
    if (ty < 0) return false;
    return this.world[ty][tx] > 0;
  }

  hits(p) {
    const xs = [p.x, p.x + p.w - 1];
    const ys = [p.y, p.y + p.h / 2, p.y + p.h - 1];
    return xs.some((x) => ys.some((y) => this.solid(x, y)));
  }

  tapWorld(wx, wy) {
    const tx = Math.floor(wx / T), ty = Math.floor(wy / T);
    if (tx < 0 || tx >= W || ty < 0 || ty >= H) return;
    const pcx = (this.p.x + this.p.w / 2) / T, pcy = (this.p.y + this.p.h / 2) / T;
    if (Math.hypot(tx + 0.5 - pcx, ty + 0.5 - pcy) > 4) return; // jangkauan 4 tile
    const t = this.world[ty][tx];
    const cx = tx * T + T / 2, cy = ty * T + T / 2;
    if (t === 4) return;
    if (t > 0) {
      this.world[ty][tx] = 0;
      this.layer.removeTileAt(tx, ty);
      this.inv[t === 3 ? 1 : t]++;
      this.fx[t].explode(10, cx, cy);
    } else if (this.inv[this.sel] > 0) {
      this.world[ty][tx] = this.sel;
      if (this.hits(this.p)) { this.world[ty][tx] = 0; return; } // jangan pasang di dalam pemain
      this.layer.putTileAt(BLOCKS[this.sel].tex, tx, ty);
      this.inv[this.sel]--;
    } else return;
    const f = this.add.rectangle(tx * T, ty * T, T, T, 0xffffff, 0.5).setOrigin(0).setDepth(4);
    this.tweens.add({ targets: f, alpha: 0, duration: 180, onComplete: () => f.destroy() });
    this.updateHud();
    this.saveWorld();
  }

  updateHud() {
    for (const s of this.slots) {
      s.txt.setText(String(this.inv[s.id]));
      s.bg.setStrokeStyle(3, s.id === this.sel ? 0xffd54a : 0xffffff, s.id === this.sel ? 1 : 0.5);
    }
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.033);
    const p = this.p;
    p.vx = (this.keys.right ? 220 : 0) - (this.keys.left ? 220 : 0);
    if (p.vx) this.facing = p.vx > 0 ? 1 : -1;
    if (this.keys.jump && p.ground) p.vy = -620;
    p.vy = Math.min(p.vy + 1800 * dt, 900);

    p.x += p.vx * dt;
    if (this.hits(p)) { p.x -= p.vx * dt; p.vx = 0; }

    p.ground = false;
    p.y += p.vy * dt;
    if (this.hits(p)) {
      p.y -= p.vy * dt;
      if (p.vy > 0) p.ground = true;
      p.vy = 0;
    }

    this.sprite.setPosition(Math.round(p.x + p.w / 2), Math.round(p.y + p.h));
    this.sprite.setFlipX(this.facing < 0);
    this.sprite.setAngle(p.vx && p.ground ? Math.sin(time * 0.025) * 5 : 0);

    const cam = this.cameras.main;
    this.hills.y = 24 * T - cam.scrollY - 200;
    this.hills.tilePositionX = cam.scrollX * 0.25;
    this.clouds.y = 10 - cam.scrollY * 0.3;
    this.clouds.tilePositionX = cam.scrollX * 0.1 + time * 0.01;
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 450,
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: GameScene,
});
