import { supabase } from './supabase'

// Panggil API route sendiri dengan token sesi pengguna
export async function apiPost(path, body = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Ralat ${res.status}`)
  return data
}

// Pautan bayaran CHIP untuk invois (dicipta jika belum ada)
export const getPayLink = invoiceId => apiPost(`/api/invoices/${invoiceId}/pay-link`).then(d => d.url)
