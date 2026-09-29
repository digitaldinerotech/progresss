import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { LayoutDashboard, ClipboardList, Factory, CalendarDays, Package, FlaskConical, Boxes, Truck, Receipt, Users, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/job-orders', label: 'Job Order', icon: ClipboardList },
  { href: '/production', label: 'Progress Pengeluaran', icon: Factory },
  { href: '/schedule', label: 'Jadual', icon: CalendarDays },
  { href: '/materials', label: 'Stok Bahan Mentah', icon: Boxes },
  { href: '/products', label: 'Produk & Formula', icon: Package },
  { href: '/qc', label: 'QC', icon: FlaskConical },
  { href: '/deliveries', label: 'Penghantaran', icon: Truck },
  { href: '/invoices', label: 'Invois & Bayaran', icon: Receipt },
  { href: '/clients', label: 'Client', icon: Users },
]

export default function Layout({ children }) {
  const router = useRouter()
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return router.replace('/login')
      const { data } = await supabase.from('profiles').select('full_name, role').eq('id', session.user.id).single()
      setProfile({ email: session.user.email, ...data })
    })
  }, [router])

  const logout = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-brand text-white md:w-64 md:min-h-screen md:flex md:flex-col">
        <div className="px-5 py-4 border-b border-white/10">
          <img src="/brand/progresss-logo-dark.svg" alt="Progresss" className="h-8" />
        </div>
        <nav className="flex md:flex-col gap-1 p-3 overflow-x-auto md:flex-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? router.pathname === '/' : router.pathname.startsWith(href)
            const cls = `flex items-center gap-3 px-3 py-2 rounded-lg text-sm whitespace-nowrap ${
              active ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'}`
            return (
              <Link key={href} href={href} className={cls}>
                <Icon size={18} className={active ? 'text-accent' : ''} />
                {label}
              </Link>
            )
          })}
        </nav>
        {profile && (
          <div className="hidden md:block p-4 border-t border-white/10 text-sm">
            <div className="font-medium truncate">{profile.full_name || profile.email}</div>
            <div className="text-white/60 capitalize">{profile.role}</div>
            <button onClick={logout} className="mt-3 flex items-center gap-2 text-white/70 hover:text-white">
              <LogOut size={16} /> Log keluar
            </button>
          </div>
        )}
      </aside>
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  )
}
