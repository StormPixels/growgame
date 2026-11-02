import Phaser from 'phaser';
import { BLOCKS, isSeed, blockOf, seedId, itemName, SEED_DROP_CHANCE, HARVEST_SEED_CHANCE } from './items.js';
import { T, W, H, loadGame, saveGame } from './world.js';
import { makeTextures } from './textures.js';

const MAX_SLOTS = 8;

class GameScene extends Phaser.Scene {
  create() {
    makeTextures(this);
    const save = loadGame();
    this.world = save.world;
    this.trees = save.trees;   // { "x,y": { b: idBlok, t: waktuTanam(ms) } }
    this.inv = save.inv;       // { idItem: jumlah }
    this.sel = null;
    this.keys = { left: false, right: false, jump: false };
    this.facing = 1;

    // latar
    this.add.image(0, 0, 'sky').setOrigin(0).setScrollFactor(0).setDepth(-10);
    this.clouds = this.add.tileSprite(0, 0, 800, 150, 'clouds').setOrigin(0).setScrollFactor(0).setDepth(-9);
    this.hills = this.add.tileSprite(0, 0, 800, 200, 'hills').setOrigin(0).setScrollFactor(0).setDepth(-8);

    // dunia
    const data = this.world.map((r) => r.map((v) => (v ? BLOCKS[v].tex : -1)));
    this.map = this.make.tilemap({ data, tileWidth: T, tileHeight: T });
    const ts = this.map.addTilesetImage('tiles', 'tiles', T, T, 0, 0);
    this.layer = this.map.createLayer(0, ts, 0, 0).setDepth(0);

    // pohon
    this.treeSprites = {};
    for (const key of Object.keys(this.trees)) this.spawnTreeSprite(key);
    this.time.addEvent({ delay: 500, loop: true, callback: () => this.refreshTrees() });

    // partikel
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
    this.add.image(0, 0, 'vignette').setOrigin(0).setScrollFactor(0).setDepth(5);

    // kontrol
    this.input.addPointer(2);
    this.makeButton(50, 395, '◀', 'left');
    this.makeButton(140, 395, '▶', 'right');
    this.makeButton(750, 395, '▲', 'jump');

    // hotbar (dibuat sekali, diisi ulang lewat updateHud)
    this.slots = [];
    for (let i = 0; i < MAX_SLOTS; i++) {
      const bg = this.add.rectangle(0, 410, 50, 50, 0x000000, 0.55).setStrokeStyle(3, 0xffffff, 0.5)
        .setScrollFactor(0).setDepth(10).setInteractive();
      const icon = this.add.image(0, 408, 'tiles', 0).setScrollFactor(0).setDepth(11);
      const txt = this.add.text(0, 432, '', { fontSize: '15px', color: '#fff', stroke: '#000', strokeThickness: 4 })
        .setOrigin(1, 1).setScrollFactor(0).setDepth(12);
      const slot = { bg, icon, txt, id: null };
      bg.on('pointerdown', () => { if (slot.id !== null) { this.sel = slot.id; this.updateHud(); } });
      this.slots.push(slot);
    }
    this.selLabel = this.add.text(400, 366, '', { fontSize: '16px', color: '#ffd54a', stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5).setScrollFactor(0).setDepth(12);
    this.hint = this.add.text(400, 16, 'Tap blok = hancurkan | Seed = tanam | Pohon matang = panen', {
      fontSize: '15px', color: '#fff', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(10);
    this.tweens.add({ targets: this.hint, alpha: 0, delay: 7000, duration: 800 });
    this.updateHud();

    this.input.on('pointerdown', (ptr, over) => {
      if (over.length) return;
      this.tapWorld(ptr.worldX, ptr.worldY);
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

  // ---------- inventory ----------
  giveItem(id, n = 1) { this.inv[id] = (this.inv[id] || 0) + n; }
  countOf(id) { return this.inv[id] || 0; }

  updateHud() {
    const ids = Object.keys(this.inv).map(Number).filter((id) => this.inv[id] > 0).sort((a, b) => a - b).slice(0, MAX_SLOTS);
    if (!ids.includes(this.sel)) this.sel = ids.length ? ids[0] : null;
    const start = 400 - (ids.length * 54) / 2 + 27;
    this.slots.forEach((s, i) => {
      const id = ids[i];
      const on = id !== undefined;
      s.id = on ? id : null;
      s.bg.setVisible(on); s.icon.setVisible(on); s.txt.setVisible(on);
      if (!on) return;
      const x = start + i * 54;
      s.bg.setX(x); s.icon.setX(x); s.txt.setX(x + 22);
      if (isSeed(id)) s.icon.setTexture('seed' + blockOf(id)); else s.icon.setTexture('tiles', BLOCKS[id].tex);
      s.txt.setText(String(this.inv[id]));
      s.bg.setStrokeStyle(3, id === this.sel ? 0xffd54a : 0xffffff, id === this.sel ? 1 : 0.5);
    });
    this.selLabel.setText(this.sel === null ? '' : itemName(this.sel));
  }

  popup(x, y, text, color = '#ffffff') {
    const t = this.add.text(x, y, text, { fontSize: '16px', color, stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5).setDepth(8);
    this.tweens.add({ targets: t, y: y - 34, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  save() { saveGame({ world: this.world, trees: this.trees, inv: this.inv }); }

  // ---------- pohon ----------
  treeProgress(tr) { return (Date.now() - tr.t) / (BLOCKS[tr.b].grow * 1000); }
  treeStage(tr) { const p = this.treeProgress(tr); return p >= 1 ? 3 : p >= 0.66 ? 2 : p >= 0.33 ? 1 : 0; }

  spawnTreeSprite(key) {
    const [tx, ty] = key.split(',').map(Number);
    const tr = this.trees[key];
    const st = this.treeStage(tr);
    const img = this.add.image(tx * T, ty * T, `tree${tr.b}_${st}`).setOrigin(0).setDepth(1);
    img.stage = st;
    this.treeSprites[key] = img;
  }

  removeTree(key) {
    delete this.trees[key];
    if (this.treeSprites[key]) { this.treeSprites[key].destroy(); delete this.treeSprites[key]; }
  }

  refreshTrees() {
    for (const key of Object.keys(this.trees)) {
      const tr = this.trees[key], img = this.treeSprites[key];
      const st = this.treeStage(tr);
      if (img && img.stage !== st) { img.setTexture(`tree${tr.b}_${st}`); img.stage = st; }
    }
  }

  // ---------- aksi (semua lewat satu pintu, siap dipindah ke server nanti) ----------
  tapWorld(wx, wy) {
    const tx = Math.floor(wx / T), ty = Math.floor(wy / T);
    if (tx < 0 || tx >= W || ty < 0 || ty >= H) return;
    const pcx = (this.p.x + this.p.w / 2) / T, pcy = (this.p.y + this.p.h / 2) / T;
    if (Math.hypot(tx + 0.5 - pcx, ty + 0.5 - pcy) > 4) return; // jangkauan 4 tile
    const key = tx + ',' + ty;
    if (this.trees[key]) this.tapTree(tx, ty, key);
    else if (this.world[ty][tx] > 0) this.breakBlock(tx, ty);
    else this.useSelected(tx, ty);
  }

  flash(tx, ty) {
    const f = this.add.rectangle(tx * T, ty * T, T, T, 0xffffff, 0.5).setOrigin(0).setDepth(4);
    this.tweens.add({ targets: f, alpha: 0, duration: 180, onComplete: () => f.destroy() });
  }

  breakBlock(tx, ty) {
    const t = this.world[ty][tx];
    const def = BLOCKS[t];
    if (def.unbreakable) return;
    const cx = tx * T + T / 2, cy = ty * T + T / 2;
    this.world[ty][tx] = 0;
    this.layer.removeTileAt(tx, ty);
    this.giveItem(def.drop || t);
    if (def.grow && Math.random() < SEED_DROP_CHANCE) {
      this.giveItem(seedId(t));
      this.popup(cx, cy - 10, '+' + itemName(seedId(t)), '#ffd54a');
    }
    this.fx[t].explode(10, cx, cy);
    const above = tx + ',' + (ty - 1); // pohon di atasnya ikut hilang, seed dikembalikan
    if (this.trees[above]) {
      this.giveItem(seedId(this.trees[above].b));
      this.removeTree(above);
    }
    this.flash(tx, ty); this.updateHud(); this.save();
  }

  useSelected(tx, ty) {
    const id = this.sel;
    if (id === null || this.countOf(id) < 1) return;
    if (isSeed(id)) { // tanam: harus di atas blok padat
      if (ty + 1 >= H || this.world[ty + 1][tx] <= 0) { this.popup(tx * T + 16, ty * T, 'Butuh tanah di bawah', '#ff8a80'); return; }
      const key = tx + ',' + ty;
      this.trees[key] = { b: blockOf(id), t: Date.now() };
      this.spawnTreeSprite(key);
    } else { // pasang blok
      this.world[ty][tx] = id;
      const p = this.p;
      const xs = [p.x, p.x + p.w - 1], ys = [p.y, p.y + p.h / 2, p.y + p.h - 1];
      if (xs.some((x) => ys.some((y) => Math.floor(x / T) === tx && Math.floor(y / T) === ty))) { this.world[ty][tx] = 0; return; }
      this.layer.putTileAt(BLOCKS[id].tex, tx, ty);
    }
    this.inv[id]--;
    this.flash(tx, ty); this.updateHud(); this.save();
  }

  tapTree(tx, ty, key) {
    const tr = this.trees[key];
    const x = tx * T + T / 2, y = ty * T;
    const prog = this.treeProgress(tr);
    if (prog < 1) {
      const left = Math.ceil(BLOCKS[tr.b].grow * (1 - prog));
      this.popup(x, y, `Matang ${left} dtk`, '#ffffff');
      return;
    }
    const n = 1 + Math.floor(Math.random() * 3);
    this.giveItem(tr.b, n);
    let msg = `+${n} ${BLOCKS[tr.b].name}`;
    if (Math.random() < HARVEST_SEED_CHANCE) { this.giveItem(seedId(tr.b)); msg += ' +1 seed'; }
    this.fx[tr.b].explode(14, x, y + 16);
    this.popup(x, y, msg, '#9cff9c');
    this.removeTree(key);
    this.updateHud(); this.save();
  }

  // ---------- fisika ----------
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
