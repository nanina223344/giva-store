import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/)
  if (match) acc[match[1]] = match[2]
  return acc
}, {})

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

async function check() {
  const { data, error } = await supabase.from('customer_addresses').select('*').limit(1)
  console.log('customer_addresses error:', error?.message || 'OK', data ? Object.keys(data[0] || {}) : [])
}
check()
