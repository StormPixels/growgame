import Phaser from 'phaser';
import { BLOCKS, RECIPES, recipeKey, recipeResult, isSeed, blockOf, seedId, itemName, SEED_DROP_CHANCE, HARVEST_SEED_CHANCE, LOCK_ID } from './items.js';
import { T, W, H, loadSave, persist, getWorld, normalizeName, playerName, emptyLock } from './world.js';
import { makeTextures, preloadTextures } from './textures.js';

const ZMIN = 0.6, ZMAX = 2.5;                 // batas zoom (cubit)
const D = 250;                                // jarak ransel naik saat ditarik
const COLS = 8, CELL = 60, GRID_TOP = 10, GRID_H = 240; // grid ransel
const HOT_Y = 410;
const SLOTS = 6;                              // jumlah slot hotbar
const SLOT_GAP = 60;                            // posisi hotbar saat tertutup
const fmtTime = (s) => (s >= 60 ? `${Math.floor(s / 60)} mnt${s % 60 ? ' ' + (s % 60) + ' dtk' : ''}` : `${s} dtk`);

class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }
  init(data) { this.worldName = (data && data.name) || 'START'; }

  create() {
    makeTextures(this);
    const save = loadSave();
    this.saveData = save;
    this.me = save.player.id;                  // id pemain yang sedang main
    this.wd = getWorld(save, this.worldName);  // data world ini: tiles, trees, door, lock
    this.world = this.wd.tiles;
    this.trees = this.wd.trees;                // { "x,y": { b: idBlok, t: waktuTanam(ms) } }
    this.inv = save.inv;                       // { idItem: jumlah }
    this.discovered = save.discovered;
    save.quick = (Array.isArray(save.quick) ? save.quick : []).slice(0, SLOTS); // simpanan lama (4 slot) diperpanjang
    while (save.quick.length < SLOTS) save.quick.push(null);
    this.quick = save.quick;
    this.quickSel = Math.min(save.quickSel || 0, SLOTS - 1);
    this.dialog = null;
    this.dmg = {};        // kerusakan blok: { "x,y": { n, t, img } }
    this.nextPunch = 0;
    this.sel = null;
    this.book = null;
    this.chatOpen = false;
    this.bubble = null;
    this.lift = 0;
    this.scroll = 0;
    this.maxScroll = 0;
    this.drag = null;
    this.liftTween = null;
    this.recycleArm = false;
    this.infoBox = null;
    this.pinch = null;
    this.keys = { left: false, right: false, jump: false, punch: false };
    this.facing = 1;
    for (const id of this.itemIds()) this.autoQuick(id); // isi slot cepat yang masih kosong

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
    const door = this.wd.door;
    this.doorSprite = this.wO(this.add.image(door.x * T, door.y * T, 'door').setOrigin(0).setDepth(1));
    this.p = { x: door.x * T + 6, y: door.y * T + 2, w: 20, h: 28, vx: 0, vy: 0, ground: false };
    this.sprite = this.wO(this.add.image(0, 0, 'player').setOrigin(0.5, 1).setDepth(2));
    this.fistSpr = this.wO(this.add.image(0, 0, 'fist').setDepth(3).setVisible(false));

    const wc = this.cams.world;
    wc.setBounds(0, 0, W * T, H * T);
    wc.startFollow(this.sprite, true, 0.1, 0.1);
    wc.roundPixels = true;

    // ---------- UI ----------
    this.uiO(this.add.image(0, 0, 'vignette').setOrigin(0).setDepth(5));
    if (this.input.manager.pointersTotal < 4) this.input.addPointer(4 - this.input.manager.pointersTotal);
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,D');
    this.keyF = this.input.keyboard.addKey('F');
    this.input.keyboard.on('keydown-B', () => this.animateLift(this.lift > D / 2 ? 0 : D));
    this.input.keyboard.on('keydown-ENTER', () => { if (!this.chatOpen) this.openChat(); });
    this.input.keyboard.on('keydown', (e) => {
      const n = '123456'.indexOf(e.key);
      if (e.key.length === 1 && n >= 0) { this.quickSel = n; this.updateHud(); this.save(); }
    });
    this.input.on('wheel', (ptr, objs, dx, dy) => this.setZoomLevel(this.cams.world.zoom * (dy > 0 ? 0.9 : 1.1)));

    this.buildPack();   // panel ransel (di belakang hotbar)
    this.buildHud();    // hotbar + tombol gerak (ikut naik saat ransel ditarik)
    this.makeButton(50, 395, '◀', 'left');
    this.makeButton(140, 395, '▶', 'right');
    this.makeButton(750, 395, '▲', 'jump');
    this.makeButton(655, 395, '👊', 'punch');

    this.bookBtn = this.uiO(this.add.rectangle(748, 30, 88, 34, 0x000000, 0.55).setStrokeStyle(2, 0xffffff, 0.6).setDepth(10).setInteractive());
    this.uiO(this.add.text(748, 30, 'Resep', { fontSize: '17px', color: '#fff' }).setOrigin(0.5).setDepth(11));
    this.bookBtn.on('pointerdown', () => this.toggleBook());

    this.talkBtn = this.uiO(this.add.rectangle(748, 70, 88, 34, 0x2e7d32, 0.75).setStrokeStyle(2, 0xffffff, 0.6).setDepth(10).setInteractive());
    this.uiO(this.add.text(748, 70, 'Talk', { fontSize: '17px', color: '#fff' }).setOrigin(0.5).setDepth(11));
    this.talkBtn.on('pointerup', () => this.openChat()); // dibuka saat jari diangkat agar keyboard HP muncul
    this.buildChatBox();

    this.worldLabel = this.uiO(this.add.text(10, 8, '', { fontSize: '15px', color: '#fff', stroke: '#000', strokeThickness: 4, lineSpacing: 2 }).setDepth(10));
    this.exitBtn = this.uiO(this.add.rectangle(54, 70, 84, 28, 0x8a2a2a, 0.85).setStrokeStyle(2, 0xffffff, 0.6).setDepth(10).setInteractive());
    this.uiO(this.add.text(54, 70, 'Keluar', { fontSize: '15px', color: '#fff' }).setOrigin(0.5).setDepth(11));
    this.exitBtn.on('pointerup', () => this.leaveWorld());
    this.refreshWorldLabel();

    this.hint = this.uiO(this.add.text(400, 14, 'Tap = aksi  |  👊 = pukul depan  |  Cubit = zoom  |  Tarik hotbar = ransel', {
      fontSize: '15px', color: '#fff', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5, 0).setDepth(10));
    this.tweens.add({ targets: this.hint, alpha: 0, delay: 7000, duration: 800 });
    this.zoomTxt = this.uiO(this.add.text(400, 52, '', { fontSize: '16px', color: '#ffd54a', stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5, 0).setDepth(10).setAlpha(0));
    this.toastTxt = this.uiO(this.add.text(400, 84, '', { fontSize: '16px', color: '#fff', stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5, 0).setDepth(50).setAlpha(0));

    this.updateHud();
    this.setLift(0);

    // ---------- input ----------
    this.input.on('pointerdown', (ptr, over) => {
      ptr.onUI = over.length > 0;
      ptr.pinched = false;
      if (this.book) { ptr.onUI = true; if (!over.length) this.toggleBook(); }
      if (this.dialog) { ptr.onUI = true; if (!over.length) this.closeDialog(); }
    });
    this.input.on('pointermove', (ptr) => {
      const d = this.drag;
      if (!d || !ptr.isDown) return;
      const dy = ptr.y - d.startY;
      if (!d.moved && Math.abs(dy) > 10) d.moved = true;
      if (!d.moved) return;
      if (d.kind === 'lift') this.setLift(Phaser.Math.Clamp(d.startLift - dy, 0, D));
      else { this.scroll = Phaser.Math.Clamp(d.startScroll - dy, 0, this.maxScroll); this.layoutGrid(); }
    });
    this.input.on('pointerup', (ptr) => {
      if (this.drag) {
        const d = this.drag;
        this.drag = null;
        if (d.kind === 'lift') {
          if (d.moved) { // lepas: tutup/buka penuh sesuai arah tarikan
            const wasOpen = d.startLift > D / 2;
            this.animateLift(wasOpen ? (this.lift < D * 0.7 ? 0 : D) : (this.lift > D * 0.3 ? D : 0));
          } else if (d.slot !== null && d.slot !== this.quickSel) {
            this.quickSel = d.slot; this.updateHud(); this.save();
          } else this.animateLift(this.lift > D / 2 ? 0 : D); // tap slot aktif / bingkai = buka-tutup
        } else if (!d.moved && d.cell !== null) this.assignQuick(d.cell);
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
    const b = this.add.image(x, y, 'btn').setInteractive();
    const t = this.add.text(x, y, label, { fontSize: '30px', color: '#fff', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5);
    b.on('pointerdown', () => { this.keys[key] = true; b.setAlpha(0.6); if (key === 'punch') this.punch(); });
    const off = () => { this.keys[key] = false; b.setAlpha(1); };
    b.on('pointerup', off); b.on('pointerout', off);
    this.hud.add([b, t]);
  }

  toast(msg) {
    this.toastTxt.setText(msg).setAlpha(1);
    if (this.toastFade) this.toastFade.stop();
    this.toastFade = this.tweens.add({ targets: this.toastTxt, alpha: 0, delay: 1200, duration: 400 });
  }

  // ---------- inventory ----------
  giveItem(id, n = 1) {
    const had = this.countOf(id) > 0;
    this.inv[id] = (this.inv[id] || 0) + n;
    if (!had) this.autoQuick(id);
  }
  countOf(id) { return this.inv[id] || 0; }
  itemIds() { return Object.keys(this.inv).map(Number).filter((id) => this.inv[id] > 0).sort((a, b) => a - b); }
  autoQuick(id) { // item baru otomatis mengisi slot cepat yang kosong
    if (this.quick.includes(id)) return;
    const k = this.quick.indexOf(null);
    if (k >= 0) this.quick[k] = id;
  }

  assignQuick(id) { // tap item di ransel -> masuk ke slot cepat yang aktif
    const j = this.quick.indexOf(id);
    const cur = this.quick[this.quickSel];
    if (j >= 0 && j !== this.quickSel) this.quick[j] = cur === undefined ? null : cur;
    this.quick[this.quickSel] = id;
    this.updateHud(); this.save();
  }

  // ---------- hotbar & ransel (ditarik ke atas) ----------
  buildHud() {
    const hud = this.uiO(this.add.container(0, 0).setDepth(10));
    this.hud = hud;
    const frame = this.add.rectangle(400, HOT_Y, SLOTS * SLOT_GAP + 18, 68, 0x6b4423, 0.96).setStrokeStyle(4, 0x2e1c0d, 1).setInteractive();
    frame.on('pointerdown', (p) => this.startLiftDrag(p, null));
    hud.add(frame);
    this.slots = [];
    for (let i = 0; i < SLOTS; i++) {
      const x = 400 + (i - (SLOTS - 1) / 2) * SLOT_GAP;
      const bg = this.add.rectangle(x, HOT_Y, 52, 52, 0x8a5a30, 1).setStrokeStyle(3, 0x3a2412, 1).setInteractive();
      const glow = this.add.rectangle(x, HOT_Y, 58, 58).setStrokeStyle(3, 0xffa530, 1).setVisible(false); // sorotan slot aktif
      const icon = this.add.image(x, HOT_Y - 2, 'tiles', 0).setVisible(false);
      const txt = this.add.text(x + 23, HOT_Y + 23, '', { fontSize: '13px', color: '#fff', stroke: '#000', strokeThickness: 4 }).setOrigin(1, 1);
      bg.on('pointerdown', (p) => this.startLiftDrag(p, i));
      hud.add([bg, glow, icon, txt]);
      this.slots.push({ bg, glow, icon, txt });
    }
  }

  startLiftDrag(p, slot) {
    if (this.liftTween) this.liftTween.stop();
    this.drag = { kind: 'lift', startY: p.y, startLift: this.lift, moved: false, slot };
  }

  buildPack() {
    const c = this.uiO(this.add.container(0, 440).setDepth(9).setVisible(false));
    const bg = this.add.rectangle(282, 130, 504, 260, 0x143a4a, 0.97).setStrokeStyle(3, 0x7ec8e3, 0.9).setInteractive();
    bg.on('pointerdown', (p) => { this.drag = { kind: 'grid', startY: p.y, startScroll: this.scroll, moved: false, cell: null }; });
    c.add(bg);
    const mk = (label, y, color, dim, fn) => {
      const r = this.add.rectangle(590, y, 96, 44, color, 1).setStrokeStyle(3, 0xffffff, 0.7).setInteractive();
      const t = this.add.text(590, y, label, { fontSize: '16px', color: '#fff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
      if (dim) { r.setAlpha(0.4); t.setAlpha(0.5); }
      r.on('pointerdown', fn);
      c.add([r, t]);
      return { r, t };
    };
    this.btnRecycle = mk('Recycle', 36, 0x2a6f8f, false, () => this.recycle());
    mk('Store', 94, 0x2a6f8f, true, () => this.toast('Store: segera hadir'));
    mk('Drop', 152, 0x2a6f8f, true, () => this.toast('Drop: segera hadir'));
    mk('Info', 210, 0x2a6f8f, false, () => this.toggleInfo());
    this.pack = c;
    this.packCells = [];
  }

  setLift(v) {
    this.lift = v;
    this.hud.y = -v;
    this.pack.y = 440 - v;
    const open = v > 4;
    if (open && !this.pack.visible) { this.pack.setVisible(true); this.refreshGrid(); }
    else if (!open) { this.pack.setVisible(false); if (this.infoBox) this.toggleInfo(); }
    this.cams.world.setFollowOffset(0, -v / 2); // karakter naik supaya tidak tertutup ransel
  }

  animateLift(target) {
    if (this.liftTween) this.liftTween.stop();
    const from = this.lift;
    if (from === target) return;
    this.liftTween = this.tweens.addCounter({
      from, to: target, duration: 60 + (Math.abs(target - from) / D) * 220, ease: 'Cubic.easeOut',
      onUpdate: (tw) => this.setLift(tw.getValue()),
    });
  }

  updateHud() {
    const q = this.quick[this.quickSel];
    this.sel = q === undefined || q === null ? null : q;
    this.slots.forEach((s, i) => {
      const id = this.quick[i];
      s.bg.setStrokeStyle(3, i === this.quickSel ? 0xffa530 : 0x3a2412, 1);
      s.glow.setVisible(i === this.quickSel);
      if (id === null || id === undefined) { s.icon.setVisible(false); s.txt.setText(''); return; }
      if (isSeed(id)) s.icon.setTexture('seed' + blockOf(id)); else s.icon.setTexture('tiles', BLOCKS[id].tex);
      s.icon.setVisible(true).setAlpha(this.countOf(id) > 0 ? 1 : 0.3);
      s.txt.setText(String(this.countOf(id)));
    });
    if (this.lift > 4) this.refreshGrid();
  }

  refreshGrid() {
    this.packCells.forEach((o) => o.destroy());
    this.packCells = [];
    const ids = this.itemIds();
    this.maxScroll = Math.max(0, Math.ceil(ids.length / COLS) * CELL - GRID_H);
    this.scroll = Math.min(this.scroll, this.maxScroll);
    for (const id of ids) {
      const border = id === this.sel ? 0xffd54a : isSeed(id) ? 0x6fcf5f : 0xbfd6e0;
      const bg = this.add.rectangle(0, 0, CELL - 6, CELL - 6, 0x0e2a36, 1).setStrokeStyle(3, border, 1).setInteractive();
      const icon = (isSeed(id) ? this.add.image(0, 0, 'seed' + blockOf(id)) : this.add.image(0, 0, 'tiles', BLOCKS[id].tex)).setScale(1.1);
      const txt = this.add.text(0, 0, String(this.inv[id]), { fontSize: '13px', color: '#fff', stroke: '#000', strokeThickness: 4 }).setOrigin(1, 1);
      bg.on('pointerdown', (p) => { this.drag = { kind: 'grid', startY: p.y, startScroll: this.scroll, moved: false, cell: id }; });
      this.pack.add([bg, icon, txt]);
      this.packCells.push(bg, icon, txt);
    }
    this.layoutGrid();
  }

  layoutGrid() {
    for (let n = 0; n < this.packCells.length; n += 3) {
      const i = n / 3, col = i % COLS, row = Math.floor(i / COLS);
      const x = 72 + col * 60, y = GRID_TOP + CELL / 2 + row * CELL - this.scroll;
      const vis = y - CELL / 2 >= GRID_TOP - 1 && y + CELL / 2 <= GRID_TOP + GRID_H + 1;
      const [bg, icon, txt] = this.packCells.slice(n, n + 3);
      bg.setPosition(x, y); icon.setPosition(x, y - 3); txt.setPosition(x + CELL / 2 - 7, y + CELL / 2 - 6);
      bg.setVisible(vis); icon.setVisible(vis); txt.setVisible(vis);
    }
  }

  toggleInfo() {
    if (this.infoBox) { this.infoBox.forEach((o) => o.destroy()); this.infoBox = null; return; }
    const id = this.sel;
    if (id === null) { this.toast('Pilih item dulu'); return; }
    const b = blockOf(id), def = BLOCKS[b];
    const lines = [itemName(id), isSeed(id) ? `Jenis: Seed (jadi pohon ${def.name})` : 'Jenis: Blok'];
    if (def.grow) lines.push(`Waktu tumbuh: ${fmtTime(def.grow)}`);
    if (id === LOCK_ID) lines.push('Pasang untuk mengunci world', 'Lepas lewat tap gemboknya');
    else if (def.unbreakable) lines.push('Tidak bisa dihancurkan');
    const rec = Object.keys(RECIPES).filter((k) => this.discovered[k] && (k.split('+').map(Number).includes(b) || RECIPES[k] === b));
    if (rec.length) {
      lines.push('', 'Resep:');
      for (const k of rec) {
        const [x, y] = k.split('+').map(Number);
        lines.push(`${BLOCKS[x].name} + ${BLOCKS[y].name} = ${BLOCKS[RECIPES[k]].name}`);
      }
    }
    const bg = this.add.rectangle(282, 130, 484, 240, 0x0e2a36, 0.98).setStrokeStyle(3, 0xffd54a, 1).setInteractive();
    bg.on('pointerdown', () => this.toggleInfo());
    const t = this.add.text(282, 24, lines.join('\n'), { fontSize: '17px', color: '#fff', align: 'center', lineSpacing: 6 }).setOrigin(0.5, 0);
    const hint = this.add.text(282, 236, 'Tap untuk menutup', { fontSize: '13px', color: '#9fb6c0' }).setOrigin(0.5);
    this.pack.add([bg, t, hint]);
    this.infoBox = [bg, t, hint];
  }

  recycle() {
    const id = this.sel;
    if (id === null || this.countOf(id) < 1) { this.toast('Tidak ada item'); return; }
    if (!this.recycleArm) { // tap pertama minta konfirmasi
      this.recycleArm = true;
      this.btnRecycle.t.setText('Yakin?');
      this.time.delayedCall(2500, () => { this.recycleArm = false; this.btnRecycle.t.setText('Recycle'); });
      return;
    }
    this.recycleArm = false;
    this.btnRecycle.t.setText('Recycle');
    const n = this.inv[id];
    this.inv[id] = 0;
    this.toast(`Dibuang ${n} ${itemName(id)}`);
    this.updateHud(); this.save();
  }

  // ---------- world & kunci ----------
  canEdit() { // satu-satunya aturan izin; nanti dipindah ke server
    const L = this.wd.lock;
    return L.owner === null || L.owner === this.me || L.publicBuild;
  }

  refreshWorldLabel() {
    const L = this.wd.lock;
    const st = L.owner === null ? 'Tidak terkunci' : `🔒 ${L.ownerName}${L.publicBuild ? ' (publik)' : ''}`;
    this.worldLabel.setText(`${this.wd.name}\n${st}`);
  }

  leaveWorld() {
    this.closeChat();
    this.save();
    this.scene.start('Menu');
  }

  overlapsPlayer(tx, ty) {
    const p = this.p;
    const xs = [p.x, p.x + p.w - 1], ys = [p.y, p.y + p.h / 2, p.y + p.h - 1];
    return xs.some((x) => ys.some((y) => Math.floor(x / T) === tx && Math.floor(y / T) === ty));
  }

  placeLock(tx, ty) {
    if (this.wd.lock.owner !== null) { this.toast('World ini sudah dikunci'); return; }
    if (this.overlapsPlayer(tx, ty)) return;
    this.world[ty][tx] = LOCK_ID;
    this.layer.putTileAt(BLOCKS[LOCK_ID].tex, tx, ty);
    this.wd.lock = { owner: this.me, ownerName: playerName(this.me), publicBuild: false, pos: { x: tx, y: ty } };
    this.inv[LOCK_ID]--;
    this.flash(tx, ty);
    this.popup(tx * T + 16, ty * T, 'World terkunci!', '#ffd54a');
    this.refreshWorldLabel(); this.updateHud(); this.save();
  }

  lockDialog() {
    const L = this.wd.lock;
    if (L.owner !== this.me) { this.toast(L.owner === null ? 'Gembok tidak aktif' : `Dikunci oleh ${L.ownerName}`); return; }
    this.showDialog('World Lock', [`Pemilik: ${L.ownerName}`, `Semua orang boleh membangun: ${L.publicBuild ? 'Ya' : 'Tidak'}`], [
      { label: L.publicBuild ? 'Matikan akses publik' : 'Izinkan semua membangun', fn: () => { L.publicBuild = !L.publicBuild; this.save(); this.refreshWorldLabel(); this.lockDialog(); } },
      { label: 'Lepas kunci', fn: () => this.removeLock() },
      { label: 'Tutup', fn: () => this.closeDialog() },
    ]);
  }

  removeLock() {
    const L = this.wd.lock;
    if (L.pos && this.world[L.pos.y][L.pos.x] === LOCK_ID) {
      this.world[L.pos.y][L.pos.x] = 0;
      this.layer.removeTileAt(L.pos.x, L.pos.y);
    }
    this.wd.lock = emptyLock();
    this.giveItem(LOCK_ID);
    this.closeDialog();
    this.toast('Kunci dilepas, gembok kembali ke ransel');
    this.refreshWorldLabel(); this.updateHud(); this.save();
  }

  showDialog(title, lines, buttons) {
    this.closeDialog();
    const h = 64 + lines.length * 26 + buttons.length * 50 + 12;
    const top = 225 - h / 2;
    const objs = [];
    objs.push(this.uiO(this.add.rectangle(400, 225, 380, h, 0x143a4a, 0.98).setStrokeStyle(3, 0x7ec8e3, 1).setDepth(45).setInteractive()));
    objs.push(this.uiO(this.add.text(400, top + 16, title, { fontSize: '22px', color: '#ffd54a', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 0).setDepth(46)));
    lines.forEach((l, i) => objs.push(this.uiO(this.add.text(400, top + 54 + i * 26, l, { fontSize: '16px', color: '#fff' }).setOrigin(0.5, 0).setDepth(46))));
    buttons.forEach((b, i) => {
      const y = top + 64 + lines.length * 26 + 25 + i * 50;
      const r = this.uiO(this.add.rectangle(400, y, 300, 40, 0x2a6f8f, 1).setStrokeStyle(2, 0xffffff, 0.7).setDepth(46).setInteractive());
      const t = this.uiO(this.add.text(400, y, b.label, { fontSize: '16px', color: '#fff' }).setOrigin(0.5).setDepth(47));
      r.on('pointerdown', () => this.time.delayedCall(0, b.fn)); // ditunda agar objek tidak dihapus saat masih memproses event-nya
      objs.push(r, t);
    });
    this.dialog = objs;
  }

  closeDialog() {
    if (this.dialog) { this.dialog.forEach((o) => o.destroy()); this.dialog = null; }
  }

  // ---------- chat ----------
  buildChatBox() {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);display:none;gap:6px;z-index:1000;width:min(92vw,480px);';
    const input = document.createElement('input');
    input.type = 'text'; input.maxLength = 60; input.placeholder = 'Ketik pesan...'; input.autocomplete = 'off';
    input.style.cssText = 'flex:1;min-width:0;padding:10px 12px;font-size:16px;border:2px solid #fff;border-radius:8px;background:#222;color:#fff;outline:none;';
    const mk = (label, bg) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = `padding:0 14px;font-size:16px;border:0;border-radius:8px;background:${bg};color:#fff;`;
      return b;
    };
    const send = mk('Kirim', '#2e7d32'), close = mk('✕', '#555');
    ['keydown', 'keyup', 'keypress'].forEach((type) => input.addEventListener(type, (e) => {
      e.stopPropagation(); // supaya WASD/spasi tidak menggerakkan karakter saat mengetik
      if (type === 'keydown') {
        if (e.key === 'Enter') this.sendChat();
        else if (e.key === 'Escape') this.closeChat();
      }
    }));
    send.addEventListener('click', () => this.sendChat());
    close.addEventListener('click', () => this.closeChat());
    box.append(input, send, close);
    document.body.appendChild(box);
    this.chat = { box, input };
    this.events.once('shutdown', () => box.remove());
  }

  openChat() {
    if (this.chatOpen) return;
    this.chatOpen = true;
    this.chat.box.style.display = 'flex';
    this.chat.input.focus();
  }

  closeChat() {
    this.chatOpen = false;
    this.chat.box.style.display = 'none';
    this.chat.input.value = '';
    this.chat.input.blur();
  }

  sendChat() {
    const msg = this.chat.input.value.trim();
    if (!msg) return;
    this.showBubble(msg);
    this.closeChat();
  }

  showBubble(msg) {
    if (this.bubble) { this.tweens.killTweensOf(this.bubble); this.bubble.destroy(); this.bubble = null; }
    const txt = this.add.text(0, 0, msg, {
      fontSize: '14px', fontFamily: 'sans-serif', color: '#1a1a1a', align: 'center', wordWrap: { width: 140 }, resolution: 2,
    }).setOrigin(0.5);
    const w = Math.max(txt.width + 16, 30), h = txt.height + 12;
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.96); g.lineStyle(2, 0x333333, 1);
    g.fillRoundedRect(-w / 2, -h - 10, w, h, 8); g.strokeRoundedRect(-w / 2, -h - 10, w, h, 8);
    g.fillTriangle(-6, -10, 6, -10, 0, 0);
    txt.setPosition(0, -10 - h / 2);
    const c = this.wO(this.add.container(this.sprite.x, this.sprite.y - 32, [g, txt]).setDepth(9));
    this.bubble = c;
    const hold = Math.min(3000 + msg.length * 80, 8000);
    this.tweens.add({
      targets: c, alpha: 0, delay: hold, duration: 500,
      onComplete: () => { if (this.bubble === c) this.bubble = null; c.destroy(); },
    });
  }

  popup(x, y, text, color = '#ffffff') {
    const t = this.wO(this.add.text(x, y, text, { fontSize: '16px', color, stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5).setDepth(8));
    this.tweens.add({ targets: t, y: y - 34, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  save() {
    this.saveData.quickSel = this.quickSel;
    persist(this.saveData); // world, pohon, kunci, inventory semuanya ada di saveData
  }

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
    const now = this.time.now;
    for (const k of Object.keys(this.dmg)) { // retakan hilang kalau blok dibiarkan 5 detik
      if (now - this.dmg[k].t > 5000) { if (this.dmg[k].img) this.dmg[k].img.destroy(); delete this.dmg[k]; }
    }
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
    const door = this.wd.door;
    if (tx === door.x && ty === door.y) { this.leaveWorld(); return; }      // tap pintu = keluar world
    if (this.world[ty][tx] === LOCK_ID) { this.lockDialog(); return; }      // tap World Lock = menu kunci
    if (!this.canEdit()) { this.popup(tx * T + 16, ty * T, `Dikunci: ${this.wd.lock.ownerName}`, '#ff8a80'); return; }
    if (this.trees[key]) this.tapTree(tx, ty, key);
    else if (this.world[ty][tx] > 0) this.hitBlock(tx, ty);
    else this.useSelected(tx, ty);
  }

  flash(tx, ty) {
    const f = this.wO(this.add.rectangle(tx * T, ty * T, T, T, 0xffffff, 0.5).setOrigin(0).setDepth(4));
    this.tweens.add({ targets: f, alpha: 0, duration: 180, onComplete: () => f.destroy() });
  }

  // ---------- pukulan ----------
  punch() { // tombol Punch: memukul tile tepat di depan karakter
    const now = this.time.now;
    if (now < this.nextPunch) return;
    this.nextPunch = now + 220;
    this.punchAnim();
    const tx = Math.floor((this.p.x + this.p.w / 2) / T) + this.facing;
    const ty = Math.floor((this.p.y + this.p.h / 2) / T);
    if (tx < 0 || tx >= W || ty < 0 || ty >= H) return;
    if (this.world[ty][tx] === LOCK_ID) { this.lockDialog(); return; }
    const key = tx + ',' + ty;
    const hasTree = !!this.trees[key], hasBlock = this.world[ty][tx] > 0;
    if (!hasTree && !hasBlock) return; // memukul udara
    if (!this.canEdit()) { this.popup(tx * T + 16, ty * T, `Dikunci: ${this.wd.lock.ownerName}`, '#ff8a80'); return; }
    if (hasTree) this.tapTree(tx, ty, key, false);
    else this.hitBlock(tx, ty);
  }

  punchAnim() {
    const f = this.facing, s = this.fistSpr;
    const px = this.p.x + this.p.w / 2 + f * 8, py = this.p.y + 14;
    this.tweens.killTweensOf(s);
    s.setPosition(px, py).setFlipX(f < 0).setAlpha(1).setVisible(true);
    this.tweens.add({ targets: s, x: px + f * 14, duration: 90, yoyo: true, onComplete: () => s.setVisible(false) });
  }

  hitBlock(tx, ty) { // blok butuh beberapa pukulan; retakan bertambah
    const t = this.world[ty][tx];
    const def = BLOCKS[t];
    const cx = tx * T + T / 2, cy = ty * T + T / 2;
    if (def.unbreakable) { this.popup(cx, ty * T, 'Tidak bisa dihancurkan', '#ff8a80'); return; }
    const need = def.hits || 3, key = tx + ',' + ty, now = this.time.now;
    let d = this.dmg[key];
    if (!d) d = this.dmg[key] = { n: 0, t: now, img: null };
    d.n++; d.t = now;
    if (d.n >= need) {
      if (d.img) d.img.destroy();
      delete this.dmg[key];
      this.breakBlock(tx, ty);
      return;
    }
    this.fx[t].explode(3, cx, cy);
    const stage = Math.min(2, Math.floor((d.n / need) * 3));
    if (!d.img) d.img = this.wO(this.add.image(tx * T, ty * T, 'crack' + stage).setOrigin(0).setDepth(0.5));
    else d.img.setTexture('crack' + stage);
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
    if (id === LOCK_ID) { this.placeLock(tx, ty); return; }
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

  tapTree(tx, ty, key, allowSplice = true) {
    const tr = this.trees[key];
    const x = tx * T + T / 2, y = ty * T;
    const prog = this.treeProgress(tr);
    if (prog < 1) {
      // seed lain dipilih & pohon belum matang -> coba splicing
      if (allowSplice && this.sel !== null && isSeed(this.sel) && this.countOf(this.sel) > 0 && blockOf(this.sel) !== tr.b) {
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

  setZoomLevel(z) {
    z = Phaser.Math.Clamp(z, ZMIN, ZMAX);
    this.cams.world.setZoom(z);
    this.zoomTxt.setText(`Zoom ${z.toFixed(1)}x`).setAlpha(1);
    if (this.zoomFade) this.zoomFade.stop();
    this.zoomFade = this.tweens.add({ targets: this.zoomTxt, alpha: 0, delay: 700, duration: 400 });
  }

  updatePinch() {
    const down = this.input.manager.pointers.filter((p) => p.isDown && !p.onUI);
    if (down.length >= 2) {
      const [a, b] = down;
      const d = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
      a.pinched = b.pinched = true;
      if (!this.pinch) this.pinch = { d0: Math.max(d, 1), z0: this.cams.world.zoom };
      else this.setZoomLevel(this.pinch.z0 * d / this.pinch.d0);
    } else this.pinch = null;
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.033);
    const p = this.p;
    const k = this.keys, cu = this.cursors, w = this.wasd;
    const goL = k.left || cu.left.isDown || w.A.isDown;
    const goR = k.right || cu.right.isDown || w.D.isDown;
    const jump = k.jump || cu.up.isDown || cu.space.isDown || w.W.isDown;
    if (k.punch || this.keyF.isDown) this.punch(); // tahan = memukul berulang
    p.vx = (goR ? 220 : 0) - (goL ? 220 : 0);
    if (p.vx) this.facing = p.vx > 0 ? 1 : -1;
    if (jump && p.ground) p.vy = -620;
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
    if (this.bubble) this.bubble.setPosition(Math.round(this.sprite.x), Math.round(this.sprite.y - 32));

    // latar mengikuti kamera dunia (parallax)
    const wc = this.cams.world, z = wc.zoom;
    const mx = wc.midPoint.x, my = wc.midPoint.y;
    this.hills.y = (24 * T - my) * z + 225 - 200;
    this.hills.tilePositionX = (mx - 400) * 0.25;
    this.clouds.y = 10 - (my - 225) * 0.3;
    this.clouds.tilePositionX = (mx - 400) * 0.1 + time * 0.01;
  }
}

class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    this.add.text(400, 225, 'Memuat...', { fontSize: '20px', color: '#fff' }).setOrigin(0.5);
    preloadTextures(this); // PNG 32x32 kustom (kalau ada) dari folder textures
  }

  create() {
    makeTextures(this);
    this.scene.start('Menu');
  }
}

class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    makeTextures(this);
    this.add.image(0, 0, 'sky').setOrigin(0);
    this.clouds = this.add.tileSprite(0, 0, 800, 150, 'clouds').setOrigin(0);
    this.add.tileSprite(0, 250, 800, 200, 'hills').setOrigin(0);
    this.buildMenu();
  }

  update(time) { this.clouds.tilePositionX = time * 0.01; }

  buildMenu() {
    const save = loadSave();
    const el = (tag, css, text) => {
      const e = document.createElement(tag);
      if (css) e.style.cssText = css;
      if (text !== undefined) e.textContent = text;
      return e;
    };
    const btnCss = 'padding:10px 14px;font-size:16px;border:0;border-radius:8px;background:#2a6f8f;color:#fff;';
    const box = el('div', 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:900;font-family:sans-serif;');
    const card = el('div', 'background:rgba(20,58,74,.96);border:3px solid #7ec8e3;border-radius:14px;padding:18px;width:min(92vw,420px);max-height:88vh;overflow:auto;color:#fff;');
    card.append(el('h2', 'margin:0 0 12px;text-align:center;color:#ffd54a;', 'GrowGame'));

    const msg = el('div', 'color:#ff8a80;font-size:14px;min-height:18px;margin:6px 0;');
    const enter = (raw) => {
      const n = normalizeName(raw);
      if (!n) { msg.textContent = 'Nama world: huruf/angka saja, maksimal 16.'; return; }
      box.remove();
      this.scene.start('Game', { name: n });
    };

    const row = el('div', 'display:flex;gap:8px;');
    const input = el('input', 'flex:1;min-width:0;padding:10px 12px;font-size:16px;border:2px solid #fff;border-radius:8px;background:#0e2a36;color:#fff;text-transform:uppercase;outline:none;');
    input.maxLength = 16; input.placeholder = 'NAMA WORLD'; input.autocomplete = 'off';
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') enter(input.value); });
    const go = el('button', btnCss + 'background:#2e7d32;', 'Masuk');
    go.addEventListener('click', () => enter(input.value));
    row.append(input, go);
    card.append(row, msg, el('div', 'font-size:14px;color:#9fd3e6;margin:8px 0 6px;', 'World yang sudah ada:'));

    const list = el('div', 'display:flex;flex-direction:column;gap:6px;');
    const renderList = () => {
      list.textContent = '';
      const names = ['START', ...Object.keys(save.worlds).filter((n) => n !== 'START')];
      for (const n of names) {
        const w = save.worlds[n];
        const L = w && w.lock;
        const tag = !L || L.owner === null ? '' : L.owner === save.player.id ? '  🔒 milikmu' : `  🔒 ${L.ownerName}`;
        const b = el('button', btnCss + 'text-align:left;', n + tag);
        b.addEventListener('click', () => enter(n));
        list.append(b);
      }
    };
    renderList();
    card.append(list);

    const who = el('div', 'margin-top:14px;display:flex;justify-content:space-between;align-items:center;font-size:14px;color:#cfe;');
    const whoTxt = el('span', '', '');
    const upd = () => { whoTxt.textContent = 'Kamu: ' + playerName(save.player.id); };
    const swap = el('button', btnCss + 'font-size:13px;padding:6px 10px;', 'Ganti pemain (tes)');
    swap.addEventListener('click', () => {
      save.player.id = save.player.id === 'A' ? 'B' : 'A';
      persist(save); upd(); renderList();
    });
    upd();
    who.append(whoTxt, swap);
    card.append(who);

    box.append(card);
    document.body.appendChild(box);
    this.events.once('shutdown', () => box.remove());
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 450,
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, MenuScene, GameScene],
});
