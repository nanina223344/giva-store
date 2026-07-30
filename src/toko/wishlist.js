/**
 * src/toko/wishlist.js
 * Logic untuk Halaman Wishlist Pelanggan — Giva Store.
 */

import '../style.css'
import Alpine from 'alpinejs'
import { supabase } from '../supabaseClient.js'
import {
  storeShellFields,
  injectComponents,
  formatPrice,
  productUrl,
  mapProductRow,
  PRODUCT_SELECT,
  addToCart,
  syncCustomerSession,
} from './store-common.js'

injectComponents()
window.Alpine = Alpine

const _clean = (str) => (str || '').replace(/^["']+|["']+$/g, '').trim()

Alpine.data('storeWishlist', () => ({
  ...storeShellFields(),

  loading: true,
  wishlistProducts: [],

  // Toast notification
  toast: {
    show: false,
    message: '',
    type: 'success',
    timeoutId: null,
  },

  async init() {
    // 1. Auth Guard
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      sessionStorage.setItem('redirect_after_login', window.location.pathname + window.location.search)
      window.location.replace('/toko/login.html')
      return
    }

    const { customer } = await syncCustomerSession()
    this.customer = customer

    await this.initShell()
    await this.fetchWishlist()

    this.loading = false
  },

  showToast(message, type = 'success') {
    if (this.toast.timeoutId) clearTimeout(this.toast.timeoutId)
    this.toast.message = message
    this.toast.type = type
    this.toast.show = true
    this.toast.timeoutId = setTimeout(() => {
      this.toast.show = false
    }, 2000)
  },

  async fetchWishlist() {
    if (!this.customer?.id) return
    try {
      const { data, error } = await supabase
        .from('wishlists')
        .select(`
          id,
          product_id,
          variant_id,
          products (
            ${PRODUCT_SELECT},
            brand_name,
            is_gift_ready
          ),
          product_variants (
            id,
            color_id,
            colors ( id, name, hex_code )
          )
        `)
        .eq('customer_id', this.customer.id)
        .order('created_at', { ascending: false })

      if (error) throw error

      if (data) {
        const validItems = data.filter((item) => item.products && item.products.is_active)
        this.wishlistProducts = validItems.map((item) => {
          const p = mapProductRow(item.products)
          p.wishlist_id = item.id
          p.wishlist_variant_id = item.variant_id
          p.wishlist_color_name = item.product_variants?.colors?.name || null
          p.brand_name = _clean(item.products.brand_name)
          p.is_gift_ready = item.products.is_gift_ready || false
          return p
        })
      }
    } catch (err) {
      console.error('Gagal memuat wishlist:', err)
    }
  },

  async removeFromWishlist(productId) {
    if (!confirm('Hapus dari wishlist?')) return

    // Optimistic UI update
    const previous = [...this.wishlistProducts]
    this.wishlistProducts = this.wishlistProducts.filter((p) => p.id !== productId)

    try {
      const { error } = await supabase
        .from('wishlists')
        .delete()
        .eq('customer_id', this.customer.id)
        .eq('product_id', productId)

      if (error) throw error
      this.showToast('Dihapus dari wishlist')
    } catch (err) {
      console.error('Gagal menghapus dari wishlist:', err)
      this.wishlistProducts = previous // revert
      this.showToast('Gagal menghapus dari wishlist', 'warning')
    }
  },

  handleAddToCart(prod) {
    if (prod.total_stock <= 0) return

    // Select wishlisted variant or first available variant
    const variant = prod.has_variants
      ? (prod.variants.find((v) => v.id === prod.wishlist_variant_id) || prod.variants.find((v) => v.stock > 0))
      : null

    const stock = variant ? variant.stock : prod.total_stock

    const line = {
      product_id: prod.id,
      variant_id: variant ? variant.id : null,
      name: prod.name,
      brand_name: prod.brand_name || null,
      color_name: variant ? variant.color_name : prod.wishlist_color_name,
      hex_code: variant ? variant.color_hex : null,
      image_url: prod.image_url,
      price: prod.sell_price,
      sell_price: prod.sell_price,
      qty: 1,
      quantity: 1,
      stock: stock,
      max_quantity: stock,
    }

    addToCart(line)
    this.refreshCartCount()
    this.showToast('Ditambahkan ke keranjang')
  },

  formatPrice,
  productUrl,
}))

Alpine.start()
