/**
 * src/toko/products.js
 * Katalog Produk — filter horizontal pill, sub-navigasi kategori,
 * 4 kolom desktop, load more, wishlist, URL params.
 */

import '../style.css'
import Alpine from 'alpinejs'
import { supabase } from '../supabaseClient.js'
import {
  storeShellFields,
  mapProductRow,
  PRODUCT_SELECT,
  injectComponents,
  fetchActiveOnlineDiscounts,
  computeDiscountForProduct,
  computeDiscountAmount,
} from './store-common.js'

injectComponents()
window.Alpine = Alpine

// ── Synchronous URL param pre-read (runs before first Alpine render) ────────
// This eliminates the flash of "Semua Produk" by setting the correct
// headerContext.type before Alpine removes x-cloak and paints the DOM.
;(() => {
  const _p = new URLSearchParams(window.location.search)
  window.__givaInitParams = {
    collection: _p.get('collection'),
    category:   _p.get('category'),
    color:      _p.get('color'),
    gift:       _p.get('gift') === 'true',
    brand:      _p.get('brand'),
    q:          _p.get('q'),
  }
})()

const _clean = (str) => (str || '').replace(/^["']+|["']+$/g, '').trim()

/** Derive the correct initial headerContext synchronously from URL params.
 *  For types that need a DB name (collection, category), we set the type
 *  correctly but leave title empty — a skeleton renders until async fills it. */
function _initialHeader() {
  const p = window.__givaInitParams || {}
  if (p.gift)       return { type: 'gift',       title: 'Gift with Love', desc: 'Kurasi hadiah spesial untuk orang-orang tersayang.', ready: true }
  if (p.collection) return { type: 'collection', title: '',               desc: '', ready: false }
  if (p.category)   return { type: 'category',   title: '',               desc: '', ready: false }
  if (p.q)          return { type: 'search',     title: _clean(p.q),      desc: 'Menampilkan produk yang relevan.', ready: true }
  return                    { type: 'all',        title: 'Semua Produk',   desc: '', ready: true }
}

Alpine.data('storeProducts', () => ({
  ...storeShellFields(),

  // UI State — set SYNCHRONOUSLY from URL params so first render is correct
  headerContext: _initialHeader(),
  activeCategoryTab: window.__givaInitParams?.category || null,

  // Active filters — pre-populate from URL params synchronously
  filters: (() => {
    const p = window.__givaInitParams || {}
    return {
      categories:  p.category  ? [p.category]  : [],
      brands:      p.brand     ? [p.brand]     : [],
      colors:      p.color     ? [p.color]     : [],
      collections: p.collection? [p.collection]: [],
      priceMin: '',
      priceMax: '',
      gift_ready: p.gift || false,
      stock: 'all',
      q:     p.q || '',
      sort:  'newest',
    }
  })(),

  // Filter metadata
  filterData: {
    categories: [],
    brands: [],
    colors: [],
  },

  // Product list
  loading: true,
  loadingMore: false,
  displayedProducts: [],
  totalFiltered: 0,

  // Pagination
  pageSize: 12,
  offset: 0,
  hasMore: false,

  // Wishlist (product_ids)
  myWishlists: [],

  // Discounts
  activeDiscounts: [],

  // ── Init ──────────────────────────────────────────────────────────────

  async init() {
    await this.initShell()

    // Params already pre-parsed; re-use the cached object
    const params = new URLSearchParams(window.location.search)

    await Promise.all([
      this.loadFilterMetadata(),
      this.loadWishlists(),
      fetchActiveOnlineDiscounts().then(d => { this.activeDiscounts = d.filter(x => x.discount_type === 'auto') }),
    ])

    // Resolve async title for collection/category (needs DB fetch)
    await this.setupHeaderContext(params)
    await this.fetchProducts(true)
  },

  // ── Header Context ────────────────────────────────────────────────────

  async setupHeaderContext(params) {
    const collectionId = params.get('collection')
    const categoryId = params.get('category')
    const q = params.get('q')

    if (this.filters.gift_ready) {
      this.headerContext = { type: 'gift', title: 'Gift with Love', desc: 'Kurasi hadiah spesial untuk orang-orang tersayang.', ready: true }
      return
    }

    if (collectionId) {
      const { data } = await supabase.from('collections').select('name, subtitle, description').eq('id', collectionId).maybeSingle()
      this.headerContext = {
        type: 'collection',
        title: data ? _clean(data.name) : 'Koleksi',
        desc: data ? (_clean(data.description || data.subtitle) || 'Koleksi spesial pilihan Giva Store.') : '',
        ready: true,
      }
      return
    }

    if (categoryId) {
      // filterData.categories already populated by loadFilterMetadata() (ran in parallel)
      const cat = this.filterData.categories.find(c => c.id === categoryId)
      this.headerContext = { type: 'category', title: _clean(cat?.name) || 'Kategori', desc: '', ready: true }
      return
    }

    if (q) {
      this.headerContext = { type: 'search', title: _clean(q), desc: 'Menampilkan produk yang relevan.', ready: true }
      return
    }

    this.headerContext = { type: 'all', title: 'Semua Produk', desc: '', ready: true }
  },


  // ── Filter Metadata ────────────────────────────────────────────────

  async loadFilterMetadata() {
    const [catRes, colorRes, brandRes] = await Promise.all([
      supabase.from('categories').select('id, name').order('name'),
      supabase.from('colors').select('id, name, hex_code').order('name'),
      supabase.from('products').select('brand_name').eq('is_active', true).neq('brand_name', null),
    ])

    if (catRes.data) this.filterData.categories = catRes.data
    if (colorRes.data) this.filterData.colors = colorRes.data
    if (brandRes.data) {
      const brands = new Set(brandRes.data.map(d => d.brand_name).filter(b => b && b.trim() !== ''))
      this.filterData.brands = Array.from(brands).sort()
    }
  },

  // ── Category Tab ──────────────────────────────────────────────────

  selectCategoryTab(catId) {
    this.activeCategoryTab = catId
    if (catId) {
      this.filters.categories = [catId]
    } else {
      this.filters.categories = []
    }
    this.applyFilters()
  },

  // ── Stock label helper ─────────────────────────────────────────────

  stockLabel(v) {
    const map = { all: 'Semua', available: 'Tersedia', low: 'Hampir Habis', out: 'Habis' }
    return map[v] || 'Stok'
  },

  // ── Wishlist ───────────────────────────────────────────────────────

  async loadWishlists() {
    // 1. Load from localStorage for guests
    try {
      const raw = localStorage.getItem('giva_wishlist')
      const local = raw ? JSON.parse(raw) : []
      if (Array.isArray(local)) this.myWishlists = [...local]
    } catch {}

    // 2. Merge with DB if logged in
    if (!this.customer?.id) return
    try {
      const { data } = await supabase.from('wishlists').select('product_id').eq('customer_id', this.customer.id)
      if (data) {
        const dbIds = data.map(w => w.product_id)
        const merged = Array.from(new Set([...this.myWishlists, ...dbIds]))
        this.myWishlists = merged
        localStorage.setItem('giva_wishlist', JSON.stringify(merged))
      }
    } catch (e) {
      console.warn('Wishlist DB load:', e)
    }
  },

  isInWishlist(productId) {
    return this.myWishlists.includes(productId)
  },

  async toggleWishlist(productId) {
    const isWished = this.isInWishlist(productId)

    // Optimistic update
    if (isWished) {
      this.myWishlists = this.myWishlists.filter(id => id !== productId)
    } else {
      this.myWishlists.push(productId)
    }
    // Persist locally
    try { localStorage.setItem('giva_wishlist', JSON.stringify(this.myWishlists)) } catch {}

    // If not logged in, prompt
    if (!this.customer?.id) {
      // Already updated locally, guest experience is fine
      return
    }

    // Persist to DB
    try {
      if (isWished) {
        await supabase.from('wishlists').delete().eq('customer_id', this.customer.id).eq('product_id', productId)
      } else {
        await supabase.from('wishlists').insert({ customer_id: this.customer.id, product_id: productId })
      }
    } catch (e) {
      console.error('Wishlist toggle error', e)
      // Revert
      await this.loadWishlists()
    }
  },

  // ── Filters & URL ─────────────────────────────────────────────────

  applyFilters() {
    // Sync category tab with pill filter
    if (this.filters.categories.length === 1) {
      this.activeCategoryTab = this.filters.categories[0]
    } else if (this.filters.categories.length === 0) {
      this.activeCategoryTab = null
    }

    // Update URL
    const params = new URLSearchParams()
    if (this.filters.collections.length === 1) params.set('collection', this.filters.collections[0])
    if (this.filters.categories.length === 1) params.set('category', this.filters.categories[0])
    if (this.filters.colors.length === 1) params.set('color', this.filters.colors[0])
    if (this.filters.gift_ready) params.set('gift', 'true')
    if (this.filters.brands.length === 1) params.set('brand', this.filters.brands[0])
    if (this.filters.q) params.set('q', this.filters.q)

    window.history.replaceState({}, '', window.location.pathname + (params.toString() ? '?' + params.toString() : ''))

    this.offset = 0
    this.fetchProducts(true)
  },

  resetFilters() {
    const q = this.filters.q
    this.filters = {
      categories: [],
      brands: [],
      colors: [],
      priceMin: '',
      priceMax: '',
      gift_ready: false,
      stock: 'all',
      q,
      sort: 'newest',
      collections: [],
    }
    this.activeCategoryTab = null
    this.applyFilters()
  },

  // ── Pagination ─────────────────────────────────────────────────────

  async loadMore() {
    if (!this.hasMore || this.loadingMore) return
    this.loadingMore = true
    this.offset += this.pageSize
    await this.fetchProducts(false)
    this.loadingMore = false
  },

  // ── Fetch Products ────────────────────────────────────────────────

  async fetchProducts(isRefresh = true) {
    if (isRefresh) {
      this.loading = true
      this.displayedProducts = []
    }

    try {
      // Build PRODUCT_SELECT with brand_name and is_gift_ready
      const selectStr = `
        id, sku, name, sell_price, image_url, category_id, brand_name, is_gift_ready, created_at,
        categories ( name ),
        stock_available ( available_quantity, variant_id ),
        product_variants (
          id, is_active, color_id,
          colors ( id, name, hex_code ),
          stock_available ( available_quantity )
        )
      `

      let query = supabase
        .from('products')
        .select(selectStr, { count: 'exact' })
        .eq('is_active', true)

      // Search
      if (this.filters.q) {
        query = query.or(`name.ilike.%${this.filters.q}%,brand_name.ilike.%${this.filters.q}%,description.ilike.%${this.filters.q}%`)
      }

      // Gift ready
      if (this.filters.gift_ready) query = query.eq('is_gift_ready', true)

      // Brand
      if (this.filters.brands.length > 0) query = query.in('brand_name', this.filters.brands)

      // Price
      if (this.filters.priceMin !== '') query = query.gte('sell_price', Number(this.filters.priceMin))
      if (this.filters.priceMax !== '') query = query.lte('sell_price', Number(this.filters.priceMax))

      // Relational filters: collections & colors require ID pre-fetch
      let productIdsToFetch = null
      if (this.filters.collections.length > 0 || this.filters.colors.length > 0) {
        let validByCollection = null
        let validByColor = null

        if (this.filters.collections.length > 0) {
          const { data: cp } = await supabase.from('collection_products').select('product_id').in('collection_id', this.filters.collections)
          validByCollection = (cp || []).map(r => r.product_id)
        }
        if (this.filters.colors.length > 0) {
          const { data: vp } = await supabase.from('product_variants').select('product_id').in('color_id', this.filters.colors).eq('is_active', true)
          validByColor = (vp || []).map(r => r.product_id)
        }

        if (validByCollection && validByColor) {
          productIdsToFetch = validByCollection.filter(id => validByColor.includes(id))
        } else {
          productIdsToFetch = validByCollection || validByColor
        }

        if ((productIdsToFetch || []).length === 0) {
          if (isRefresh) { this.displayedProducts = []; this.totalFiltered = 0; this.hasMore = false }
          this.loading = false
          return
        }
        query = query.in('id', productIdsToFetch)
      }

      // Categories (from pill or tab)
      if (this.filters.categories.length > 0) {
        query = query.in('category_id', this.filters.categories)
      }

      // Sort
      switch (this.filters.sort) {
        case 'price_asc':  query = query.order('sell_price', { ascending: true }); break
        case 'price_desc': query = query.order('sell_price', { ascending: false }); break
        case 'name_asc':   query = query.order('name', { ascending: true }); break
        case 'brand_asc':  query = query.order('brand_name', { ascending: true }); break
        default:           query = query.order('created_at', { ascending: false }); break
      }

      // Pagination
      query = query.range(this.offset, this.offset + this.pageSize - 1)

      const { data, count, error } = await query
      if (error) throw error

      const mapped = (data || []).map(row => {
        const prod = mapProductRow(row)
        // Extend with extra fields
        prod.brand_name = row.brand_name || null
        prod.is_gift_ready = row.is_gift_ready || false
        return prod
      })

      // Apply client-side stock filter (since stock is computed, not a DB column)
      const filtered = this.applyStockFilter(mapped)

      if (isRefresh) {
        this.displayedProducts = filtered
        this.totalFiltered = count || 0
      } else {
        this.displayedProducts = [...this.displayedProducts, ...filtered]
      }

      this.hasMore = this.displayedProducts.length < (count || 0)

    } catch (err) {
      console.error('Fetch products error:', err)
    } finally {
      this.loading = false
    }
  },

  applyStockFilter(products) {
    if (this.filters.stock === 'all') return products
    return products.filter(p => {
      if (this.filters.stock === 'available') return p.total_stock > 3
      if (this.filters.stock === 'low')       return p.total_stock > 0 && p.total_stock <= 3
      if (this.filters.stock === 'out')       return p.total_stock === 0
      return true
    })
  },

  // ── Discount helpers for product cards ──────────────────────────────────────────

  getProductDiscount(product) {
    if (!product || !this.activeDiscounts.length) return null
    return computeDiscountForProduct(
      { id: product.id, category_id: product.category_id, sell_price: product.sell_price },
      this.activeDiscounts
    )
  },

  getDiscountedPrice(product) {
    const d = this.getProductDiscount(product)
    if (!d) return null
    const amt = computeDiscountAmount(d, product.sell_price)
    return Math.max(0, product.sell_price - amt)
  },

  getDiscountPercent(product) {
    const d = this.getProductDiscount(product)
    if (!d) return 0
    if (d.type === 'percentage') return Math.round(d.value)
    const saving = computeDiscountAmount(d, product.sell_price)
    return Math.round(saving / product.sell_price * 100)
  },

}))

Alpine.start()
