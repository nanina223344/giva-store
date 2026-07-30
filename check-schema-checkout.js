import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/)
  if (match) acc[match[1]] = match[2]
  return acc
}, {})

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

async function check(table) {
  const { data, error } = await supabase.from(table).select('*').limit(1)
  console.log(table, error?.message || 'OK', data ? Object.keys(data[0] || {}) : [])
}

async function run() {
  await check('sales')
  await check('sale_items')
  await check('shipping')
  await check('payments')
  await check('bank_accounts')
}
run()
