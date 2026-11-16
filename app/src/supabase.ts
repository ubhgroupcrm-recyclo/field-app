import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!url || !publishableKey) throw new Error('Supabase environment variables are not configured.')

export const supabase = createClient(url, publishableKey)

export type Profile = { id: string; display_name: string; role: 'member' | 'admin' }
export type Project = {
  id: string; name: string; company: string; code?: string
  project_manager_name?: string | null; project_manager_email?: string | null
  project_manager_mobile?: string | null; project_address?: string | null; what3words?: string | null
}
