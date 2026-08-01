/**
 * Shared helpers for public storefront (toko).
 */

import { supabase } from '../supabaseClient.js'
import navbarHtml from '../../toko/components/navbar.html?raw'
import footerHtml from '../../toko/components/footer.html?raw'

export const CART_KEY = 'giva_cart'
export const CUSTOMER_KEY = 'giva_customer'

export const SETTING_DEFAULTS = {
  store_name: 'Giva Store',
  store_tagline: 'Keindahan dalam setiap detail',
  store_about:
    'Koleksi lifestyle pilihan — material berkualitas, desain timeless, siap menemani hari-hari Anda.',
  store_hero_image_url: '',
  store_whatsapp: '',
  store_instagram: '',
  announcement_bar_active: 'false',
  announcement_bar_text: '',
  announcement_bar_bg_color: '#8FA07E',
  announcement_bar_text_color: '#FFFFFF',
}

export function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function saveCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items))
  window.dispatchEvent(new CustomEvent('giva:cart-updated'))
}

export function cartCountFrom(items) {
  return (items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0)
}

export function addToCart(line) {
  const cart = loadCart()
  const cartKey = line.cartKey || `${line.product_id}__${line.variant_id || 'base'}`
  const existing = cart.find((i) => i.cartKey === cartKey)
  if (existing) {
    const next = existing.qty + (line.qty || 1)
    existing.qty = line.stock != null ? Math.min(next, line.stock) : next
    existing.stock = line.stock ?? existing.stock
  } else {
    cart.push({
      cartKey,
      product_id: line.product_id,
      variant_id: line.variant_id ?? null,
      name: line.name,
      color_name: line.color_name ?? null,
      color_hex: line.color_hex ?? null,
      image_url: line.image_url ?? null,
      sell_price: line.sell_price,
      qty: line.qty || 1,
      stock: line.stock ?? null,
    })
  }
  saveCart(cart)
  return cart
}

export function updateCartQty(cartKey, qty) {
  const cart = loadCart()
  const item = cart.find((i) => i.cartKey === cartKey)
  if (!item) return cart
  let n = parseInt(qty, 10)
  if (Number.isNaN(n) || n < 1) n = 1
  if (item.stock != null && n > item.stock) n = item.stock
  item.qty = n
  saveCart(cart)
  return cart
}

export function removeFromCart(cartKey) {
  const cart = loadCart().filter((i) => i.cartKey !== cartKey)
  saveCart(cart)
  return cart
}

export function clearCart() {
  saveCart([])
  return []
}

export function cartSubtotal(items) {
  return (items || []).reduce(
    (s, i) => s + Number(i.sell_price || 0) * (Number(i.qty) || 0),
    0,
  )
}

/**
 * Fetch semua diskon aktif yang berlaku untuk channel online/all.
 * Filter validitas periode dan usage limit dilakukan di client.
 */
export async function fetchActiveOnlineDiscounts() {
  try {
    const now = new Date().toISOString()
    const { data } = await supabase
      .from('discounts')
      .select('*')
      .eq('is_active', true)
      .or('channel.eq.all,channel.eq.online')
      .or('start_date.is.null,start_date.lte.' + now)
      .or('end_date.is.null,end_date.gte.' + now)

    const result = []
    for (const d of (data || [])) {
      if (d.usage_limit && d.usage_count >= d.usage_limit) continue
      result.push(d)
    }
    return result
  } catch {
    return []
  }
}

/**
 * Cari diskon terbaik yang berlaku untuk produk tertentu.
 * @param {object} product - { id, category_id, sell_price }
 * @param {Array} discounts - hasil fetchActiveOnlineDiscounts()
 * @returns {object|null} diskon terbaik atau null
 */
export function computeDiscountForProduct(product, discounts) {
  if (!product || !discounts || discounts.length === 0) return null

  let best = null
  let bestAmount = 0

  for (const d of discounts) {
    // Cek apakah diskon berlaku untuk produk ini
    if (d.applies_to === 'product' && d.target_id !== product.id) continue
    if (d.applies_to === 'category' && d.target_id !== product.category_id) continue

    // Min order tidak relevan untuk per-produk — skip jika ada min order
    if (d.min_order_amount && d.min_order_amount > 0) continue

    const amt = computeDiscountAmount(d, product.sell_price)
    if (amt > bestAmount) { bestAmount = amt; best = d }
  }

  return best
}

/**
 * Hitung nilai diskon berdasarkan objek diskon dan subtotal.
 * @param {object} discount
 * @param {number} subtotal
 * @returns {number} nilai diskon (tidak lebih dari subtotal)
 */
export function computeDiscountAmount(discount, subtotal) {
  if (!discount || !subtotal) return 0
  let amt = 0
  if (discount.type === 'percentage') {
    amt = subtotal * discount.value / 100
    if (discount.max_discount_amount) amt = Math.min(amt, discount.max_discount_amount)
  } else {
    amt = discount.value
  }
  return Math.min(amt, subtotal)
}

export function loadCustomer() {
  try {
    const raw = localStorage.getItem(CUSTOMER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveCustomerCache(customer) {
  if (customer) {
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer))
  } else {
    localStorage.removeItem(CUSTOMER_KEY)
  }
  window.dispatchEvent(new CustomEvent('giva:customer-updated'))
}

export function logoutCustomer() {
  localStorage.removeItem(CUSTOMER_KEY)
  window.dispatchEvent(new CustomEvent('giva:customer-updated'))
}

export function formatPrice(val) {
  if (val == null || val === '') return '—'
  return 'Rp\u00a0' + Number(val).toLocaleString('id-ID')
}

export function productUrl(id) {
  return `/toko/product-detail.html?id=${encodeURIComponent(id)}`
}

export function waLink(whatsapp) {
  const raw = String(whatsapp || '').replace(/\D/g, '')
  if (!raw) return '#'
  let n = raw
  if (n.startsWith('0')) n = '62' + n.slice(1)
  return `https://wa.me/${n}`
}

export function igLink(instagram) {
  const ig = String(instagram || '').trim()
  if (!ig) return '#'
  if (ig.startsWith('http')) return ig
  return `https://instagram.com/${ig.replace(/^@/, '')}`
}

export async function fetchStoreSettings() {
  try {
    const { data, error } = await supabase.from('settings').select('key, value')
    if (error) throw error
    const map = { ...SETTING_DEFAULTS }
    for (const row of data || []) {
      if (row.key != null && row.value != null && row.value !== '') {
        map[row.key] = row.value
      }
    }
    return {
      store_name: map.store_name || map.toko_nama || SETTING_DEFAULTS.store_name,
      store_tagline: map.store_tagline || SETTING_DEFAULTS.store_tagline,
      store_about: map.store_about || SETTING_DEFAULTS.store_about,
      store_hero_image_url: map.store_hero_image_url || '',
      store_whatsapp: map.store_whatsapp || map.toko_telepon || '',
      store_instagram: map.store_instagram || '',
      announcement_bar_active: map.announcement_bar_active || 'false',
      announcement_bar_text: map.announcement_bar_text || '',
      announcement_bar_bg_color: map.announcement_bar_bg_color || '#8FA07E',
      announcement_bar_text_color: map.announcement_bar_text_color || '#FFFFFF',
    }
  } catch (err) {
    console.warn('Settings toko:', err.message)
    return { ...SETTING_DEFAULTS }
  }
}

/** Cek apakah auth user adalah staff aktif (setara is_staff). */
export async function isStaffUser(authUserId) {
  if (!authUserId) return false
  const { data, error } = await supabase
    .from('staff')
    .select('id')
    .eq('auth_user_id', authUserId)
    .eq('is_active', true)
    .maybeSingle()
  if (error) {
    console.warn('[isStaffUser]', error.message)
    return false
  }
  return !!data
}

/** Ambil baris customers berdasarkan auth user. */
export async function fetchCustomerByAuth(authUserId) {
  if (!authUserId) return null
  const { data, error } = await supabase
    .from('customers')
    .select('id, auth_user_id, name, phone, email, address')
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  if (error) {
    console.warn('[fetchCustomerByAuth]', error.message)
    return null
  }
  return data
}

/**
 * Sync cache localStorage + return { session, customer }.
 * Customer cache: { id, name, email, phone }
 */
export async function syncCustomerSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    logoutCustomer()
    return { session: null, customer: null }
  }

  const { data: customerData } = await supabase
    .from('customers')
    .select('id, auth_user_id, name, phone, email, address')
    .eq('auth_user_id', session.user.id)
    .maybeSingle()

  if (customerData) {
    const customer = {
      id: customerData.id,
      name: customerData.name || 'Customer',
      email: customerData.email || session.user.email || '',
      phone: customerData.phone || '',
      address: customerData.address || '',
      auth_user_id: session.user.id,
    }
    saveCustomerCache(customer)
    return { session, customer }
  } else {
    // TIDAK ada di tabel customers = ini staff/admin
    // tampilkan tombol "Masuk" saja, JANGAN tampilkan nama apapun
    // JANGAN query tabel staff sama sekali di storefront
    logoutCustomer()
    return { session, customer: null }
  }
}

/**
 * Guard halaman customer-only.
 * - Belum login → /toko/login.html?redirect=...
 * - Staff → /admin/categories.html (bukan profil customer)
 */
export async function requireCustomerAuth(redirectPath) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const redirect =
    redirectPath ||
    window.location.pathname + window.location.search

  if (!session?.user) {
    window.location.replace(
      `/toko/login.html?redirect=${encodeURIComponent(redirect)}`,
    )
    throw new Error('Unauthenticated')
  }

  if (await isStaffUser(session.user.id)) {
    window.location.replace('/admin/categories.html')
    throw new Error('StaffRedirect')
  }

  const { customer } = await syncCustomerSession()
  return { session, customer }
}

export async function signOutCustomer() {
  await supabase.auth.signOut()
  logoutCustomer()
}

/** Injeksi komponen navbar dan footer ke elemen placeholder */
export function injectComponents() {
  const navContainer = document.getElementById('navbar-container')
  if (navContainer) navContainer.outerHTML = navbarHtml

  const footerContainer = document.getElementById('footer-container')
  if (footerContainer) footerContainer.outerHTML = footerHtml
}

/** Shared Alpine shell fields for navbar/footer */
export function storeShellFields() {
  return {
    mobileNavOpen: false,
    customerMenuOpen: false,
    navCollectionOpen: false,
    navCollections: [],
    cartCount: 0,
    cartItems: [],
    cartSubtotal: 0,
    cartDrawerOpen: false,
    freeShippingThreshold: 0,
    customer: null,
    settings: { ...SETTING_DEFAULTS },
    announcementDismissed: false,

    get storeName() {
      return this.settings.store_name || SETTING_DEFAULTS.store_name
    },

    get showAnnouncement() {
      return (
        this.settings.announcement_bar_active === 'true' &&
        this.settings.announcement_bar_text &&
        !this.announcementDismissed
      )
    },

    dismissAnnouncement() {
      this.announcementDismissed = true
      try { sessionStorage.setItem('giva_announcement_dismissed', '1') } catch {}
    },

    async initShell() {
      // Check announcement bar session dismiss
      try { this.announcementDismissed = sessionStorage.getItem('giva_announcement_dismissed') === '1' } catch {}
      this.refreshCartCount()

      // Don't load stale customer from cache — wait for live auth check
      // (avoids flashing staff name "Abdan" from old cache)
      this.customer = null
      
      const onCart = () => this.refreshCartCount()
      window.addEventListener('storage', (e) => {
        if (e.key === CART_KEY) this.refreshCartCount()
        if (e.key === CUSTOMER_KEY) this.customer = loadCustomer()
      })
      window.addEventListener('giva:cart-updated', onCart)
      window.addEventListener('giva:customer-updated', () => {
        this.customer = loadCustomer()
      })

      await fetchStoreSettings().then((s) => {
        this.settings = s
      })

      // Live auth check — only source of truth for customer identity
      try {
        const { customer } = await syncCustomerSession()
        this.customer = customer
      } catch {
        this.customer = null
      }

      // Load active collections for navbar
      try {
        const { data } = await supabase
          .from('collections')
          .select('id, name, sort_order')
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
        this.navCollections = data || []
      } catch (err) {
        console.warn('Navbar collections:', err.message)
      }

      // Fetch free shipping threshold
      try {
        const { data } = await supabase
          .from('shipping_zones')
          .select('free_shipping_min_order')
          .not('free_shipping_min_order', 'is', null)
          .order('free_shipping_min_order', { ascending: true })
          .limit(1)
        if (data && data.length > 0) {
          this.freeShippingThreshold = data[0].free_shipping_min_order
        }
      } catch (err) {}
    },

    refreshCartCount() {
      this.cartItems = loadCart()
      this.cartCount = cartCountFrom(this.cartItems)
      this.cartSubtotal = cartSubtotal(this.cartItems)
    },

    updateCartQty(idx, newQty) {
      const item = this.cartItems[idx]
      if (item) {
        updateCartQty(item.cartKey, newQty)
      }
    },

    removeFromCart(idx) {
      const item = this.cartItems[idx]
      if (item) {
        removeFromCart(item.cartKey)
      }
    },

    formatPrice,
    productUrl,
    waLink() {
      return waLink(this.settings.store_whatsapp)
    },
    igLink() {
      return igLink(this.settings.store_instagram)
    },
    async logoutCustomer() {
      await signOutCustomer()
      this.customer = null
      this.customerMenuOpen = false
      window.location.href = '/toko/index.html'
    },
  }
}

export function mapProductRow(p) {
  const baseStock = (p.stock_available || [])
    .filter((s) => !s.variant_id)
    .reduce((sum, s) => sum + (s.available_quantity ?? 0), 0)

  const variants = (p.product_variants || [])
    .filter((v) => v.is_active !== false)
    .map((v) => {
      const stockQty = (v.stock_available || []).reduce((sum, s) => sum + (s.available_quantity ?? 0), 0)
      return {
        id: v.id,
        color_id: v.color_id ?? v.colors?.id ?? null,
        color_name: v.colors?.name ?? 'Warna',
        color_hex: v.colors?.hex_code ?? '#cfc9bc',
        stock: stockQty,
        is_active: v.is_active !== false,
      }
    })

  const variantStock = variants.reduce((sum, v) => sum + v.stock, 0)
  const total_stock = baseStock + variantStock

  const seen = new Set()
  const colorDots = []
  for (const v of variants) {
    const key = (v.color_hex || '').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    colorDots.push({
      id: v.id,
      name: v.color_name,
      hex: v.color_hex,
      color_id: v.color_id,
    })
  }

  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    sell_price: p.sell_price,
    image_url: p.image_url,
    category_id: p.category_id,
    category_name: p.categories?.name ?? null,
    description: p.description ?? null,
    created_at: p.created_at,
    base_stock: baseStock,
    total_stock,
    has_variants: variants.length > 0,
    variants,
    colors: colorDots,
  }
}

export const PRODUCT_SELECT = `
  id, sku, name, sell_price, image_url, category_id, created_at,
  categories ( name ),
  stock_available ( available_quantity, variant_id ),
  product_variants (
    id, is_active, color_id,
    colors ( id, name, hex_code ),
    stock_available ( available_quantity )
  )
`
