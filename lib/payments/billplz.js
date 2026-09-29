import crypto from 'crypto'

// Adapter Billplz (FPX + kad). Gateway lain boleh ditambah dengan antara muka yang sama:
// createBill(invoice, client) -> { billId, url } dan verifyCallback(body) -> boolean.

const BASE = process.env.BILLPLZ_SANDBOX === 'true'
  ? 'https://www.billplz-sandbox.com/api/v3'
  : 'https://www.billplz.com/api/v3'

export const GATEWAY = 'billplz'

export async function createBill(invoice, client) {
  const appUrl = process.env.APP_URL
  const form = new URLSearchParams({
    collection_id: process.env.BILLPLZ_COLLECTION_ID,
    name: client.name,
    amount: String(Math.round((invoice.amount - invoice.amount_paid) * 100)), // sen
    description: `${invoice.invoice_no} (${invoice.type})`.slice(0, 200),
    callback_url: `${appUrl}/api/payments/billplz-webhook`,
    redirect_url: `${appUrl}/invoices/${invoice.id}`,
    reference_1_label: 'Invois',
    reference_1: invoice.invoice_no,
  })
  if (client.email) form.set('email', client.email)
  if (client.phone) form.set('mobile', client.phone)

  const res = await fetch(`${BASE}/bills`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${process.env.BILLPLZ_API_KEY}:`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message?.join?.(', ') || data?.error?.message || 'Billplz gagal cipta bill')
  return { billId: data.id, url: data.url }
}

// X-Signature: setiap pasangan "key"+"value" (kecuali x_signature), disusun menaik, dicantum dengan "|",
// kemudian HMAC-SHA256 menggunakan X Signature Key.
export function verifyCallback(body) {
  const key = process.env.BILLPLZ_X_SIGNATURE_KEY
  if (!key || !body?.x_signature) return false
  const source = Object.keys(body)
    .filter(k => k !== 'x_signature')
    .map(k => `${k}${body[k] ?? ''}`)
    .sort()
    .join('|')
  const expected = crypto.createHmac('sha256', key).update(source).digest('hex')
  const given = String(body.x_signature)
  return expected.length === given.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))
}
