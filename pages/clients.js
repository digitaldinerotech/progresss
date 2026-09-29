import { useEffect, useState } from 'react'
import Head from 'next/head'
import { Plus, Pencil } from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { PageHeader, Button, Card, Table, Modal, Field, inputCls, Loading, ErrorBox } from '../components/ui'

const EMPTY = { code: '', name: '', ssm_no: '', tin: '', contact_name: '', phone: '', email: '', address: '', deposit_percent: 50, credit_days: 0, is_internal: false }

export default function Clients() {
  const [rows, setRows] = useState(null)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  const load = async () => {
    const { data } = await supabase.from('clients').select('*').order('name')
    setRows(data || [])
  }
  useEffect(() => { load() }, [])

  const save = async e => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { id, created_at, ...values } = form
    values.code = values.code.trim().toUpperCase()
    const { error } = id
      ? await supabase.from('clients').update(values).eq('id', id)
      : await supabase.from('clients').insert(values)
    setSaving(false)
    if (error) return setError(error.message)
    setForm(null)
    load()
  }

  const set = k => e => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const shown = (rows || []).filter(r => !q || `${r.code} ${r.name} ${r.contact_name}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <Layout>
      <Head><title>Client · Progresss</title></Head>
      <PageHeader title="Client" subtitle="Syarikat yang membuat order dengan kilang">
        <input className={inputCls + ' w-56'} placeholder="Cari client…" value={q} onChange={e => setQ(e.target.value)} />
        <Button onClick={() => { setError(''); setForm(EMPTY) }}><Plus size={16} /> Client baru</Button>
      </PageHeader>

      {!rows ? <Loading /> : (
        <Card>
          <Table head={['Kod', 'Nama', 'Hubungi', 'Emel', { label: 'Deposit', right: true }, { label: 'Kredit', right: true }, '']}
            empty={shown.length === 0 && 'Belum ada client'}>
            {shown.map(c => (
              <tr key={c.id}>
                <td className="px-4 py-2 font-mono">{c.code}</td>
                <td className="px-4 py-2 font-medium">
                  {c.name} {c.is_internal && <span className="ml-1 rounded bg-accent/20 px-1.5 text-xs text-brand">Dalaman</span>}
                </td>
                <td className="px-4 py-2">{c.contact_name}<div className="text-xs text-slate-500">{c.phone}</div></td>
                <td className="px-4 py-2">{c.email || <span className="text-xs text-red-500">Tiada emel (wajib untuk CHIP)</span>}</td>
                <td className="px-4 py-2 text-right">{Number(c.deposit_percent)}%</td>
                <td className="px-4 py-2 text-right">{c.credit_days} hari</td>
                <td className="px-4 py-2 text-right">
                  <Button variant="ghost" onClick={() => { setError(''); setForm(c) }}><Pencil size={14} /></Button>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Modal open={!!form} title={form?.id ? 'Kemas kini client' : 'Client baru'} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={save} className="space-y-3">
            <ErrorBox error={error} />
            <div className="grid grid-cols-3 gap-3">
              <Field label="Kod *"><input className={inputCls} value={form.code} onChange={set('code')} required placeholder="DINERO" /></Field>
              <Field label="Nama syarikat *" className="col-span-2"><input className={inputCls} value={form.name} onChange={set('name')} required /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="No. SSM"><input className={inputCls} value={form.ssm_no || ''} onChange={set('ssm_no')} /></Field>
              <Field label="TIN (e-Invois)"><input className={inputCls} value={form.tin || ''} onChange={set('tin')} /></Field>
              <Field label="Nama untuk dihubungi"><input className={inputCls} value={form.contact_name || ''} onChange={set('contact_name')} /></Field>
              <Field label="Telefon"><input className={inputCls} value={form.phone || ''} onChange={set('phone')} /></Field>
            </div>
            <Field label="Emel" hint="Wajib untuk bayaran melalui CHIP"><input type="email" className={inputCls} value={form.email || ''} onChange={set('email')} /></Field>
            <Field label="Alamat"><textarea rows={2} className={inputCls} value={form.address || ''} onChange={set('address')} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Deposit (%)" hint="Kerja bermula selepas deposit dibayar">
                <input type="number" min="0" max="100" step="0.01" className={inputCls} value={form.deposit_percent} onChange={set('deposit_percent')} required />
              </Field>
              <Field label="Terma kredit baki (hari)">
                <input type="number" min="0" className={inputCls} value={form.credit_days} onChange={set('credit_days')} required />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_internal} onChange={set('is_internal')} /> Client dalaman (syarikat kumpulan Dinero)
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setForm(null)}>Batal</Button>
              <Button loading={saving}>Simpan</Button>
            </div>
          </form>
        )}
      </Modal>
    </Layout>
  )
}
