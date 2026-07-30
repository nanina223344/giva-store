/**
 * Keranjang belanja — /toko/cart.html
 * Persist: localStorage (giva_cart) — exception untuk storefront cart.
 */

import '../style.css'
import Alpine from 'alpinejs'
import {
  storeShellFields,
  loadCart,
  updateCartQty,
  removeFromCart,
  cartSubtotal,
  cartCountFrom,
  productUrl,
} from './store-common.js'

window.Alpine = Alpine

Alpine.data('storeCart', () => ({
  ...storeShellFields(),

  items: [],
  loading: true,

  get subtotal() {
    return cartSubtotal(this.items)
  },

  get isEmpty() {
    return this.items.length === 0
  },

  async init() {
    await this.initShell()
    document.title = `Keranjang — ${this.storeName}`
    this.reload()
    this.loading = false
    window.addEventListener('giva:cart-updated', () => this.reload())
  },

  reload() {
    this.items = loadCart()
    this.cartCount = cartCountFrom(this.items)
  },

  lineSubtotal(item) {
    return Number(item.sell_price || 0) * (Number(item.qty) || 0)
  },

  inc(item) {
    const max = item.stock != null ? item.stock : 9999
    if (item.qty >= max) return
    updateCartQty(item.cartKey, item.qty + 1)
    this.reload()
  },

  dec(item) {
    if (item.qty <= 1) {
      this.remove(item)
      return
    }
    updateCartQty(item.cartKey, item.qty - 1)
    this.reload()
  },

  setQty(item, val) {
    updateCartQty(item.cartKey, val)
    this.reload()
  },

  remove(item) {
    removeFromCart(item.cartKey)
    this.reload()
  },

  goCheckout() {
    if (this.isEmpty) return
    // Keranjang sudah di localStorage; redirect login akan kembali ke checkout
    window.location.href = '/toko/checkout.html'
  },

  productUrl,
}))

Alpine.start()
