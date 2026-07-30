import '../style.css'
import Alpine from 'alpinejs'
import { supabase } from '../supabaseClient.js'
import { requireAuth, getStaffUser } from './auth.js'

window.Alpine = Alpine

Alpine.data('collectionProductsAdmin', () => ({
  collectionId: null,
  collection: { name: '', subtitle: '' },
  
  assignedProducts: [],
  loadingAssigned: true,
  
  searchQuery: '',
  searchResults: [],
  loadingSearch: false,

  staffUser: { name: '—', email: '—' },
  sidebarOpen: false,

  async init() {
    await requireAuth()
    this.staffUser = getStaffUser()
    
    const params = new URLSearchParams(window.location.search)
    this.collectionId = params.get('id')
    
    if (!this.collectionId) {
      alert('ID Koleksi tidak valid.')
      window.location.href = '/admin/collections.html'
      return
    }

    await this.fetchCollectionDetails()
    await this.fetchAssignedProducts()
  },

  async fetchCollectionDetails() {
    const { data, error } = await supabase
      .from('collections')
      .select('name, subtitle')
      .eq('id', this.collectionId)
      .single()

    if (error) {
      console.error(error)
      return
    }
    if (data) {
      this.collection = data
    }
  },

  async fetchAssignedProducts() {
    this.loadingAssigned = true
    try {
      const { data, error } = await supabase
        .from('collection_products')
        .select(`
          id, sort_order, product_id,
          products ( id, name, sku, brand_name, image_url )
        `)
        .eq('collection_id', this.collectionId)
        .order('sort_order', { ascending: true })

      if (error) throw error
      this.assignedProducts = data || []
      
      // Update search list to remove items that are now assigned
      if (this.searchResults.length > 0) {
        const assignedIds = this.assignedProducts.map(ap => ap.product_id)
        this.searchResults = this.searchResults.filter(p => !assignedIds.includes(p.id))
      }
    } catch (err) {
      console.error(err)
      alert('Gagal memuat produk koleksi')
    } finally {
      this.loadingAssigned = false
    }
  },

  async searchProducts() {
    const q = this.searchQuery.trim().toLowerCase()
    if (!q) {
      this.searchResults = []
      return
    }

    this.loadingSearch = true
    try {
      const assignedIds = this.assignedProducts.map(ap => ap.product_id)

      let query = supabase
        .from('products')
        .select('id, name, sku, brand_name, image_url')
        .eq('is_active', true)
        
      if (assignedIds.length > 0) {
        query = query.not('id', 'in', `(${assignedIds.join(',')})`)
      }

      // using or for name/sku/brand_name search
      query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%,brand_name.ilike.%${q}%`)
      query = query.limit(20)

      const { data, error } = await query

      if (error) throw error
      this.searchResults = data || []
    } catch (err) {
      console.error(err)
    } finally {
      this.loadingSearch = false
    }
  },

  async addProduct(product) {
    try {
      const { error } = await supabase
        .from('collection_products')
        .insert({
          collection_id: this.collectionId,
          product_id: product.id,
          sort_order: 0
        })
        
      if (error) throw error
      
      // Optimistically remove from search results
      this.searchResults = this.searchResults.filter(p => p.id !== product.id)
      
      // Refetch assigned
      await this.fetchAssignedProducts()
    } catch (err) {
      console.error(err)
      alert('Gagal menambah produk ke koleksi')
    }
  },

  async removeProduct(relId) {
    if (!confirm('Hapus produk ini dari koleksi?')) return
    
    try {
      const { error } = await supabase
        .from('collection_products')
        .delete()
        .eq('id', relId)
        
      if (error) throw error
      
      // Refetch assigned
      await this.fetchAssignedProducts()
      // Optional: re-trigger search so the removed item pops back in if it matches query
      if (this.searchQuery) {
        this.searchProducts()
      }
    } catch (err) {
      console.error(err)
      alert('Gagal menghapus produk')
    }
  },

  async updateSortOrder(relId, val) {
    const newVal = Number(val) || 0
    // Optimistic update locally
    const item = this.assignedProducts.find(ap => ap.id === relId)
    if (item && item.sort_order === newVal) return // No change
    
    if (item) item.sort_order = newVal
    
    // Sort locally immediately
    this.assignedProducts.sort((a, b) => a.sort_order - b.sort_order)

    // Save to DB
    try {
      const { error } = await supabase
        .from('collection_products')
        .update({ sort_order: newVal })
        .eq('id', relId)
        
      if (error) throw error
    } catch (err) {
      console.error(err)
      alert('Gagal mengubah urutan')
      await this.fetchAssignedProducts() // Revert on error
    }
  }

}))

Alpine.start()
