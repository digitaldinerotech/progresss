import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Plus } from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { PageHeader, Button, Card, Table, Modal, Field, inputCls, Loading, ErrorBox, num, fmtDate, today } from '../components/ui'

export default function Deliveries() {
  const router = useRouter()
  const [rows, setRows] = useState(null)
  const [jobs, setJobs] = useState([])
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    const [d, j] = await Promise.all([
      supabase.from('deliveries').select('*, job_orders(id, jo_no, clients(name), products(name, pack_unit))').order('created_at', { ascending: false }).limit(300),
      supabase.from('job_orders')
        .select('id, jo_no, quantity, status, clients(name), products(name, pack_unit), production_batches(stage, good_qty), deliveries(qty)')
        .in('status', ['in_production', 'qc', 'ready']),
    ])
    if (d.error) setError(d.error.message.includes('deliveries') ? 'Jadual penghantaran belum wujud. Jalankan supabase/migrations/0002_deliveries.sql di Supabase.' : d.error.message)
    setRows(d.data || [])
    // Hanya JO yang ada baki lulus QC untuk dihantar
    setJobs((j.data || []).map(x => {
      const released = (x.production_batches || []).filter(b => b.stage === 'released').reduce((t, b) => t + Number(b.good_qty), 0)
      const delivered = (x.deliveries || []).reduce((t, v) => t + Number(v.qty), 0)
      return { ...x, released, delivered, balance: released - delivered }
    }).filter(x => x.balance > 0))
    return j.data
  }

  useEffect(() => { load() }, [])

  // ?jo=<id> dari halaman job order → terus buka borang
  useEffect(() => {
    const jo = router.query.jo
    const job = jo && jobs.find(j => j.id === jo)
    if (job && !form) openForm(job)
  }, [router.query.jo, jobs]) // eslint-disable-line react-hooks/exhaustive-deps

  const openForm = job => {
    setError('')
    setForm({ job_order_id: job?.id || '', qty: job?.balance || '', delivered_on: today(), recipient: '', carrier: '', tracking_no: '', note: '' })
  }

  const set = k => e => {
    const next = { ...form, [k]: e.target.value }
    if (k === 'job_order_id') next.qty = jobs.find(j => j.id === e.target.value)?.balance || ''
    setForm(next)
  }

  const save = async e => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error } = await supabase.from('deliveries').insert(form)
    setSaving(false)
    if (error) return setError(error.message)
    setForm(null)
    router.replace('/deliveries', undefined, { shallow: true })
    load()
  }

  const job = jobs.find(j => j.id === form?.job_order_id)

  return (
    <Layout>
      <Head><title>Penghantaran · Progresss</title></Head>
      <PageHeader title="Penghantaran" subtitle="Delivery Order untuk barang yang sudah lulus QC">
        <Button onClick={() => openForm()} disabled={jobs.length === 0}><Plus size={16} /> Delivery Order baru</Button>
      </PageHeader>

      <ErrorBox error={!form && error} />

      {!rows ? <Loading /> : (
        <div className="space-y-6">
          {jobs.length > 0 && (
            <Card title="Sedia untuk dihantar">
              <Table head={['Job order', 'Client', 'Produk', { label: 'Lulus QC', right: true }, { label: 'Sudah dihantar', right: true }, { label: 'Baki', right: true }, '']}>
                {jobs.map(j => (
                  <tr key={j.id}>
                    <td className="px-4 py-2 font-mono"><Link href={`/job-orders/${j.id}`} className="text-brand hover:underline">{j.jo_no}</Link></td>
                    <td className="px-4 py-2">{j.clients?.name}</td>
                    <td className="px-4 py-2">{j.products?.name}</td>
                    <td className="px-4 py-2 text-right">{num(j.released)}</td>
                    <td className="px-4 py-2 text-right">{num(j.delivered)}</td>
                    <td className="px-4 py-2 text-right font-medium">{num(j.balance)} {j.products?.pack_unit}</td>
                    <td className="px-4 py-2 text-right"><Button variant="outline" onClick={() => openForm(j)}>Buat DO</Button></td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}

          <Card title="Delivery Order">
            <Table head={['No. DO', 'Tarikh', 'Job order', 'Client', 'Produk', { label: 'Kuantiti', right: true }, 'Penghantar', 'Penerima']}
              empty={rows.length === 0 && 'Belum ada penghantaran'}>
              {rows.map(d => (
                <tr key={d.id}>
                  <td className="px-4 py-2 font-mono">{d.do_no}</td>
                  <td className="px-4 py-2">{fmtDate(d.delivered_on)}</td>
                  <td className="px-4 py-2 font-mono"><Link href={`/job-orders/${d.job_orders?.id}`} className="text-brand hover:underline">{d.job_orders?.jo_no}</Link></td>
                  <td className="px-4 py-2">{d.job_orders?.clients?.name}</td>
                  <td className="px-4 py-2">{d.job_orders?.products?.name}</td>
                  <td className="px-4 py-2 text-right">{num(d.qty)} {d.job_orders?.products?.pack_unit}</td>
                  <td className="px-4 py-2">{d.carrier || '—'}{d.tracking_no && <div className="font-mono text-xs text-slate-500">{d.tracking_no}</div>}</td>
                  <td className="px-4 py-2">{d.recipient || '—'}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      )}

      <Modal open={!!form} title="Delivery Order baru" onClose={() => { setForm(null); router.replace('/deliveries', undefined, { shallow: true }) }}>
        {form && (
          <form onSubmit={save} className="space-y-3">
            <ErrorBox error={error} />
            <Field label="Job order *">
              <select className={inputCls} value={form.job_order_id} onChange={set('job_order_id')} required>
                <option value="">— Pilih job order —</option>
                {jobs.map(j => <option key={j.id} value={j.id}>{j.jo_no} · {j.clients?.name} · {j.products?.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kuantiti *" hint={job ? `Baki boleh dihantar: ${num(job.balance)} ${job.products?.pack_unit}` : ''}>
                <input type="number" min="1" max={job?.balance} className={inputCls} value={form.qty} onChange={set('qty')} required />
              </Field>
              <Field label="Tarikh hantar *"><input type="date" className={inputCls} value={form.delivered_on} onChange={set('delivered_on')} required /></Field>
              <Field label="Penghantar" hint="Lori sendiri / kurier / client ambil"><input className={inputCls} value={form.carrier} onChange={set('carrier')} /></Field>
              <Field label="No. tracking"><input className={inputCls} value={form.tracking_no} onChange={set('tracking_no')} /></Field>
            </div>
            <Field label="Nama penerima"><input className={inputCls} value={form.recipient} onChange={set('recipient')} /></Field>
            <Field label="Catatan"><textarea rows={2} className={inputCls} value={form.note} onChange={set('note')} /></Field>
            <p className="text-xs text-slate-500">Bila semua kuantiti lulus QC sudah dihantar, status job order akan bertukar ke <b>Dihantar</b> secara automatik.</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setForm(null)}>Batal</Button>
              <Button loading={saving}>Simpan DO</Button>
            </div>
          </form>
        )}
      </Modal>
    </Layout>
  )
}
