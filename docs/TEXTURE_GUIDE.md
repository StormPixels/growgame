# Panduan Tekstur GrowGame (32 x 32)

Semua tekstur item di game ini berukuran **32 x 32 piksel**, format **PNG**.
Folder tempatnya: `public/textures/`

Kalau sebuah PNG ada, game memakainya. Kalau belum ada, game memakai gambar bawaan.
Jadi kamu bisa mengganti satu per satu, tidak harus sekaligus.

## Aturan
- Ukuran **tepat 32x32**. Ukuran lain tetap dimuat tapi diperbesar/dikecilkan kasar (nearest), hasilnya jelek.
- Background **transparan** untuk seed, pohon, pemain, pintu, dan tinju. Blok sebaiknya **penuh** (tanpa lubang), kecuali kaca.
- Jangan pakai anti-aliasing atau blur. Pakai pensil 1 piksel.
- Nama file persis seperti tabel di bawah (huruf kecil).

## Daftar file
| Folder | File | Isi |
|---|---|---|
| `blocks/` | `dirt` `stone` `grass` `bedrock` `sand` `gravel` `wood` `glass` `brick` `world_lock` | Blok di dunia dan di ransel |
| `seeds/` | `dirt` `stone` `grass` `sand` `gravel` `wood` `glass` `brick` | Ikon seed (kantong) |
| `trees/` | `<nama>_0` sampai `<nama>_3` | Pohon 4 tahap per blok |
| `player/` | `body` | Badan karakter |
| `misc/` | `door` `fist` `crack_0` `crack_1` `crack_2` | Pintu world, sarung tinju, retakan blok |

Semua nama ditulis dengan `.png` di belakangnya, misalnya `public/textures/blocks/dirt.png`.

## Pohon (4 tahap)
- `_0` tunas, `_1` kecil, `_2` besar (belum matang), `_3` matang (berbuah).
- Pohon berdiri di atas blok, jadi **batang menyentuh tepi bawah** kanvas.
- Di tahap `_3`, warna buah sebaiknya sama dengan warna bloknya supaya mudah dikenali.

## Pemain
- Kaki menyentuh **tepi bawah** kanvas, badan di tengah. Area badan bawaan sekitar x 6-26, y 4-32.
- Hitbox di game 20 x 28, jadi gambar yang jauh di luar area itu akan terlihat "melayang" atau menembus blok.

## Retakan (`crack_0..2`)
Digambar di atas blok yang sedang dipukul. Transparan, hanya garis retak. Makin besar nomornya, makin parah.

## Pakaian (rencana)
Tiap pakaian nanti juga 32x32 dengan kanvas yang **sama persis** seperti `player/body.png`,
jadi bisa ditumpuk di atas badan. Rencana foldernya: `clothes/<bagian>/<nama>.png`
(misalnya `clothes/hat/topi_merah.png`). Gambar bagian pakaian saja, sisanya transparan.

## Blok baru
Tambah satu entri di `src/items.js` (nama, `file`, warna, dst.), lalu buat PNG-nya di `blocks/`,
`seeds/`, dan `trees/` dengan nama `file` yang sama.

## Mencoba hasilnya
- **APK** (Actions) dan hosting lewat http memuat PNG kustom.
- Membuka `web/index.html` langsung dari file (`file://`) **tidak** memuat PNG, karena browser memblokirnya.
  Di mode itu game selalu memakai gambar bawaan.

## Titik awal
Isi folder `public/textures/` saat ini adalah gambar bawaan yang diekspor, jadi kamu bisa membukanya di aplikasi
pixel art lalu mengeditnya. Tidak harus menggambar dari nol.
