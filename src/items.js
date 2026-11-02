// Daftar semua blok dan seed. Tambah blok baru cukup di sini (+ gambar di textures.js).
// grow = lama pohon tumbuh (detik, waktu nyata). Tanpa grow = tidak punya seed.
export const BLOCKS = {
  1: { name: 'Tanah', tex: 0, color: '#8b5a2b', grow: 30 },
  2: { name: 'Batu', tex: 1, color: '#808080', grow: 90 },
  3: { name: 'Rumput', tex: 2, color: '#4caf50', grow: 45, drop: 1 }, // dihancurkan -> dapat tanah
  4: { name: 'Dasar', tex: 3, color: '#333333', unbreakable: true },
  5: { name: 'Pasir', tex: 4, color: '#e3cf8e', grow: 60 },
};

export const SEED_BASE = 100;
export const seedId = (block) => SEED_BASE + block;
export const isSeed = (id) => id > SEED_BASE;
export const blockOf = (id) => (isSeed(id) ? id - SEED_BASE : id);
export const itemName = (id) => (isSeed(id) ? 'Seed ' : '') + BLOCKS[blockOf(id)].name;
export const growable = Object.keys(BLOCKS).map(Number).filter((b) => BLOCKS[b].grow);

export const SEED_DROP_CHANCE = 0.25;   // peluang dapat seed saat menghancurkan blok
export const HARVEST_SEED_CHANCE = 0.5; // peluang dapat seed saat panen pohon
