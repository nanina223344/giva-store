import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/)
  if (match) acc[match[1]] = match[2]
  return acc
}, {})

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

async function getCols(table) {
  const { data, error } = await supabase.rpc('get_table_columns', { table_name: table }) // Might not exist
  // Let's just try to insert a dummy and get error if get_table_columns doesn't exist
  if (error) {
    const { error: err2 } = await supabase.from(table).insert([{ __invalid: 1 }])
    console.log(table, err2?.message || 'OK')
  } else {
    console.log(table, data)
  }
}

async function run() {
  await getCols('sales')
  await getCols('sale_items')
  await getCols('shipping')
  await getCols('payments')
}
run()
