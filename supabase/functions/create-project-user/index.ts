import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const allowedRoles = new Set(['operative', 'telehandler_operator', 'authorised_person', 'competent_person', 'site_manager'])

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

  const body = await request.json().catch(() => ({}))
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const pin = body.pin
  const projectId = body.projectId
  const roles = Array.isArray(body.roles) ? [...new Set(body.roles)] : []
  if (!displayName || !/^\S+@\S+\.\S+$/.test(email) || !/^\d{4}$/.test(pin) || typeof projectId !== 'string' || !roles.length || !roles.every(role => typeof role === 'string' && allowedRoles.has(role))) {
    return new Response('Name, email, four-digit PIN, project and at least one valid role are required.', { status: 400, headers: corsHeaders })
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({ email, password: `PT-${pin}`, email_confirm: true, user_metadata: { display_name: displayName } })
  if (createError || !created.user) return new Response(createError?.message ?? 'Could not create the user.', { status: 400, headers: corsHeaders })

  const userId = created.user.id
  const fail = async (message: string) => { await adminClient.auth.admin.deleteUser(userId); return new Response(message, { status: 400, headers: corsHeaders }) }
  const { error: membershipError } = await adminClient.from('project_members').upsert({ project_id: projectId, user_id: userId, role: roles.includes('site_manager') ? 'supervisor' : 'worker' })
  if (membershipError) return fail(membershipError.message)
  const { error: rolesError } = await adminClient.from('project_member_roles').insert(roles.map(role => ({ project_id: projectId, user_id: userId, role })))
  if (rolesError) return fail(rolesError.message)
  if (body.globalAdmin === true) {
    const { error: adminError } = await adminClient.from('profiles').update({ role: 'admin' }).eq('id', userId)
    if (adminError) return fail(adminError.message)
  }
  return Response.json({ id: userId }, { headers: corsHeaders })
})
