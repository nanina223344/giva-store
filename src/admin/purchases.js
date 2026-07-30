import '../style.css'
import Alpine from 'alpinejs'
import { supabase } from '../supabaseClient.js'
import { requireAuth, getStaffUser, getStaffId, signOut } from './auth.js'
import { initSidebar } from '../../admin/js/sidebar.js'


window.Alpine = Alpine

Alpine.data('purchasesAdmin', () => ({
  // ─── View state ───────────────────────────────────────────────────────────
  // 'list' | 'detail'
  view: 'list',

  // ─── Mobile sidebar ───────────────────────────────────────────────────────
  sidebarOpen: false,

  // ─── Staff ────────────────────────────────────────────────────────────────
  staffUser: { name: '—', email: '—' },
  currentUserId: null,     // ← DEPRECATED; gunakan currentStaffId
  currentStaffId: null,    // staff.id (FK valid untuk purchases.created_by)

  // ─── Reference data ───────────────────────────────────────────────────────
  suppliers: [],
  locations: [],
  products: [],

  // ─── List state ───────────────────────────────────────────────────────────
  purchases: [],
  loadingList: true,
  searchQuery: '',
  filterStatus: 'all',

  // ─── Detail state ─────────────────────────────────────────────────────────
  detailMode: 'new',        // 'new' | 'existing'
  currentPurchase: null,    // purchase header row
  currentItems: [],         // purchase_items for current purchase
  loadingDetail: false,

  // ─── New purchase header form ─────────────────────────────────────────────
  form: {
    supplier_id: '',
    location_id: '',
    invoice_no: '',
    purchase_date: new Date().toISOString().slice(0, 10),
    items: [],   // { product_id, product_name, product_sku, product_unit, quantity, unit_cost }
  },

  // ─── Inline "add item" row (shared by new + existing detail) ─────────────
  newItem: { product_id: '', variant_id: '', quantity: 1, unit_cost: '' },
  activeProductVariants: [],

  // ─── Errors ───────────────────────────────────────────────────────────────
  errors: {
    supplier_id: '',
    location_id: '',
    purchase_date: '',
    items: '',
    newItem: { product_id: '', variant_id: '', quantity: '', unit_cost: '' },
  },

  // ─── Saving flags ─────────────────────────────────────────────────────────
  savingPurchase: false,
  addingItem: false,
  removingItemId: null,
  receivingGoods: false,

  // ─── Alert ────────────────────────────────────────────────────────────────
  alert: { show: false, type: 'success', message: '' },

  // ─── Computed ─────────────────────────────────────────────────────────────
  get filtered() {
    let list = this.purchases
    if (this.filterStatus !== 'all') list = list.filter(p => p.status === this.filterStatus)
    const q = this.searchQuery.trim().toLowerCase()
    if (!q) return list
    return list.filter(p =>
      (p.invoice_no    && p.invoice_no.toLowerCase().includes(q))    ||
      (p.supplier_name && p.supplier_name.toLowerCase().includes(q))
    )
  },

  get isLocked() {
    return this.currentPurchase && this.currentPurchase.status !== 'draft'
  },

  get previewTotal() {
    return this.form.items.reduce((s, i) =>
      s + (Number(i.quantity) || 0) * (Number(i.unit_cost) || 0), 0)
  },

  get newItemSubtotal() {
    return (Number(this.newItem.quantity) || 0) * (Number(this.newItem.unit_cost) || 0)
  },

  get draftCount()     { return this.purchases.filter(p => p.status === 'draft').length },
  get receivedCount()  { return this.purchases.filter(p => p.status === 'received').length },

  // ─── Init ─────────────────────────────────────────────────────────────────
  async init() {
    await requireAuth()
    this.staffUser     = await getStaffUser()
    initSidebar(this.staffUser, () => this.logout())
    this.currentStaffId = await getStaffId()   // staff.id → untuk created_by FK

    await Promise.all([
      this.fetchPurchases(),
      this.fetchSuppliers(),
      this.fetchLocations(),
      this.fetchProducts(),
    ])
  },

  // ─── Logout ───────────────────────────────────────────────────────────────
  async logout() { await signOut() },

  // ─── Data fetching ────────────────────────────────────────────────────────
  async fetchPurchases() {
    this.loadingList = true
    try {
      const { data, error } = await supabase
        .from('purchases')
        .select('id, invoice_no, purchase_date, total_amount, status, supplier_id, location_id, suppliers(name), locations(name)')
        .order('purchase_date', { ascending: false })
        .order('id', { ascending: false })

      if (error) throw error
      this.purchases = (data || []).map(p => ({
        ...p,
        supplier_name: p.suppliers?.name ?? '—',
        location_name: p.locations?.name ?? '—',
      }))
    } catch (err) {
      this.showAlert('error', 'Gagal memuat data pembelian: ' + err.message)
    } finally {
      this.loadingList = false
    }
  },

  async fetchSuppliers() {
    const { data } = await supabase.from('suppliers').select('id, name').order('name')
    this.suppliers = data || []
  },

  async fetchLocations() {
    const { data } = await supabase.from('locations').select('id, name').order('id')
    this.locations = data || []
    if (this.locations.length > 0 && !this.form.location_id) {
      this.form.location_id = String(this.locations[0].id)
    }
  },

  async fetchProducts() {
    const { data } = await supabase
      .from('products')
      .select('id, sku, name, unit, cost_price')
      .eq('is_active', true)
      .order('name')
    this.products = data || []
  },

  async fetchDetailItems(purchaseId) {
    this.loadingDetail = true
    try {
      const { data, error } = await supabase
        .from('purchase_items')
        .select('id, quantity, unit_cost, subtotal, product_id, variant_id, products(id, sku, name, unit), product_variants(colors(name, hex_code))')
        .eq('purchase_id', purchaseId)
        .order('id')
      if (error) throw error
      this.currentItems = (data || []).map(item => ({
        ...item,
        colors: item.product_variants?.colors || null
      }))
    } catch (err) {
      this.showAlert('error', 'Gagal memuat item: ' + err.message)
    } finally {
      this.loadingDetail = false
    }
  },

  async refetchCurrentPurchase() {
    if (!this.currentPurchase) return
    const { data } = await supabase
      .from('purchases')
      .select('id, invoice_no, purchase_date, total_amount, status, supplier_id, location_id, suppliers(name), locations(name)')
      .eq('id', this.currentPurchase.id)
      .single()
    if (data) {
      this.currentPurchase = {
        ...data,
        supplier_name: data.suppliers?.name ?? '—',
        location_name: data.locations?.name ?? '—',
      }
    }
  },

  // ─── Navigation ───────────────────────────────────────────────────────────
  openAddView() {
    this.detailMode = 'new'
    this.currentPurchase = null
    this.currentItems = []
    this.resetForm()
    this.view = 'detail'
  },

  async openDetailView(purchase) {
    this.detailMode = 'existing'
    this.currentPurchase = {
      ...purchase,
      supplier_name: purchase.suppliers?.name ?? purchase.supplier_name ?? '—',
      location_name: purchase.locations?.name ?? purchase.location_name ?? '—',
    }
    this.resetNewItem()
    this.view = 'detail'
    await this.fetchDetailItems(purchase.id)
  },

  goBackToList() {
    this.view = 'list'
    this.currentPurchase = null
    this.currentItems = []
  },

  // ─── Auto-fill unit_cost from product.cost_price ──────────────────────────
  async onNewItemProductSelect() {
    const pid = String(this.newItem.product_id)
    const prod = this.products.find(p => String(p.id) === pid)
    if (prod && prod.cost_price != null) {
      this.newItem.unit_cost = prod.cost_price
    }
    this.errors.newItem.product_id = ''
    this.newItem.variant_id = ''
    this.activeProductVariants = []

    if (pid) {
      const { data } = await supabase
        .from('product_variants')
        .select('id, colors(id, name, hex_code)')
        .eq('product_id', pid)
        .eq('is_active', true)
      
      this.activeProductVariants = (data || []).filter(v => v.colors)
    }
  },

  // ─── Add item to "new purchase" form (preview only, not yet saved) ─────────
  //
  // Merge rule:
  //   product_id SAMA + unit_cost SAMA  → tambahkan qty ke baris yang ada
  //   product_id SAMA + unit_cost BEDA  → baris baru (batch harga berbeda)
  addFormItem() {
    const pid  = this.newItem.product_id
    const vid  = this.newItem.variant_id
    const qty  = Number(this.newItem.quantity)
    const cost = Number(this.newItem.unit_cost)

    this.errors.newItem.product_id = pid ? '' : 'Pilih produk.'
    this.errors.newItem.variant_id = (this.activeProductVariants.length > 0 && !vid) ? 'Pilih warna.' : ''
    this.errors.newItem.quantity   = qty > 0 ? '' : 'Qty harus > 0.'
    this.errors.newItem.unit_cost  = (String(this.newItem.unit_cost).trim() !== '' && cost >= 0) ? '' : 'Harga beli harus ≥ 0.'

    if (this.errors.newItem.product_id || this.errors.newItem.variant_id || this.errors.newItem.quantity || this.errors.newItem.unit_cost) return

    // Cari baris yang sudah ada dengan product_id, variant_id, DAN unit_cost yang sama
    const existingIdx = this.form.items.findIndex(
      i => String(i.product_id) === String(pid) && String(i.variant_id || '') === String(vid || '') && Number(i.unit_cost) === cost
    )

    if (existingIdx !== -1) {
      // Merge: tambahkan qty ke baris yang ada, recalculate subtotal preview
      const row = this.form.items[existingIdx]
      row.quantity = Number(row.quantity) + qty
      // Trigger Alpine reactivity by replacing the whole array item
      this.form.items.splice(existingIdx, 1, { ...row })
    } else {
      // Baris baru: produk berbeda, variant berbeda, ATAU unit_cost berbeda (batch harga beda)
      const prod = this.products.find(p => String(p.id) === String(pid))
      const variant = this.activeProductVariants.find(v => String(v.id) === String(vid))
      this.form.items.push({
        product_id:   pid,
        variant_id:   vid || null,
        product_name: prod?.name ?? '—',
        product_sku:  prod?.sku  ?? '',
        product_unit: prod?.unit ?? '',
        color_name:   variant?.colors?.name ?? '',
        color_hex:    variant?.colors?.hex_code ?? '',
        quantity:     qty,
        unit_cost:    cost,
      })
    }

    this.errors.items = ''
    this.resetNewItem()
  },

  removeFormItem(index) {
    this.form.items.splice(index, 1)
  },

  // ─── Save new purchase (header + items in batch) ──────────────────────────
  async savePurchase() {
    if (this.savingPurchase) return

    this.errors.supplier_id   = this.form.supplier_id   ? '' : 'Supplier wajib dipilih.'
    this.errors.location_id   = this.form.location_id   ? '' : 'Lokasi wajib dipilih.'
    this.errors.purchase_date = this.form.purchase_date ? '' : 'Tanggal wajib diisi.'
    this.errors.items         = this.form.items.length > 0 ? '' : 'Minimal 1 item harus ditambahkan sebelum menyimpan.'

    if (this.errors.supplier_id || this.errors.location_id || this.errors.purchase_date || this.errors.items) {
      this.showAlert('warning', 'Harap lengkapi semua data yang diperlukan.')
      return
    }

    this.savingPurchase = true
    try {
      // Step 1 — insert purchase header
      const { data: purchase, error: pErr } = await supabase
        .from('purchases')
        .insert({
          supplier_id:   this.form.supplier_id,
          location_id:   this.form.location_id,
          invoice_no:    this.form.invoice_no.trim() || null,
          purchase_date: this.form.purchase_date,
          status:        'draft',
          created_by:    this.currentStaffId,   // staff.id — FK ke tabel staff
        })
        .select()
        .single()
      if (pErr) throw pErr

      // Step 2 — insert all items
      const rows = this.form.items.map(i => ({
        purchase_id: purchase.id,
        product_id:  i.product_id,
        variant_id:  i.variant_id || null,
        quantity:    Number(i.quantity),
        unit_cost:   Number(i.unit_cost),
        subtotal:    Number(i.quantity) * Number(i.unit_cost),
      }))
      const { error: iErr } = await supabase.from('purchase_items').insert(rows)
      if (iErr) throw iErr

      this.showAlert('success', 'Draft pembelian berhasil dibuat.')
      await this.fetchPurchases()

      // Navigate to detail; refetch header for trigger-computed total_amount
      await this.openDetailView({ id: purchase.id, ...purchase })
      await this.refetchCurrentPurchase()

    } catch (err) {
      this.showAlert('error', 'Gagal menyimpan pembelian: ' + err.message)
    } finally {
      this.savingPurchase = false
    }
  },

  // ─── Add item to existing DRAFT purchase ──────────────────────────────────
  async addItemToExisting() {
    if (this.addingItem || this.isLocked) return

    const pid  = this.newItem.product_id
    const vid  = this.newItem.variant_id
    const qty  = Number(this.newItem.quantity)
    const cost = Number(this.newItem.unit_cost)

    this.errors.newItem.product_id = pid ? '' : 'Pilih produk.'
    this.errors.newItem.variant_id = (this.activeProductVariants.length > 0 && !vid) ? 'Pilih warna.' : ''
    this.errors.newItem.quantity   = qty > 0 ? '' : 'Qty harus > 0.'
    this.errors.newItem.unit_cost  = (String(this.newItem.unit_cost).trim() !== '' && cost >= 0) ? '' : 'Harga beli harus ≥ 0.'

    if (this.errors.newItem.product_id || this.errors.newItem.variant_id || this.errors.newItem.quantity || this.errors.newItem.unit_cost) return

    this.addingItem = true
    try {
      const { error } = await supabase.from('purchase_items').insert({
        purchase_id: this.currentPurchase.id,
        product_id:  pid,
        variant_id:  vid || null,
        quantity:    qty,
        unit_cost:   cost,
        subtotal:    qty * cost,
      })
      if (error) throw error

      this.resetNewItem()
      await Promise.all([
        this.fetchDetailItems(this.currentPurchase.id),
        this.refetchCurrentPurchase(),
      ])
    } catch (err) {
      this.showAlert('error', 'Gagal menambah item: ' + err.message)
    } finally {
      this.addingItem = false
    }
  },

  // ─── Remove item from existing DRAFT purchase ─────────────────────────────
  async removeItem(itemId) {
    if (this.isLocked) return
    this.removingItemId = itemId
    try {
      const { error } = await supabase.from('purchase_items').delete().eq('id', itemId)
      if (error) throw error
      await Promise.all([
        this.fetchDetailItems(this.currentPurchase.id),
        this.refetchCurrentPurchase(),
      ])
    } catch (err) {
      this.showAlert('error', 'Gagal menghapus item: ' + err.message)
    } finally {
      this.removingItemId = null
    }
  },

  // ─── Receive goods (trigger handles stock increment) ─────────────────────
  async receiveGoods() {
    if (this.receivingGoods || !this.currentPurchase) return
    if (this.currentItems.length === 0) {
      this.showAlert('warning', 'Tidak bisa menerima: tidak ada item dalam pembelian ini.')
      return
    }

    this.receivingGoods = true
    try {
      const { error } = await supabase
        .from('purchases')
        .update({ status: 'received' })
        .eq('id', this.currentPurchase.id)
      if (error) throw error

      await Promise.all([this.refetchCurrentPurchase(), this.fetchPurchases()])
      this.showAlert('success', 'Barang berhasil diterima! Stok produk sudah otomatis diperbarui oleh sistem.')
    } catch (err) {
      this.showAlert('error', 'Gagal mengubah status: ' + err.message)
    } finally {
      this.receivingGoods = false
    }
  },

  // ─── Helpers ─────────────────────────────────────────────────────────────
  resetForm() {
    this.form = {
      supplier_id:   '',
      location_id:   this.locations.length > 0 ? String(this.locations[0].id) : '',
      invoice_no:    '',
      purchase_date: new Date().toISOString().slice(0, 10),
      items:         [],
    }
    this.errors = {
      supplier_id: '', location_id: '', purchase_date: '', items: '',
      newItem: { product_id: '', quantity: '', unit_cost: '' },
    }
    this.resetNewItem()
  },

  resetNewItem() {
    this.newItem = { product_id: '', variant_id: '', quantity: 1, unit_cost: '' }
    this.activeProductVariants = []
    if (this.errors.newItem) {
      this.errors.newItem = { product_id: '', variant_id: '', quantity: '', unit_cost: '' }
    }
  },

  formatPrice(val) {
    if (val == null || val === '') return '—'
    return 'Rp\u00a0' + Number(val).toLocaleString('id-ID')
  },

  formatDate(dateStr) {
    if (!dateStr) return '—'
    try {
      return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
    } catch { return dateStr }
  },

  statusLabel(status) {
    return { draft: 'Draft', received: 'Diterima', cancelled: 'Dibatalkan' }[status] ?? status
  },

  statusClass(status) {
    if (status === 'received')  return 'bg-sage/10 text-sage-deep border-sage/25'
    if (status === 'cancelled') return 'bg-red-50 text-red-600 border-red-200'
    return 'bg-amber-50 text-amber-700 border-amber-200'   // draft
  },

  showAlert(type, message) {
    this.alert = { show: true, type, message }
    setTimeout(() => { this.alert.show = false }, 6000)
  },
}))

Alpine.start()
