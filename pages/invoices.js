import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { Plus, Link2, Copy, Banknote, Ban, ExternalLink } from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { getPayLink } from '../lib/api'
import { PageHeader, Button, Card, Table, Modal, Field, Badge, inputCls, Loading, ErrorBox, INVOICE_STATUS, rm, fmtDate, today } from '../components/ui'

const TYPE = { deposit: 'Deposit', balance: 'Baki', full: 'Penuh', other: 'Lain-lain' }
const METHOD = { bank_transfer: 'Pindahan bank', cash: 'Tunai', gateway: 'CHIP', other: 'Lain-lain' }

export default function Invoices() {
  const [rows, setRows] = useState(null)
  const [aging, setAging] = useState([])
  const [payments, setPayments] = useState([])
  const [clients, setClients] = useState([])
  const [jobs, setJobs] = useState([])
  const [filter, setFilter] = useState('open')
  const [modal, setModal] = useState(null) // { type: 'invoice'|'payment', data }
  const [busy, setBusy] = useState('')
  const [copied, setCopied] = useState('')
  const [error, setError] = useState('')

  const load = async () => {
    const [i, a, p] = await Promise.all([
      supabase.from('invoices').select('*, clients(name), job_orders(id, jo_no)').order('created_at', { ascending: false }).limit(500),
      supabase.from('v_receivables_aging').select('*').order('outstanding', { ascending: false }),
      supabase.from('payments').select('*, invoices(invoice_no, clients(name))').order('paid_at', { ascending: false }).limit(20),
    ])
    setRows(i.data || [])
    setAging(a.data || [])
    setPayments(p.data || [])
  }
  useEffect(() => {
    load()
    supabase.from('clients').select('id, name, credit_days').order('name').then(({ data }) => setClients(data || []))
    supabase.from('job_orders').select('id, jo_no, client_id').not('status', 'in', '(completed,cancelled)').order('jo_no', { ascending: false }).then(({ data }) => setJobs(data || []))
  }, [])

  const payLink = async inv => {
    setBusy(`pay-${inv.id}`)
    setError('')
    try {
      const url = await getPayLink(inv.id)
      await navigator.clipboard?.writeText(url).catch(() => {})
      setCopied(inv.id)
      load()
    } catch (e) {
      setError(e.message)
    }
    setBusy('')
  }

  const voidInvoice = async inv => {
    if (!confirm(`Batalkan invois ${inv.invoice_no}?`)) return
    const { error } = await supabase.from('invoices').update({ status: 'void' }).eq('id', inv.id)
    if (error) setError(error.message)
    load()
  }

  const save = async e => {
    e.preventDefault()
    setBusy('save')
    setError('')
    const { type, data } = modal
    const { error } = type === 'invoice'
      ? await supabase.from('invoices').insert({
        client_id: data.client_id, job_order_id: data.job_order_id || null, type: data.type,
        amount: data.amount, due_date: data.due_date || null, status: 'issued',
      })
      : await supabase.from('payments').insert({
        invoice_id: data.invoice.id, amount: data.amount, method: data.method,
        gateway: null, gateway_ref: data.reference || null, status: 'success',
        paid_at: new Date(data.paid_at).toISOString(),
      })
    setBusy('')
    if (error) return setError(error.message)
    setModal(null)
    load()
  }

  const set = k => e => setModal({ ...modal, data: { ...modal.data, [k]: e.target.value } })
  const shown = (rows || []).filter(r => filter === 'all' || (filter === 'open' ? ['issued', 'partially_paid'].includes(r.status) : r.status === filter))
  const totals = aging.reduce((t, a) => {
    for (const k of ['outstanding', 'not_due', 'd1_30', 'd31_60', 'd61_90', 'd90_plus']) t[k] = (t[k] || 0) + Number(a[k] || 0)
    return t
  }, {})

  return (
    <Layout>
      <Head><title>Invois & Bayaran · Progresss</title></Head>
      <PageHeader title="Invois & Bayaran" subtitle="Bayaran melalui CHIP direkod secara automatik">
        <select className={inputCls + ' w-40'} value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="open">Belum dijelaskan</option>
          <option value="paid">Dibayar</option>
          <option value="void">Batal</option>
          <option value="all">Semua</option>
        </select>
        <Button onClick={() => { setError(''); setModal({ type: 'invoice', data: { client_id: '', job_order_id: '', type: 'other', amount: '', due_date: today() } }) }}>
          <Plus size={16} /> Invois manual
        </Button>
      </PageHeader>

      <ErrorBox error={!modal && error} />

      {!rows ? <Loading /> : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[['Jumlah tertunggak', totals.outstanding], ['Belum tamat tempoh', totals.not_due], ['1–30 hari', totals.d1_30], ['31–60 hari', totals.d31_60], ['61–90 hari', totals.d61_90], ['> 90 hari', totals.d90_plus]].map(([k, v], i) => (
              <div key={k} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs text-slate-500">{k}</div>
                <div className={`font-semibold ${i >= 4 && v > 0 ? 'text-red-600' : 'text-brand'}`}>{rm(v)}</div>
              </div>
            ))}
          </div>

          <Card>
            <Table head={['Invois', 'Client', 'Job order', 'Jenis', { label: 'Jumlah', right: true }, { label: 'Dibayar', right: true }, 'Tempoh', 'Status', '']}
              empty={shown.length === 0 && 'Tiada invois'}>
              {shown.map(i => {
                const open = ['issued', 'partially_paid'].includes(i.status)
                const overdue = open && i.due_date && i.due_date < today()
                return (
                  <tr key={i.id}>
                    <td className="px-4 py-2 font-mono">{i.invoice_no}</td>
                    <td className="px-4 py-2">{i.clients?.name}</td>
                    <td className="px-4 py-2 font-mono">{i.job_orders ? <Link href={`/job-orders/${i.job_orders.id}`} className="text-brand hover:underline">{i.job_orders.jo_no}</Link> : '—'}</td>
                    <td className="px-4 py-2">{TYPE[i.type]}</td>
                    <td className="px-4 py-2 text-right">{rm(i.amount)}</td>
                    <td className="px-4 py-2 text-right">{rm(i.amount_paid)}</td>
                    <td className={`px-4 py-2 whitespace-nowrap ${overdue ? 'font-medium text-red-600' : ''}`}>{fmtDate(i.due_date)}</td>
                    <td className="px-4 py-2"><Badge map={INVOICE_STATUS} value={i.status} /></td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {open && (
                        <>
                          <Button variant="ghost" title="Salin pautan bayaran CHIP" loading={busy === `pay-${i.id}`} onClick={() => payLink(i)}>
                            {copied === i.id ? <Copy size={14} className="text-green-600" /> : <Link2 size={14} />}
                          </Button>
                          {i.payment_url && <a href={i.payment_url} target="_blank" rel="noreferrer" className="inline-flex p-2 text-slate-500 hover:text-brand" title="Buka halaman bayaran"><ExternalLink size={14} /></a>}
                          <Button variant="ghost" title="Rekod bayaran manual" onClick={() => { setError(''); setModal({ type: 'payment', data: { invoice: i, amount: (i.amount - i.amount_paid).toFixed(2), method: 'bank_transfer', paid_at: today(), reference: '' } }) }}>
                            <Banknote size={14} />
                          </Button>
                          {Number(i.amount_paid) === 0 && <Button variant="ghost" title="Batalkan invois" onClick={() => voidInvoice(i)}><Ban size={14} className="text-red-500" /></Button>}
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </Table>
          </Card>
          {copied && <p className="-mt-4 text-xs text-green-700">Pautan bayaran telah disalin. Hantar kepada client melalui WhatsApp atau emel.</p>}

          <Card title="Bayaran terkini">
            <Table head={['Tarikh', 'Invois', 'Client', 'Kaedah', 'Rujukan', { label: 'Jumlah', right: true }]} empty={payments.length === 0 && 'Belum ada bayaran'}>
              {payments.map(p => (
                <tr key={p.id}>
                  <td className="px-4 py-2">{fmtDate(p.paid_at)}</td>
                  <td className="px-4 py-2 font-mono">{p.invoices?.invoice_no}</td>
                  <td className="px-4 py-2">{p.invoices?.clients?.name}</td>
                  <td className="px-4 py-2">{METHOD[p.method]}</td>
                  <td className="px-4 py-2 font-mono text-xs">{p.gateway_ref || '—'}</td>
                  <td className="px-4 py-2 text-right">{rm(p.amount)}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.type === 'invoice' ? 'Invois manual' : `Rekod bayaran: ${modal?.data.invoice?.invoice_no || ''}`}>
        {modal && (
          <form onSubmit={save} className="space-y-3">
            <ErrorBox error={error} />
            {modal.type === 'invoice' ? (
              <>
                <p className="text-xs text-slate-500">Invois deposit dan baki untuk job order dicipta dari halaman job order. Gunakan borang ini untuk caj lain (contoh: sampel, R&D formula).</p>
                <Field label="Client *">
                  <select className={inputCls} value={modal.data.client_id} onChange={set('client_id')} required>
                    <option value="">— Pilih client —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label="Job order (pilihan)">
                  <select className={inputCls} value={modal.data.job_order_id} onChange={set('job_order_id')}>
                    <option value="">—</option>
                    {jobs.filter(j => j.client_id === modal.data.client_id).map(j => <option key={j.id} value={j.id}>{j.jo_no}</option>)}
                  </select>
                </Field>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Jenis">
                    <select className={inputCls} value={modal.data.type} onChange={set('type')}>
                      {Object.entries(TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label="Jumlah (RM) *"><input type="number" min="0.01" step="0.01" className={inputCls} value={modal.data.amount} onChange={set('amount')} required /></Field>
                  <Field label="Tarikh akhir bayar"><input type="date" className={inputCls} value={modal.data.due_date} onChange={set('due_date')} /></Field>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-500">
                  {modal.data.invoice.clients?.name} · baki {rm(modal.data.invoice.amount - modal.data.invoice.amount_paid)}. Bayaran CHIP direkod secara automatik; borang ini untuk pindahan bank atau tunai.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Jumlah (RM) *"><input type="number" min="0.01" step="0.01" className={inputCls} value={modal.data.amount} onChange={set('amount')} required /></Field>
                  <Field label="Tarikh bayar *"><input type="date" className={inputCls} value={modal.data.paid_at} onChange={set('paid_at')} required /></Field>
                  <Field label="Kaedah">
                    <select className={inputCls} value={modal.data.method} onChange={set('method')}>
                      <option value="bank_transfer">Pindahan bank</option>
                      <option value="cash">Tunai</option>
                      <option value="other">Lain-lain</option>
                    </select>
                  </Field>
                  <Field label="No. rujukan"><input className={inputCls} value={modal.data.reference} onChange={set('reference')} /></Field>
                </div>
                {modal.data.invoice.type === 'deposit' && <p className="rounded-lg bg-blue-50 p-2 text-xs text-blue-800">Bila deposit dibayar penuh, job order akan disahkan secara automatik.</p>}
              </>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setModal(null)}>Batal</Button>
              <Button loading={busy === 'save'}>Simpan</Button>
            </div>
          </form>
        )}
      </Modal>
    </Layout>
  )
}
