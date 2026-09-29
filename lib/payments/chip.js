import crypto from 'crypto'

// Adapter CHIP Collect (FPX, kad, e-wallet, DuitNow QR). https://docs.chip-in.asia
// Semua jumlah dalam API CHIP adalah dalam sen (integer).

const BASE = 'https://gate.chip-in.asia/api/v1'
export const GATEWAY = 'chip'
// Status yang bermaksud wang telah diterima (purchase boleh bergerak dari 'paid' ke 'cleared'/'settled')
export const PAID_STATUSES = ['paid', 'cleared', 'settled']

async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.CHIP_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`CHIP ${res.status}: ${JSON.stringify(data)}`)
  return data
}

export async function createPurchase(invoice, client) {
  if (!client.email) throw new Error('Emel client diperlukan untuk bayaran CHIP')
  const appUrl = process.env.APP_URL
  const data = await api('/purchases/', {
    method: 'POST',
    body: JSON.stringify({
      brand_id: process.env.CHIP_BRAND_ID,
      reference: invoice.invoice_no,
      client: { email: client.email, full_name: client.name, ...(client.phone && { phone: client.phone }) },
      purchase: {
        currency: 'MYR',
        products: [{
          name: `${invoice.invoice_no} (${invoice.type})`,
          price: Math.round((invoice.amount - invoice.amount_paid) * 100),
        }],
      },
      success_callback: `${appUrl}/api/payments/chip-callback`,
      success_redirect: `${appUrl}/invoices/${invoice.id}?paid=1`,
      failure_redirect: `${appUrl}/invoices/${invoice.id}?failed=1`,
    }),
  })
  return { billId: data.id, url: data.checkout_url }
}

export const getPurchase = id => api(`/purchases/${encodeURIComponent(id)}/`)

// Kunci awam syarikat untuk success_callback. Guna CHIP_PUBLIC_KEY jika ditetapkan,
// jika tidak ambil dari GET /public_key/ (respons ialah string PEM berformat JSON).
let cachedKey = null
async function publicKey() {
  if (process.env.CHIP_PUBLIC_KEY) return process.env.CHIP_PUBLIC_KEY.replace(/\\n/g, '\n')
  if (!cachedKey) cachedKey = await api('/public_key/')
  return cachedKey
}

// X-Signature: base64 RSA PKCS#1 v1.5 + SHA-256 ke atas bait mentah body.
export async function verifySignature(rawBody, signature) {
  if (!signature) return false
  try {
    return crypto.verify('RSA-SHA256', rawBody, await publicKey(), Buffer.from(signature, 'base64'))
  } catch {
    return false
  }
}
