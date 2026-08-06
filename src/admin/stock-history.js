/**
 * src/admin/stock-history.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Halaman Riwayat Koreksi Stok — log semua penyesuaian dari stock_adjustments
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '../style.css'
import Alpine from 'alpinejs'
import { supabase }                                     from '../supabaseClient.js'
import { requireAuth, getStaffUser, getStaffRole, signOut } from './auth.js'
import { initSidebar }                                  from '../../admin/js/sidebar.js'

window.Alpine = Alpine

// Helper: format YYYY-MM-DD dari Date
function toYMD(date) {
  return date.toISOString().split('T')[0]
}

Alpine.data('stockHistoryAdmin', () => ({

  // ── Auth ─────────────────────────────────────────────────────────────────
  staffUser: { name: '—', email: '—' },

  // ── Data ─────────────────────────────────────────────────────────────────
  rows:      [],   // semua log dalam range
  staffList: [],

  // ── Summary ───────────────────────────────────────────────────────────────
  totalCount:   0,
  totalAdded:   0,
  totalRemoved: 0,

  // ── Loading / alert ───────────────────────────────────────────────────────
  loading: true,
  alert:   { show: false, type: 'success', message: '' },

  // ── Date range — default 30 hari terakhir ──────────────────────────────────
  dateFrom: toYMD(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
  dateTo:   toYMD(new Date()),

  // ── Filters ───────────────────────────────────────────────────────────────
  searchQuery:    '',
  filterStaff:    '',
  filterCategory: '',
  filterType:     'all',   // 'all' | 'increase' | 'decrease'

  // ── Pagination ────────────────────────────────────────────────────────────
  perPage:     25,
  currentPage: 1,

  // ── Computed ──────────────────────────────────────────────────────────────
  get filtered() {
    const q = this.searchQuery.trim().toLowerCase()
    return this.rows.filter(row => {
      if (q && !(
        (row.product_name || '').toLowerCase().includes(q) ||
        (row.sku || '').toLowerCase().includes(q)
      )) return false
      if (this.filterStaff    && String(row.staff_id)        !== this.filterStaff)    return false
      if (this.filterCategory && row.reason_category         !== this.filterCategory) return false
      if (this.filterType === 'increase' && row.diff <= 0) return false
      if (this.filterType === 'decrease' && row.diff >= 0) return false
      return true
    })
  },

  get totalPages() {
    return Math.max(1, Math.ceil(this.filtered.length / this.perPage))
  },

  get paginatedRows() {
    const start = (this.currentPage - 1) * this.perPage
    return this.filtered.slice(start, start + this.perPage)
  },

  // ── Watchers (via Alpine $watch) ──────────────────────────────────────────

  // ── Init ──────────────────────────────────────────────────────────────────
  async init() {
    await requireAuth()
    this.staffUser = await getStaffUser()
    initSidebar(this.staffUser, () => signOut())

    await Promise.all([
      this.fetchHistory(),
      this.fetchStaffList(),
    ])

    // Fetch ulang bila tanggal berubah
    this.$watch('dateFrom', () => { this.currentPage = 1; this.fetchHistory() })
    this.$watch('dateTo',   () => { this.currentPage = 1; this.fetchHistory() })
    this.$watch('filtered', () => { this.currentPage = 1 })
  },

  // ── Data fetching ─────────────────────────────────────────────────────────

  async fetchHistory() {
    this.loading = true
    try {
      const from = this.dateFrom ? this.dateFrom + 'T00:00:00' : undefined
      const to   = this.dateTo   ? this.dateTo   + 'T23:59:59' : undefined

      let query = supabase
        .from('stock_adjustments')
        .select(`
          id, stock_id, product_id, variant_id, location_id,
          quantity_before, quantity_after, reason, adjusted_by, created_at,
          products ( id, name, sku ),
          locations ( id, name ),
          product_variants (
            id, color_id,
            colors ( id, name, hex_code )
          ),
          staff:adjusted_by ( id, name )
        `)
        .order('created_at', { ascending: false })

      if (from) query = query.gte('created_at', from)
      if (to)   query = query.lte('created_at', to)

      const { data, error } = await query
      if (error) throw error

      const rawRows = (data || []).map(r => {
        const diff = (r.quantity_after ?? 0) - (r.quantity_before ?? 0)
        // Parse reason: "Kategori: detail" atau raw
        const reasonRaw = r.reason || ''
        const colonIdx  = reasonRaw.indexOf(': ')
        const reasonCategory = colonIdx > -1 ? reasonRaw.substring(0, colonIdx).trim() : ''
        const reasonDetail   = colonIdx > -1 ? reasonRaw.substring(colonIdx + 2).trim() : reasonRaw

        return {
          id:              r.id,
          product_id:      r.product_id,
          variant_id:      r.variant_id,
          location_id:     r.location_id,
          staff_id:        r.adjusted_by,
          quantity_before: r.quantity_before ?? 0,
          quantity_after:  r.quantity_after  ?? 0,
          diff,
          reason_raw:      reasonRaw,
          reason_category: reasonCategory,
          reason_detail:   reasonDetail,
          created_at:      r.created_at,
          // Product
          product_name: r.products?.name ?? '—',
          sku:          r.products?.sku  ?? '—',
          // Location
          location_name: r.locations?.name ?? '—',
          // Color
          color_name: r.product_variants?.colors?.name     ?? null,
          color_hex:  r.product_variants?.colors?.hex_code ?? null,
          // Staff
          staff_name: r.staff?.name ?? '—',
        }
      })

      this.rows = rawRows

      // Summary
      this.totalCount   = rawRows.length
      this.totalAdded   = rawRows.filter(r => r.diff > 0).reduce((s, r) => s + r.diff, 0)
      this.totalRemoved = rawRows.filter(r => r.diff < 0).reduce((s, r) => s + Math.abs(r.diff), 0)

    } catch (err) {
      this.showAlert('error', 'Gagal memuat riwayat: ' + err.message)
    } finally {
      this.loading = false
    }
  },

  async fetchStaffList() {
    const { data } = await supabase
      .from('staff')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
    this.staffList = data || []
  },

  // ── Export CSV ────────────────────────────────────────────────────────────

  exportCSV() {
    const rows = this.filtered
    if (rows.length === 0) {
      this.showAlert('error', 'Tidak ada data untuk diekspor.')
      return
    }

    const headers = [
      'Tanggal', 'Produk', 'SKU', 'Warna', 'Lokasi',
      'Stok Sebelum', 'Stok Sesudah', 'Selisih',
      'Kategori', 'Alasan', 'Dikoreksi Oleh',
    ]

    const escape = v => {
      const s = String(v ?? '').replace(/"/g, '""')
      return `"${s}"`
    }

    const csvRows = rows.map(r => [
      escape(this.formatDateFull(r.created_at)),
      escape(r.product_name),
      escape(r.sku),
      escape(r.color_name || ''),
      escape(r.location_name),
      escape(r.quantity_before),
      escape(r.quantity_after),
      escape((r.diff > 0 ? '+' : '') + r.diff),
      escape(r.reason_category),
      escape(r.reason_detail || r.reason_raw),
      escape(r.staff_name),
    ].join(','))

    const csv = [headers.map(h => `"${h}"`).join(','), ...csvRows].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href     = url
    link.download = `riwayat-koreksi-stok-${this.dateFrom}-sd-${this.dateTo}.csv`
    link.click()
    URL.revokeObjectURL(url)
  },

  // ── Helpers ───────────────────────────────────────────────────────────────

  formatDateShort(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
  },

  formatTime(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  },

  formatDateFull(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  },

  showAlert(type, message) {
    this.alert = { show: true, type, message }
    setTimeout(() => { this.alert.show = false }, 4500)
  },
}))

Alpine.start()
