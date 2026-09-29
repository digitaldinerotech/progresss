import { useEffect, useState } from 'react'
import Head from 'next/head'
import { CheckCircle2, XCircle } from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { PageHeader, Button, Card, Table, Modal, Field, inputCls, Loading, ErrorBox, PRODUCT_FORM, num, fmtDate } from '../components/ui'

// Parameter ujian cadangan ikut bentuk produk
const PARAMS = {
  pill: ['Berat purata (mg)', 'Kekerasan (kp)', 'Masa hancur (min)', 'Ujian mikrob'],
  drink: ['pH', 'Brix (°Bx)', 'Isipadu (ml)', 'Ujian mikrob'],
  incoming: ['Rupa / warna', 'Bau', 'Kelembapan (%)', 'COA supplier disemak'],
}
const paramSet = form => (['drink_liquid', 'drink_powder'].includes(form) ? PARAMS.drink : PARAMS.pill)

export default function QC() {
  const [lots, setLots] = useState(null)
  const [batches, setBatches] = useState([])
  const [history, setHistory] = useState([])
  const [target, setTarget] = useState(null) // { kind: 'lot'|'batch', row, passed }
  const [values, setValues] = useState({})
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    const [l, b, h] = await Promise.all([
      supabase.from('raw_material_lots').select('*, raw_materials(code, name, uom), suppliers(name)').eq('status', 'quarantine').order('received_at'),
      supabase.from('production_batches').select('*, job_orders(jo_no, clients(name), products(name, form, pack_unit))').eq('stage', 'qc').order('updated_at'),
      supabase.from('qc_checks').select('*, raw_material_lots(lot_no, raw_materials(name)), production_batches(batch_no)').order('checked_at', { ascending: false }).limit(30),
    ])
    setLots(l.data || [])
    setBatches(b.data || [])
    setHistory(h.data || [])
  }
  useEffect(() => { load() }, [])

  const start = (kind, row, passed) => {
    setError('')
    setValues({})
    setNote('')
    setTarget({ kind, row, passed })
  }

  const submit = async e => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { kind, row, passed } = target
    const parameters = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ''))
    if (note) parameters.catatan = note
    try {
      const qc = await supabase.from('qc_checks').insert({
        [kind === 'lot' ? 'lot_id' : 'batch_id']: row.id,
        check_type: kind === 'lot' ? 'incoming' : 'final',
        parameters,
        passed,
      })
      if (qc.error) throw qc.error
      const upd = kind === 'lot'
        ? await supabase.from('raw_material_lots').update({ status: passed ? 'released' : 'rejected' }).eq('id', row.id)
        : await supabase.from('production_batches').update({ stage: passed ? 'released' : 'rejected' }).eq('id', row.id)
      if (upd.error) throw upd.error
      setTarget(null)
      load()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  const fields = target ? (target.kind === 'lot' ? PARAMS.incoming : paramSet(target.row.job_orders?.products?.form)) : []

  return (
    <Layout>
      <Head><title>QC · Progresss</title></Head>
      <PageHeader title="Kawalan Kualiti (QC)" subtitle="Luluskan lot bahan masuk dan batch siap" />

      {!lots ? <Loading /> : (
        <div className="space-y-6">
          <Card title={`Batch menunggu QC akhir (${batches.length})`}>
            <Table head={['Batch', 'Job order', 'Produk', { label: 'Baik', right: true }, { label: 'Reject', right: true }, '']}
              empty={batches.length === 0 && 'Tiada batch menunggu QC'}>
              {batches.map(b => (
                <tr key={b.id}>
                  <td className="px-4 py-2 font-mono">{b.batch_no}</td>
                  <td className="px-4 py-2">{b.job_orders?.jo_no} <span className="text-xs text-slate-500">{b.job_orders?.clients?.name}</span></td>
                  <td className="px-4 py-2">{b.job_orders?.products?.name} <span className="text-xs text-slate-500">{PRODUCT_FORM[b.job_orders?.products?.form]}</span></td>
                  <td className="px-4 py-2 text-right">{num(b.good_qty)}</td>
                  <td className="px-4 py-2 text-right">{num(b.reject_qty)}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <Button variant="ghost" onClick={() => start('batch', b, true)}><CheckCircle2 size={16} className="text-green-600" /> Lulus</Button>
                    <Button variant="ghost" onClick={() => start('batch', b, false)}><XCircle size={16} className="text-red-600" /> Gagal</Button>
                  </td>
                </tr>
              ))}
            </Table>
          </Card>

          <Card title={`Lot bahan dalam kuarantin (${lots.length})`}>
            <Table head={['Bahan', 'No. lot', 'Supplier', { label: 'Kuantiti', right: true }, 'Diterima', 'Luput', '']}
              empty={lots.length === 0 && 'Tiada lot dalam kuarantin'}>
              {lots.map(l => (
                <tr key={l.id}>
                  <td className="px-4 py-2">{l.raw_materials?.name}</td>
                  <td className="px-4 py-2 font-mono">{l.lot_no}</td>
                  <td className="px-4 py-2">{l.suppliers?.name || '—'}</td>
                  <td className="px-4 py-2 text-right">{num(l.received_qty, 3)} {l.raw_materials?.uom}</td>
                  <td className="px-4 py-2">{fmtDate(l.received_at)}</td>
                  <td className="px-4 py-2">{fmtDate(l.expiry_date)}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <Button variant="ghost" onClick={() => start('lot', l, true)}><CheckCircle2 size={16} className="text-green-600" /> Lulus</Button>
                    <Button variant="ghost" onClick={() => start('lot', l, false)}><XCircle size={16} className="text-red-600" /> Tolak</Button>
                  </td>
                </tr>
              ))}
            </Table>
          </Card>

          <Card title="Sejarah QC terkini">
            <Table head={['Tarikh', 'Jenis', 'Item', 'Keputusan', 'Butiran']} empty={history.length === 0 && 'Belum ada rekod'}>
              {history.map(h => (
                <tr key={h.id}>
                  <td className="px-4 py-2 whitespace-nowrap">{fmtDate(h.checked_at)}</td>
                  <td className="px-4 py-2">{{ incoming: 'Bahan masuk', in_process: 'Dalam proses', final: 'Akhir' }[h.check_type]}</td>
                  <td className="px-4 py-2 font-mono">{h.production_batches?.batch_no || `${h.raw_material_lots?.raw_materials?.name} · ${h.raw_material_lots?.lot_no}`}</td>
                  <td className="px-4 py-2">{h.passed ? <span className="text-green-700">Lulus</span> : <span className="text-red-600">Gagal</span>}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{Object.entries(h.parameters || {}).map(([k, v]) => `${k}: ${v}`).join(' · ')}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      )}

      <Modal open={!!target} onClose={() => setTarget(null)}
        title={target ? `${target.passed ? 'Luluskan' : target.kind === 'lot' ? 'Tolak' : 'Gagalkan'} ${target.kind === 'lot' ? `lot ${target.row.lot_no}` : `batch ${target.row.batch_no}`}` : ''}>
        {target && (
          <form onSubmit={submit} className="space-y-3">
            <ErrorBox error={error} />
            <p className="text-sm text-slate-500">Rekod keputusan ujian. Semua medan pilihan.</p>
            <div className="grid grid-cols-2 gap-3">
              {fields.map(f => (
                <Field key={f} label={f}><input className={inputCls} value={values[f] || ''} onChange={e => setValues({ ...values, [f]: e.target.value })} /></Field>
              ))}
            </div>
            <Field label="Catatan"><textarea rows={2} className={inputCls} value={note} onChange={e => setNote(e.target.value)} /></Field>
            {target.kind === 'batch' && target.passed && (
              <p className="rounded-lg bg-green-50 p-2 text-xs text-green-800">Tarikh pengilangan dan tarikh luput batch akan ditetapkan secara automatik.</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setTarget(null)}>Batal</Button>
              <Button variant={target.passed ? 'primary' : 'danger'} loading={busy}>{target.passed ? 'Sahkan lulus' : 'Sahkan gagal'}</Button>
            </div>
          </form>
        )}
      </Modal>
    </Layout>
  )
}
