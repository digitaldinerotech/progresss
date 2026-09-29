import { supabaseAdmin, getRequestUser } from '../../../../lib/supabaseAdmin'
import { GATEWAY, createPurchase } from '../../../../lib/payments/chip'

// Cipta (atau guna semula) pautan bayaran untuk invois. Boleh dipanggil oleh staf
// atau oleh client pemilik invois (dari portal client).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const user = await getRequestUser(req)
  if (!user) return res.status(401).json({ error: 'Sila log masuk' })

  const { data: invoice } = await supabaseAdmin
    .from('invoices').select('*, clients(name, email, phone)').eq('id', req.query.id).single()
  if (!invoice) return res.status(404).json({ error: 'Invois tidak dijumpai' })

  const isStaff = user.role !== 'client'
  if (!isStaff && invoice.client_id !== user.client_id) return res.status(403).json({ error: 'Tiada akses' })
  if (['paid', 'void'].includes(invoice.status)) return res.status(400).json({ error: `Invois ${invoice.status}` })
  if (invoice.payment_url && invoice.gateway === GATEWAY) return res.status(200).json({ url: invoice.payment_url })

  try {
    const { billId, url } = await createPurchase(invoice, invoice.clients)
    await supabaseAdmin.from('invoices').update({
      gateway: GATEWAY,
      gateway_bill_id: billId,
      payment_url: url,
      status: invoice.status === 'draft' ? 'issued' : invoice.status,
    }).eq('id', invoice.id)
    return res.status(200).json({ url })
  } catch (e) {
    return res.status(502).json({ error: e.message })
  }
}
