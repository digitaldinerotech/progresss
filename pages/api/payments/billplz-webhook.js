import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { GATEWAY, verifyCallback } from '../../../lib/payments/billplz'

// Callback server-ke-server Billplz (application/x-www-form-urlencoded).
// Idempotent: unique(gateway, gateway_ref) di jadual payments. Trigger DB `payments_apply`
// mengemas kini invois, dan jika deposit dibayar penuh, job order bertukar ke 'confirmed'.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const body = req.body || {}
  if (!verifyCallback(body)) return res.status(401).json({ error: 'Signature tidak sah' })
  if (body.paid !== 'true') return res.status(200).json({ ok: true, ignored: 'unpaid' })

  const { data: invoice } = await supabaseAdmin
    .from('invoices').select('id').eq('gateway', GATEWAY).eq('gateway_bill_id', body.id).single()
  if (!invoice) return res.status(404).json({ error: 'Invois tidak dijumpai' })

  const { error } = await supabaseAdmin.from('payments').upsert({
    invoice_id: invoice.id,
    amount: Number(body.paid_amount) / 100,
    method: 'gateway',
    gateway: GATEWAY,
    gateway_ref: body.id,
    status: 'success',
    paid_at: body.paid_at ? new Date(body.paid_at).toISOString() : new Date().toISOString(),
    raw: body,
  }, { onConflict: 'gateway,gateway_ref', ignoreDuplicates: true })

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ ok: true })
}
