import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('Authorization')
  if (!url || !anonKey || !serviceRoleKey || !authorization) return new Response('Unauthorised', { status: 401, headers: corsHeaders })

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return new Response('Unauthorised', { status: 401, headers: corsHeaders })

  const adminClient = createClient(url, serviceRoleKey)
  const { data: profile, error: profileError } = await adminClient.from('profiles').select('role').eq('id', user.id).single()
  if (profileError || profile?.role !== 'admin') return new Response('Forbidden', { status: 403, headers: corsHeaders })

  const { userId, pin } = await request.json().catch(() => ({}))
  if (typeof userId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(userId) || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    return new Response('A user and four-digit PIN are required.', { status: 400, headers: corsHeaders })
  }

  const { error } = await adminClient.auth.admin.updateUserById(userId, { password: `PT-${pin}` })
  if (error) return new Response(error.message, { status: 400, headers: corsHeaders })
  return Response.json({ ok: true }, { headers: corsHeaders })
})
