import Phaser from 'phaser';

const T = 32, W = 80, H = 50;
const COLOR = { 1: 0x8b5a2b, 2: 0x7a7a7a }; // 1 = tanah, 2 = batu
const SAVE_KEY = 'growgame-world-v1';

class GameScene extends Phaser.Scene {
  create() {
    this.world = this.loadWorld();
    this.inv = { 1: 0, 2: 0 };
    this.sel = 1;
    this.keys = { left: false, right: false, jump: false };

    this.cameras.main.setBackgroundColor(0x87ceeb);
    this.gfx = this.add.graphics();
    this.drawWorld();

    this.p = { x: (W * T) / 2, y: 10 * T, w: 20, h: 28, vx: 0, vy: 0, ground: false };
    this.sprite = this.add.rectangle(this.p.x, this.p.y, this.p.w, this.p.h, 0xffcc00).setOrigin(0, 0);
    this.cameras.main.setBounds(0, 0, W * T, H * T);
    this.cameras.main.startFollow(this.sprite, true, 0.1, 0.1);

    this.input.addPointer(2);
    this.makeButton(20, 340, 80, 80, '<', 'left');
    this.makeButton(120, 340, 80, 80, '>', 'right');
    this.makeButton(700, 340, 80, 80, '^', 'jump');

    this.hud = this.add.text(10, 10, '', { fontSize: '20px', color: '#fff', backgroundColor: '#0008', padding: { x: 8, y: 4 } })
      .setScrollFactor(0).setDepth(10).setInteractive();
    this.hud.on('pointerdown', () => { this.sel = this.sel === 1 ? 2 : 1; });

    this.input.on('pointerdown', (ptr, over) => {
      if (over.length) return;
      this.tapWorld(ptr.worldX, ptr.worldY);
    });
  }

  makeButton(x, y, w, h, label, key) {
    const r = this.add.rectangle(x, y, w, h, 0xffffff, 0.35).setOrigin(0, 0)
      .setScrollFactor(0).setDepth(10).setInteractive();
    this.add.text(x + w / 2, y + h / 2, label, { fontSize: '36px', color: '#000' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(11);
    r.on('pointerdown', () => { this.keys[key] = true; });
    r.on('pointerup', () => { this.keys[key] = false; });
    r.on('pointerout', () => { this.keys[key] = false; });
  }

  generateWorld() {
    const w = [];
    for (let y = 0; y < H; y++) {
      const row = [];
      for (let x = 0; x < W; x++) {
        row.push(y < 20 ? 0 : y < 32 ? 1 : 2);
      }
      w.push(row);
    }
    return w;
  }

  loadWorld() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* abaikan */ }
    return this.generateWorld();
  }

  saveWorld() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.world)); } catch (e) { /* abaikan */ }
  }

  drawWorld() {
    this.gfx.clear();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = this.world[y][x];
        if (!t) continue;
        this.gfx.fillStyle(COLOR[t], 1);
        this.gfx.fillRect(x * T, y * T, T - 1, T - 1);
      }
    }
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
    if (tx < 0 || tx >= W || ty < 0 || ty >= H - 1) return;
    const pcx = (this.p.x + this.p.w / 2) / T, pcy = (this.p.y + this.p.h / 2) / T;
    if (Math.hypot(tx + 0.5 - pcx, ty + 0.5 - pcy) > 4) return; // jangkauan 4 tile
    const t = this.world[ty][tx];
    if (t > 0) {
      this.world[ty][tx] = 0;
      this.inv[t]++;
    } else if (this.inv[this.sel] > 0) {
      this.world[ty][tx] = this.sel;
      const blocked = this.hits(this.p);
      if (blocked) { this.world[ty][tx] = 0; return; } // jangan pasang di dalam pemain
      this.inv[this.sel]--;
    } else return;
    this.drawWorld();
    this.saveWorld();
  }

  update(_, delta) {
    const dt = Math.min(delta / 1000, 0.033);
    const p = this.p;
    p.vx = (this.keys.right ? 220 : 0) - (this.keys.left ? 220 : 0);
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

    this.sprite.setPosition(p.x, p.y);
    this.hud.setText(`Tanah: ${this.inv[1]}  Batu: ${this.inv[2]}  | Dipilih: ${this.sel === 1 ? 'Tanah' : 'Batu'} (tap untuk ganti)`);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 450,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: GameScene,
});
