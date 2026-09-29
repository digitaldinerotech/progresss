# Progresss — System Blueprint

**Progresss** ialah sistem pengurusan kilang untuk perniagaan kilang Dinero (OEM produk kesihatan: **minuman** dan **pil**).
Sistem ini **berasingan sepenuhnya dari Basepoint**: repo sendiri, projek Supabase sendiri, dan pengguna sendiri.

Dokumen ini ialah "source of truth" untuk sistem. Jika perlu bina semula, berikan dokumen ini bersama `supabase/migrations/` kepada AI assistant.

---

## 1. Latar belakang perniagaan

| Perkara | Keputusan |
|---|---|
| Produk | Produk kesihatan: minuman (cecair / serbuk) dan pil (tablet / kapsul) |
| Model | **Make-to-order** sahaja. Kilang hanya keluarkan produk bila ada order client. |
| Client | Beberapa client luar. **Dinero ialah salah satu client** dan dilayan sama seperti client lain (`clients.is_internal = true`). |
| Bayaran | Melalui payment gateway. **Kerja hanya bermula selepas deposit diterima.** |

## 2. Tech stack (selari dengan Basepoint)

- **Next.js 14** (Pages router), **Tailwind CSS v4**, **lucide-react**, **recharts**
- **Supabase**: Postgres, Auth, Storage (COA, dokumen batch), Row Level Security
- **Payment gateway**: **CHIP** (CHIP Collect: FPX, kad, e-wallet, DuitNow QR). Kodnya ditulis dalam bentuk adapter di `lib/payments/chip.js`.
- Hosting: Vercel (sama seperti Basepoint)

## 3. Aliran utama

```
Client buat order ──► Job Order (draft)
                          │ harga & tarikh disahkan
                          ▼
                  awaiting_deposit ──► Invois deposit + pautan bayaran (CHIP)
                          │ webhook gateway: bayaran berjaya
                          ▼  (trigger DB: auto)
                      confirmed ──► semak kecukupan bahan (BOM × kuantiti)
                          ▼
                      scheduled ──► Batch dirancang pada line & tarikh
                          ▼
                   in_production ──► peringkat batch (lihat §5)
                          ▼
                         qc ──► lulus QC, batch "released"
                          ▼
                        ready ──► Invois baki + pautan bayaran
                          │ baki dibayar (atau ikut terma kredit client)
                          ▼
                      delivered ──► Delivery Order
                          ▼
                      completed
```

**Peraturan kritikal ("deposit gate")**: batch **tidak boleh** keluarkan bahan (`material_issued`) selagi Job Order belum `confirmed`. Peraturan ini dikuatkuasakan oleh trigger di database, bukan di UI sahaja.

## 4. Modul

### Fasa 1 (MVP)
1. **Client**: profil syarikat, No. SSM, TIN (untuk e-Invois), % deposit, terma kredit (hari).
2. **Produk & Formula (BOM)**: produk milik client, bentuk (tablet/kapsul/minuman cecair/serbuk), No. pendaftaran NPRA (MAL) atau kelulusan KKM, sijil Halal, jangka hayat, dan formula (bahan per unit + % pembaziran).
3. **Job Order**: kuantiti, harga, tarikh dijanji, status, dan jumlah deposit.
4. **Progress pengeluaran**: batch, peringkat, kuantiti baik dan reject. Supervisor kemas kini guna telefon atau tablet.
5. **Stok bahan mentah**: ikut **lot**, dengan status kuarantin → lulus → ditolak/luput. Tarikh luput dijejak dan stok dikeluarkan ikut **FEFO** (first-expiry-first-out). Paras reorder ditetapkan per bahan.
6. **Invois & Bayaran**: invois deposit/baki, pautan bayaran gateway, dan webhook auto-rekod bayaran. Ada juga aging.
7. **Dashboard**: order aktif, batch mengikut peringkat, bahan bawah paras reorder, dan jumlah tertunggak.

### Fasa 2
8. **Jadual & kapasiti**: Gantt setiap line (line pil dan line minuman berasingan), dengan amaran order berisiko lewat.
9. **Supplier & Purchase Order**: PO bahan. Bila GRN diterima, lot baru auto-dicipta dalam status kuarantin.
10. **QC**: ujian bahan masuk (release lot), in-process (berat tablet, kekerasan, pH/Brix minuman), dan ujian akhir. COA untuk setiap batch.
11. **Portal client**: client log masuk dan hanya nampak order, progress batch, invois dan COA mereka sendiri (RLS).
12. **Delivery Order**: penghantaran penuh atau separa.
13. **Notifikasi**: WhatsApp/Telegram bila deposit diterima, batch siap, stok rendah, atau invois tertunggak.

### Fasa 3
14. **e-Invois LHDN (MyInvois)**: hantar invois dan simpan UUID/status.
15. **Costing & margin**: kos bahan (ikut harga lot sebenar), buruh dan overhead untuk setiap batch, berbanding harga jual.
16. **Integrasi Basepoint**: bila order Dinero dihantar, stok barang siap Basepoint auto "Stock In" (menggantikan kemasukan manual di `pages/factory.js` Basepoint).
17. **Batch Manufacturing Record (BMR) digital**: rekod GMP penuh untuk audit NPRA.

## 5. Peringkat batch

| Peringkat | Pil (tablet/kapsul) | Minuman |
|---|---|---|
| `planned` | Dirancang | Dirancang |
| `material_issued` | Bahan dikeluarkan dari stor (stok ditolak, lot direkod) | sama |
| `processing` | Timbang, campur, granulasi | Timbang, campur, larut |
| `forming` | Mampat tablet / isi kapsul | Isi botol / sachet, pasteurisasi |
| `packing` | Blister / botol, label | Label, kotak |
| `qc` | Ujian akhir | Ujian akhir |
| `released` | Lulus, sedia hantar | sama |
| `rejected` | Gagal QC | sama |

Setiap perubahan peringkat direkod dalam `batch_stage_logs` (siapa, bila, kuantiti, catatan). Rekod ini menjadi asas BMR.

## 6. Kebolehkesanan (traceability)

`batch_materials` merekod **lot bahan mana** digunakan oleh **batch mana**. Daripada rekod ini boleh dijawab:
- "Lot bahan X yang bermasalah digunakan dalam batch apa, dan untuk client siapa?" (recall)
- "Batch Y menggunakan bahan dari supplier mana?"

Stok ditolak secara automatik (trigger) bila baris `batch_materials` dimasukkan. Lot yang belum `released` atau yang sudah luput akan ditolak.

## 7. Payment gateway

- `POST /api/invoices/[id]/pay-link`: cipta *purchase* CHIP (`POST /purchases/`) untuk baki invois, dan simpan `checkout_url` sebagai `payment_url`. Emel client wajib (keperluan CHIP).
- `POST /api/payments/chip-callback`: `success_callback` CHIP.
  1. Header `X-Signature` disahkan (RSA PKCS#1 v1.5 + SHA-256 atas body mentah, guna kunci awam dari `GET /public_key/`).
  2. Status purchase **disahkan semula** melalui `GET /purchases/{id}/` (`paid` / `cleared` / `settled`).
  3. Baris `payments` dimasukkan secara **idempotent** (`unique(gateway, gateway_ref)`), kerana CHIP boleh menghantar callback yang sama berulang kali.
- Trigger `payments_apply` akan kemas kini `invoices.amount_paid` dan status invois. Jika invois **deposit** sudah dibayar penuh, `job_orders.status` bertukar ke `confirmed` secara automatik.
- Bayaran manual (pindahan bank / tunai) boleh direkod oleh kewangan melalui jadual yang sama (`method = 'bank_transfer'`).

Env yang diperlukan: `CHIP_SECRET_KEY`, `CHIP_BRAND_ID`, `CHIP_PUBLIC_KEY` (pilihan), `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`.

## 8. Peranan pengguna

| Peranan | Akses |
|---|---|
| `admin` | Semua |
| `planner` | Client, produk, BOM, job order, jadual |
| `supervisor` | Kemas kini peringkat batch |
| `store` | Stok, lot, GRN, keluarkan bahan |
| `qc` | QC, release lot/batch |
| `finance` | Invois, bayaran |
| `client` | Portal: data syarikat sendiri sahaja (baca) |

Semua staf boleh membaca semua data operasi. Kawalan tulis mengikut peranan dikuatkuasakan di API/UI pada Fasa 1, dan diperketat ke RLS setiap jadual pada Fasa 2.

## 9. Skema database

Lihat `supabase/migrations/0001_init.sql`. Ringkasan:

- `profiles`, `clients`, `suppliers`
- `products`, `raw_materials`, `bom_items`
- `raw_material_lots`, `stock_movements`
- `production_lines`, `job_orders`, `production_batches`, `batch_stage_logs`, `batch_materials`, `qc_checks`
- `invoices`, `payments`
- `deliveries` (Delivery Order, `0002_deliveries.sql`): tidak boleh hantar melebihi kuantiti lulus QC; bila semua sudah dihantar, job order → `delivered`
- Views: `v_raw_material_stock`, `v_job_order_progress`, `v_receivables_aging`

## 10. Pematuhan (produk kesihatan)

- **Pil (suplemen)**: pendaftaran produk NPRA (No. MAL), dan kilang perlu **lesen pengilang + GMP**. Rekod batch perlu disimpan.
- **Minuman**: di bawah Akta/Peraturan Makanan (KKM). Pensijilan yang disyorkan: **MeSTI / HACCP / GMP makanan**.
- **Halal JAKIM**: simpan status halal bagi setiap bahan dan produk.
- Label: tarikh pengilangan, tarikh luput dan no. batch auto dari sistem.
