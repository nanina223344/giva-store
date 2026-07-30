import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/)
  if (match) acc[match[1]] = match[2]
  return acc
}, {})

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

async function check() {
  const { error: err1 } = await supabase.from('wishlists').select('id').limit(1)
  console.log('wishlists error:', err1?.message || 'OK')
  
  const { error: err2 } = await supabase.from('customer_wishlists').select('id').limit(1)
  console.log('customer_wishlists error:', err2?.message || 'OK')

  const { error: err3 } = await supabase.from('shipping_zones').select('id').limit(1)
  console.log('shipping_zones error:', err3?.message || 'OK')
}
check()
