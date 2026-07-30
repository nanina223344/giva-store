---
trigger: always_on
---

# Giva Store — Design System

Referensi arah desain: palet sage green + krem hangat, tipografi serif elegan untuk heading, banyak whitespace, kartu produk dengan background netral lembut. Terang dan lapang — bukan dark mode.

## Palet Warna

| Nama | Hex | Dipakai untuk |
|---|---|---|
| `cream` | `#FAF8F3` | Background utama semua halaman |
| `sand` | `#F0ECE3` | Background kartu, sidebar, section alternatif |
| `sage` | `#8FA07E` | Aksen utama — tombol primary, badge, link aktif |
| `sage-deep` | `#6B7D5C` | Hover/active state dari elemen sage |
| `ink` | `#232019` | Teks utama, heading |
| `stone` | `#84807A` | Teks sekunder, placeholder, caption |
| `border` | `#E2DED3` | Garis pembatas (hairline), bukan shadow |

**Catatan penting**: ganti SEMUA elemen gelap yang sudah dibangun (sidebar admin yang sekarang dark navy, background hitam) ke token-token di atas. Gak ada elemen yang background-nya gelap di seluruh aplikasi — termasuk sidebar.

## Tipografi

- **Display** (heading/judul halaman saja): `Cormorant Garamond` — serif elegan, dipakai TERBATAS hanya untuk H1/H2 (contoh: judul halaman seperti "Kategori Produk")
- **Sans** (semua yang lain): `Inter` — body text, label form, isi tabel, tombol, navigasi

**Aturan pembagian**: di admin/kasir (UI yang padat data), serif HANYA di judul halaman — sisanya tetap Inter biar tabel dan form tetap mudah dibaca. Di storefront nanti (Fase 4), serif boleh lebih leluasa dipakai di headline marketing karena itu memang ranahnya konten editorial/lifestyle.

## Elemen Signature

**Sage pill** — badge/tag berbentuk pil dengan background `sage` opacity rendah dan teks `sage-deep`, sudut membulat penuh. Dipakai konsisten untuk: status badge (draft/received, aktif/nonaktif), tag kategori, dan indikator menu aktif di sidebar (ganti highlight ungu yang sekarang). Ini elemen yang dipakai berulang di seluruh aplikasi, jadi terasa sebagai identitas Giva Store, bukan style generic dashboard.

Hairline border (1px, warna `border`) dipakai untuk membatasi kartu/section — hindari box-shadow tebal, biar tetap terasa lapang dan bersih sesuai referensi.

## Responsive Behavior

Berlaku untuk SEMUA halaman (admin, kasir, storefront), bukan cuma sekali ditambahkan ke satu halaman.

**Breakpoint** (default Tailwind): mobile `<768px` (md), tablet `768px–1024px`, desktop `≥1024px` (lg+)

**Sidebar navigasi**

- Desktop (`lg+`): sidebar tetap terlihat penuh, seperti yang sudah dibangun
- Mobile & tablet (`<lg`): sidebar disembunyikan secara default. Ganti dengan header bar di atas berisi ikon hamburger + judul halaman. Tap hamburger membuka sidebar sebagai drawer/overlay yang menutupi konten, dengan tombol close atau tap di luar area drawer untuk menutup.

**Tabel data**

- Desktop (`lg+`): tetap tabel biasa
- Mobile (`<md`): tiap baris tabel diubah jadi **card terpisah** (stacked vertikal, label: value), bukan tabel horizontal yang harus di-scroll ke samping. Tombol aksi (Edit/Hapus) tetap mudah dijangkau di tiap card
- Tablet: boleh tetap tabel kalau kolom sedikit dan masih muat, atau ikut pola card kalau kolom terlalu banyak

**Form/Modal**

- Desktop: modal di tengah, ukuran tetap seperti sekarang
- Mobile: form tampil **full-screen** (bukan modal kecil di tengah) — supaya keyboard on-screen gak nutupin input yang sedang diisi

**Touch target**

- Semua elemen interaktif (tombol, link, item menu) minimal **44x44px** di breakpoint mobile/tablet — dirancang buat disentuh jari, bukan ukuran kecil yang asumsinya pakai mouse

## Responsive Behavior

Semua halaman admin/kasir wajib jalan baik di desktop maupun handphone — bukan cuma "muat di layar kecil", tapi interaksinya disesuaikan per ukuran:

**Breakpoint acuan** (default Tailwind, gak perlu custom): `sm` (640px), `md` (768px), `lg` (1024px)

**Sidebar navigasi**

- Desktop (`lg` ke atas): sidebar tetap terbuka di kiri, seperti sekarang
- Mobile/tablet (di bawah `lg`): sidebar disembunyikan secara default, diganti **hamburger icon** di pojok kiri atas yang membuka sidebar sebagai overlay/drawer dari kiri (geser masuk, ada backdrop gelap transparan di belakangnya, tap di luar area sidebar buat nutup)

**Tabel data (list kategori, supplier, produk, dll)**

- Desktop: tetap sebagai tabel biasa seperti sekarang
- Mobile (di bawah `md`): tabel diubah jadi **tampilan kartu** — satu kartu per baris data, label field ditampilkan di atas/samping value-nya (bukan tabel yang di-scroll horizontal, itu pengalaman buruk di HP)

**Form (Tambah/Edit)**

- Desktop: modal di tengah layar dengan lebar terbatas, seperti sekarang
- Mobile: form full-screen (menutupi seluruh viewport, bukan modal kecil di tengah) supaya keyboard HP gak menutupi input

**Tombol aksi utama** (misal "Tambah Kategori")

- Desktop: tombol normal di pojok kanan atas, seperti sekarang
- Mobile: pertimbangkan posisi **floating action button** (lingkaran/pill mengambang di kanan bawah) supaya tetap mudah dijangkau jempol tanpa harus scroll ke atas

**Aturan umum**: pakai utility responsive Tailwind (`hidden md:block`, `flex-col md:flex-row`, dst) langsung di tiap komponen — jangan bikin dua halaman terpisah untuk desktop dan mobile.

## Implementasi (Tailwind v4)

Ganti isi `src/style.css` jadi:

```css
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@400;500;600;700&display=swap');
@import "tailwindcss";

@theme {
  --color-cream: #FAF8F3;
  --color-sand: #F0ECE3;
  --color-sage: #8FA07E;
  --color-sage-deep: #6B7D5C;
  --color-ink: #232019;
  --color-stone: #84807A;
  --color-border: #E2DED3;

  --font-display: "Cormorant Garamond", serif;
  --font-sans: "Inter", system-ui, sans-serif;
}
```

Setelah ini di-apply, kelas Tailwind seperti `bg-cream`, `text-ink`, `bg-sage`, `font-display` otomatis tersedia dan harus dipakai di semua halaman ke depan (kategori, supplier, customer, produk, pembelian, kasir, storefront) — bukan warna Tailwind default (`purple-600`, `gray-900`, dst).
