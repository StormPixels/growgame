import Phaser from 'phaser';
import { BLOCKS, RECIPES, recipeKey, recipeResult, isSeed, blockOf, seedId, itemName, SEED_DROP_CHANCE, HARVEST_SEED_CHANCE } from './items.js';
import { T, W, H, loadGame, saveGame } from './world.js';
import { makeTextures } from './textures.js';

const ZMIN = 0.6, ZMAX = 2.5;          // batas zoom (cubit)
const COLS = 8, CELL = 66, MAXCELLS = 32; // grid ransel

class GameScene extends Phaser.Scene {
  create() {
    makeTextures(this);
    const save = loadGame();
    this.world = save.world;
    this.trees = save.trees;   // { "x,y": { b: idBlok, t: waktuTanam(ms) } }
    this.inv = save.inv;       // { idItem: jumlah }
    this.discovered = save.discovered;
    this.sel = null;
    this.book = null;
    this.packOpen = false;
    this.barDown = false;
    this.packDragY = null;
    this.pinch = null;
    this.keys = { left: false, right: false, jump: false };
    this.facing = 1;

    // 3 kamera: latar (tetap) -> dunia (bisa zoom) -> UI (tetap)
    this.cams = {
      bg: this.cameras.main,
      world: this.cameras.add(0, 0, 800, 450),
      ui: this.cameras.add(0, 0, 800, 450),
    };

    // latar
    this.bgO(this.add.image(0, 0, 'sky').setOrigin(0).setDepth(-10));
    this.clouds = this.bgO(this.add.tileSprite(0, 0, 800, 150, 'clouds').setOrigin(0).setDepth(-9));
    this.hills = this.bgO(this.add.tileSprite(0, 0, 800, 200, 'hills').setOrigin(0).setDepth(-8));

    // dunia
    const data = this.world.map((r) => r.map((v) => (v ? BLOCKS[v].tex : -1)));
    this.map = this.make.tilemap({ data, tileWidth: T, tileHeight: T });
    const ts = this.map.addTilesetImage('tiles', 'tiles', T, T, 0, 0);
    this.layer = this.wO(this.map.createLayer(0, ts, 0, 0).setDepth(0));

    this.treeSprites = {};
    for (const key of Object.keys(this.trees)) this.spawnTreeSprite(key);
    this.time.addEvent({ delay: 500, loop: true, callback: () => this.refreshTrees() });

    this.fx = {};
    for (const k of Object.keys(BLOCKS)) {
      this.fx[k] = this.wO(this.add.particles(0, 0, 'debris' + k, {
        speed: { min: 60, max: 200 }, angle: { min: 200, max: 340 }, gravityY: 700,
        lifespan: 600, scale: { start: 1.3, end: 0.2 }, emitting: false,
      }).setDepth(3));
    }

    // pemain
    let sy = 0;
    const cx = Math.floor(W / 2);
    while (sy < H && !this.world[sy][cx]) sy++;
    this.p = { x: cx * T + 6, y: sy * T - 30, w: 20, h: 28, vx: 0, vy: 0, ground: false };
    this.sprite = this.wO(this.add.image(0, 0, 'player').setOrigin(0.5, 1).setDepth(2));

    const wc = this.cams.world;
    wc.setBounds(0, 0, W * T, H * T);
    wc.startFollow(this.sprite, true, 0.1, 0.1);
    wc.roundPixels = true;

    // ---------- UI ----------
    this.uiO(this.add.image(0, 0, 'vignette').setOrigin(0).setDepth(5));
    this.input.addPointer(2);
    this.makeButton(50, 395, '◀', 'left');
    this.makeButton(140, 395, '▶', 'right');
    this.makeButton(750, 395, '▲', 'jump');

    // bar item terpilih (tap / geser ke atas = buka ransel)
    this.barBg = this.uiO(this.add.rectangle(400, 412, 300, 58, 0x000000, 0.6).setStrokeStyle(3, 0xffffff, 0.6).setDepth(10).setInteractive());
    this.barIcon = this.uiO(this.add.image(268, 412, 'tiles', 0).setDepth(11));
    this.barTxt = this.uiO(this.add.text(300, 412, '', { fontSize: '18px', color: '#fff', stroke: '#000', strokeThickness: 4 }).setOrigin(0, 0.5).setDepth(11));
    this.uiO(this.add.text(528, 412, '▲', { fontSize: '16px', color: '#ffd54a' }).setOrigin(0.5).setDepth(11));
    this.barBg.on('pointerdown', () => { this.barDown = true; });

    this.buildPack();

    this.bookBtn = this.uiO(this.add.rectangle(748, 30, 88, 34, 0x000000, 0.55).setStrokeStyle(2, 0xffffff, 0.6).setDepth(10).setInteractive());
    this.uiO(this.add.text(748, 30, 'Resep', { fontSize: '17px', color: '#fff' }).setOrigin(0.5).setDepth(11));
    this.bookBtn.on('pointerdown', () => this.toggleBook());

    this.hint = this.uiO(this.add.text(400, 14, 'Tap = aksi  |  Cubit = zoom  |  Tap/geser bar bawah = ransel', {
      fontSize: '15px', color: '#fff', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5, 0).setDepth(10));
    this.tweens.add({ targets: this.hint, alpha: 0, delay: 7000, duration: 800 });
    this.zoomTxt = this.uiO(this.add.text(400, 52, '', { fontSize: '16px', color: '#ffd54a', stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5, 0).setDepth(10).setAlpha(0));

    this.updateHud();

    // ---------- input ----------
    this.input.on('pointerdown', (ptr, over) => {
      ptr.onUI = over.length > 0;
      ptr.pinched = false;
      if (this.book) { ptr.onUI = true; if (!over.length) this.toggleBook(); }
    });
    this.input.on('pointerup', (ptr) => {
      if (this.barDown) {
        this.barDown = false;
        const dy = ptr.downY - ptr.upY;
        if (dy > 20 || Math.abs(dy) < 12) this.openPack();
        return;
      }
      if (this.packDragY !== null) {
        const dy = ptr.upY - this.packDragY;
        this.packDragY = null;
        if (dy > 40) this.closePack(); // geser ke bawah menutup
        return;
      }
      if (ptr.onUI || ptr.pinched) return;
      const moved = Phaser.Math.Distance.Between(ptr.downX, ptr.downY, ptr.upX, ptr.upY);
      if (moved > 14 || ptr.upTime - ptr.downTime > 400) return; // hanya tap singkat
      const wp = this.cams.world.getWorldPoint(ptr.upX, ptr.upY);
      this.tapWorld(wp.x, wp.y);
    });
  }

  // ---------- pembagian kamera ----------
  reg(o, group) {
    for (const k of ['bg', 'world', 'ui']) if (k !== group) this.cams[k].ignore(o);
    return o;
  }
  bgO(o) { return this.reg(o, 'bg'); }
  wO(o) { return this.reg(o, 'world'); }
  uiO(o) { o.setScrollFactor(0); return this.reg(o, 'ui'); }

  makeButton(x, y, label, key) {
    const b = this.uiO(this.add.image(x, y, 'btn').setDepth(10).setInteractive());
    this.uiO(this.add.text(x, y, label, { fontSize: '30px', color: '#fff', stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5).setDepth(11));
    b.on('pointerdown', () => { this.keys[key] = true; b.setAlpha(0.6); });
    const off = () => { this.keys[key] = false; b.setAlpha(1); };
    b.on('pointerup', off); b.on('pointerout', off);
  }

  // ---------- inventory & ransel ----------
  giveItem(id, n = 1) { this.inv[id] = (this.inv[id] || 0) + n; }
  countOf(id) { return this.inv[id] || 0; }
  itemIds() { return Object.keys(this.inv).map(Number).filter((id) => this.inv[id] > 0).sort((a, b) => a - b); }

  updateHud() {
    const ids = this.itemIds();
    if (!ids.includes(this.sel)) this.sel = ids.length ? ids[0] : null;
    if (this.sel === null) {
      this.barIcon.setVisible(false);
      this.barTxt.setText('Ransel kosong');
    } else {
      if (isSeed(this.sel)) this.barIcon.setTexture('seed' + blockOf(this.sel));
      else this.barIcon.setTexture('tiles', BLOCKS[this.sel].tex);
      this.barIcon.setVisible(true);
      this.barTxt.setText(`${itemName(this.sel)}  x${this.inv[this.sel]}`);
    }
  }

  buildPack() {
    const c = this.uiO(this.add.container(0, 450).setDepth(30).setVisible(false));
    const dim = this.add.rectangle(400, 225, 800, 450, 0x000000, 0.45).setInteractive();
    dim.on('pointerdown', () => this.closePack());
    const panel = this.add.rectangle(400, 285, 580, 330, 0x1d1d1d, 0.96).setStrokeStyle(3, 0xffffff, 0.5).setInteractive();
    panel.on('pointerdown', (p) => { this.packDragY = p.y; });
    const grip = this.add.rectangle(400, 128, 60, 5, 0xffffff, 0.5);
    this.packTitle = this.add.text(400, 150, '', { fontSize: '18px', color: '#ffd54a', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
    c.add([dim, panel, grip, this.packTitle]);
    this.pack = c;
    this.packCells = [];
  }

  refreshPack() {
    this.packCells.forEach((o) => o.destroy());
    this.packCells = [];
    const ids = this.itemIds().slice(0, MAXCELLS);
    this.packTitle.setText(this.sel === null ? 'Ransel kosong' : 'Ransel  ·  ' + itemName(this.sel));
    ids.forEach((id, i) => {
      const col = i % COLS, row = Math.floor(i / COLS);
      const x = 400 - (COLS * CELL) / 2 + CELL / 2 + col * CELL, y = 200 + row * CELL;
      const bg = this.add.rectangle(x, y, CELL - 6, CELL - 6, 0x2f2f2f, 1)
        .setStrokeStyle(3, id === this.sel ? 0xffd54a : 0x666666, 1).setInteractive();
      const icon = (isSeed(id) ? this.add.image(x, y - 3, 'seed' + blockOf(id)) : this.add.image(x, y - 3, 'tiles', BLOCKS[id].tex)).setScale(1.2);
      const txt = this.add.text(x + CELL / 2 - 8, y + CELL / 2 - 8, String(this.inv[id]), { fontSize: '14px', color: '#fff', stroke: '#000', strokeThickness: 4 }).setOrigin(1, 1);
      bg.on('pointerdown', () => {
        this.sel = id;
        this.updateHud();
        this.time.delayedCall(120, () => this.closePack());
      });
      this.pack.add([bg, icon, txt]);
      this.packCells.push(bg, icon, txt);
    });
  }

  openPack() {
    if (this.packOpen) return;
    this.packOpen = true;
    this.refreshPack();
    this.pack.setVisible(true);
    this.tweens.killTweensOf(this.pack);
    this.tweens.add({ targets: this.pack, y: 0, duration: 220, ease: 'Cubic.easeOut' });
  }

  closePack() {
    if (!this.packOpen) return;
    this.packOpen = false;
    this.tweens.killTweensOf(this.pack);
    this.tweens.add({ targets: this.pack, y: 450, duration: 180, ease: 'Cubic.easeIn', onComplete: () => this.pack.setVisible(false) });
  }

  popup(x, y, text, color = '#ffffff') {
    const t = this.wO(this.add.text(x, y, text, { fontSize: '16px', color, stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5).setDepth(8));
    this.tweens.add({ targets: t, y: y - 34, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  save() { saveGame({ world: this.world, trees: this.trees, inv: this.inv, discovered: this.discovered }); }

  // ---------- pohon ----------
  treeProgress(tr) { return (Date.now() - tr.t) / (BLOCKS[tr.b].grow * 1000); }
  treeStage(tr) { const p = this.treeProgress(tr); return p >= 1 ? 3 : p >= 0.66 ? 2 : p >= 0.33 ? 1 : 0; }

  spawnTreeSprite(key) {
    const [tx, ty] = key.split(',').map(Number);
    const tr = this.trees[key];
    const st = this.treeStage(tr);
    const img = this.wO(this.add.image(tx * T, ty * T, `tree${tr.b}_${st}`).setOrigin(0).setDepth(1));
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
    const f = this.wO(this.add.rectangle(tx * T, ty * T, T, T, 0xffffff, 0.5).setOrigin(0).setDepth(4));
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
      // seed lain dipilih & pohon belum matang -> coba splicing
      if (this.sel !== null && isSeed(this.sel) && this.countOf(this.sel) > 0 && blockOf(this.sel) !== tr.b) {
        this.spliceTree(tx, ty, key);
        return;
      }
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

  spliceTree(tx, ty, key) {
    const tr = this.trees[key];
    const x = tx * T + T / 2, y = ty * T;
    const b2 = blockOf(this.sel);
    const result = recipeResult(tr.b, b2);
    if (!result) { this.popup(x, y, 'Tidak cocok', '#ff8a80'); return; }
    this.inv[this.sel]--;
    const rk = recipeKey(tr.b, b2);
    const isNew = !this.discovered[rk];
    this.discovered[rk] = true;
    tr.b = result;
    tr.t = Date.now(); // pohon hasil splicing mulai tumbuh dari awal
    const img = this.treeSprites[key];
    img.setTexture(`tree${result}_0`); img.stage = 0;
    this.fx[result].explode(18, x, y + 16);
    this.flash(tx, ty);
    this.popup(x, y, (isNew ? 'Resep baru! ' : 'Splice! ') + BLOCKS[result].name, '#ffd54a');
    this.updateHud(); this.save();
  }

  toggleBook() {
    if (this.book) { this.book.forEach((o) => o.destroy()); this.book = null; return; }
    const keys = Object.keys(RECIPES);
    const found = keys.filter((k) => this.discovered[k]).length;
    const lines = keys.map((k) => {
      if (!this.discovered[k]) return '?  +  ?  =  ?';
      const [a, b] = k.split('+').map(Number);
      return `${BLOCKS[a].name}  +  ${BLOCKS[b].name}  =  ${BLOCKS[RECIPES[k]].name}`;
    });
    const bg = this.uiO(this.add.rectangle(400, 225, 560, 320, 0x000000, 0.88).setStrokeStyle(3, 0xffffff, 0.6).setDepth(40).setInteractive());
    const st = { fontSize: '20px', color: '#fff', align: 'center', lineSpacing: 10 };
    const title = this.uiO(this.add.text(400, 88, `Buku Resep (${found}/${keys.length})`, { ...st, fontSize: '24px', color: '#ffd54a' }).setOrigin(0.5, 0).setDepth(41));
    const body = this.uiO(this.add.text(400, 135, lines.join('\n'), st).setOrigin(0.5, 0).setDepth(41));
    const foot = this.uiO(this.add.text(400, 340, 'Cara: pilih seed, lalu tap pohon lain yang belum matang.\nTap di mana saja untuk menutup.', { ...st, fontSize: '15px', color: '#cfcfcf' }).setOrigin(0.5, 0).setDepth(41));
    bg.on('pointerdown', () => this.toggleBook());
    this.book = [bg, title, body, foot];
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

  updatePinch() {
    const down = this.input.manager.pointers.filter((p) => p.isDown && !p.onUI);
    const wc = this.cams.world;
    if (down.length >= 2) {
      const [a, b] = down;
      const d = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
      a.pinched = b.pinched = true;
      if (!this.pinch) this.pinch = { d0: Math.max(d, 1), z0: wc.zoom };
      else {
        const z = Phaser.Math.Clamp(this.pinch.z0 * d / this.pinch.d0, ZMIN, ZMAX);
        wc.setZoom(z);
        this.zoomTxt.setText(`Zoom ${z.toFixed(1)}x`).setAlpha(1);
        if (this.zoomFade) this.zoomFade.stop();
        this.zoomFade = this.tweens.add({ targets: this.zoomTxt, alpha: 0, delay: 700, duration: 400 });
      }
    } else this.pinch = null;
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

    this.updatePinch();

    // latar mengikuti kamera dunia (parallax)
    const wc = this.cams.world, z = wc.zoom;
    const mx = wc.midPoint.x, my = wc.midPoint.y;
    this.hills.y = (24 * T - my) * z + 225 - 200;
    this.hills.tilePositionX = (mx - 400) * 0.25;
    this.clouds.y = 10 - (my - 225) * 0.3;
    this.clouds.tilePositionX = (mx - 400) * 0.1 + time * 0.01;
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
