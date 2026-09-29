import { useEffect, useState } from 'react'
import Head from 'next/head'
import { Plus, Pencil, Trash2, FlaskConical } from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { PageHeader, Button, Card, Table, Modal, Field, inputCls, Loading, ErrorBox, PRODUCT_FORM, num } from '../components/ui'

const EMPTY = { client_id: '', code: '', name: '', form: 'capsule', pack_unit: 'botol', pack_size: '', registration_no: '', halal_cert_no: '', shelf_life_months: 24, active: true }

export default function Products() {
  const [rows, setRows] = useState(null)
  const [clients, setClients] = useState([])
  const [materials, setMaterials] = useState([])
  const [form, setForm] = useState(null)
  const [bomFor, setBomFor] = useState(null)
  const [bom, setBom] = useState([])
  const [bomLine, setBomLine] = useState({ raw_material_id: '', qty_per_unit: '', wastage_percent: 0 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [clientFilter, setClientFilter] = useState('')

  const load = async () => {
    const [p, c, m] = await Promise.all([
      supabase.from('products').select('*, clients(name), bom_items(count)').order('name'),
      supabase.from('clients').select('id, name').order('name'),
      supabase.from('raw_materials').select('id, code, name, uom').order('name'),
    ])
    setRows(p.data || [])
    setClients(c.data || [])
    setMaterials(m.data || [])
  }
  useEffect(() => { load() }, [])

  const loadBom = async productId => {
    const { data } = await supabase.from('bom_items').select('*, raw_materials(code, name, uom)').eq('product_id', productId)
    setBom(data || [])
  }

  const save = async e => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { id, created_at, clients: _c, bom_items: _b, ...values } = form
    values.code = values.code.trim().toUpperCase()
    const { error } = id
      ? await supabase.from('products').update(values).eq('id', id)
      : await supabase.from('products').insert(values)
    setSaving(false)
    if (error) return setError(error.message)
    setForm(null)
    load()
  }

  const openBom = p => {
    setError('')
    setBomFor(p)
    setBomLine({ raw_material_id: '', qty_per_unit: '', wastage_percent: 0 })
    loadBom(p.id)
  }

  const addBomLine = async e => {
    e.preventDefault()
    setError('')
    const { error } = await supabase.from('bom_items').upsert(
      { product_id: bomFor.id, ...bomLine },
      { onConflict: 'product_id,raw_material_id' }
    )
    if (error) return setError(error.message)
    setBomLine({ raw_material_id: '', qty_per_unit: '', wastage_percent: 0 })
    loadBom(bomFor.id)
    load()
  }

  const removeBomLine = async id => {
    await supabase.from('bom_items').delete().eq('id', id)
    loadBom(bomFor.id)
    load()
  }

  const set = k => e => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const shown = (rows || []).filter(r => !clientFilter || r.client_id === clientFilter)
  const selectedUom = materials.find(m => m.id === bomLine.raw_material_id)?.uom

  return (
    <Layout>
      <Head><title>Produk & Formula · Progresss</title></Head>
      <PageHeader title="Produk & Formula" subtitle="Produk client dan formula (BOM) bagi setiap unit">
        <select className={inputCls + ' w-48'} value={clientFilter} onChange={e => setClientFilter(e.target.value)}>
          <option value="">Semua client</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Button onClick={() => { setError(''); setForm({ ...EMPTY, client_id: clientFilter }) }} disabled={clients.length === 0}>
          <Plus size={16} /> Produk baru
        </Button>
      </PageHeader>

      {!rows ? <Loading /> : (
        <Card>
          <Table head={['Kod', 'Produk', 'Client', 'Bentuk', 'Pek', 'No. MAL / KKM', 'Formula', '']}
            empty={shown.length === 0 && (clients.length === 0 ? 'Tambah client dahulu' : 'Belum ada produk')}>
            {shown.map(p => {
              const bomCount = p.bom_items?.[0]?.count || 0
              return (
                <tr key={p.id} className={p.active ? '' : 'opacity-50'}>
                  <td className="px-4 py-2 font-mono">{p.code}</td>
                  <td className="px-4 py-2 font-medium">{p.name}</td>
                  <td className="px-4 py-2">{p.clients?.name}</td>
                  <td className="px-4 py-2">{PRODUCT_FORM[p.form]}</td>
                  <td className="px-4 py-2">{p.pack_size} {p.pack_unit}</td>
                  <td className="px-4 py-2">{p.registration_no || '—'}</td>
                  <td className="px-4 py-2">
                    <button onClick={() => openBom(p)} className={`inline-flex items-center gap-1 text-sm ${bomCount ? 'text-brand' : 'text-red-600'} hover:underline`}>
                      <FlaskConical size={14} /> {bomCount ? `${bomCount} bahan` : 'Belum ada formula'}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button variant="ghost" onClick={() => { setError(''); setForm(p) }}><Pencil size={14} /></Button>
                  </td>
                </tr>
              )
            })}
          </Table>
        </Card>
      )}

      <Modal open={!!form} title={form?.id ? 'Kemas kini produk' : 'Produk baru'} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={save} className="space-y-3">
            <ErrorBox error={error} />
            <Field label="Client *">
              <select className={inputCls} value={form.client_id} onChange={set('client_id')} required>
                <option value="">— Pilih client —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Kod *"><input className={inputCls} value={form.code} onChange={set('code')} required /></Field>
              <Field label="Nama produk *" className="col-span-2"><input className={inputCls} value={form.name} onChange={set('name')} required /></Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Bentuk *">
                <select className={inputCls} value={form.form} onChange={set('form')}>
                  {Object.entries(PRODUCT_FORM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Unit pek *" hint="botol / kotak / sachet"><input className={inputCls} value={form.pack_unit} onChange={set('pack_unit')} required /></Field>
              <Field label="Saiz pek" hint="cth: 60 kapsul, 500ml"><input className={inputCls} value={form.pack_size || ''} onChange={set('pack_size')} /></Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="No. MAL / KKM"><input className={inputCls} value={form.registration_no || ''} onChange={set('registration_no')} /></Field>
              <Field label="No. sijil Halal"><input className={inputCls} value={form.halal_cert_no || ''} onChange={set('halal_cert_no')} /></Field>
              <Field label="Jangka hayat (bulan) *"><input type="number" min="1" className={inputCls} value={form.shelf_life_months} onChange={set('shelf_life_months')} required /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={set('active')} /> Aktif</label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setForm(null)}>Batal</Button>
              <Button loading={saving}>Simpan</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!bomFor} wide title={`Formula: ${bomFor?.name || ''} (setiap 1 ${bomFor?.pack_unit || 'unit'})`} onClose={() => setBomFor(null)}>
        <ErrorBox error={error} />
        <Table head={['Bahan', { label: 'Kuantiti / unit', right: true }, { label: 'Pembaziran', right: true }, '']}
          empty={bom.length === 0 && 'Belum ada bahan dalam formula'}>
          {bom.map(b => (
            <tr key={b.id}>
              <td className="px-4 py-2">{b.raw_materials?.name} <span className="text-xs text-slate-400">{b.raw_materials?.code}</span></td>
              <td className="px-4 py-2 text-right">{num(b.qty_per_unit, 6)} {b.raw_materials?.uom}</td>
              <td className="px-4 py-2 text-right">{Number(b.wastage_percent)}%</td>
              <td className="px-4 py-2 text-right">
                <Button variant="ghost" onClick={() => removeBomLine(b.id)}><Trash2 size={14} className="text-red-500" /></Button>
              </td>
            </tr>
          ))}
        </Table>

        <form onSubmit={addBomLine} className="mt-4 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
          <Field label="Bahan">
            <select className={inputCls} value={bomLine.raw_material_id} onChange={e => setBomLine({ ...bomLine, raw_material_id: e.target.value })} required>
              <option value="">— Pilih bahan —</option>
              {materials.map(m => <option key={m.id} value={m.id}>{m.name} ({m.uom})</option>)}
            </select>
          </Field>
          <Field label={`Kuantiti / unit${selectedUom ? ` (${selectedUom})` : ''}`}>
            <input type="number" step="any" min="0" className={inputCls} value={bomLine.qty_per_unit} onChange={e => setBomLine({ ...bomLine, qty_per_unit: e.target.value })} required />
          </Field>
          <Field label="Pembaziran (%)">
            <input type="number" step="0.01" min="0" className={inputCls} value={bomLine.wastage_percent} onChange={e => setBomLine({ ...bomLine, wastage_percent: e.target.value })} />
          </Field>
          <Button><Plus size={16} /> Tambah</Button>
        </form>
        {materials.length === 0 && <p className="mt-2 text-xs text-slate-500">Daftar bahan mentah dahulu di halaman Stok Bahan Mentah → Senarai Bahan.</p>}
        <p className="mt-2 text-xs text-slate-500">Contoh: 1 botol 60 kapsul × 500mg kolagen = 0.03 kg kolagen. Kalau bahan yang sama ditambah semula, nilainya akan dikemas kini.</p>
      </Modal>
    </Layout>
  )
}
