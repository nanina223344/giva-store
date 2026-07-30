import '../style.css'
import Alpine from 'alpinejs'
import { supabase } from '../supabaseClient.js'
import { requireAuth, getStaffUser, signOut } from './auth.js'
import { initSidebar } from '../../admin/js/sidebar.js'


window.Alpine = Alpine

Alpine.data('productsAdmin', () => ({
  // ─── State ───────────────────────────────────────────────────────────────
  products: [],        // full list from Supabase (with category name + total stock)
  categories: [],      // for dropdown
  colors: [],          // for variant dropdown
  loading: true,
  saving: false,

  // Variants (for open product being edited)
  variants: [],        // current product's variants
  loadingVariants: false,
  savingVariant: false,
  variantForm: {
    color_id:    '',
    sku_variant: '',
    is_active:   true,
  },
  variantFormError: '',

  // Mobile sidebar drawer
  sidebarOpen: false,

  // Search / filter
  searchQuery: '',
  filterStatus: 'all',   // 'all' | 'active' | 'inactive'
  filterColor:  '',      // '' = semua warna; kalau diisi = color id

  // Stock popover (breakdown per varian)
  stockPopover: {
    show:      false,
    productId: null,
    loading:   false,
    rows:      [],       // [{ label, hex, quantity }]
    total:     0,
  },

  // Sidebar staff user
  staffUser: { name: '—', email: '—' },

  // Modal state
  showModal: false,
  isEditing: false,

  // Form fields
  form: {
    id: null,
    sku: '',
    name: '',
    category_id: '',
    unit: 'pcs',
    cost_price: '',
    sell_price: '',
    image_url: '',
    is_active: true,
    brand_name: '',
    description: '',
    material: '',
    dimensions: '',
    weight_gram: '',
    is_gift_ready: false,
    tags: [],
  },

  // Tag input helper
  tagInput: '',

  // Upload & Storage State
  uploadingImage: false,
  imageError: '',
  oldImageUrl: '',

  // Field-level errors
  errors: {
    sku: '',
    name: '',
    category_id: '',
    unit: '',
    cost_price: '',
    sell_price: '',
  },

  // Alerts
  alert: {
    show: false,
    type: 'success',
    message: '',
  },

  // ─── Computed: filtered list ──────────────────────────────────────────────
  get filtered() {
    let list = this.products

    if (this.filterStatus === 'active')   list = list.filter(p => p.is_active)
    if (this.filterStatus === 'inactive') list = list.filter(p => !p.is_active)

    // Filter per warna: produk harus punya varian aktif dengan color_id ini
    if (this.filterColor) {
      const cid = String(this.filterColor)
      list = list.filter(p =>
        (p.product_variants || []).some(
          v => v.is_active && String(v.color_id) === cid
        )
      )
    }

    const q = this.searchQuery.trim().toLowerCase()
    if (!q) return list
    return list.filter(p =>
      (p.sku           && p.sku.toLowerCase().includes(q))           ||
      (p.name          && p.name.toLowerCase().includes(q))          ||
      (p.category_name && p.category_name.toLowerCase().includes(q))
    )
  },

  get activeCount()   { return this.products.filter(p =>  p.is_active).length },
  get inactiveCount() { return this.products.filter(p => !p.is_active).length },

  // ─── Init ─────────────────────────────────────────────────────────────────
  async init() {
    await requireAuth()
    this.staffUser = await getStaffUser()
    initSidebar(this.staffUser, () => this.logout())
    await Promise.all([this.fetchCategories(), this.fetchColors(), this.fetchProducts()])
  },

  // ─── Logout ───────────────────────────────────────────────────────────────
  async logout() {
    await signOut()
  },

  // ─── Data fetching ────────────────────────────────────────────────────────
  async fetchCategories() {
    const { data } = await supabase
      .from('categories')
      .select('id, name')
      .order('name', { ascending: true })
    this.categories = data || []
  },

  async fetchColors() {
    const { data } = await supabase
      .from('colors')
      .select('id, name, hex_code')
      .order('name', { ascending: true })
    this.colors = data || []
  },

  async fetchVariants(productId) {
    this.loadingVariants = true
    try {
      const { data, error } = await supabase
        .from('product_variants')
        .select(`
          id, sku_variant, is_active,
          color_id,
          colors ( name, hex_code )
        `)
        .eq('product_id', productId)
        .order('created_at', { ascending: true })
      if (error) throw error

      // Normalize + sort A-Z by color name
      const mapped = (data || []).map(v => ({
        ...v,
        color_name:     v.colors?.name     ?? '—',
        color_hex_code: v.colors?.hex_code ?? '#e5e7eb',
      }))
      mapped.sort((a, b) => a.color_name.localeCompare(b.color_name, 'id'))
      this.variants = mapped
    } catch (err) {
      this.showAlert('error', 'Gagal memuat varian: ' + err.message)
    } finally {
      this.loadingVariants = false
    }
  },

  // ─── Stock breakdown popover ──────────────────────────────────────────────
  async openStockPopover(prod) {
    // Toggle: tutup kalau sudah buka untuk produk yang sama
    if (this.stockPopover.show && this.stockPopover.productId === prod.id) {
      this.stockPopover.show = false
      return
    }

    this.stockPopover = { show: true, productId: prod.id, loading: true, rows: [], total: 0 }

    try {
      // Ambil stok tersedia + stok fisik untuk produk ini
      const [availRes, rawRes] = await Promise.all([
        supabase
          .from('stock_available')
          .select(`
            available_quantity, variant_id,
            product_variants (
              id,
              colors ( name, hex_code )
            )
          `)
          .eq('product_id', prod.id),
        supabase
          .from('stock')
          .select('quantity, variant_id')
          .eq('product_id', prod.id),
      ])

      if (availRes.error) throw availRes.error

      // Build map of raw quantity per variant_id for reserved calculation
      const rawMap = new Map()
      for (const r of (rawRes.data || [])) {
        const key = r.variant_id ?? '__base__'
        rawMap.set(key, (rawMap.get(key) || 0) + (r.quantity ?? 0))
      }

      const rows = []
      let total = 0

      for (const s of (availRes.data || [])) {
        const avail = s.available_quantity ?? 0
        total += avail
        const key = s.variant_id ?? '__base__'
        const raw = rawMap.get(key) || avail
        const reserved = Math.max(0, raw - avail)

        if (s.variant_id && s.product_variants) {
          rows.push({
            label: s.product_variants.colors?.name ?? 'Warna tak dikenal',
            hex:   s.product_variants.colors?.hex_code ?? '#e5e7eb',
            quantity: avail,
            reserved,
            isVariant: true,
          })
        } else {
          rows.push({ label: 'Tanpa varian', hex: null, quantity: avail, reserved, isVariant: false })
        }
      }

      // Varian diurutkan A-Z by label, lalu "Tanpa varian" di akhir
      rows.sort((a, b) => {
        if (!a.isVariant && b.isVariant)  return 1
        if (a.isVariant  && !b.isVariant) return -1
        return a.label.localeCompare(b.label, 'id')
      })

      this.stockPopover = { show: true, productId: prod.id, loading: false, rows, total }
    } catch (err) {
      this.stockPopover = { show: false, productId: null, loading: false, rows: [], total: 0 }
    }
  },

  closeStockPopover() {
    this.stockPopover.show = false
  },

  async fetchProducts() {
    this.loading = true
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          id, sku, name, unit, cost_price, sell_price,
          image_url, is_active, category_id,
          brand_name, description, material, dimensions,
          weight_gram, is_gift_ready, tags,
          categories ( name ),
          stock ( quantity, variant_id ),
          stock_available ( available_quantity, variant_id ),
          product_variants (
            id, is_active,
            colors ( name, hex_code ),
            stock ( quantity ),
            stock_available ( available_quantity )
          )
        `)
        .order('name', { ascending: true })

      if (error) throw error

      // DEBUG: hapus setelah verifikasi warna berhasil tampil
      if (data && data[0]?.product_variants?.length > 0) {
        console.log('[products] sample variant data:', JSON.stringify(data[0].product_variants[0], null, 2))
      }

      this.products = (data || []).map(p => {
        // Stok base: baris stok yang tidak punya variant_id
        const baseStock = (p.stock || [])
          .filter(s => !s.variant_id)
          .reduce((sum, s) => sum + (s.quantity ?? 0), 0)

        const baseAvailable = (p.stock_available || [])
          .filter(s => !s.variant_id)
          .reduce((sum, s) => sum + (s.available_quantity ?? 0), 0)

        // Normalize setiap varian — pastikan color_hex_code & color_name selalu ada
        const variants = (p.product_variants || []).map(v => ({
          ...v,
          color_name:     v.colors?.name     ?? '—',
          color_hex_code: v.colors?.hex_code ?? '#e5e7eb',
        }))

        // Stok fisik semua varian aktif
        const variantRawStock = variants
          .filter(v => v.is_active)
          .flatMap(v => v.stock || [])
          .reduce((sum, s) => sum + (s.quantity ?? 0), 0)

        // Stok tersedia semua varian aktif
        const variantAvailable = variants
          .filter(v => v.is_active)
          .flatMap(v => v.stock_available || [])
          .reduce((sum, s) => sum + (s.available_quantity ?? 0), 0)

        const raw_stock = baseStock + variantRawStock
        const total_stock = baseAvailable + variantAvailable
        const reserved_stock = Math.max(0, raw_stock - total_stock)

        return {
          ...p,
          product_variants: variants,
          category_name: p.categories?.name ?? '—',
          total_stock,
          raw_stock,
          reserved_stock,
        }
      })
    } catch (err) {
      this.showAlert('error', 'Gagal memuat data produk: ' + err.message)
    } finally {
      this.loading = false
    }
  },

  // ─── SKU uniqueness pre-check ─────────────────────────────────────────────
  async checkSkuUnique(sku) {
    if (!sku || !sku.trim()) return true
    let query = supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('sku', sku.trim())

    if (this.isEditing && this.form.id) {
      query = query.neq('id', this.form.id)
    }

    const { count, error } = await query
    if (error) return true   // fail-open: let DB constraint be the last guard
    return count === 0
  },

  async onSkuBlur() {
    const sku = this.form.sku.trim()
    if (!sku) {
      this.errors.sku = 'SKU tidak boleh kosong.'
      return
    }
    const unique = await this.checkSkuUnique(sku)
    this.errors.sku = unique ? '' : `SKU "${sku}" sudah dipakai produk lain.`
  },

  // ─── Inline validation ────────────────────────────────────────────────────
  onNameBlur() {
    this.errors.name = this.form.name.trim() ? '' : 'Nama produk tidak boleh kosong.'
  },
  onCategoryBlur() {
    this.errors.category_id = this.form.category_id ? '' : 'Kategori wajib dipilih.'
  },
  onUnitBlur() {
    this.errors.unit = this.form.unit.trim() ? '' : 'Satuan tidak boleh kosong.'
  },
  onCostBlur() {
    const v = Number(this.form.cost_price)
    this.errors.cost_price = (this.form.cost_price.toString().trim() === '' || isNaN(v) || v < 0)
      ? 'Harga beli harus berupa angka ≥ 0.' : ''
  },
  onSellBlur() {
    const v = Number(this.form.sell_price)
    this.errors.sell_price = (this.form.sell_price.toString().trim() === '' || isNaN(v) || v < 0)
      ? 'Harga jual harus berupa angka ≥ 0.' : ''
  },

  // ─── Image Upload Handlers (Supabase Storage 'product-images') ────────────
  triggerFilePicker() {
    const fileInput = document.getElementById('input-file-product-image')
    if (fileInput) fileInput.click()
  },

  handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (file) this.processAndUploadFile(file)
  },

  handleFileDrop(e) {
    const file = e.dataTransfer?.files?.[0]
    if (file) this.processAndUploadFile(file)
  },

  async processAndUploadFile(file) {
    this.imageError = ''

    // 1. Tipe file harus gambar (jpeg, png, webp)
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      this.imageError = 'Tipe file harus berupa gambar (JPG, PNG, WebP).'
      return
    }

    // 2. Ukuran max 2MB
    const maxSize = 2 * 1024 * 1024
    if (file.size > maxSize) {
      this.imageError = 'Ukuran file maksimal 2MB.'
      return
    }

    // 3. Upload ke Supabase Storage bucket 'product-images'
    this.uploadingImage = true
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const timestamp = Date.now()
      const filename = this.isEditing && this.form.id
        ? `${this.form.id}-${timestamp}.${ext}`
        : `temp-${timestamp}.${ext}`

      // Hapus file lama jika ada
      if (this.form.image_url && this.form.image_url.includes('product-images')) {
        const oldFileName = this.form.image_url.split('/').pop()
        if (oldFileName && oldFileName !== filename) {
          await supabase.storage.from('product-images').remove([oldFileName])
        }
      }

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('product-images')
        .upload(filename, file, {
          cacheControl: '3600',
          upsert: true,
        })

      if (uploadErr) throw uploadErr

      // Dapatkan public URL
      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(filename)

      this.form.image_url = urlData.publicUrl
    } catch (err) {
      console.error('Upload product image error:', err)
      this.imageError = 'Gagal mengunggah foto: ' + err.message
    } finally {
      this.uploadingImage = false
    }
  },

  async removeProductImage() {
    this.imageError = ''
    if (this.form.image_url && this.form.image_url.includes('product-images')) {
      try {
        const oldFileName = this.form.image_url.split('/').pop()
        if (oldFileName) {
          await supabase.storage.from('product-images').remove([oldFileName])
        }
      } catch (e) {
        console.error('Error removing old image from storage:', e)
      }
    }
    this.form.image_url = ''
    const fileInput = document.getElementById('input-file-product-image')
    if (fileInput) fileInput.value = ''
  },

  // ─── Modal control ────────────────────────────────────────────────────────
  openAddModal() {
    this.resetForm()
    this.isEditing = false
    this.showModal = true
  },

  openEditModal(product) {
    this.form = {
      id:          product.id,
      sku:         product.sku         ?? '',
      name:        product.name        ?? '',
      category_id: product.category_id ? String(product.category_id) : '',
      unit:        product.unit        ?? 'pcs',
      cost_price:  product.cost_price  != null ? product.cost_price  : '',
      sell_price:  product.sell_price  != null ? product.sell_price  : '',
      image_url:   product.image_url   ?? '',
      is_active:   product.is_active   ?? true,
      brand_name:    product.brand_name    ?? '',
      description:   product.description   ?? '',
      material:      product.material      ?? '',
      dimensions:    product.dimensions    ?? '',
      weight_gram:   product.weight_gram   != null ? product.weight_gram : '',
      is_gift_ready: product.is_gift_ready ?? false,
      tags:          Array.isArray(product.tags) ? [...product.tags] : [],
    }
    this.oldImageUrl = product.image_url ?? ''
    this.imageError = ''
    this.uploadingImage = false
    this.tagInput = ''
    this.errors = { sku: '', name: '', category_id: '', unit: '', cost_price: '', sell_price: '' }
    this.isEditing = true
    this.showModal = true
    this.variants = []
    this.variantForm = { color_id: '', sku_variant: '', is_active: true }
    this.variantFormError = ''
    this.fetchVariants(product.id)
  },

  closeModal() {
    this.showModal = false
    this.resetForm()
    this.variants = []
    this.variantForm = { color_id: '', sku_variant: '', is_active: true }
    this.variantFormError = ''
  },

  resetForm() {
    this.form = {
      id: null, sku: '', name: '', category_id: '',
      unit: 'pcs', cost_price: '', sell_price: '',
      image_url: '', is_active: true,
      brand_name: '', description: '', material: '',
      dimensions: '', weight_gram: '', is_gift_ready: false,
      tags: [],
    }
    this.oldImageUrl = ''
    this.imageError = ''
    this.uploadingImage = false
    this.tagInput = ''
    this.errors = { sku: '', name: '', category_id: '', unit: '', cost_price: '', sell_price: '' }
    const fileInput = document.getElementById('input-file-product-image')
    if (fileInput) fileInput.value = ''
  },

  // ─── Tag management ───────────────────────────────────────────────────────
  addTag(value) {
    const tag = (value || '').trim().toLowerCase()
    if (!tag) return
    if (this.form.tags.includes(tag)) {
      this.tagInput = ''
      return
    }
    this.form.tags = [...this.form.tags, tag]
    this.tagInput = ''
  },

  removeTag(index) {
    this.form.tags = this.form.tags.filter((_, i) => i !== index)
  },

  handleTagKeydown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      this.addTag(this.tagInput)
    }
    // Backspace on empty input removes last tag
    if (e.key === 'Backspace' && !this.tagInput && this.form.tags.length > 0) {
      this.form.tags = this.form.tags.slice(0, -1)
    }
  },

  // ─── Variant CRUD ─────────────────────────────────────────────────────────
  async addVariant() {
    this.variantFormError = ''
    if (!this.variantForm.color_id) {
      this.variantFormError = 'Pilih warna terlebih dahulu.'
      return
    }
    if (!this.form.id) return  // hanya untuk mode edit

    this.savingVariant = true
    try {
      const payload = {
        product_id:  this.form.id,
        color_id:    this.variantForm.color_id,
        sku_variant: this.variantForm.sku_variant.trim() || null,
        is_active:   this.variantForm.is_active,
      }
      const { error } = await supabase
        .from('product_variants')
        .insert(payload)
      if (error) throw error

      this.variantForm = { color_id: '', sku_variant: '', is_active: true }
      this.showAlert('success', 'Varian warna berhasil ditambahkan.')
      await Promise.all([this.fetchVariants(this.form.id), this.fetchProducts()])
    } catch (err) {
      this.variantFormError = 'Gagal menambah varian: ' + err.message
    } finally {
      this.savingVariant = false
    }
  },

  // Soft-delete: set is_active = false
  // Jika varian belum pernah ada di transaksi, bisa hard-delete — tapi untuk keamanan kita selalu soft-delete
  async removeVariant(variant) {
    try {
      const { error } = await supabase
        .from('product_variants')
        .update({ is_active: false })
        .eq('id', variant.id)
      if (error) throw error
      this.showAlert('success', `Varian ${variant.color_name} dinonaktifkan.`)
      await Promise.all([this.fetchVariants(this.form.id), this.fetchProducts()])
    } catch (err) {
      this.showAlert('error', 'Gagal menghapus varian: ' + err.message)
    }
  },

  // ─── Save (insert / update) ───────────────────────────────────────────────
  async saveProduct() {
    if (this.saving || this.uploadingImage) return

    // Synchronous field validation
    this.errors.name        = this.form.name.trim()   ? '' : 'Nama produk tidak boleh kosong.'
    this.errors.category_id = this.form.category_id   ? '' : 'Kategori wajib dipilih.'
    this.errors.unit        = this.form.unit.trim()   ? '' : 'Satuan tidak boleh kosong.'
    const cp = Number(this.form.cost_price)
    const sp = Number(this.form.sell_price)
    this.errors.cost_price = (this.form.cost_price.toString().trim() === '' || isNaN(cp) || cp < 0)
      ? 'Harga beli harus berupa angka ≥ 0.' : ''
    this.errors.sell_price = (this.form.sell_price.toString().trim() === '' || isNaN(sp) || sp < 0)
      ? 'Harga jual harus berupa angka ≥ 0.' : ''

    // Async SKU uniqueness check
    const sku = this.form.sku.trim()
    if (!sku) {
      this.errors.sku = 'SKU tidak boleh kosong.'
    } else {
      const unique = await this.checkSkuUnique(sku)
      this.errors.sku = unique ? '' : `SKU "${sku}" sudah dipakai produk lain. Gunakan SKU yang berbeda.`
    }

    if (Object.values(this.errors).some(e => e)) {
      this.showAlert('warning', 'Harap perbaiki kesalahan pada formulir sebelum menyimpan.')
      return
    }

    this.saving = true
    try {
      const payload = {
        sku:         sku,
        name:        this.form.name.trim(),
        category_id: this.form.category_id || null,
        unit:        this.form.unit.trim(),
        cost_price:  cp,
        sell_price:  sp,
        image_url:   this.form.image_url.trim() || null,
        is_active:   this.form.is_active,
        brand_name:    this.form.brand_name.trim() || null,
        description:   this.form.description.trim() || null,
        material:      this.form.material.trim() || null,
        dimensions:    this.form.dimensions.trim() || null,
        weight_gram:   this.form.weight_gram !== '' ? Number(this.form.weight_gram) : null,
        is_gift_ready: this.form.is_gift_ready ?? false,
        tags:          this.form.tags.length > 0 ? this.form.tags : null,
      }

      if (this.isEditing) {
        const { error } = await supabase
          .from('products').update(payload).eq('id', this.form.id)
        if (error) throw error
        this.showAlert('success', 'Produk berhasil diperbarui.')
        this.closeModal()
        await this.fetchProducts()
      } else {
        // INSERT — ambil kembali row yang baru dibuat agar dapat id-nya
        const { data: inserted, error } = await supabase
          .from('products')
          .insert(payload)
          .select(`
            id, sku, name, unit, cost_price, sell_price,
            image_url, is_active, category_id,
            brand_name, description, material, dimensions,
            weight_gram, is_gift_ready, tags,
            categories ( name ),
            stock ( quantity, variant_id ),
            product_variants ( id, is_active, stock ( quantity ) )
          `)
          .single()
        if (error) throw error

        // Refresh list di background
        await this.fetchProducts()

        this.showAlert('success', 'Produk berhasil ditambahkan. Sekarang Anda bisa menambahkan varian warna.')

        // Buka otomatis modal Edit untuk produk yang baru saja dibuat
        this.openEditModal({
          id:          inserted.id,
          sku:         inserted.sku,
          name:        inserted.name,
          category_id: inserted.category_id,
          unit:        inserted.unit,
          cost_price:  inserted.cost_price,
          sell_price:  inserted.sell_price,
          image_url:   inserted.image_url,
          is_active:   inserted.is_active,
        })
      }

    } catch (err) {
      // Catch DB-level unique constraint (race condition safety net)
      if (err.code === '23505' || (err.message && err.message.includes('unique'))) {
        this.errors.sku = `SKU "${sku}" sudah dipakai. Ganti SKU dan coba lagi.`
        this.showAlert('warning', 'SKU sudah dipakai produk lain. Ganti SKU dan coba lagi.')
      } else {
        this.showAlert('error', 'Terjadi kesalahan: ' + err.message)
      }
    } finally {
      this.saving = false
    }
  },

  // ─── Quick toggle is_active from list (soft delete / restore) ─────────────
  async toggleActive(product) {
    const newState = !product.is_active
    const { error } = await supabase
      .from('products')
      .update({ is_active: newState })
      .eq('id', product.id)

    if (error) {
      this.showAlert('error', 'Gagal mengubah status produk.')
      return
    }

    const label = newState ? 'diaktifkan' : 'dinonaktifkan'
    this.showAlert('success', `Produk "${product.name}" berhasil ${label}.`)
    await this.fetchProducts()
  },

  // ─── Formatting helpers ───────────────────────────────────────────────────
  formatPrice(val) {
    if (val == null || val === '') return '—'
    return 'Rp\u00a0' + Number(val).toLocaleString('id-ID')
  },

  // ─── Alert helper ────────────────────────────────────────────────────────
  showAlert(type, message) {
    this.alert = { show: true, type, message }
    setTimeout(() => { this.alert.show = false }, 6000)
  },
}))

Alpine.start()
