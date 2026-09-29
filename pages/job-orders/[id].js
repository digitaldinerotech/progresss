import { useCallback, useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { ArrowLeft, Plus, Send, Link2, Copy, CheckCircle2, AlertTriangle, XCircle, Truck } from 'lucide-react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { getPayLink } from '../../lib/api'
import { materialRequirements, materialCheck } from '../../lib/production'
import {
  Button, Card, Table, Modal, Field, Badge, inputCls, Loading, ErrorBox,
  JOB_STATUS, BATCH_STAGE, INVOICE_STATUS, PRODUCT_FORM, rm, num, fmtDate, today,
} from '../../components/ui'

const addDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10)

export default function JobOrderDetail() {
  const { query: { id } } = useRouter()
  const [jo, setJo] = useState(null)
  const [batches, setBatches] = useState([])
  const [invoices, setInvoices] = useState([])
  const [bom, setBom] = useState([])
  const [stock, setStock] = useState([])
  const [lines, setLines] = useState([])
  const [batchForm, setBatchForm] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')

  const load = useCallback(async () => {
    if (!id) return
    const { data: j } = await supabase.from('job_orders')
      .select('*, clients(name, email, deposit_percent, credit_days), products(code, name, form, pack_unit, pack_size)')
      .eq('id', id).single()
    const [b, i, bm, s, l] = await Promise.all([
      supabase.from('production_batches').select('*, production_lines(name)').eq('job_order_id', id).order('created_at'),
      supabase.from('invoices').select('*').eq('job_order_id', id).order('created_at'),
      supabase.from('bom_items').select('*, raw_materials(name, uom)').eq('product_id', j?.product_id),
      supabase.from('v_raw_material_stock').select('id, available_qty'),
      supabase.from('production_lines').select('*').eq('active', true).order('name'),
    ])
    setJo(j)
    setBatches(b.data || [])
    setInvoices(i.data || [])
    setBom(bm.data || [])
    setStock(s.data || [])
    setLines(l.data || [])
  }, [id])
  useEffect(() => { load() }, [load])

  const check = useMemo(() => (jo ? materialCheck(materialRequirements(bom, jo.quantity), stock) : []), [jo, bom, stock])

  const run = async (key, fn) => {
    setBusy(key)
    setError('')
    try {
      await fn()
      await load()
    } catch (e) {
      setError(e.message)
    }
    setBusy('')
  }
  const must = ({ error }) => { if (error) throw new Error(error.message) }
  const setStatus = status => supabase.from('job_orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id).then(must)

  // Draf → invois deposit dikeluarkan → tunggu bayaran
  const requestDeposit = () => run('deposit', async () => {
    must(await supabase.from('invoices').insert({
      client_id: jo.client_id, job_order_id: jo.id, type: 'deposit', amount: jo.deposit_amount, status: 'issued', due_date: addDays(7),
    }))
    await setStatus('awaiting_deposit')
  })

  const confirmWithoutDeposit = () => run('confirm', () => setStatus('confirmed'))

  const createBalanceInvoice = () => run('balance', async () => {
    const billed = invoices.filter(i => i.status !== 'void').reduce((t, i) => t + Number(i.amount), 0)
    const amount = Math.round((Number(jo.total_amount) - billed) * 100) / 100
    if (amount <= 0) throw new Error('Jumlah order sudah diinvois sepenuhnya')
    must(await supabase.from('invoices').insert({
      client_id: jo.client_id, job_order_id: jo.id, type: 'balance', amount, status: 'issued', due_date: addDays(jo.clients?.credit_days || 0),
    }))
  })

  const payLink = inv => run(`pay-${inv.id}`, async () => {
    const url = await getPayLink(inv.id)
    await navigator.clipboard?.writeText(url).catch(() => {})
    setCopied(inv.id)
  })

  const addBatch = e => {
    e.preventDefault()
    run('batch', async () => {
      must(await supabase.from('production_batches').insert({
        job_order_id: jo.id,
        planned_qty: batchForm.planned_qty,
        line_id: batchForm.line_id || null,
        planned_start: batchForm.planned_start || null,
        planned_end: batchForm.planned_end || null,
      }))
      if (jo.status === 'confirmed') await setStatus('scheduled')
      setBatchForm(null)
    })
  }

  if (!jo) return <Layout><Loading /></Layout>

  const plannedQty = batches.filter(b => b.stage !== 'rejected').reduce((t, b) => t + Number(b.planned_qty), 0)
  const releasedQty = batches.filter(b => b.stage === 'released').reduce((t, b) => t + Number(b.good_qty), 0)
  const depositInvoice = invoices.find(i => i.type === 'deposit' && i.status !== 'void')
  const canPlan = ['confirmed', 'scheduled', 'in_production', 'qc'].includes(jo.status)
  const preProduction = ['draft', 'awaiting_deposit', 'confirmed', 'scheduled'].includes(jo.status) && !batches.some(b => b.stage !== 'planned')
  const billed = invoices.filter(i => i.status !== 'void').reduce((t, i) => t + Number(i.amount), 0)

  return (
    <Layout>
      <Head><title>{jo.jo_no} · Progresss</title></Head>
      <Link href="/job-orders" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand"><ArrowLeft size={14} /> Job Order</Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-brand">{jo.jo_no} <Badge map={JOB_STATUS} value={jo.status} /></h1>
          <p className="text-slate-600">{jo.clients?.name} · {jo.products?.name} ({PRODUCT_FORM[jo.products?.form]})</p>
        </div>
        {preProduction && (
          <Button variant="outline" loading={busy === 'cancel'} onClick={() => confirm('Batalkan job order ini?') && run('cancel', () => setStatus('cancelled'))}>
            <XCircle size={16} /> Batalkan
          </Button>
        )}
      </div>

      <ErrorBox error={error} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ['Kuantiti', `${num(jo.quantity)} ${jo.products?.pack_unit}`],
          ['Jumlah', rm(jo.total_amount)],
          ['Deposit', `${rm(jo.deposit_amount)}${jo.deposit_paid_at ? ' ✓' : ''}`],
          ['Janji siap', fmtDate(jo.promised_date)],
          ['Dirancang', `${num(plannedQty)} / ${num(jo.quantity)}`],
          ['Lulus QC', `${num(releasedQty)} (${Math.round((releasedQty / jo.quantity) * 100)}%)`],
          ['Harga seunit', rm(jo.unit_price)],
          ['Diinvois', rm(billed)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-xs text-slate-500">{k}</div>
            <div className="font-semibold text-brand">{v}</div>
          </div>
        ))}
      </div>

      {/* Langkah seterusnya */}
      <Card title="Langkah seterusnya" className="mb-6">
        <div className="p-4 text-sm">
          {jo.status === 'draft' && (Number(jo.deposit_amount) > 0 ? (
            <div className="flex flex-wrap items-center gap-3">
              <span>Keluarkan invois deposit {rm(jo.deposit_amount)}. Kerja hanya boleh bermula selepas deposit dibayar.</span>
              <Button loading={busy === 'deposit'} onClick={requestDeposit}><Send size={16} /> Keluarkan invois deposit</Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <span>Order ini tiada deposit.</span>
              <Button loading={busy === 'confirm'} onClick={confirmWithoutDeposit}><CheckCircle2 size={16} /> Sahkan order</Button>
            </div>
          ))}

          {jo.status === 'awaiting_deposit' && depositInvoice && (
            <div className="flex flex-wrap items-center gap-3">
              <span>Menunggu deposit <b>{depositInvoice.invoice_no}</b> ({rm(depositInvoice.amount - depositInvoice.amount_paid)}). Bila bayaran diterima melalui CHIP, status akan bertukar secara automatik.</span>
              <Button variant="accent" loading={busy === `pay-${depositInvoice.id}`} onClick={() => payLink(depositInvoice)}>
                {copied === depositInvoice.id ? <><Copy size={16} /> Pautan disalin</> : <><Link2 size={16} /> Salin pautan bayaran</>}
              </Button>
              <Link href="/invoices" className="text-brand underline">Rekod bayaran manual</Link>
            </div>
          )}

          {canPlan && (
            <div className="flex flex-wrap items-center gap-3">
              <span>
                {plannedQty < jo.quantity ? `Rancang batch untuk baki ${num(jo.quantity - plannedQty)} unit.` : 'Semua kuantiti sudah dirancang. Kemas kini progress di halaman Progress Pengeluaran.'}
              </span>
              {plannedQty < jo.quantity && (
                <Button onClick={() => setBatchForm({ planned_qty: jo.quantity - plannedQty, line_id: lines[0]?.id || '', planned_start: today(), planned_end: '' })}>
                  <Plus size={16} /> Tambah batch
                </Button>
              )}
              {releasedQty > 0 && releasedQty < jo.quantity && (
                <Button variant="outline" loading={busy === 'ready'} onClick={() => run('ready', () => setStatus('ready'))}>Tandakan siap ({num(releasedQty)} unit)</Button>
              )}
            </div>
          )}

          {jo.status === 'ready' && (
            <div className="flex flex-wrap items-center gap-3">
              <span>Barang siap. Keluarkan invois baki, dan buat Delivery Order bila barang dihantar.</span>
              {billed < Number(jo.total_amount) && <Button loading={busy === 'balance'} onClick={createBalanceInvoice}><Send size={16} /> Invois baki {rm(jo.total_amount - billed)}</Button>}
              <Link href={`/deliveries?jo=${jo.id}`}><Button variant="outline"><Truck size={16} /> Buat Delivery Order</Button></Link>
            </div>
          )}

          {jo.status === 'delivered' && (
            <div className="flex flex-wrap items-center gap-3">
              <span>Barang sudah dihantar. Tandakan selesai selepas semua invois dijelaskan.</span>
              {billed < Number(jo.total_amount) && <Button variant="outline" loading={busy === 'balance'} onClick={createBalanceInvoice}><Send size={16} /> Invois baki</Button>}
              <Button loading={busy === 'done'} onClick={() => run('done', () => setStatus('completed'))}><CheckCircle2 size={16} /> Tandakan selesai</Button>
            </div>
          )}

          {['completed', 'cancelled'].includes(jo.status) && <span className="text-slate-500">Tiada tindakan.</span>}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Batch pengeluaran">
          <Table head={['Batch', 'Line', { label: 'Kuantiti', right: true }, 'Peringkat', 'Tarikh']} empty={batches.length === 0 && 'Belum ada batch'}>
            {batches.map(b => (
              <tr key={b.id}>
                <td className="px-4 py-2 font-mono"><Link href={`/production?batch=${b.id}`} className="text-brand hover:underline">{b.batch_no}</Link></td>
                <td className="px-4 py-2">{b.production_lines?.name || '—'}</td>
                <td className="px-4 py-2 text-right">{b.stage === 'released' ? `${num(b.good_qty)} / ` : ''}{num(b.planned_qty)}</td>
                <td className="px-4 py-2"><Badge map={BATCH_STAGE} value={b.stage} /></td>
                <td className="px-4 py-2 text-xs text-slate-500">{fmtDate(b.planned_start)}</td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title="Invois">
          <Table head={['Invois', 'Jenis', { label: 'Jumlah', right: true }, 'Status', '']} empty={invoices.length === 0 && 'Belum ada invois'}>
            {invoices.map(i => (
              <tr key={i.id}>
                <td className="px-4 py-2 font-mono">{i.invoice_no}</td>
                <td className="px-4 py-2 capitalize">{{ deposit: 'Deposit', balance: 'Baki', full: 'Penuh', other: 'Lain' }[i.type]}</td>
                <td className="px-4 py-2 text-right">{rm(i.amount)}</td>
                <td className="px-4 py-2"><Badge map={INVOICE_STATUS} value={i.status} /></td>
                <td className="px-4 py-2 text-right">
                  {['issued', 'partially_paid'].includes(i.status) && (
                    <Button variant="ghost" loading={busy === `pay-${i.id}`} onClick={() => payLink(i)} title="Salin pautan bayaran CHIP">
                      {copied === i.id ? <Copy size={14} className="text-green-600" /> : <Link2 size={14} />}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title="Keperluan bahan mentah" className="lg:col-span-2">
          <Table head={['Bahan', { label: 'Diperlukan (penuh)', right: true }, { label: 'Tersedia sekarang', right: true }, '']}
            empty={bom.length === 0 && 'Produk ini belum ada formula'}>
            {check.map(c => (
              <tr key={c.raw_material_id}>
                <td className="px-4 py-2">{c.name}</td>
                <td className="px-4 py-2 text-right">{num(c.required, 3)} {c.uom}</td>
                <td className="px-4 py-2 text-right">{num(c.available, 3)} {c.uom}</td>
                <td className="px-4 py-2 text-right">
                  {c.shortfall > 0
                    ? <span className="inline-flex items-center gap-1 text-red-600"><AlertTriangle size={14} /> Kurang {num(c.shortfall, 3)}</span>
                    : <CheckCircle2 size={16} className="ml-auto text-green-600" />}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>

      {jo.notes && <p className="mt-6 whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600"><b>Catatan:</b> {jo.notes}</p>}

      <Modal open={!!batchForm} title="Tambah batch" onClose={() => setBatchForm(null)}>
        {batchForm && (
          <form onSubmit={addBatch} className="space-y-3">
            <Field label="Kuantiti batch *"><input type="number" min="1" className={inputCls} value={batchForm.planned_qty} onChange={e => setBatchForm({ ...batchForm, planned_qty: e.target.value })} required /></Field>
            <Field label="Line pengeluaran" hint={lines.length === 0 ? 'Belum ada line. Tambah di halaman Jadual.' : ''}>
              <select className={inputCls} value={batchForm.line_id} onChange={e => setBatchForm({ ...batchForm, line_id: e.target.value })}>
                <option value="">—</option>
                {lines.map(l => <option key={l.id} value={l.id}>{l.name} ({l.line_type === 'pill' ? 'pil' : 'minuman'})</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mula dirancang"><input type="date" className={inputCls} value={batchForm.planned_start} onChange={e => setBatchForm({ ...batchForm, planned_start: e.target.value })} /></Field>
              <Field label="Siap dirancang"><input type="date" className={inputCls} value={batchForm.planned_end} onChange={e => setBatchForm({ ...batchForm, planned_end: e.target.value })} /></Field>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setBatchForm(null)}>Batal</Button>
              <Button loading={busy === 'batch'}>Simpan</Button>
            </div>
          </form>
        )}
      </Modal>
    </Layout>
  )
}
