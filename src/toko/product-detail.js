/**
 * src/toko/product-detail.js
 * Logic untuk Halaman Detail Produk — Giva Store.
 */

import '../style.css'
import Alpine from 'alpinejs'
import collapse from '@alpinejs/collapse'
import { supabase } from '../supabaseClient.js'
import {
  storeShellFields,
  mapProductRow,
  PRODUCT_SELECT,
  loadCart,
  saveCart,
  injectComponents,
} from './store-common.js'

Alpine.plugin(collapse)
injectComponents()
window.Alpine = Alpine

const _clean = (str) => (str || '').replace(/^["']+|["']+$/g, '').trim()

Alpine.data('storeProductDetail', () => ({
  ...storeShellFields(),

  loading: true,
  product: null,

  // Selection & quantity
  selectedVariant: null,
  qty: 1,

  // Wishlist
  isWished: false,

  // Auxiliary data
  shippingZones: [],
  sameCollectionProducts: [],
  recommendedProducts: [],

  // Toast notification
  toast: {
    show: false,
    message: '',
    type: 'success', // 'success' | 'warning'
    timeoutId: null,
  },

  async init() {
    await this.initShell()

    const params = new URLSearchParams(window.location.search)
    const id = params.get('id')

    if (!id) {
      this.loading = false
      return
    }

    await this.fetchProduct(id)

    if (this.product) {
      // 1. SEO & Meta
      document.title = `${this.product.name} — Giva Store`
      const metaDesc = document.querySelector('meta[name="description"]')
      if (metaDesc) {
        const brand = this.product.brand_name ? `${this.product.brand_name} ` : ''
        const descExcerpt = (this.product.description || '').slice(0, 50)
        metaDesc.setAttribute('content', `${brand}${this.product.name} — ${descExcerpt}`)
      }

      // 2. Pre-select first available variant if has variants
      if (this.product.has_variants) {
        const available = this.product.variants.find((v) => v.stock > 0)
        if (available) {
          this.selectedVariant = available
        } else if (this.product.variants.length > 0) {
          this.selectedVariant = this.product.variants[0]
        }
      }

      // 3. Parallel auxiliary fetches
      await Promise.all([
        this.checkWishlist(),
        this.fetchShippingZones(),
        this.fetchRelatedSections(),
      ])
    }

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

  async fetchProduct(id) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          ${PRODUCT_SELECT},
          description, material, dimensions, weight_gram, brand_name, is_gift_ready
        `)
        .eq('id', id)
        .eq('is_active', true)
        .maybeSingle()

      if (error) throw error
      if (data) {
        const mapped = mapProductRow(data)
        this.product = {
          ...mapped,
          name: _clean(mapped.name),
          brand_name: _clean(data.brand_name),
          description: data.description || '',
          material: data.material || '',
          dimensions: data.dimensions || '',
          weight_gram: data.weight_gram || 0,
          is_gift_ready: data.is_gift_ready || false,
        }
      }
    } catch (err) {
      console.error('Gagal memuat detail produk:', err)
    }
  },

  async checkWishlist() {
    if (!this.customer?.id || !this.product) return
    try {
      const { data } = await supabase
        .from('wishlists')
        .select('id')
        .eq('customer_id', this.customer.id)
        .eq('product_id', this.product.id)
        .maybeSingle()

      this.isWished = !!data
    } catch (e) {
      this.isWished = false
    }
  },

  async toggleWishlist() {
    if (!this.customer?.id) {
      window.location.href = `/toko/login.html?redirect=${encodeURIComponent(window.location.href)}`
      return
    }

    const targetState = !this.isWished
    this.isWished = targetState // Optimistic update

    try {
      if (targetState) {
        await supabase.from('wishlists').insert({
          customer_id: this.customer.id,
          product_id: this.product.id,
        })
        this.showToast('Ditambahkan ke wishlist', 'success')
      } else {
        await supabase
          .from('wishlists')
          .delete()
          .eq('customer_id', this.customer.id)
          .eq('product_id', this.product.id)
        this.showToast('Dihapus dari wishlist', 'success')
      }
    } catch (e) {
      console.error('Wishlist toggle error:', e)
      this.isWished = !targetState // Revert
    }
  },

  async fetchShippingZones() {
    try {
      const { data } = await supabase
        .from('shipping_zones')
        .select('*')
        .order('cost', { ascending: true })
      if (data) this.shippingZones = data
    } catch (e) {
      console.warn('Gagal memuat info pengiriman:', e)
    }
  },

  async fetchRelatedSections() {
    if (!this.product) return
    try {
      // 1. "Dari Koleksi Yang Sama"
      let sameColIds = []
      const { data: cols } = await supabase
        .from('collection_products')
        .select('collection_id')
        .eq('product_id', this.product.id)

      if (cols && cols.length > 0) {
        const colIds = cols.map((c) => c.collection_id)
        const { data: prodRows } = await supabase
          .from('collection_products')
          .select('product_id')
          .in('collection_id', colIds)
          .neq('product_id', this.product.id)
          .limit(4)

        if (prodRows) {
          sameColIds = Array.from(new Set(prodRows.map((p) => p.product_id)))
        }
      }

      if (sameColIds.length > 0) {
        const { data: sameColData } = await supabase
          .from('products')
          .select(PRODUCT_SELECT)
          .in('id', sameColIds)
          .eq('is_active', true)

        if (sameColData) {
          this.sameCollectionProducts = sameColData.map((p) => {
            const mapped = mapProductRow(p)
            mapped.brand_name = _clean(p.brand_name)
            return mapped
          })
        }
      } else if (this.product.category_id) {
        // Fallback: 4 products from same category
        const { data: sameCatData } = await supabase
          .from('products')
          .select(PRODUCT_SELECT)
          .eq('category_id', this.product.category_id)
          .neq('id', this.product.id)
          .eq('is_active', true)
          .limit(4)

        if (sameCatData) {
          this.sameCollectionProducts = sameCatData.map((p) => {
            const mapped = mapProductRow(p)
            mapped.brand_name = _clean(p.brand_name)
            return mapped
          })
        }
      }

      // 2. "Mungkin Kamu Suka" — 4 products from same category excluding current & already shown
      const excludeIds = [
        this.product.id,
        ...this.sameCollectionProducts.map((p) => p.id),
      ]

      let recQuery = supabase
        .from('products')
        .select(PRODUCT_SELECT)
        .eq('is_active', true)

      if (this.product.category_id) {
        recQuery = recQuery.eq('category_id', this.product.category_id)
      }

      if (excludeIds.length > 0) {
        recQuery = recQuery.not('id', 'in', `(${excludeIds.join(',')})`)
      }

      const { data: recData } = await recQuery.limit(4)

      if (recData) {
        this.recommendedProducts = recData.map((p) => {
          const mapped = mapProductRow(p)
          mapped.brand_name = _clean(p.brand_name)
          return mapped
        })
      }
    } catch (e) {
      console.warn('Gagal memuat produk terkait:', e)
    }
  },

  selectVariant(v) {
    if (v.stock <= 0) return
    this.selectedVariant = v
    if (this.qty > v.stock) this.qty = v.stock
    if (this.qty < 1) this.qty = 1
  },

  get currentAvailableStock() {
    if (!this.product) return 0
    if (this.product.has_variants) {
      return this.selectedVariant ? this.selectedVariant.stock : 0
    }
    return this.product.base_stock
  },

  get canAddToCart() {
    if (!this.product) return false
    if (this.currentAvailableStock <= 0) return false
    if (this.product.has_variants && !this.selectedVariant) return false
    return true
  },

  get stockStatusText() {
    if (!this.product) return ''
    if (this.product.has_variants && !this.selectedVariant) {
      return 'Pilih warna untuk melihat stok'
    }
    const stock = this.currentAvailableStock
    if (stock <= 0) return 'Stok Habis'
    if (stock <= 5) return `Sisa ${stock} item`
    return 'Tersedia'
  },

  get waMessageLink() {
    if (!this.product) return '#'
    let colorPart = ''
    if (this.product.has_variants && this.selectedVariant) {
      colorPart = ` warna ${this.selectedVariant.color_name}`
    }
    const pageUrl = window.location.href
    const text = `Halo Giva Store, saya tertarik dengan ${this.product.name}${colorPart}. Boleh info lebih lanjut? ${pageUrl}`

    let num = (this.settings.store_whatsapp || '').replace(/\D/g, '')
    if (num.startsWith('0')) num = '62' + num.slice(1)
    if (!num) num = '6281234567890'

    return `https://wa.me/${num}?text=${encodeURIComponent(text)}`
  },

  incQty() {
    const max = this.currentAvailableStock
    if (this.qty < max) {
      this.qty++
    }
  },

  decQty() {
    if (this.qty > 1) {
      this.qty--
    }
  },

  handleAddToCart() {
    if (!this.canAddToCart) return

    const variant = this.product.has_variants ? this.selectedVariant : null
    const maxQty = this.currentAvailableStock
    const cartKey = `${this.product.id}__${variant ? variant.id : 'base'}`

    const cart = loadCart()
    const existingIndex = cart.findIndex((i) => i.cartKey === cartKey)

    let finalQty = this.qty
    let isCapped = false

    if (existingIndex > -1) {
      const newTotal = cart[existingIndex].qty + this.qty
      if (newTotal > maxQty) {
        cart[existingIndex].qty = maxQty
        cart[existingIndex].quantity = maxQty
        isCapped = true
      } else {
        cart[existingIndex].qty = newTotal
        cart[existingIndex].quantity = newTotal
      }
      cart[existingIndex].stock = maxQty
      cart[existingIndex].max_quantity = maxQty
    } else {
      if (finalQty > maxQty) {
        finalQty = maxQty
        isCapped = true
      }
      cart.push({
        cartKey,
        product_id: this.product.id,
        variant_id: variant ? variant.id : null,
        name: this.product.name,
        brand_name: this.product.brand_name || null,
        color_name: variant ? variant.color_name : null,
        hex_code: variant ? variant.color_hex : null,
        color_hex: variant ? variant.color_hex : null,
        image_url: this.product.image_url,
        price: this.product.sell_price,
        sell_price: this.product.sell_price,
        quantity: finalQty,
        qty: finalQty,
        max_quantity: maxQty,
        stock: maxQty,
      })
    }

    saveCart(cart)
    this.refreshCartCount()

    if (isCapped) {
      this.showToast(`Stok terbatas, maksimal ${maxQty} item`, 'warning')
    } else {
      this.showToast('Ditambahkan ke keranjang', 'success')
    }
  },
}))

Alpine.start()
