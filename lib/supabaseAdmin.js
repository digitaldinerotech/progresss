import { createClient } from '@supabase/supabase-js'

// Server sahaja (API routes). Service role memintas RLS — jangan import dari komponen client.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key',
  { auth: { persistSession: false } }
)

// Pengguna daripada header "Authorization: Bearer <access_token>" beserta profilnya.
export async function getRequestUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return null
  const { data: profile } = await supabaseAdmin.from('profiles').select('role, client_id').eq('id', user.id).single()
  return profile ? { ...user, ...profile } : null
}
