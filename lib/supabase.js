import { createClient } from '@supabase/supabase-js'

let supabase

if (typeof window !== 'undefined' || process.env.NEXT_PUBLIC_SUPABASE_URL) {
  supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

export { supabase }