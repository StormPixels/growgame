// ===== Konstanta =====
const TILE = 32;
const WORLD_W = 100;
const WORLD_H = 60;
const GROUND_Y = 30; // baris pertama tanah
const KEY_WORLD = "growgame_world_";
const KEY_INDEX = "growgame_worlds";
const KEY_INV = "growgame_inv";
const REACH = 4; // jangkauan pukul/pasang (dalam tile)

const B = { AIR: 0, DIRT: 1, BEDROCK: 2, ROCK: 3, DOOR: 4 };
const INFO = {
  1: { color: 0x8b5a2b, hp: 3, name: "Tanah" },
  2: { color: 0x2f3142, hp: Infinity, name: "Bedrock" },
  3: { color: 0x7d8590, hp: 6, name: "Batu" },
  4: { color: 0xffd23f, hp: Infinity, name: "Pintu" },
};
const SOLID = new Set([B.DIRT, B.BEDROCK, B.ROCK]);

// ===== Penyimpanan (aman jika localStorage gagal) =====
function load(key) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch (e) { return null; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* abaikan */ }
}

// ===== World =====
function normalizeName(raw) {
  const name = (raw || "").toUpperCase().trim();
  return /^[A-Z0-9]{1,24}$/.test(name) ? name : null;
}

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function noise(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function generateWorld(name) {
  const seed = hashString(name) % 1000;
  const tiles = new Array(WORLD_W * WORLD_H).fill(B.AIR);
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      let id = B.AIR;
      if (x === 0 || x === WORLD_W - 1 || y === WORLD_H - 1) id = B.BEDROCK;
      else if (y >= GROUND_Y) {
        id = y >= 40 && noise(x + seed, y) < 0.35 ? B.ROCK : B.DIRT;
      }
      tiles[y * WORLD_W + x] = id;
    }
  }
  const doorX = 50;
  tiles[(GROUND_Y - 1) * WORLD_W + doorX] = B.DOOR;
  return { name, width: WORLD_W, height: WORLD_H, tiles, doorX, createdAt: Date.now() };
}

function rememberWorld(name) {
  const list = load(KEY_INDEX) || [];
  const next = [name, ...list.filter((n) => n !== name)].slice(0, 12);
  save(KEY_INDEX, next);
}

function enterWorld(rawName) {
  const name = normalizeName(rawName);
  if (!name) return null;
  let world = load(KEY_WORLD + name);
  if (!world || !Array.isArray(world.tiles) || world.tiles.length !== WORLD_W * WORLD_H) {
    world = generateWorld(name);
    save(KEY_WORLD + name, world);
  }
  rememberWorld(name);
  return world;
}

// ===== Scene Phaser =====
class MainScene extends Phaser.Scene {
  constructor() { super("main"); }

  create() {
    this.gfx = this.add.graphics();
    this.world = null;
    this.dmg = {};
    this.dmgTime = {};
    this.lastHeal = 0;
    this.lastSave = 0;
    this.inv = Object.assign({ 1: 20, 3: 0 }, load(KEY_INV) || {});
    this.mode = "hit"; // "hit" atau "place"
    this.sel = B.DIRT;
    this.touch = { left: false, right: false, jump: false };
    this.player = { x: 0, y: 0, vx: 0, vy: 0, w: 24, h: 48, ground: false };
    this.camTarget = { x: 0, y: 0 };

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys("A,D,W,SPACE");
    this.input.addPointer(2);
    this.input.on("pointerdown", (p) => this.onTap(p));
    this.cameras.main.setBackgroundColor(0x8fd3f4);

    this.updateHud();
  }

  startWorld(world) {
    this.world = world;
    this.dmg = {};
    this.dmgTime = {};
    const p = this.player;
    p.x = world.doorX * TILE + (TILE - p.w) / 2;
    p.y = GROUND_Y * TILE - p.h;
    p.vx = 0; p.vy = 0;
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W * TILE, WORLD_H * TILE);
    cam.startFollow(this.camTarget, true, 0.15, 0.15);
    this.camTarget.x = p.x; this.camTarget.y = p.y;
    this.updateHud();
  }

  leaveWorld() {
    this.saveNow();
    this.world = null;
    this.cameras.main.stopFollow();
  }

  saveNow() {
    if (!this.world) return;
    save(KEY_WORLD + this.world.name, this.world);
    save(KEY_INV, this.inv);
  }

  tileAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return B.BEDROCK;
    return this.world.tiles[ty * WORLD_W + tx];
  }

  setTile(tx, ty, id) {
    this.world.tiles[ty * WORLD_W + tx] = id;
  }

  solidAt(tx, ty) { return SOLID.has(this.tileAt(tx, ty)); }

  onTap(pointer) {
    if (!this.world) return;
    const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tx = Math.floor(wp.x / TILE);
    const ty = Math.floor(wp.y / TILE);
    const p = this.player;
    const dx = tx - Math.floor((p.x + p.w / 2) / TILE);
    const dy = ty - Math.floor((p.y + p.h / 2) / TILE);
    if (Math.hypot(dx, dy) > REACH) return;
    if (this.mode === "hit") this.hitTile(tx, ty);
    else this.placeTile(tx, ty);
  }

  hitTile(tx, ty) {
    const id = this.tileAt(tx, ty);
    const info = INFO[id];
    if (!info || info.hp === Infinity) return;
    const idx = ty * WORLD_W + tx;
    this.dmg[idx] = (this.dmg[idx] || 0) + 1;
    this.dmgTime[idx] = this.time.now;
    if (this.dmg[idx] >= info.hp) {
      this.setTile(tx, ty, B.AIR);
      delete this.dmg[idx];
      delete this.dmgTime[idx];
      this.inv[id] = (this.inv[id] || 0) + 1;
      this.updateHud();
      this.saveNow();
    }
  }

  placeTile(tx, ty) {
    if (this.tileAt(tx, ty) !== B.AIR) return;
    if ((this.inv[this.sel] || 0) <= 0) return;
    const p = this.player;
    const overlap =
      p.x < (tx + 1) * TILE && p.x + p.w > tx * TILE &&
      p.y < (ty + 1) * TILE && p.y + p.h > ty * TILE;
    if (overlap) return;
    this.setTile(tx, ty, this.sel);
    this.inv[this.sel] -= 1;
    this.updateHud();
    this.saveNow();
  }

  updateHud() {
    const d = document.getElementById("selDirt");
    const r = document.getElementById("selRock");
    const m = document.getElementById("modeBtn");
    if (!d) return;
    d.textContent = "Tanah " + (this.inv[1] || 0);
    r.textContent = "Batu " + (this.inv[3] || 0);
    d.classList.toggle("on", this.sel === B.DIRT);
    r.classList.toggle("on", this.sel === B.ROCK);
    m.textContent = this.mode === "hit" ? "Pukul" : "Pasang";
    m.classList.toggle("on", this.mode === "place");
  }

  update(time, delta) {
    if (!this.world) { this.gfx.clear(); return; }
    const dt = Math.min(delta, 50) / 1000;
    const p = this.player;

    // Input
    const left = this.cursors.left.isDown || this.keys.A.isDown || this.touch.left;
    const right = this.cursors.right.isDown || this.keys.D.isDown || this.touch.right;
    const jump = this.cursors.up.isDown || this.keys.W.isDown || this.keys.SPACE.isDown || this.touch.jump;
    p.vx = ((right ? 1 : 0) - (left ? 1 : 0)) * 180;
    if (jump && p.ground) { p.vy = -450; p.ground = false; }
    p.vy = Math.min(p.vy + 1100 * dt, 800);

    // Gerak sumbu X
    let nx = p.x + p.vx * dt;
    const y0 = Math.floor(p.y / TILE), y1 = Math.floor((p.y + p.h - 0.01) / TILE);
    const x0 = Math.floor(nx / TILE), x1 = Math.floor((nx + p.w - 0.01) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.solidAt(tx, ty)) {
          nx = p.vx > 0 ? tx * TILE - p.w : (tx + 1) * TILE;
          p.vx = 0;
        }
      }
    }
    p.x = nx;

    // Gerak sumbu Y
    let ny = p.y + p.vy * dt;
    p.ground = false;
    const ax0 = Math.floor(p.x / TILE), ax1 = Math.floor((p.x + p.w - 0.01) / TILE);
    const ay0 = Math.floor(ny / TILE), ay1 = Math.floor((ny + p.h - 0.01) / TILE);
    for (let ty = ay0; ty <= ay1; ty++) {
      for (let tx = ax0; tx <= ax1; tx++) {
        if (this.solidAt(tx, ty)) {
          if (p.vy > 0) { ny = ty * TILE - p.h; p.ground = true; }
          else ny = (ty + 1) * TILE;
          p.vy = 0;
        }
      }
    }
    p.y = ny;

    this.camTarget.x = p.x + p.w / 2;
    this.camTarget.y = p.y + p.h / 2;

    // Luka pada blok pulih jika tidak dipukul 5 detik
    if (time - this.lastHeal > 1000) {
      this.lastHeal = time;
      for (const k of Object.keys(this.dmgTime)) {
        if (time - this.dmgTime[k] > 5000) { delete this.dmg[k]; delete this.dmgTime[k]; }
      }
    }
    // Simpan otomatis tiap 5 detik
    if (time - this.lastSave > 5000) { this.lastSave = time; this.saveNow(); }

    this.draw();
  }

  draw() {
    const g = this.gfx;
    g.clear();
    const view = this.cameras.main.worldView;
    const x0 = Math.max(0, Math.floor(view.x / TILE));
    const x1 = Math.min(WORLD_W - 1, Math.floor(view.right / TILE));
    const y0 = Math.max(0, Math.floor(view.y / TILE));
    const y1 = Math.min(WORLD_H - 1, Math.floor(view.bottom / TILE));

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const id = this.world.tiles[ty * WORLD_W + tx];
        if (id === B.AIR) continue;
        const info = INFO[id];
        g.fillStyle(info.color, 1);
        g.fillRect(tx * TILE, ty * TILE, TILE, TILE);
        // rumput di atas tanah
        if (id === B.DIRT && this.tileAt(tx, ty - 1) === B.AIR) {
          g.fillStyle(0x5bbf4a, 1);
          g.fillRect(tx * TILE, ty * TILE, TILE, 8);
        }
        // garis tepi halus
        g.lineStyle(1, 0x000000, 0.18);
        g.strokeRect(tx * TILE + 0.5, ty * TILE + 0.5, TILE - 1, TILE - 1);
        // retakan
        const hits = this.dmg[ty * WORLD_W + tx];
        if (hits) {
          g.fillStyle(0x000000, Math.min(0.55, (hits / info.hp) * 0.55));
          g.fillRect(tx * TILE, ty * TILE, TILE, TILE);
        }
      }
    }

    // Pemain
    const p = this.player;
    g.fillStyle(0x2b2d42, 1);
    g.fillRect(p.x, p.y, p.w, p.h);
    g.fillStyle(0xffd2a8, 1);
    g.fillRect(p.x + 2, p.y + 2, p.w - 4, 18);
    g.fillStyle(0x2b2d42, 1);
    g.fillRect(p.x + 6, p.y + 8, 4, 4);
    g.fillRect(p.x + p.w - 10, p.y + 8, 4, 4);
  }
}

// ===== Inisialisasi game =====
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#8fd3f4",
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  scene: MainScene,
});

function scene() { return game.scene.getScene("main"); }

// ===== UI: lobby =====
const $ = (id) => document.getElementById(id);
const lobby = $("lobby"), hud = $("hud"), input = $("worldName");

function renderRecent() {
  const list = load(KEY_INDEX) || [];
  const box = $("recent");
  box.innerHTML = "";
  $("recentTitle").classList.toggle("hidden", list.length === 0);
  list.forEach((name) => {
    const b = document.createElement("button");
    b.textContent = name;
    b.addEventListener("click", () => join(name));
    box.appendChild(b);
  });
}

function join(raw) {
  const world = enterWorld(raw);
  if (!world) {
    $("error").textContent = "Nama hanya boleh huruf A-Z dan angka 0-9, maksimal 24 karakter.";
    return;
  }
  $("error").textContent = "";
  $("worldLabel").textContent = world.name;
  lobby.classList.add("hidden");
  hud.classList.remove("hidden");
  const s = scene();
  if (s && s.sys.isActive()) s.startWorld(world);
  else game.events.once("ready", () => scene().startWorld(world));
}

function exitToLobby() {
  scene().leaveWorld();
  hud.classList.add("hidden");
  lobby.classList.remove("hidden");
  input.value = "";
  renderRecent();
}

input.addEventListener("input", () => {
  input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
});
input.addEventListener("keydown", (e) => { if (e.key === "Enter") join(input.value); });
$("enterBtn").addEventListener("click", () => join(input.value));
$("exitBtn").addEventListener("click", exitToLobby);

// ===== UI: HUD =====
$("modeBtn").addEventListener("click", () => {
  const s = scene();
  s.mode = s.mode === "hit" ? "place" : "hit";
  s.updateHud();
});
$("selDirt").addEventListener("click", () => { const s = scene(); s.sel = B.DIRT; s.mode = "place"; s.updateHud(); });
$("selRock").addEventListener("click", () => { const s = scene(); s.sel = B.ROCK; s.mode = "place"; s.updateHud(); });

// Tombol gerak sentuh
document.querySelectorAll(".pad button").forEach((btn) => {
  const k = btn.dataset.k;
  const set = (v) => (e) => {
    e.preventDefault();
    const s = scene();
    if (s && s.touch) s.touch[k] = v;
    btn.classList.toggle("down", v);
  };
  btn.addEventListener("pointerdown", set(true));
  ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => btn.addEventListener(ev, set(false)));
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
});

// Simpan saat aplikasi ditutup / pindah tab
window.addEventListener("pagehide", () => { const s = scene(); if (s) s.saveNow(); });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { const s = scene(); if (s) s.saveNow(); }
});

renderRecent();
