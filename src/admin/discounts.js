/**
 * src/admin/discounts.js
 * Halaman Admin — Manajemen Diskon Giva Store.
 */

import '../style.css'
import Alpine from 'alpinejs'
import { supabase } from '../supabaseClient.js'
import { requireAuth, getStaffUser, signOut } from './auth.js'
import { initSidebar } from '../../admin/js/sidebar.js'

window.Alpine = Alpine

Alpine.data('discountsAdmin', () => ({
  staffUser: { name: '—', email: '—' },
  discounts: [],
  categories: [],
  loading: true,
  saving: false,
  searchQuery: '',
  filterStatus: 'all',
  filterType: 'all',
  showModal: false,
  isEditing: false,
  productSearch: '',
  productSearchResults: [],
  searchingProducts: false,
  alert: { show: false, type: 'success', message: '' },
  showDeleteConfirm: false,
  deletingId: null,
  deletingName: '',
  form: {
    id: null, name: '', description: '',
    discount_type: 'auto', code: '',
    type: 'percentage', value: '',
    max_discount_amount: '',
    applies_to: 'all', target_id: '', target_name: '',
    min_order_amount: 0, channel: 'all',
    start_date: '', end_date: '',
    usage_limit: '', is_active: true,
  },

  get filteredDiscounts() {
    let list = this.discounts
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.trim().toLowerCase()
      list = list.filter(d =>
        (d.name || '').toLowerCase().includes(q) ||
        (d.code || '').toLowerCase().includes(q)
      )
    }
    if (this.filterType !== 'all') {
      list = list.filter(d => d.discount_type === this.filterType)
    }
    if (this.filterStatus !== 'all') {
      list = list.filter(d => this.getDiscountStatus(d).key === this.filterStatus)
    }
    return list
  },

  get discountPreview() {
    const name = this.form.name || '[Nama Diskon]'
    const val  = this.form.value
    if (!val) return 'Diskon ' + name + ': hemat [nilai] untuk [berlaku untuk]'
    let valueStr = ''
    if (this.form.type === 'percentage') {
      valueStr = val + '%'
      if (this.form.max_discount_amount) {
        valueStr += ' (maks ' + this.formatPrice(this.form.max_discount_amount) + ')'
      }
    } else {
      valueStr = this.formatPrice(val)
    }
    let appliesToStr = 'semua produk'
    if (this.form.applies_to === 'category') {
      appliesToStr = this.form.target_name ? 'kategori "' + this.form.target_name + '"' : 'kategori tertentu'
    } else if (this.form.applies_to === 'product') {
      appliesToStr = this.form.target_name ? 'produk "' + this.form.target_name + '"' : 'produk tertentu'
    }
    let channelStr = ''
    if (this.form.channel === 'offline') channelStr = ' (kasir saja)'
    else if (this.form.channel === 'online') channelStr = ' (online saja)'
    if (Number(this.form.min_order_amount) > 0) {
      return 'Diskon ' + name + ': hemat ' + valueStr + ' untuk ' + appliesToStr + channelStr + '. Min. pembelian ' + this.formatPrice(this.form.min_order_amount) + '.'
    }
    return 'Diskon ' + name + ': hemat ' + valueStr + ' untuk ' + appliesToStr + channelStr + '.'
  },

  async init() {
    try { await requireAuth() } catch { return }
    this.staffUser = await getStaffUser()
    initSidebar(this.staffUser, () => signOut())
    await Promise.all([this.fetchDiscounts(), this.fetchCategories()])
  },

  async fetchDiscounts() {
    this.loading = true
    try {
      const { data, error } = await supabase
        .from('discounts')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      this.discounts = data || []
    } catch (err) {
      this.showAlert('error', 'Gagal memuat diskon: ' + err.message)
    } finally {
      this.loading = false
    }
  },

  async fetchCategories() {
    try {
      const { data } = await supabase.from('categories').select('id, name').order('name')
      this.categories = data || []
    } catch {}
  },

  async searchProducts() {
    const q = this.productSearch.trim()
    if (!q) { this.productSearchResults = []; return }
    this.searchingProducts = true
    try {
      const { data } = await supabase
        .from('products')
        .select('id, name, sku')
        .or('name.ilike.%' + q + '%,sku.ilike.%' + q + '%')
        .eq('is_active', true)
        .limit(10)
      this.productSearchResults = data || []
    } catch {} finally {
      this.searchingProducts = false
    }
  },

  selectProduct(product) {
    this.form.target_id   = product.id
    this.form.target_name = product.name
    this.productSearch    = product.name
    this.productSearchResults = []
  },

  openAddModal() {
    this.isEditing = false
    this.resetForm()
    this.productSearch = ''
    this.productSearchResults = []
    this.showModal = true
  },

  openEditModal(discount) {
    this.isEditing = true
    this.form = {
      id:                  discount.id,
      name:                discount.name        || '',
      description:         discount.description  || '',
      discount_type:       discount.discount_type || 'auto',
      code:                discount.code         || '',
      type:                discount.type         || 'percentage',
      value:               discount.value        ?? '',
      max_discount_amount: discount.max_discount_amount ?? '',
      applies_to:          discount.applies_to   || 'all',
      target_id:           discount.target_id    || '',
      target_name:         '',
      min_order_amount:    discount.min_order_amount ?? 0,
      channel:             discount.channel      || 'all',
      start_date:          discount.start_date   ? discount.start_date.slice(0, 16) : '',
      end_date:            discount.end_date     ? discount.end_date.slice(0, 16)   : '',
      usage_limit:         discount.usage_limit  ?? '',
      is_active:           discount.is_active !== false,
    }
    if (discount.applies_to === 'category' && discount.target_id) {
      const cat = this.categories.find(c => c.id === discount.target_id)
      this.form.target_name = cat?.name || ''
    }
    if (discount.applies_to === 'product' && discount.target_id) {
      supabase.from('products').select('name').eq('id', discount.target_id).maybeSingle()
        .then(({ data }) => {
          if (data) { this.form.target_name = data.name; this.productSearch = data.name }
        })
    }
    this.productSearch = (discount.applies_to === 'product') ? (this.form.target_name || '') : ''
    this.productSearchResults = []
    this.showModal = true
  },

  closeModal() {
    this.showModal = false
    this.resetForm()
  },

  resetForm() {
    this.form = {
      id: null, name: '', description: '',
      discount_type: 'auto', code: '',
      type: 'percentage', value: '',
      max_discount_amount: '',
      applies_to: 'all', target_id: '', target_name: '',
      min_order_amount: 0, channel: 'all',
      start_date: '', end_date: '',
      usage_limit: '', is_active: true,
    }
    this.productSearch = ''
    this.productSearchResults = []
  },

  generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code = ''
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    this.form.code = code
  },

  async saveDiscount() {
    if (!this.form.name.trim()) { this.showAlert('error', 'Nama diskon wajib diisi.'); return }
    if (this.form.discount_type === 'voucher' && !this.form.code.trim()) { this.showAlert('error', 'Kode voucher wajib diisi.'); return }
    if (!this.form.value || Number(this.form.value) <= 0) { this.showAlert('error', 'Nilai diskon harus lebih dari 0.'); return }
    if (this.form.type === 'percentage' && Number(this.form.value) > 100) { this.showAlert('error', 'Persentase diskon maksimal 100%.'); return }
    if (this.form.applies_to !== 'all' && !this.form.target_id) {
      this.showAlert('error', 'Pilih ' + (this.form.applies_to === 'category' ? 'kategori' : 'produk') + ' yang akan didiskon.')
      return
    }

    this.saving = true
    try {
      const codeVal = this.form.discount_type === 'voucher' ? (this.form.code || '').toUpperCase().trim() : null
      const payload = {
        name:                this.form.name.trim(),
        description:         this.form.description.trim() || null,
        discount_type:       this.form.discount_type,
        code:                codeVal,
        type:                this.form.type,
        value:               Number(this.form.value),
        max_discount_amount: (this.form.type === 'percentage' && this.form.max_discount_amount) ? Number(this.form.max_discount_amount) : null,
        applies_to:          this.form.applies_to,
        target_id:           this.form.applies_to !== 'all' ? this.form.target_id : null,
        min_order_amount:    Number(this.form.min_order_amount) || 0,
        channel:             this.form.channel,
        start_date:          this.form.start_date ? new Date(this.form.start_date).toISOString() : null,
        end_date:            this.form.end_date   ? new Date(this.form.end_date).toISOString()   : null,
        usage_limit:         this.form.usage_limit ? Number(this.form.usage_limit) : null,
        is_active:           this.form.is_active,
      }

      if (codeVal) {
        const { data: existing } = await supabase.from('discounts').select('id').eq('code', codeVal).maybeSingle()
        if (existing && existing.id !== this.form.id) {
          this.showAlert('error', 'Kode voucher "' + codeVal + '" sudah digunakan diskon lain.')
          this.saving = false
          return
        }
      }

      let err2
      if (this.isEditing) {
        const res = await supabase.from('discounts').update(payload).eq('id', this.form.id)
        err2 = res.error
      } else {
        payload.usage_count = 0
        const res = await supabase.from('discounts').insert(payload)
        err2 = res.error
      }

      if (err2) throw err2
      this.showAlert('success', this.isEditing ? 'Diskon berhasil diperbarui.' : 'Diskon berhasil ditambahkan.')
      this.closeModal()
      await this.fetchDiscounts()
    } catch (err) {
      this.showAlert('error', 'Gagal menyimpan diskon: ' + err.message)
    } finally {
      this.saving = false
    }
  },

  async toggleActive(discount) {
    try {
      const { error } = await supabase.from('discounts').update({ is_active: !discount.is_active }).eq('id', discount.id)
      if (error) throw error
      discount.is_active = !discount.is_active
      this.showAlert('success', 'Diskon "' + discount.name + '" ' + (discount.is_active ? 'diaktifkan' : 'dinonaktifkan') + '.')
    } catch (err) {
      this.showAlert('error', 'Gagal mengubah status: ' + err.message)
    }
  },

  confirmDelete(discount) {
    this.deletingId   = discount.id
    this.deletingName = discount.name
    this.showDeleteConfirm = true
  },

  async deleteDiscount() {
    if (!this.deletingId) return
    try {
      const { error } = await supabase.from('discounts').delete().eq('id', this.deletingId)
      if (error) throw error
      this.discounts = this.discounts.filter(d => d.id !== this.deletingId)
      this.showAlert('success', 'Diskon "' + this.deletingName + '" berhasil dihapus.')
    } catch (err) {
      this.showAlert('error', 'Gagal menghapus: ' + err.message)
    } finally {
      this.showDeleteConfirm = false
      this.deletingId = null
      this.deletingName = ''
    }
  },

  getDiscountStatus(discount) {
    const now = new Date()
    if (!discount.is_active) return { key: 'inactive', label: 'Nonaktif', cls: 'bg-stone/10 text-stone border-stone/20' }
    if (discount.start_date && new Date(discount.start_date) > now) {
      return { key: 'upcoming', label: 'Belum Mulai', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
    }
    if (discount.end_date && new Date(discount.end_date) < now) {
      return { key: 'expired', label: 'Sudah Berakhir', cls: 'bg-red-50 text-red-600 border-red-200' }
    }
    if (discount.usage_limit && discount.usage_count >= discount.usage_limit) {
      return { key: 'expired', label: 'Habis', cls: 'bg-red-50 text-red-600 border-red-200' }
    }
    return { key: 'active', label: 'Aktif', cls: 'bg-sage/10 text-sage-deep border-sage/25' }
  },

  getAppliesToLabel(discount) {
    if (discount.applies_to === 'all') return 'Semua Produk'
    if (discount.applies_to === 'category') return 'Kategori'
    if (discount.applies_to === 'product') return 'Produk Tertentu'
    return discount.applies_to
  },

  getChannelLabel(channel) {
    const map = { all: 'Semua', offline: 'Kasir', online: 'Online' }
    return map[channel] || channel
  },

  getValueLabel(discount) {
    if (discount.type === 'percentage') {
      let s = discount.value + '%'
      if (discount.max_discount_amount) s += ' (maks ' + this.formatPrice(discount.max_discount_amount) + ')'
      return s
    }
    return this.formatPrice(discount.value)
  },

  getPeriodLabel(discount) {
    const fmt = (d) => new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
    if (discount.start_date && discount.end_date) return fmt(discount.start_date) + ' – ' + fmt(discount.end_date)
    if (discount.start_date) return 'Mulai ' + fmt(discount.start_date)
    if (discount.end_date)   return 's/d ' + fmt(discount.end_date)
    return 'Selamanya'
  },

  formatPrice(val) {
    if (val == null || val === '') return '—'
    return 'Rp\u00a0' + Number(val).toLocaleString('id-ID')
  },

  showAlert(type, message) {
    this.alert = { show: true, type, message }
    setTimeout(() => { this.alert.show = false }, 5000)
  },
}))

Alpine.start()
