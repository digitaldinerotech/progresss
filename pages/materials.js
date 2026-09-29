import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { Plus, Pencil, PackagePlus, AlertTriangle } from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import {
  PageHeader, Button, Card, Table, Modal, Field, Tabs, Badge, inputCls, Loading, ErrorBox,
  LOT_STATUS, MATERIAL_CATEGORY, num, fmtDate, today, rm,
} from '../components/ui'

const EMPTY_MATERIAL = { code: '', name: '', category: 'active', uom: 'kg', reorder_level: 0, is_halal: true, default_supplier_id: '' }
const EMPTY_SUPPLIER = { name: '', contact_name: '', phone: '', email: '' }

export default function Materials() {
  const [tab, setTab] = useState('stock')
  const [stock, setStock] = useState(null)
  const [lots, setLots] = useState([])
  const [materials, setMaterials] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [lotFilter, setLotFilter] = useState('active')
  const [modal, setModal] = useState(null) // { type: 'material'|'supplier'|'lot', data }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    const [s, l, m, sp] = await Promise.all([
      supabase.from('v_raw_material_stock').select('*').order('name'),
      supabase.from('raw_material_lots').select('*, raw_materials(code, name, uom), suppliers(name)').order('received_at', { ascending: false }).limit(500),
      supabase.from('raw_materials').select('*, suppliers(name)').order('name'),
      supabase.from('suppliers').select('*').order('name'),
    ])
    setStock(s.data || [])
    setLots(l.data || [])
    setMaterials(m.data || [])
    setSuppliers(sp.data || [])
  }
  useEffect(() => { load() }, [])

  const open = (type, data) => { setError(''); setModal({ type, data }) }
  const set = k => e => setModal({ ...modal, data: { ...modal.data, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value } })

  const save = async e => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { type, data } = modal
    let result
    if (type === 'material') {
      const { id, created_at, suppliers: _s, ...v } = data
      v.code = v.code.trim().toUpperCase()
      v.default_supplier_id = v.default_supplier_id || null
      result = id ? await supabase.from('raw_materials').update(v).eq('id', id) : await supabase.from('raw_materials').insert(v)
    } else if (type === 'supplier') {
      const { id, created_at, ...v } = data
      result = id ? await supabase.from('suppliers').update(v).eq('id', id) : await supabase.from('suppliers').insert(v)
    } else {
      result = await supabase.from('raw_material_lots').insert({
        raw_material_id: data.raw_material_id,
        supplier_id: data.supplier_id || null,
        lot_no: data.lot_no.trim(),
        received_qty: data.received_qty,
        remaining_qty: data.received_qty,
        unit_cost: data.unit_cost || null,
        received_at: data.received_at,
        expiry_date: data.expiry_date || null,
        status: 'quarantine',
      })
    }
    setSaving(false)
    if (result.error) return setError(result.error.message)
    setModal(null)
    load()
  }

  const receiveLot = (materialId = '') => {
    const m = materials.find(x => x.id === materialId)
    open('lot', { raw_material_id: materialId, supplier_id: m?.default_supplier_id || '', lot_no: '', received_qty: '', unit_cost: '', received_at: today(), expiry_date: '' })
  }

  const soon = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10)
  const shownLots = lots.filter(l => lotFilter === 'all' || (lotFilter === 'active' ? ['quarantine', 'released'].includes(l.status) : l.status === lotFilter))
  const lowCount = (stock || []).filter(s => s.below_reorder).length

  return (
    <Layout>
      <Head><title>Stok Bahan Mentah · Progresss</title></Head>
      <PageHeader title="Stok Bahan Mentah" subtitle="Stok ikut lot: kuarantin → lulus QC → digunakan (FEFO)">
        <Button onClick={() => receiveLot()} disabled={materials.length === 0}><PackagePlus size={16} /> Terima stok (GRN)</Button>
      </PageHeader>

      <Tabs value={tab} onChange={setTab} tabs={[
        ['stock', `Baki stok${lowCount ? ` (${lowCount} rendah)` : ''}`],
        ['lots', 'Lot'],
        ['materials', 'Senarai bahan'],
        ['suppliers', 'Supplier'],
      ]} />

      {!stock ? <Loading /> : (
        <>
          {tab === 'stock' && (
            <Card>
              <Table head={['Bahan', 'Kategori', { label: 'Tersedia', right: true }, { label: 'Kuarantin', right: true }, { label: 'Paras reorder', right: true }, 'Luput terdekat', '']}
                empty={stock.length === 0 && 'Belum ada bahan. Tambah di tab "Senarai bahan".'}>
                {stock.map(s => (
                  <tr key={s.id} className={s.below_reorder ? 'bg-red-50/50' : ''}>
                    <td className="px-4 py-2 font-medium">{s.name} <span className="text-xs text-slate-400">{s.code}</span></td>
                    <td className="px-4 py-2">{MATERIAL_CATEGORY[s.category]}</td>
                    <td className={`px-4 py-2 text-right font-medium ${s.below_reorder ? 'text-red-600' : ''}`}>
                      {s.below_reorder && <AlertTriangle size={14} className="mr-1 inline" />}{num(s.available_qty, 3)} {s.uom}
                    </td>
                    <td className="px-4 py-2 text-right text-amber-700">{Number(s.quarantine_qty) ? `${num(s.quarantine_qty, 3)} ${s.uom}` : '—'}</td>
                    <td className="px-4 py-2 text-right text-slate-500">{num(s.reorder_level, 3)} {s.uom}</td>
                    <td className={`px-4 py-2 ${s.next_expiry && s.next_expiry <= soon ? 'text-red-600' : ''}`}>{fmtDate(s.next_expiry)}</td>
                    <td className="px-4 py-2 text-right"><Button variant="outline" onClick={() => receiveLot(s.id)}>Terima</Button></td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}

          {tab === 'lots' && (
            <Card title="Lot bahan" actions={
              <select className={inputCls + ' w-40'} value={lotFilter} onChange={e => setLotFilter(e.target.value)}>
                <option value="active">Aktif</option>
                <option value="quarantine">Kuarantin</option>
                <option value="released">Lulus</option>
                <option value="depleted">Habis</option>
                <option value="rejected">Ditolak</option>
                <option value="all">Semua</option>
              </select>
            }>
              {lots.some(l => l.status === 'quarantine') && (
                <p className="border-b border-slate-100 bg-amber-50 px-4 py-2 text-sm text-amber-800">
                  Lot kuarantin belum boleh digunakan. Luluskan di halaman <Link href="/qc" className="font-medium underline">QC</Link>.
                </p>
              )}
              <Table head={['Bahan', 'No. lot', 'Supplier', { label: 'Diterima', right: true }, { label: 'Baki', right: true }, 'Tarikh terima', 'Luput', 'Status']}
                empty={shownLots.length === 0 && 'Tiada lot'}>
                {shownLots.map(l => (
                  <tr key={l.id}>
                    <td className="px-4 py-2">{l.raw_materials?.name}</td>
                    <td className="px-4 py-2 font-mono">{l.lot_no}</td>
                    <td className="px-4 py-2">{l.suppliers?.name || '—'}</td>
                    <td className="px-4 py-2 text-right">{num(l.received_qty, 3)}</td>
                    <td className="px-4 py-2 text-right font-medium">{num(l.remaining_qty, 3)} {l.raw_materials?.uom}</td>
                    <td className="px-4 py-2">{fmtDate(l.received_at)}</td>
                    <td className={`px-4 py-2 ${l.expiry_date && l.expiry_date <= soon ? 'text-red-600' : ''}`}>{fmtDate(l.expiry_date)}</td>
                    <td className="px-4 py-2"><Badge map={LOT_STATUS} value={l.status} /></td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}

          {tab === 'materials' && (
            <Card title="Senarai bahan" actions={<Button onClick={() => open('material', EMPTY_MATERIAL)}><Plus size={16} /> Bahan baru</Button>}>
              <Table head={['Kod', 'Nama', 'Kategori', 'Unit', { label: 'Paras reorder', right: true }, 'Halal', 'Supplier utama', '']}
                empty={materials.length === 0 && 'Belum ada bahan'}>
                {materials.map(m => (
                  <tr key={m.id}>
                    <td className="px-4 py-2 font-mono">{m.code}</td>
                    <td className="px-4 py-2 font-medium">{m.name}</td>
                    <td className="px-4 py-2">{MATERIAL_CATEGORY[m.category]}</td>
                    <td className="px-4 py-2">{m.uom}</td>
                    <td className="px-4 py-2 text-right">{num(m.reorder_level, 3)}</td>
                    <td className="px-4 py-2">{m.is_halal == null ? '—' : m.is_halal ? 'Ya' : 'Tidak'}</td>
                    <td className="px-4 py-2">{m.suppliers?.name || '—'}</td>
                    <td className="px-4 py-2 text-right"><Button variant="ghost" onClick={() => open('material', { ...m, default_supplier_id: m.default_supplier_id || '' })}><Pencil size={14} /></Button></td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}

          {tab === 'suppliers' && (
            <Card title="Supplier" actions={<Button onClick={() => open('supplier', EMPTY_SUPPLIER)}><Plus size={16} /> Supplier baru</Button>}>
              <Table head={['Nama', 'Hubungi', 'Telefon', 'Emel', '']} empty={suppliers.length === 0 && 'Belum ada supplier'}>
                {suppliers.map(s => (
                  <tr key={s.id}>
                    <td className="px-4 py-2 font-medium">{s.name}</td>
                    <td className="px-4 py-2">{s.contact_name}</td>
                    <td className="px-4 py-2">{s.phone}</td>
                    <td className="px-4 py-2">{s.email}</td>
                    <td className="px-4 py-2 text-right"><Button variant="ghost" onClick={() => open('supplier', s)}><Pencil size={14} /></Button></td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}
        </>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={
        modal?.type === 'lot' ? 'Terima stok bahan (GRN)' : modal?.type === 'supplier' ? (modal.data.id ? 'Kemas kini supplier' : 'Supplier baru') : (modal?.data.id ? 'Kemas kini bahan' : 'Bahan baru')
      }>
        {modal && (
          <form onSubmit={save} className="space-y-3">
            <ErrorBox error={error} />

            {modal.type === 'material' && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Kod *"><input className={inputCls} value={modal.data.code} onChange={set('code')} required /></Field>
                  <Field label="Nama *" className="col-span-2"><input className={inputCls} value={modal.data.name} onChange={set('name')} required /></Field>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Kategori">
                    <select className={inputCls} value={modal.data.category} onChange={set('category')}>
                      {Object.entries(MATERIAL_CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label="Unit *" hint="kg / g / L / ml / pcs"><input className={inputCls} value={modal.data.uom} onChange={set('uom')} required /></Field>
                  <Field label="Paras reorder"><input type="number" step="any" min="0" className={inputCls} value={modal.data.reorder_level} onChange={set('reorder_level')} /></Field>
                </div>
                <Field label="Supplier utama">
                  <select className={inputCls} value={modal.data.default_supplier_id} onChange={set('default_supplier_id')}>
                    <option value="">—</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!modal.data.is_halal} onChange={set('is_halal')} /> Bahan halal</label>
              </>
            )}

            {modal.type === 'supplier' && (
              <>
                <Field label="Nama *"><input className={inputCls} value={modal.data.name} onChange={set('name')} required /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nama untuk dihubungi"><input className={inputCls} value={modal.data.contact_name || ''} onChange={set('contact_name')} /></Field>
                  <Field label="Telefon"><input className={inputCls} value={modal.data.phone || ''} onChange={set('phone')} /></Field>
                </div>
                <Field label="Emel"><input type="email" className={inputCls} value={modal.data.email || ''} onChange={set('email')} /></Field>
              </>
            )}

            {modal.type === 'lot' && (
              <>
                <Field label="Bahan *">
                  <select className={inputCls} value={modal.data.raw_material_id} onChange={set('raw_material_id')} required>
                    <option value="">— Pilih bahan —</option>
                    {materials.map(m => <option key={m.id} value={m.id}>{m.name} ({m.uom})</option>)}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="No. lot supplier *"><input className={inputCls} value={modal.data.lot_no} onChange={set('lot_no')} required /></Field>
                  <Field label="Supplier">
                    <select className={inputCls} value={modal.data.supplier_id} onChange={set('supplier_id')}>
                      <option value="">—</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </Field>
                  <Field label={`Kuantiti diterima *${materials.find(m => m.id === modal.data.raw_material_id) ? ` (${materials.find(m => m.id === modal.data.raw_material_id).uom})` : ''}`}>
                    <input type="number" step="any" min="0" className={inputCls} value={modal.data.received_qty} onChange={set('received_qty')} required />
                  </Field>
                  <Field label="Kos seunit (RM)"><input type="number" step="any" min="0" className={inputCls} value={modal.data.unit_cost} onChange={set('unit_cost')} /></Field>
                  <Field label="Tarikh terima *"><input type="date" className={inputCls} value={modal.data.received_at} onChange={set('received_at')} required /></Field>
                  <Field label="Tarikh luput"><input type="date" className={inputCls} value={modal.data.expiry_date} onChange={set('expiry_date')} /></Field>
                </div>
                {modal.data.unit_cost && modal.data.received_qty && (
                  <p className="text-sm text-slate-500">Nilai stok: {rm(modal.data.unit_cost * modal.data.received_qty)}</p>
                )}
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Lot baru masuk sebagai <b>Kuarantin</b>. Lot tu perlu diluluskan di halaman QC sebelum boleh digunakan.</p>
              </>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setModal(null)}>Batal</Button>
              <Button loading={saving}>Simpan</Button>
            </div>
          </form>
        )}
      </Modal>
    </Layout>
  )
}
