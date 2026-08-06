/**
 * src/admin/stock-zero.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Halaman Stok Nol — menampilkan semua varian dengan available_quantity = 0
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '../style.css'
import Alpine from 'alpinejs'
import { supabase }                                     from '../supabaseClient.js'
import { requireAuth, getStaffUser, getStaffRole, signOut } from './auth.js'
import { initSidebar }                                  from '../../admin/js/sidebar.js'

window.Alpine = Alpine

Alpine.data('stockZeroAdmin', () => ({

  // ── Auth / staff ──────────────────────────────────────────────────────────
  staffUser: { name: '—', email: '—' },
  staffId:   null,
  staffRole: null,
  isAdmin:   false,

  // ── Data ──────────────────────────────────────────────────────────────────
  rows:       [],   // semua baris stok nol
  categories: [],
  locations:  [],
  colors:     [],

  // ── Summary ───────────────────────────────────────────────────────────────
  totalProducts:     0,
  totalVariants:     0,
  totalReservedValue: 0,

  // ── Loading / alert ───────────────────────────────────────────────────────
  loading: true,
  alert:   { show: false, type: 'success', message: '' },

  // ── Filters ───────────────────────────────────────────────────────────────
  searchQuery:    '',
  filterCategory: '',
  filterLocation: '',
  filterColor:    '',

  // ── Modal ─────────────────────────────────────────────────────────────────
  showModal: false,
  saving:    false,
  modalRow:  null,
  modalForm: { quantity: '', category: '', reason: '' },

  // ── Computed ──────────────────────────────────────────────────────────────
  get filtered() {
    const q = this.searchQuery.trim().toLowerCase()
    return this.rows.filter(row => {
      if (q && !(
        (row.product_name || '').toLowerCase().includes(q) ||
        (row.sku || '').toLowerCase().includes(q)
      )) return false
      if (this.filterCategory && String(row.category_id) !== this.filterCategory) return false
      if (this.filterLocation && String(row.location_id) !== this.filterLocation) return false
      if (this.filterColor    && String(row.color_id)    !== this.filterColor)    return false
      return true
    })
  },

  // ── Init ──────────────────────────────────────────────────────────────────
  async init() {
    await requireAuth()
    this.staffUser = await getStaffUser()
    this.staffRole = await getStaffRole()
    this.isAdmin   = this.staffRole === 'admin'
    initSidebar(this.staffUser, () => signOut())

    const me = await supabase.auth.getUser()
    this.staffId = me?.data?.user?.id ?? null

    await Promise.all([
      this.fetchData(),
      this.fetchCategories(),
      this.fetchLocations(),
      this.fetchColors(),
    ])
  },

  // ── Data fetching ─────────────────────────────────────────────────────────

  async fetchData() {
    this.loading = true
    try {
      // Ambil semua baris stok dengan available_quantity = 0
      // available_quantity = quantity - reserved_quantity
      // Kita filter di sisi client karena tidak ada kolom computed di Supabase
      const { data, error } = await supabase
        .from('stock')
        .select(`
          id, product_id, location_id, variant_id, quantity, reserved_quantity, updated_at,
          products ( id, name, sku, category_id, cost_price,
            categories ( id, name )
          ),
          locations ( id, name ),
          product_variants (
            id, color_id,
            colors ( id, name, hex_code )
          )
        `)
        .order('updated_at', { ascending: false })

      if (error) throw error

      const rawRows = (data || [])
        .map(r => {
          const available = (r.quantity ?? 0) - (r.reserved_quantity ?? 0)
          return {
            id:                r.id,
            product_id:        r.product_id,
            location_id:       r.location_id,
            variant_id:        r.variant_id,
            quantity:          r.quantity ?? 0,
            reserved_quantity: r.reserved_quantity ?? 0,
            available_quantity: available,
            updated_at:        r.updated_at,
            // Product
            product_name:  r.products?.name     ?? '—',
            sku:           r.products?.sku      ?? '—',
            category_id:   r.products?.category_id ?? null,
            category_name: r.products?.categories?.name ?? '—',
            cost_price:    r.products?.cost_price ?? 0,
            // Location
            location_name: r.locations?.name ?? '—',
            // Color
            color_id:   r.product_variants?.colors?.id      ?? null,
            color_name: r.product_variants?.colors?.name    ?? null,
            color_hex:  r.product_variants?.colors?.hex_code ?? null,
          }
        })
        .filter(r => r.available_quantity <= 0)

      this.rows = rawRows

      // Summary
      const distinctProducts = new Set(rawRows.map(r => r.product_id))
      this.totalProducts     = distinctProducts.size
      this.totalVariants     = rawRows.length
      this.totalReservedValue = rawRows.reduce((sum, r) =>
        sum + (r.reserved_quantity * r.cost_price), 0)

    } catch (err) {
      this.showAlert('error', 'Gagal memuat data: ' + err.message)
    } finally {
      this.loading = false
    }
  },

  async fetchCategories() {
    const { data } = await supabase.from('categories').select('id, name').order('name')
    this.categories = data || []
  },

  async fetchLocations() {
    const { data } = await supabase.from('locations').select('id, name').order('name')
    this.locations = data || []
  },

  async fetchColors() {
    const { data } = await supabase.from('colors').select('id, name, hex_code').order('name')
    this.colors = data || []
  },

  // ── Modal ─────────────────────────────────────────────────────────────────

  openCorrection(row) {
    this.modalRow  = row
    this.modalForm = { quantity: '', category: '', reason: '' }
    this.showModal = true
  },

  closeModal() {
    this.showModal = false
    this.modalRow  = null
    this.modalForm = { quantity: '', category: '', reason: '' }
  },

  async saveCorrection() {
    if (this.saving) return
    const qty = Number(this.modalForm.quantity)
    if (isNaN(qty) || qty < 0) {
      this.showAlert('error', 'Stok aktual tidak boleh kurang dari 0.')
      return
    }
    if (!this.modalForm.category) {
      this.showAlert('error', 'Pilih kategori alasan terlebih dahulu.')
      return
    }
    if (this.modalForm.reason.trim().length < 10) {
      this.showAlert('error', 'Alasan koreksi minimal 10 karakter.')
      return
    }

    this.saving = true
    try {
      const row        = this.modalRow
      const reasonFull = `${this.modalForm.category}: ${this.modalForm.reason.trim()}`

      // 1. UPDATE stock
      const { error: upErr } = await supabase
        .from('stock')
        .update({ quantity: qty, updated_at: new Date().toISOString() })
        .eq('id', row.id)

      if (upErr) throw upErr

      // 2. INSERT stock_adjustments
      const { error: logErr } = await supabase
        .from('stock_adjustments')
        .insert({
          stock_id:        row.id,
          product_id:      row.product_id,
          variant_id:      row.variant_id  ?? null,
          location_id:     row.location_id ?? null,
          quantity_before: 0,
          quantity_after:  qty,
          reason:          reasonFull,
          adjusted_by:     this.staffId,
        })

      if (logErr && !logErr.message?.includes('does not exist')) {
        console.warn('stock_adjustments insert error:', logErr.message)
      }

      this.showAlert('success', `Stok berhasil dikoreksi: 0 → ${qty}.`)
      this.closeModal()
      // Refresh — kalau stok jadi > 0, baris hilang dari halaman ini
      await this.fetchData()

    } catch (err) {
      this.showAlert('error', 'Gagal menyimpan koreksi: ' + err.message)
    } finally {
      this.saving = false
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

  formatRupiah(val) {
    if (!val && val !== 0) return '—'
    return 'Rp ' + Number(val).toLocaleString('id-ID')
  },

  showAlert(type, message) {
    this.alert = { show: true, type, message }
    setTimeout(() => { this.alert.show = false }, 4500)
  },
}))

Alpine.start()
