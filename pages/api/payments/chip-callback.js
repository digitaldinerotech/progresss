import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { GATEWAY, PAID_STATUSES, getPurchase, verifySignature } from '../../../lib/payments/chip'

// success_callback CHIP. Tandatangan dikira atas body mentah, jadi bodyParser dimatikan.
export const config = { api: { bodyParser: false } }

async function readRaw(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

// Idempotent: CHIP boleh hantar callback yang sama berulang kali; unique(gateway, gateway_ref).
// Trigger DB `payments_apply` mengemas kini invois, dan deposit penuh → job order 'confirmed'.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const raw = await readRaw(req)
  if (!(await verifySignature(raw, req.headers['x-signature']))) {
    return res.status(401).json({ error: 'Signature tidak sah' })
  }

  let id
  try {
    id = JSON.parse(raw.toString('utf8')).id
  } catch {
    return res.status(400).json({ error: 'Body tidak sah' })
  }

  // Sahkan status terus dari API CHIP, bukan dari payload
  const purchase = await getPurchase(id)
  if (!PAID_STATUSES.includes(purchase.status) || !purchase.payment) {
    return res.status(200).json({ ok: true, ignored: purchase.status })
  }

  const { data: invoice } = await supabaseAdmin
    .from('invoices').select('id').eq('gateway', GATEWAY).eq('gateway_bill_id', purchase.id).single()
  if (!invoice) return res.status(404).json({ error: 'Invois tidak dijumpai' })

  const { error } = await supabaseAdmin.from('payments').upsert({
    invoice_id: invoice.id,
    amount: purchase.payment.amount / 100,
    method: 'gateway',
    gateway: GATEWAY,
    gateway_ref: purchase.id,
    status: 'success',
    paid_at: new Date((purchase.payment.paid_on || Date.now() / 1000) * 1000).toISOString(),
    raw: purchase,
  }, { onConflict: 'gateway,gateway_ref', ignoreDuplicates: true })

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ ok: true })
}
