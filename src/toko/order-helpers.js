/**
 * Shared status / display helpers for customer orders.
 */

export function orderNumber(saleId) {
  return String(saleId || '').replace(/-/g, '').slice(0, 8).toUpperCase()
}

/**
 * Combined customer-facing status label.
 */
export function displayOrderStatus(order) {
  if (!order) return '—'
  if (order.order_status === 'cancelled') return 'Dibatalkan'
  if (order.order_status === 'completed') return 'Selesai'
  if (order.order_status === 'shipped') return 'Dikirim'
  if (order.order_status === 'processing') return 'Diproses'
  // pending order_status
  if (order.payment_status === 'unpaid') return 'Menunggu Pembayaran'
  if (order.payment_status === 'paid' && order.order_status === 'pending') {
    return 'Menunggu Konfirmasi'
  }
  // proof uploaded: payment may be pending while sale still unpaid
  if (order.payment_status === 'unpaid' || order.payment_status === 'pending') {
    const pay = firstPayment(order)
    if (pay?.status === 'pending' && pay?.proof_url) return 'Menunggu Konfirmasi'
    return 'Menunggu Pembayaran'
  }
  if (order.order_status === 'pending') return 'Menunggu Konfirmasi'
  return order.order_status || '—'
}

export function firstPayment(order) {
  const p = order?.payments
  if (!p) return null
  return Array.isArray(p) ? p[0] : p
}

export function firstShipping(order) {
  const s = order?.shipping
  if (!s) return null
  return Array.isArray(s) ? s[0] : s
}

export function formatOrderDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function methodLabel(m) {
  const map = {
    transfer: 'Transfer Bank',
    qris: 'QRIS',
    gopay: 'GoPay',
    ovo: 'OVO',
    dana: 'Dana',
    cash: 'Tunai',
  }
  return map[m] || m || '—'
}

export function paymentStatusLabel(s) {
  const map = {
    unpaid: 'Belum dibayar',
    pending: 'Menunggu verifikasi',
    success: 'Berhasil',
    paid: 'Lunas',
    failed: 'Gagal',
  }
  return map[s] || s || '—'
}

/** Map sale_items row to display line */
export function mapSaleItem(row) {
  const product = row.products || {}
  const variant = row.product_variants || {}
  const color = variant.colors || {}
  return {
    id: row.id,
    product_id: row.product_id,
    name: product.name || 'Produk',
    image_url: product.image_url || null,
    color_name: color.name || null,
    color_hex: color.hex_code || null,
    quantity: row.quantity,
    unit_price: row.unit_price,
    subtotal: row.subtotal ?? Number(row.unit_price) * Number(row.quantity),
  }
}

export const SALE_LIST_SELECT = `
  id, total_amount, payment_status, order_status, created_at, channel, customer_id,
  payments ( id, method, status, amount, proof_url, payment_detail ),
  shipping (
    shipping_cost, shipping_address, recipient_name, recipient_phone, shipping_zone_id,
    shipping_zones ( id, name, base_cost, fee )
  ),
  sale_items (
    id, quantity, unit_price, subtotal, product_id, variant_id,
    products ( id, name, image_url ),
    product_variants ( id, colors ( name, hex_code ) )
  )
`

export const SALE_LIST_SELECT_FALLBACK = `
  id, total_amount, payment_status, order_status, created_at, channel, customer_id,
  payments ( id, method, status, amount, proof_url, payment_detail ),
  sale_items (
    id, quantity, unit_price, subtotal, product_id, variant_id,
    products ( id, name, image_url ),
    product_variants ( id, colors ( name, hex_code ) )
  )
`
