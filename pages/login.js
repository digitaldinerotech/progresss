import { useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) return setError('Emel atau kata laluan salah')
    router.replace('/')
  }

  const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30'
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-brand">
      <Head><title>Log masuk · Progresss</title></Head>
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8 space-y-4">
        <img src="/brand/progresss-logo.svg" alt="Progresss" className="h-10 mx-auto mb-2" />
        <p className="text-center text-sm text-slate-500">Sistem pengurusan kilang</p>
        <input className={input} type="email" placeholder="Emel" value={email} onChange={e => setEmail(e.target.value)} required />
        <input className={input} type="password" placeholder="Kata laluan" value={password} onChange={e => setPassword(e.target.value)} required />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={loading} className="w-full rounded-lg bg-brand text-white py-2 font-medium hover:bg-brand-light flex justify-center">
          {loading ? <Loader2 className="animate-spin" size={20} /> : 'Log masuk'}
        </button>
      </form>
    </div>
  )
}
