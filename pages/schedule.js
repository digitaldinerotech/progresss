import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Settings2, Plus, Pencil } from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { PageHeader, Button, Card, Table, Modal, Field, inputCls, Loading, ErrorBox, BATCH_STAGE, num } from '../components/ui'

const DAYS = 14
const iso = d => d.toISOString().slice(0, 10)
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d) }
const monday = () => { const d = new Date(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return iso(d) }
const DOW = ['Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab', 'Ahd']

export default function Schedule() {
  const [start, setStart] = useState(monday())
  const [lines, setLines] = useState(null)
  const [batches, setBatches] = useState([])
  const [unscheduled, setUnscheduled] = useState([])
  const [manage, setManage] = useState(false)
  const [lineForm, setLineForm] = useState(null)
  const [error, setError] = useState('')

  const end = addDays(start, DAYS - 1)
  const days = Array.from({ length: DAYS }, (_, i) => addDays(start, i))
  const todayIso = iso(new Date())

  const load = async () => {
    const [l, b, u] = await Promise.all([
      supabase.from('production_lines').select('*').order('name'),
      supabase.from('production_batches')
        .select('id, batch_no, stage, planned_qty, planned_start, planned_end, line_id, job_orders(jo_no, clients(name), products(name))')
        .lte('planned_start', end)
        .or(`planned_end.gte.${start},and(planned_end.is.null,planned_start.gte.${start})`)
        .neq('stage', 'rejected'),
      supabase.from('production_batches').select('id, batch_no, planned_qty, job_orders(jo_no, products(name))').is('planned_start', null).eq('stage', 'planned'),
    ])
    setLines(l.data || [])
    setBatches(b.data || [])
    setUnscheduled(u.data || [])
  }
  useEffect(() => { load() }, [start]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveLine = async e => {
    e.preventDefault()
    setError('')
    const { id, ...v } = lineForm
    v.capacity_per_day = v.capacity_per_day || null
    const { error } = id ? await supabase.from('production_lines').update(v).eq('id', id) : await supabase.from('production_lines').insert(v)
    if (error) return setError(error.message)
    setLineForm(null)
    load()
  }

  const rowsFor = lineId => batches.filter(b => (b.line_id || null) === lineId)
  const onDay = (b, d) => b.planned_start <= d && d <= (b.planned_end || b.planned_start)
  const rowDefs = [...(lines || []).filter(l => l.active).map(l => ({ id: l.id, name: l.name, cap: l.capacity_per_day, type: l.line_type })), { id: null, name: 'Tiada line' }]

  return (
    <Layout>
      <Head><title>Jadual · Progresss</title></Head>
      <PageHeader title="Jadual Pengeluaran" subtitle="Batch dirancang mengikut line (14 hari)">
        <Button variant="outline" onClick={() => setStart(addDays(start, -7))}><ChevronLeft size={16} /></Button>
        <Button variant="outline" onClick={() => setStart(monday())}>Minggu ini</Button>
        <Button variant="outline" onClick={() => setStart(addDays(start, 7))}><ChevronRight size={16} /></Button>
        <Button onClick={() => setManage(true)}><Settings2 size={16} /> Urus line</Button>
      </PageHeader>

      {!lines ? <Loading /> : (
        <>
          {lines.length === 0 && (
            <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Belum ada line pengeluaran. Tekan <b>Urus line</b> untuk tambah (contoh: Line Kapsul 1, Line Minuman 1).</p>
          )}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[1100px] table-fixed text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="w-40 px-3 py-2 text-left font-medium">Line</th>
                  {days.map(d => {
                    const dt = new Date(d + 'T00:00:00Z')
                    const weekend = dt.getUTCDay() === 0 || dt.getUTCDay() === 6
                    return (
                      <th key={d} className={`px-1 py-2 font-medium ${d === todayIso ? 'bg-accent/20 text-brand' : weekend ? 'bg-slate-50' : ''}`}>
                        {DOW[(dt.getUTCDay() + 6) % 7]}<div className="text-sm text-slate-700">{dt.getUTCDate()}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {rowDefs.map(r => {
                  const rows = rowsFor(r.id)
                  if (r.id === null && rows.length === 0) return null
                  return (
                    <tr key={r.id || 'none'} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-700">{r.name}</div>
                        {r.cap && <div className="text-slate-400">{num(r.cap)} unit/hari</div>}
                      </td>
                      {days.map(d => {
                        const items = rows.filter(b => onDay(b, d))
                        const load = items.reduce((t, b) => {
                          const span = Math.max(1, (new Date(b.planned_end || b.planned_start) - new Date(b.planned_start)) / 864e5 + 1)
                          return t + Number(b.planned_qty) / span
                        }, 0)
                        const over = r.cap && load > r.cap
                        return (
                          <td key={d} className={`space-y-1 px-1 py-1 ${d === todayIso ? 'bg-accent/10' : ''} ${over ? 'bg-red-50' : ''}`}>
                            {items.map(b => {
                              const [, cls] = BATCH_STAGE[b.stage]
                              return (
                                <Link key={b.id} href={`/production?batch=${b.id}`} title={`${b.batch_no} · ${b.job_orders?.products?.name} · ${b.job_orders?.clients?.name}`}
                                  className={`block truncate rounded px-1.5 py-1 ${cls} hover:ring-1 hover:ring-brand/40`}>
                                  {b.job_orders?.products?.name}
                                </Link>
                              )
                            })}
                            {over && <div className="text-[10px] font-medium text-red-600">Lebih kapasiti</div>}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {unscheduled.length > 0 && (
            <Card title={`Batch belum bertarikh (${unscheduled.length})`} className="mt-6">
              <ul className="divide-y divide-slate-100 text-sm">
                {unscheduled.map(b => (
                  <li key={b.id} className="flex justify-between px-4 py-2">
                    <span><span className="font-mono">{b.batch_no}</span> · {b.job_orders?.jo_no} · {b.job_orders?.products?.name}</span>
                    <span>{num(b.planned_qty)} unit</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      <Modal open={manage} title="Line pengeluaran" onClose={() => { setManage(false); setLineForm(null) }}>
        <ErrorBox error={error} />
        {!lineForm ? (
          <>
            <Table head={['Nama', 'Jenis', { label: 'Kapasiti/hari', right: true }, 'Aktif', '']} empty={(lines || []).length === 0 && 'Belum ada line'}>
              {(lines || []).map(l => (
                <tr key={l.id}>
                  <td className="px-3 py-2 font-medium">{l.name}</td>
                  <td className="px-3 py-2">{l.line_type === 'pill' ? 'Pil' : 'Minuman'}</td>
                  <td className="px-3 py-2 text-right">{l.capacity_per_day ? num(l.capacity_per_day) : '—'}</td>
                  <td className="px-3 py-2">{l.active ? 'Ya' : 'Tidak'}</td>
                  <td className="px-3 py-2 text-right"><Button variant="ghost" onClick={() => setLineForm(l)}><Pencil size={14} /></Button></td>
                </tr>
              ))}
            </Table>
            <Button className="mt-4" onClick={() => setLineForm({ name: '', line_type: 'pill', capacity_per_day: '', active: true })}><Plus size={16} /> Line baru</Button>
          </>
        ) : (
          <form onSubmit={saveLine} className="space-y-3">
            <Field label="Nama *"><input className={inputCls} value={lineForm.name} onChange={e => setLineForm({ ...lineForm, name: e.target.value })} required placeholder="Line Kapsul 1" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Jenis">
                <select className={inputCls} value={lineForm.line_type} onChange={e => setLineForm({ ...lineForm, line_type: e.target.value })}>
                  <option value="pill">Pil (tablet / kapsul)</option>
                  <option value="drink">Minuman</option>
                </select>
              </Field>
              <Field label="Kapasiti (unit/hari)"><input type="number" min="0" className={inputCls} value={lineForm.capacity_per_day || ''} onChange={e => setLineForm({ ...lineForm, capacity_per_day: e.target.value })} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={lineForm.active} onChange={e => setLineForm({ ...lineForm, active: e.target.checked })} /> Aktif</label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setLineForm(null)}>Kembali</Button>
              <Button>Simpan</Button>
            </div>
          </form>
        )}
      </Modal>
    </Layout>
  )
}
