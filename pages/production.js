import { useCallback, useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { ArrowRight, PackageOpen, AlertTriangle } from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { materialRequirements, allocateFefo, NEXT_STAGE } from '../lib/production'
import { PageHeader, Button, Modal, Field, Badge, Table, inputCls, Loading, ErrorBox, BATCH_STAGE, PRODUCT_FORM, num, fmtDate } from '../components/ui'

const BOARD = ['planned', 'material_issued', 'processing', 'forming', 'packing', 'qc']
const READY_JOB = ['confirmed', 'scheduled', 'in_production', 'qc']

export default function Production() {
  const router = useRouter()
  const [batches, setBatches] = useState(null)
  const [showDone, setShowDone] = useState(false)
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null) // { logs, used, plan }
  const [qty, setQty] = useState({ good_qty: '', reject_qty: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    let q = supabase.from('production_batches')
      .select('*, production_lines(name), job_orders(id, jo_no, status, quantity, product_id, clients(name), products(name, form, pack_unit))')
      .order('planned_start', { ascending: true, nullsFirst: false })
    if (!showDone) q = q.in('stage', BOARD)
    const { data } = await q.limit(300)
    setBatches(data || [])
    return data || []
  }, [showDone])

  const openBatch = useCallback(async b => {
    setSelected(b)
    setError('')
    setDetail(null)
    setQty({ good_qty: b.good_qty || b.planned_qty, reject_qty: b.reject_qty || 0 })
    const [logs, used] = await Promise.all([
      supabase.from('batch_stage_logs').select('*').eq('batch_id', b.id).order('created_at'),
      supabase.from('batch_materials').select('qty, created_at, raw_material_lots(lot_no, expiry_date, raw_materials(name, uom))').eq('batch_id', b.id),
    ])
    let plan = null
    if (b.stage === 'planned') {
      const { data: bom } = await supabase.from('bom_items').select('*, raw_materials(name, uom)').eq('product_id', b.job_orders.product_id)
      const ids = (bom || []).map(x => x.raw_material_id)
      const { data: lots } = ids.length
        ? await supabase.from('raw_material_lots').select('*').in('raw_material_id', ids).eq('status', 'released').gt('remaining_qty', 0)
        : { data: [] }
      plan = { bomCount: (bom || []).length, ...allocateFefo(materialRequirements(bom || [], b.planned_qty), lots || []) }
    }
    setDetail({ logs: logs.data || [], used: used.data || [], plan })
  }, [])

  useEffect(() => {
    load().then(rows => {
      const id = router.query.batch
      const b = id && rows.find(r => r.id === id)
      if (b) openBatch(b)
    })
  }, [load, router.query.batch, openBatch])

  const act = async fn => {
    setBusy(true)
    setError('')
    try {
      await fn()
      const rows = await load()
      const fresh = rows.find(r => r.id === selected.id)
      if (fresh && BOARD.includes(fresh.stage)) openBatch(fresh)
      else setSelected(null)
    } catch (e) {
      setError(e.message)
    }
    setBusy(false)
  }
  const must = ({ error }) => { if (error) throw new Error(error.message) }

  // Keluarkan bahan ikut FEFO (satu INSERT = atomik; trigger DB tolak stok & semak lot/deposit)
  const issueMaterials = () => act(async () => {
    const rows = detail.plan.allocations.map(a => ({ batch_id: selected.id, lot_id: a.lot_id, qty: a.qty }))
    if (rows.length) must(await supabase.from('batch_materials').insert(rows))
    must(await supabase.from('production_batches').update({ stage: 'material_issued' }).eq('id', selected.id))
  })

  const advance = () => act(async () => {
    const next = NEXT_STAGE[selected.stage]
    const patch = { stage: next }
    if (next === 'qc') Object.assign(patch, { good_qty: Number(qty.good_qty) || 0, reject_qty: Number(qty.reject_qty) || 0 })
    must(await supabase.from('production_batches').update(patch).eq('id', selected.id))
  })

  const grouped = Object.fromEntries(BOARD.map(s => [s, (batches || []).filter(b => b.stage === s)]))
  const jobReady = selected && READY_JOB.includes(selected.job_orders?.status)

  return (
    <Layout>
      <Head><title>Progress Pengeluaran · Progresss</title></Head>
      <PageHeader title="Progress Pengeluaran" subtitle="Tekan batch untuk kemas kini peringkat">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> Tunjuk batch lulus/ditolak
        </label>
      </PageHeader>

      {!batches ? <Loading /> : (
        <>
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            {BOARD.map(stage => (
              <div key={stage} className="rounded-xl bg-slate-100 p-2">
                <div className="mb-2 flex items-center justify-between px-1">
                  <Badge map={BATCH_STAGE} value={stage} />
                  <span className="text-xs text-slate-500">{grouped[stage].length}</span>
                </div>
                <div className="space-y-2">
                  {grouped[stage].map(b => <BatchCard key={b.id} b={b} onClick={() => openBatch(b)} />)}
                  {grouped[stage].length === 0 && <p className="px-1 py-3 text-center text-xs text-slate-400">—</p>}
                </div>
              </div>
            ))}
          </div>

          {showDone && (
            <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {batches.filter(b => !BOARD.includes(b.stage)).map(b => <BatchCard key={b.id} b={b} onClick={() => openBatch(b)} />)}
            </div>
          )}
        </>
      )}

      <Modal open={!!selected} wide title={selected ? `Batch ${selected.batch_no}` : ''} onClose={() => { setSelected(null); router.replace('/production', undefined, { shallow: true }) }}>
        {selected && (
          <div className="space-y-4">
            <ErrorBox error={error} />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge map={BATCH_STAGE} value={selected.stage} />
              <Link href={`/job-orders/${selected.job_orders?.id}`} className="font-mono text-brand hover:underline">{selected.job_orders?.jo_no}</Link>
              <span>· {selected.job_orders?.clients?.name} · {selected.job_orders?.products?.name} ({PRODUCT_FORM[selected.job_orders?.products?.form]})</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Info k="Kuantiti dirancang" v={`${num(selected.planned_qty)} ${selected.job_orders?.products?.pack_unit || ''}`} />
              <Info k="Line" v={selected.production_lines?.name || '—'} />
              <Info k="Mula dirancang" v={fmtDate(selected.planned_start)} />
              <Info k="Mula sebenar" v={fmtDate(selected.actual_start)} />
            </div>

            {!detail ? <Loading /> : (
              <>
                {/* Tindakan ikut peringkat */}
                {selected.stage === 'planned' && (
                  <div className="rounded-lg border border-slate-200 p-3">
                    <h3 className="mb-2 font-medium">Keluarkan bahan dari stor (FEFO)</h3>
                    {!jobReady ? (
                      <p className="flex items-center gap-2 text-sm text-amber-700"><AlertTriangle size={16} /> Job order belum disahkan. Deposit mesti dibayar dahulu.</p>
                    ) : detail.plan.bomCount === 0 ? (
                      <p className="text-sm text-red-600">Produk belum ada formula. Tambah di Produk & Formula.</p>
                    ) : (
                      <>
                        <Table head={['Bahan', 'Lot', 'Luput', { label: 'Kuantiti', right: true }]}>
                          {detail.plan.allocations.map(a => (
                            <tr key={a.lot_id}>
                              <td className="px-3 py-1.5">{a.name}</td>
                              <td className="px-3 py-1.5 font-mono">{a.lot_no}</td>
                              <td className="px-3 py-1.5">{fmtDate(a.expiry_date)}</td>
                              <td className="px-3 py-1.5 text-right">{num(a.qty, 3)} {a.uom}</td>
                            </tr>
                          ))}
                        </Table>
                        {detail.plan.shortages.length > 0 ? (
                          <div className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-700">
                            Stok tidak cukup: {detail.plan.shortages.map(s => `${s.name} kurang ${num(s.missing, 3)} ${s.uom}`).join(', ')}.
                            Terima stok baru atau luluskan lot kuarantin di QC.
                          </div>
                        ) : (
                          <Button className="mt-3" loading={busy} onClick={issueMaterials}><PackageOpen size={16} /> Sahkan & keluarkan bahan</Button>
                        )}
                      </>
                    )}
                  </div>
                )}

                {['material_issued', 'processing', 'forming'].includes(selected.stage) && (
                  <Button loading={busy} onClick={advance}>Seterusnya: {BATCH_STAGE[NEXT_STAGE[selected.stage]][0]} <ArrowRight size={16} /></Button>
                )}

                {selected.stage === 'packing' && (
                  <div className="rounded-lg border border-slate-200 p-3">
                    <h3 className="mb-2 font-medium">Packing selesai: rekod kuantiti</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Kuantiti baik"><input type="number" min="0" className={inputCls} value={qty.good_qty} onChange={e => setQty({ ...qty, good_qty: e.target.value })} /></Field>
                      <Field label="Reject"><input type="number" min="0" className={inputCls} value={qty.reject_qty} onChange={e => setQty({ ...qty, reject_qty: e.target.value })} /></Field>
                    </div>
                    <Button className="mt-3" loading={busy} onClick={advance}>Hantar ke QC <ArrowRight size={16} /></Button>
                  </div>
                )}

                {selected.stage === 'qc' && (
                  <p className="rounded-lg bg-cyan-50 p-3 text-sm text-cyan-800">
                    Menunggu keputusan QC ({num(selected.good_qty)} baik, {num(selected.reject_qty)} reject). <Link href="/qc" className="font-medium underline">Buka halaman QC</Link>
                  </p>
                )}

                {detail.used.length > 0 && (
                  <div>
                    <h3 className="mb-1 text-sm font-medium">Bahan digunakan (traceability)</h3>
                    <Table head={['Bahan', 'Lot', 'Luput', { label: 'Kuantiti', right: true }]}>
                      {detail.used.map((u, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5">{u.raw_material_lots?.raw_materials?.name}</td>
                          <td className="px-3 py-1.5 font-mono">{u.raw_material_lots?.lot_no}</td>
                          <td className="px-3 py-1.5">{fmtDate(u.raw_material_lots?.expiry_date)}</td>
                          <td className="px-3 py-1.5 text-right">{num(u.qty, 3)} {u.raw_material_lots?.raw_materials?.uom}</td>
                        </tr>
                      ))}
                    </Table>
                  </div>
                )}

                {detail.logs.length > 0 && (
                  <div>
                    <h3 className="mb-1 text-sm font-medium">Sejarah peringkat</h3>
                    <ol className="space-y-1 text-sm">
                      {detail.logs.map(l => (
                        <li key={l.id} className="flex flex-wrap items-center gap-2 text-slate-600">
                          <span className="w-36 text-xs text-slate-400">{new Date(l.created_at).toLocaleString('ms-MY', { dateStyle: 'short', timeStyle: 'short' })}</span>
                          <Badge map={BATCH_STAGE} value={l.to_stage} />
                          {l.note && <span>{l.note}</span>}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Modal>
    </Layout>
  )
}

function BatchCard({ b, onClick }) {
  const late = b.planned_end && b.planned_end < new Date().toISOString().slice(0, 10) && BOARD.includes(b.stage)
  return (
    <button onClick={onClick} className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm hover:border-brand/40">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-slate-500">{b.batch_no}</span>
        {!BOARD.includes(b.stage) && <Badge map={BATCH_STAGE} value={b.stage} />}
      </div>
      <div className="mt-1 text-sm font-medium">{b.job_orders?.products?.name}</div>
      <div className="text-xs text-slate-500">{b.job_orders?.clients?.name} · {num(b.planned_qty)} unit</div>
      <div className={`mt-1 text-xs ${late ? 'font-medium text-red-600' : 'text-slate-400'}`}>
        {b.production_lines?.name || 'Tiada line'} · {fmtDate(b.planned_start)}{late ? ' · lewat' : ''}
      </div>
    </button>
  )
}

function Info({ k, v }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <div className="text-xs text-slate-500">{k}</div>
      <div className="font-medium">{v}</div>
    </div>
  )
}
