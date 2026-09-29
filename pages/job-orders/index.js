import { useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Plus, AlertTriangle, CheckCircle2 } from 'lucide-react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { materialRequirements, materialCheck } from '../../lib/production'
import { PageHeader, Button, Card, Table, Modal, Field, Badge, inputCls, Loading, ErrorBox, JOB_STATUS, rm, num, fmtDate } from '../../components/ui'

const FILTERS = {
  active: ['awaiting_deposit', 'confirmed', 'scheduled', 'in_production', 'qc', 'ready'],
  draft: ['draft'],
  done: ['delivered', 'completed'],
  cancelled: ['cancelled'],
}

export default function JobOrders() {
  const router = useRouter()
  const [rows, setRows] = useState(null)
  const [filter, setFilter] = useState('active')
  const [clients, setClients] = useState([])
  const [products, setProducts] = useState([])
  const [form, setForm] = useState(null)
  const [bom, setBom] = useState([])
  const [stock, setStock] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    const { data } = await supabase.from('v_job_order_progress').select('*').order('jo_no', { ascending: false })
    setRows(data || [])
  }

  useEffect(() => {
    load()
    Promise.all([
      supabase.from('clients').select('id, name, deposit_percent').order('name'),
      supabase.from('products').select('id, client_id, code, name, pack_unit').eq('active', true).order('name'),
      supabase.from('v_raw_material_stock').select('id, available_qty'),
    ]).then(([c, p, s]) => {
      setClients(c.data || [])
      setProducts(p.data || [])
      setStock(s.data || [])
    })
  }, [])

  useEffect(() => {
    if (!form?.product_id) return setBom([])
    supabase.from('bom_items').select('*, raw_materials(name, uom)').eq('product_id', form.product_id).then(({ data }) => setBom(data || []))
  }, [form?.product_id])

  const client = clients.find(c => c.id === form?.client_id)
  const total = form ? Math.round(Number(form.quantity || 0) * Number(form.unit_price || 0) * 100) / 100 : 0
  const check = useMemo(() => (form?.quantity ? materialCheck(materialRequirements(bom, form.quantity), stock) : []), [bom, stock, form?.quantity])

  const set = k => e => {
    const next = { ...form, [k]: e.target.value }
    if (k === 'client_id') next.product_id = ''
    // Deposit auto-kira ikut % client, kecuali pengguna ubah sendiri
    if (['client_id', 'quantity', 'unit_price'].includes(k) && !form.depositTouched) {
      const c = clients.find(x => x.id === next.client_id)
      next.deposit_amount = c ? (Math.round(Number(next.quantity || 0) * Number(next.unit_price || 0) * Number(c.deposit_percent)) / 100).toFixed(2) : ''
    }
    if (k === 'deposit_amount') next.depositTouched = true
    setForm(next)
  }

  const save = async e => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { depositTouched, ...v } = form
    const { data, error } = await supabase.from('job_orders').insert({
      ...v,
      deposit_amount: v.deposit_amount || 0,
      requested_date: v.requested_date || null,
      promised_date: v.promised_date || null,
    }).select('id').single()
    setSaving(false)
    if (error) return setError(error.message)
    router.push(`/job-orders/${data.id}`)
  }

  const shown = (rows || []).filter(r => FILTERS[filter].includes(r.status))

  return (
    <Layout>
      <Head><title>Job Order · Progresss</title></Head>
      <PageHeader title="Job Order" subtitle="Order pengeluaran daripada client">
        <select className={inputCls + ' w-40'} value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="active">Aktif</option>
          <option value="draft">Draf</option>
          <option value="done">Dihantar / selesai</option>
          <option value="cancelled">Batal</option>
        </select>
        <Button onClick={() => { setError(''); setForm({ client_id: '', product_id: '', quantity: '', unit_price: '', deposit_amount: '', requested_date: '', promised_date: '', notes: '', status: 'draft' }) }}>
          <Plus size={16} /> Job order baru
        </Button>
      </PageHeader>

      {!rows ? <Loading /> : (
        <Card>
          <Table head={['JO', 'Client', 'Produk', { label: 'Kuantiti', right: true }, { label: 'Jumlah', right: true }, 'Status', 'Progress', 'Janji siap']}
            empty={shown.length === 0 && 'Tiada job order'}>
            {shown.map(j => (
              <tr key={j.id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/job-orders/${j.id}`)}>
                <td className="px-4 py-2 font-mono"><Link href={`/job-orders/${j.id}`} className="text-brand hover:underline">{j.jo_no}</Link></td>
                <td className="px-4 py-2">{j.client_name}</td>
                <td className="px-4 py-2">{j.product_name}</td>
                <td className="px-4 py-2 text-right">{num(j.quantity)}</td>
                <td className="px-4 py-2 text-right">{rm(j.total_amount)}</td>
                <td className="px-4 py-2"><Badge map={JOB_STATUS} value={j.status} /></td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-accent" style={{ width: `${Math.min(100, j.percent_done)}%` }} /></div>
                    <span className="text-xs text-slate-500">{Math.round(j.percent_done)}%</span>
                  </div>
                </td>
                <td className={`px-4 py-2 ${j.is_late ? 'font-medium text-red-600' : ''}`}>{fmtDate(j.promised_date)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Modal open={!!form} wide title="Job order baru" onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={save} className="space-y-3">
            <ErrorBox error={error} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Client *">
                <select className={inputCls} value={form.client_id} onChange={set('client_id')} required>
                  <option value="">— Pilih client —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Produk *">
                <select className={inputCls} value={form.product_id} onChange={set('product_id')} required disabled={!form.client_id}>
                  <option value="">— Pilih produk —</option>
                  {products.filter(p => p.client_id === form.client_id).map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Kuantiti *"><input type="number" min="1" className={inputCls} value={form.quantity} onChange={set('quantity')} required /></Field>
              <Field label="Harga seunit (RM) *"><input type="number" min="0" step="0.0001" className={inputCls} value={form.unit_price} onChange={set('unit_price')} required /></Field>
              <Field label="Jumlah"><input className={inputCls} value={rm(total)} disabled /></Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Deposit (RM)" hint={client ? `${Number(client.deposit_percent)}% ikut tetapan client` : ''}>
                <input type="number" min="0" step="0.01" className={inputCls} value={form.deposit_amount} onChange={set('deposit_amount')} />
              </Field>
              <Field label="Tarikh diminta client"><input type="date" className={inputCls} value={form.requested_date} onChange={set('requested_date')} /></Field>
              <Field label="Tarikh janji siap"><input type="date" className={inputCls} value={form.promised_date} onChange={set('promised_date')} /></Field>
            </div>
            <Field label="Catatan"><textarea rows={2} className={inputCls} value={form.notes} onChange={set('notes')} /></Field>

            {form.product_id && (
              <div className="rounded-lg border border-slate-200">
                <div className="border-b border-slate-200 px-3 py-2 text-sm font-medium">Semakan bahan mentah</div>
                {bom.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-red-600">Produk ini belum ada formula. Tambah formula di halaman Produk & Formula.</p>
                ) : (
                  <Table head={['Bahan', { label: 'Diperlukan', right: true }, { label: 'Tersedia', right: true }, '']}>
                    {check.map(c => (
                      <tr key={c.raw_material_id}>
                        <td className="px-3 py-1.5">{c.name}</td>
                        <td className="px-3 py-1.5 text-right">{num(c.required, 3)} {c.uom}</td>
                        <td className="px-3 py-1.5 text-right">{num(c.available, 3)} {c.uom}</td>
                        <td className="px-3 py-1.5 text-right">
                          {c.shortfall > 0
                            ? <span className="inline-flex items-center gap-1 text-red-600"><AlertTriangle size={14} /> Kurang {num(c.shortfall, 3)}</span>
                            : <CheckCircle2 size={16} className="ml-auto text-green-600" />}
                        </td>
                      </tr>
                    ))}
                  </Table>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setForm(null)}>Batal</Button>
              <Button loading={saving}>Cipta job order</Button>
            </div>
          </form>
        )}
      </Modal>
    </Layout>
  )
}
