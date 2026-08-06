/**
 * src/admin/stock.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Halaman Manajemen Stok — Admin Giva Store
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '../style.css'
import Alpine from 'alpinejs'
import { supabase }                          from '../supabaseClient.js'
import { requireAuth, getStaffUser, getStaffRole, signOut } from './auth.js'
import { initSidebar } from '../../admin/js/sidebar.js'


window.Alpine = Alpine

Alpine.data('stockAdmin', () => ({

  // ── Auth / staff ──────────────────────────────────────────────────────────
  staffUser:   { name: '—', email: '—' },
  staffId:     null,
  staffRole:   null,
  isAdmin:     false,
  sidebarOpen: false,

  // ── Data ──────────────────────────────────────────────────────────────────
  stockRows:   [],    // semua baris stok dari DB
  locations:   [],    // untuk dropdown filter
  colors:      [],    // untuk dropdown filter

  // ── Loading / alert ───────────────────────────────────────────────────────
  loading:  true,
  alert: { show: false, type: 'success', message: '' },

  // ── Filter & Search ───────────────────────────────────────────────────────
  searchQuery:   '',
  filterLocation: '',   // '' = semua lokasi
  filterColor:    '',   // '' = semua warna
  filterStock:    'all', // 'all' | 'available' | 'empty'

  // ── Expand: detail stok per produk ────────────────────────────────────────
  expandedProductId: null,   // product_id yang sedang di-expand

  // ── Correction modal ──────────────────────────────────────────────────────
  showCorrectionModal: false,
  correcting:          false,
  correctionRow:       null,   // baris stok yang dikoreksi
  correctionForm: {
    quantity: '',
    category: '',
    reason:   '',
  },

  // ── Computed: filtered rows ───────────────────────────────────────────────
  get filtered() {
    let result = []
    const q = this.searchQuery.trim().toLowerCase()

    for (const group of this.stockRows) {
      // 1. Search filter applies to product
      let matchSearch = true
      if (q) {
        matchSearch = (group.product_name.toLowerCase().includes(q) || (group.sku && group.sku.toLowerCase().includes(q)))
      }
      if (!matchSearch) continue

      // 2. Filter variants
      let filteredVariants = group.variants

      if (this.filterLocation) {
        filteredVariants = filteredVariants.filter(r => String(r.location_id) === this.filterLocation)
      }
      if (this.filterColor) {
        filteredVariants = filteredVariants.filter(r => String(r.color_id) === this.filterColor)
      }

      // Filter status stok applies to available_quantity
      if (this.filterStock === 'available') {
        if (!filteredVariants.some(v => v.available_quantity > 0)) {
          filteredVariants = []
        }
      }
      if (this.filterStock === 'empty') {
        if (!filteredVariants.every(v => v.available_quantity === 0)) {
          filteredVariants = []
        }
      }

      // Only include product if it has any matching variants
      if (filteredVariants.length > 0) {
        result.push({
          ...group,
          filteredVariants // Store the filtered variants to render in expanded view
        })
      }
    }

    // Default expand jika sisa 1 produk
    if (result.length === 1 && this.expandedProductId !== result[0].product_id) {
      this.expandedProductId = result[0].product_id
    }

    return result
  },

  // ── Init ──────────────────────────────────────────────────────────────────
  async init() {
    await requireAuth()
    this.staffUser = await getStaffUser()
    this.staffRole = await getStaffRole()
    this.isAdmin   = this.staffRole === 'admin'
    initSidebar(this.staffUser, () => this.logout())
    const me = await supabase.auth.getUser()
    this.staffId = me?.data?.user?.id ?? null

    await Promise.all([
      this.fetchStock(),
      this.fetchLocations(),
      this.fetchColors(),
    ])
  },

  async logout() {
    await signOut()
  },

  // ── Data fetching ─────────────────────────────────────────────────────────

  async fetchStock() {
    this.loading = true
    try {
      const { data, error } = await supabase
        .from('stock')
        .select(`
          id, product_id, location_id, variant_id, quantity, reserved_quantity, updated_at,
          products ( id, name, sku ),
          locations ( id, name ),
          product_variants (
            id, color_id,
            colors ( id, name, hex_code )
          )
        `)
        .order('product_id', { ascending: true })

      if (error) throw error

      const rawRows = (data || []).map(r => ({
        id:            r.id,
        product_id:    r.product_id,
        location_id:   r.location_id,
        variant_id:    r.variant_id,
        quantity:           r.quantity ?? 0,
        reserved_quantity:  r.reserved_quantity ?? 0,
        available_quantity: (r.quantity ?? 0) - (r.reserved_quantity ?? 0),
        updated_at:    r.updated_at,
        // Product info
        product_name:  r.products?.name  ?? '—',
        sku:           r.products?.sku   ?? '—',
        // Location
        location_name: r.locations?.name ?? '—',
        // Color / variant
        color_id:      r.product_variants?.colors?.id      ?? null,
        color_name:    r.product_variants?.colors?.name    ?? null,
        color_hex:     r.product_variants?.colors?.hex_code ?? null,
      }))

      const grouped = {}
      for (const row of rawRows) {
        if (!grouped[row.product_id]) {
          grouped[row.product_id] = {
            product_id: row.product_id,
            product_name: row.product_name,
            sku: row.sku,
            variants: [],
            total_quantity: 0,
            total_reserved: 0,
            total_available: 0,
            updated_at: '1970-01-01'
          }
        }
        grouped[row.product_id].variants.push(row)
        grouped[row.product_id].total_quantity  += row.quantity
        grouped[row.product_id].total_reserved  += row.reserved_quantity
        grouped[row.product_id].total_available += row.available_quantity
        if (row.updated_at > grouped[row.product_id].updated_at) {
            grouped[row.product_id].updated_at = row.updated_at
        }
      }

      this.stockRows = Object.values(grouped).map(group => {
        group.variants.sort((a, b) => {
          if (!a.variant_id && b.variant_id) return -1
          if (a.variant_id && !b.variant_id) return 1
          return (a.color_name || '').localeCompare(b.color_name || '', 'id')
        })
        return group
      }).sort((a, b) => a.product_name.localeCompare(b.product_name, 'id'))

    } catch (err) {
      this.showAlert('error', 'Gagal memuat data stok: ' + err.message)
    } finally {
      this.loading = false
    }
  },

  async fetchLocations() {
    const { data } = await supabase
      .from('locations')
      .select('id, name')
      .order('name', { ascending: true })
    this.locations = data || []
  },

  async fetchColors() {
    const { data } = await supabase
      .from('colors')
      .select('id, name, hex_code')
      .order('name', { ascending: true })
    this.colors = data || []
  },

  // ── Expand per-product breakdown ──────────────────────────────────────────

  toggleExpand(productId) {
    this.expandedProductId = this.expandedProductId === productId ? null : productId
  },

  // ── Correction modal ──────────────────────────────────────────────────────

  openCorrection(row) {
    this.correctionRow  = row
    this.correctionForm = { quantity: row.quantity, category: '', reason: '' }
    this.showCorrectionModal = true
  },

  closeCorrection() {
    this.showCorrectionModal = false
    this.correctionRow  = null
    this.correctionForm = { quantity: '', category: '', reason: '' }
  },

  async saveCorrection() {
    if (this.correcting) return
    const qty = Number(this.correctionForm.quantity)
    if (isNaN(qty) || qty < 0) {
      this.showAlert('error', 'Stok aktual tidak boleh kurang dari 0.')
      return
    }
    if (!this.correctionForm.category) {
      this.showAlert('error', 'Pilih kategori alasan terlebih dahulu.')
      return
    }
    if (this.correctionForm.reason.trim().length < 10) {
      this.showAlert('error', 'Alasan koreksi minimal 10 karakter.')
      return
    }

    this.correcting = true
    try {
      const row       = this.correctionRow
      const qtyBefore = row.quantity
      const reasonFull = `${this.correctionForm.category}: ${this.correctionForm.reason.trim()}`

      // 1. Update stock quantity
      const { error: upErr } = await supabase
        .from('stock')
        .update({ quantity: qty, updated_at: new Date().toISOString() })
        .eq('id', row.id)

      if (upErr) throw upErr

      // 2. Log ke stock_adjustments
      const { error: logErr } = await supabase
        .from('stock_adjustments')
        .insert({
          stock_id:        row.id,
          product_id:      row.product_id,
          variant_id:      row.variant_id   ?? null,
          location_id:     row.location_id  ?? null,
          quantity_before: qtyBefore,
          quantity_after:  qty,
          reason:          reasonFull,
          adjusted_by:     this.staffId,
        })

      if (logErr && !logErr.message?.includes('does not exist')) {
        console.warn('stock_adjustments log error:', logErr.message)
      }

      this.showAlert('success', `Stok berhasil dikoreksi: ${qtyBefore} → ${qty}.`)
      this.closeCorrection()
      await this.refetchProductStock(row.product_id)

    } catch (err) {
      this.showAlert('error', 'Gagal menyimpan koreksi: ' + err.message)
    } finally {
      this.correcting = false
    }
  },

  async refetchProductStock(productId) {
    try {
      const { data, error } = await supabase
        .from('stock')
        .select(`
          id, product_id, location_id, variant_id, quantity, reserved_quantity, updated_at,
          products ( id, name, sku ),
          locations ( id, name ),
          product_variants (
            id, color_id,
            colors ( id, name, hex_code )
          )
        `)
        .eq('product_id', productId)

      if (error) throw error

      const rawRows = (data || []).map(r => ({
        id:            r.id,
        product_id:    r.product_id,
        location_id:   r.location_id,
        variant_id:    r.variant_id,
        quantity:           r.quantity ?? 0,
        reserved_quantity:  r.reserved_quantity ?? 0,
        available_quantity: (r.quantity ?? 0) - (r.reserved_quantity ?? 0),
        updated_at:    r.updated_at,
        product_name:  r.products?.name  ?? '—',
        sku:           r.products?.sku   ?? '—',
        location_name: r.locations?.name ?? '—',
        color_id:      r.product_variants?.colors?.id      ?? null,
        color_name:    r.product_variants?.colors?.name    ?? null,
        color_hex:     r.product_variants?.colors?.hex_code ?? null,
      }))

      const idx = this.stockRows.findIndex(g => g.product_id === productId)
      if (idx !== -1) {
        const group = this.stockRows[idx]
        group.variants = rawRows.sort((a, b) => {
          if (!a.variant_id && b.variant_id) return -1
          if (a.variant_id && !b.variant_id) return 1
          return (a.color_name || '').localeCompare(b.color_name || '', 'id')
        })
        group.total_quantity  = rawRows.reduce((sum, v) => sum + v.quantity, 0)
        group.total_reserved  = rawRows.reduce((sum, v) => sum + v.reserved_quantity, 0)
        group.total_available = rawRows.reduce((sum, v) => sum + v.available_quantity, 0)
        group.updated_at = rawRows.reduce((latest, v) => (v.updated_at > latest ? v.updated_at : latest), '1970-01-01')
        this.stockRows.splice(idx, 1, { ...group })
      }
    } catch (err) {
      console.error('Failed to refetch product stock:', err)
    }
  },

  // ── Helpers ───────────────────────────────────────────────────────────────

  formatDate(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  },

  showAlert(type, message) {
    this.alert = { show: true, type, message }
    setTimeout(() => { this.alert.show = false }, 4000)
  },
}))

Alpine.start()
