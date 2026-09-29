<p align="center"><img src="public/brand/progresss-logo.svg" alt="Progresss" height="64"></p>

**Progresss** ialah sistem pengurusan kilang OEM produk kesihatan (minuman & pil) untuk kilang Dinero dan client-clientnya.
Sistem ini berasingan dari Basepoint.

- 📋 **Job order & progress pengeluaran**: setiap batch dijejak dari bahan dikeluarkan hingga lulus QC
- 🧪 **Stok bahan mentah ikut lot**: kuarantin/lulus, tarikh luput, FEFO dan paras reorder
- 💳 **Bayaran client melalui payment gateway**: kerja hanya bermula selepas deposit diterima (dikuatkuasakan di database)
- 👥 **Portal client**: setiap client hanya nampak data sendiri (Supabase RLS)

Butiran penuh: [SYSTEM_BLUEPRINT.md](SYSTEM_BLUEPRINT.md)

## Setup

1. Cipta projek Supabase baru (jangan guna projek Basepoint).
2. Jalankan `supabase/migrations/0001_init.sql` dalam SQL Editor.
3. `cp .env.example .env.local` dan isi nilai-nilainya.
4. `npm install && npm run dev`
5. Daftar pengguna pertama dalam Supabase Auth, kemudian tetapkan dia sebagai admin:
   ```sql
   update profiles set role = 'admin' where id = '<user-id>';
   ```
6. CHIP: ambil **Secret Key** dan **Brand ID** dari portal CHIP (Developers). Callback URL dihantar secara automatik dalam setiap purchase: `APP_URL/api/payments/chip-callback`. Guna test key semasa pembangunan (kad ujian `4444 3333 2222 1111`, CVC `123`).

## Stack
Next.js 14 (Pages router) · Tailwind CSS v4 · Supabase · CHIP · lucide-react

## Jenama
Logo di `public/brand/`: `progresss-logo.svg` (latar cerah), `progresss-logo-dark.svg` (latar gelap), `progresss-mark.svg` (ikon).
Warna: Navy `#0F2A44` · Amber `#F5A524`.
