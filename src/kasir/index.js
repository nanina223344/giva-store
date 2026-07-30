/**
 * src/kasir/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Halaman Kasir (POS) Giva Store.
 * Auth guard: hanya role 'kasir' atau 'admin' yang bisa akses.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '../style.css'
import Alpine from 'alpinejs'
import { supabase } from '../supabaseClient.js'
import { requireKasirAuth, getStaffUser, signOut } from '../admin/auth.js'

window.Alpine = Alpine

Alpine.data('kasirApp', () => ({
  // ── Auth / staff ──────────────────────────────────────────────────────────
  staffUser:   { name: '—', email: '—' },
  staffId:     null,
  staffRole:   null,
  accessError: '',

  // ── UI state ─────────────────────────────────────────────────────────────────
  loading:     true,
  activeTab:   'produk',   // 'produk' | 'keranjang' | 'riwayat'

  // ── Products ─────────────────────────────────────────────────────────────────
  products:    [],
  searchQuery: '',
  stockFilter: 'available',   // 'all' | 'available' | 'empty'

  // ── Variant modal (pilih warna sebelum masuk keranjang) ──────────────────
  showVariantModal:    false,
  variantModalProduct: null,   // produk yang sedang dipilih variannya
  variantModalVariants: [],    // varian yang bisa dipilih (stok > 0)

  // ── Cart ─────────────────────────────────────────────────────────────────
  cart: [],  // [{ cartKey, id, variant_id, color_name, color_hex, sku, name, unit, sell_price, qty, stock }]

  // ── Payment modal ─────────────────────────────────────────────────────────
  showPayModal:  false,
  paying:        false,
  nominalBayar:  '',

  // Metode pembayaran: 'cash' | 'qris' | 'transfer' | 'gopay' | 'ovo' | 'dana' | 'debit'
  payMethod:      'cash',
  selectedBankId: null,    // ID rekening bank yang dipilih saat transfer
  bankAccounts:   [],      // daftar rekening aktif dari tabel bank_accounts

  // Bukti bayar
  proofFile:       null,    // File object
  proofPreviewUrl: '',      // blob URL untuk preview
  uploadingProof:  false,
  proofError:      '',

  // Cache settings dari DB  { key → value }
  settingsMap: {},
  loadingSettings: false,

  // ── Receipt modal (tampil setelah pembayaran berhasil) ────────────────────
  showReceiptModal: false,
  receipt: {
    saleId: '', tanggal: '', jam: '', items: [], total: 0,
    nominal: 0, kembalian: 0, kasir: '', method: 'cash', isReprint: false
  },

  // ── Riwayat transaksi hari ini ───────────────────────────────────────────
  transactions:       [],
  todayOmzet:         0,
  loadingTrx:         false,
  showTrxDetailModal: false,
  activeTrx:          null,
  trxDetailItems:     [],
  loadingTrxDetail:   false,

  // ── Alert ─────────────────────────────────────────────────────────────────
  alert: { show: false, type: 'success', message: '' },

  // ── Computed ──────────────────────────────────────────────────────────────
  get filteredProducts() {
    let list = this.products
    if (this.stockFilter === 'available') list = list.filter(p => p.total_stock > 0)
    if (this.stockFilter === 'empty')     list = list.filter(p => p.total_stock === 0)
    const q = this.searchQuery.trim().toLowerCase()
    if (!q) return list
    return list.filter(p =>
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.sku  && p.sku.toLowerCase().includes(q))
    )
  },

  get cartTotal() {
    return this.cart.reduce((s, i) => s + i.sell_price * i.qty, 0)
  },

  get cartCount() {
    return this.cart.reduce((s, i) => s + i.qty, 0)
  },

  get kembalian() {
    if (this.payMethod !== 'cash') return 0
    const nominal = Number(this.nominalBayar) || 0
    return nominal - this.cartTotal
  },

  // Apakah metode ini memerlukan upload bukti bayar
  get requiresProof() {
    return !['cash', 'debit'].includes(this.payMethod)
  },

  get canConfirmPay() {
    if (this.cartTotal <= 0) return false
    if (this.payMethod === 'cash') return Number(this.nominalBayar) >= this.cartTotal
    if (this.payMethod === 'transfer') {
      return this.selectedBankId != null && this.proofFile != null
    }
    if (this.requiresProof) return this.proofFile != null
    return true  // debit: konfirmasi langsung
  },

  // Info rekening bank yang dipilih (dari bank_accounts)
  get selectedBankInfo() {
    return this.bankAccounts.find(b => b.id === this.selectedBankId) || null
  },

  // Info e-wallet yang dipilih (gopay / ovo / dana)
  get ewalletInfo() {
    const map = {
      gopay: { key: 'ewallet_gopay', label: 'GoPay' },
      ovo:   { key: 'ewallet_ovo',   label: 'OVO' },
      dana:  { key: 'ewallet_dana',  label: 'Dana' },
    }
    const info = map[this.payMethod] || {}
    return {
      nomor: this.settingsMap[info.key] || '—',
      label: info.label || '',
    }
  },

  // ── Init ──────────────────────────────────────────────────────────────────
  async init() {
    try {
      const authResult = await requireKasirAuth()
      this.staffId   = authResult.staffId
      this.staffRole = authResult.staffRole
    } catch (err) {
      if (err.message && err.message.startsWith('ACCESS_DENIED:')) {
        const role = err.message.split(':')[1]
        this.accessError = `Akun ini (role: ${role}) tidak memiliki akses ke halaman Kasir.`
        this.loading = false
        return
      }
      return
    }

    this.staffUser = await getStaffUser()
    await Promise.all([
      this.fetchProducts(),
      this.fetchTransactions(),
      this.fetchSettings(),
    ])
  },

  // ── Logout ────────────────────────────────────────────────────────────────
  async logout() {
    await signOut()
  },

  // ── Fetch settings + bank accounts ─────────────────────────────────
  async fetchSettings() {
    this.loadingSettings = true
    try {
      const [settingsRes, banksRes] = await Promise.all([
        supabase.from('settings').select('key, value'),
        supabase.from('bank_accounts')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .order('bank_name',  { ascending: true }),
      ])

      if (settingsRes.error) throw settingsRes.error

      const map = {}
      for (const row of (settingsRes.data || [])) {
        map[row.key] = row.value ?? ''
      }
      this.settingsMap  = map
      this.bankAccounts = banksRes.data || []
      // selectedBankId di-set saat kasir klik rekening di modal
    } catch (err) {
      console.warn('Settings/banks tidak tersedia:', err.message)
    } finally {
      this.loadingSettings = false
    }
  },

  // ── Fetch products with stock + variants ──────────────────────────────────
  async fetchProducts() {
    this.loading = true
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          id, sku, name, unit, sell_price, image_url,
          stock_available ( available_quantity, variant_id ),
          product_variants (
            id, is_active,
            colors ( name, hex_code ),
            stock_available ( available_quantity )
          )
        `)
        .eq('is_active', true)
        .order('name', { ascending: true })

      if (error) throw error

      this.products = (data || []).map(p => {
        const activeVariants = (p.product_variants || [])
          .filter(v => v.is_active)
          .map(v => ({
            id:         v.id,
            color_name: v.colors?.name     ?? 'Warna',
            hex_code:   v.colors?.hex_code ?? '#cccccc',
            stock: (v.stock_available || []).reduce((s, r) => s + (r.available_quantity ?? 0), 0),
          }))

        const baseStock = (p.stock_available || [])
          .filter(s => !s.variant_id)
          .reduce((s, r) => s + (r.available_quantity ?? 0), 0)

        const variantStock = activeVariants.reduce((s, v) => s + v.stock, 0)
        const total_stock  = baseStock + variantStock

        return {
          ...p,
          total_stock,
          base_stock:  baseStock,
          hasVariants: activeVariants.length > 0,
          variants:    activeVariants,
        }
      })
    } catch (err) {
      this.showAlert('error', 'Gagal memuat produk: ' + err.message)
    } finally {
      this.loading = false
    }
  },

  // ── Cart operations ───────────────────────────────────────────────────────
  clickProduct(product) {
    if (product.hasVariants) {
      this.variantModalVariants = product.variants
      this.variantModalProduct  = product
      this.showVariantModal     = true
    } else {
      this.addToCart(product, null)
    }
  },

  closeVariantModal() {
    this.showVariantModal = false
    this.variantModalProduct = null
  },

  addToCartWithVariant(variant) {
    const product = this.variantModalProduct
    this.closeVariantModal()
    this.addToCart(product, variant)
  },

  addToCart(product, variant) {
    const cartKey  = variant ? `${product.id}__${variant.id}` : `${product.id}__base`
    const stockQty = variant ? variant.stock : product.base_stock || product.total_stock

    const existing = this.cart.find(i => i.cartKey === cartKey)
    if (existing) {
      if (existing.qty < existing.stock) {
        existing.qty++
      } else {
        this.showAlert('warning', `Stok ${product.name}${variant ? ' (' + variant.color_name + ')' : ''} hanya tersisa ${existing.stock}.`)
      }
      this.triggerCartBadgeBounce()
      return
    }
    this.cart.push({
      cartKey,
      id:         product.id,
      variant_id: variant ? variant.id   : null,
      color_name: variant ? variant.color_name : null,
      color_hex:  variant ? (variant.hex_code ?? '#e5e7eb') : null,
      sku:        product.sku,
      name:       product.name,
      unit:       product.unit,
      sell_price: product.sell_price,
      qty:        1,
      stock:      stockQty,
    })
    this.triggerCartBadgeBounce()
  },

  triggerCartBadgeBounce() {
    const badges = document.querySelectorAll('#tab-keranjang .cart-badge')
    badges.forEach(badge => {
      badge.classList.remove('cart-badge-bounce')
      void badge.offsetWidth
      badge.classList.add('cart-badge-bounce')
    })
  },

  incrementQty(item) {
    if (item.qty < item.stock) {
      item.qty++
    } else {
      this.showAlert('warning', `Stok ${item.name} hanya tersisa ${item.stock}.`)
    }
  },

  decrementQty(item) {
    if (item.qty > 1) {
      item.qty--
    } else {
      this.removeFromCart(item)
    }
  },

  setQty(item, val) {
    const n = parseInt(val, 10)
    if (isNaN(n) || n < 1) {
      item.qty = 1
    } else if (n > item.stock) {
      item.qty = item.stock
      this.showAlert('warning', `Stok ${item.name} hanya tersisa ${item.stock}.`)
    } else {
      item.qty = n
    }
  },

  removeFromCart(item) {
    this.cart = this.cart.filter(i => i.cartKey !== item.cartKey)
  },

  clearCart() {
    this.cart = []
    this.nominalBayar = ''
  },

  // ── Payment modal ─────────────────────────────────────────────────────────

  openPayModal() {
    if (this.cart.length === 0) return
    this.nominalBayar   = ''
    this.payMethod      = 'cash'
    this.selectedBankId = null  // kasir wajib pilih rekening saat transfer
    this.clearProof()
    this.showPayModal = true
  },

  closePayModal() {
    if (this.paying) return
    this.showPayModal = false
    this.clearProof()
  },

  selectPayMethod(method) {
    this.payMethod = method
    this.clearProof()
    this.proofError = ''
  },

  // ── Bukti bayar ───────────────────────────────────────────────────────────

  clearProof() {
    if (this.proofPreviewUrl) {
      URL.revokeObjectURL(this.proofPreviewUrl)
    }
    this.proofFile       = null
    this.proofPreviewUrl = ''
    this.proofError      = ''
  },

  handleProofFile(event) {
    const file = event.target.files?.[0]
    if (!file) return

    // Validasi tipe
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) {
      this.proofError = 'Format file harus JPG, PNG, atau WebP.'
      event.target.value = ''
      return
    }

    // Validasi ukuran (5MB)
    if (file.size > 5 * 1024 * 1024) {
      this.proofError = 'Ukuran file maksimal 5 MB.'
      event.target.value = ''
      return
    }

    this.proofError = ''
    this.clearProof()
    this.proofFile       = file
    this.proofPreviewUrl = URL.createObjectURL(file)
  },

  async uploadProofToStorage(saleId) {
    if (!this.proofFile) return null

    const ext      = this.proofFile.name.split('.').pop() || 'jpg'
    const filename = `${saleId}-${Date.now()}.${ext}`

    this.uploadingProof = true
    try {
      const { error: uploadErr } = await supabase.storage
        .from('payment-proofs')
        .upload(filename, this.proofFile, {
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadErr) throw uploadErr

      const { data: urlData } = supabase.storage
        .from('payment-proofs')
        .getPublicUrl(filename)

      return urlData?.publicUrl ?? null
    } catch (err) {
      throw new Error('Upload bukti bayar gagal: ' + err.message)
    } finally {
      this.uploadingProof = false
    }
  },

  // ── Confirm payment ───────────────────────────────────────────────────────

  async confirmPayment() {
    if (!this.canConfirmPay || this.paying) return
    this.paying = true

    try {
      // 1. Ambil location_id aktif pertama
      const { data: locData, error: locErr } = await supabase
        .from('locations')
        .select('id')
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (locErr || !locData) {
        throw new Error('Lokasi tidak ditemukan. Pastikan minimal satu lokasi tersedia.')
      }

      const locationId = locData.id

      // 2. Insert ke tabel sales
      const { data: saleData, error: saleErr } = await supabase
        .from('sales')
        .insert({
          channel:        'offline',
          location_id:    locationId,
          staff_id:       this.staffId,
          total_amount:   this.cartTotal,
          payment_status: 'unpaid',
          order_status:   'pending',
        })
        .select('id')
        .single()

      if (saleErr) throw saleErr

      const saleId = saleData.id

      // 3. Insert sale_items
      const saleItems = this.cart.map(i => ({
        sale_id:    saleId,
        product_id: i.id,
        variant_id: i.variant_id ?? null,
        quantity:   i.qty,
        unit_price: i.sell_price,
        subtotal:   i.sell_price * i.qty,
      }))

      const { error: itemsErr } = await supabase
        .from('sale_items')
        .insert(saleItems)

      if (itemsErr) throw itemsErr

      // 4. Upload bukti bayar jika diperlukan
      let proofUrl = null
      if (this.requiresProof && this.proofFile) {
        proofUrl = await this.uploadProofToStorage(saleId)
      }

      // 5. Susun payment_detail berdasarkan metode
      let paymentDetail = null
      if (this.payMethod === 'transfer' && this.selectedBankInfo) {
        const b = this.selectedBankInfo
        paymentDetail = `Transfer ${b.bank_name} - ${b.account_number} a/n ${b.account_name}`
      } else if (['gopay', 'ovo', 'dana'].includes(this.payMethod)) {
        paymentDetail = { ewallet: this.payMethod, nomor: this.ewalletInfo.nomor }
      }

      // 6. Insert ke tabel payments
      const paymentRow = {
        sale_id:  saleId,
        method:   this.payMethod,
        amount:   this.cartTotal,
        status:   'success',
        paid_at:  new Date().toISOString(),
      }
      if (proofUrl != null)      paymentRow.proof_url       = proofUrl
      if (paymentDetail != null) paymentRow.payment_detail  = paymentDetail

      // Untuk cash: sertakan nominal bayar
      if (this.payMethod === 'cash') {
        paymentRow.amount = Number(this.nominalBayar)
      }

      const { error: payErr } = await supabase
        .from('payments')
        .insert(paymentRow)

      if (payErr) throw payErr

      // 7. Update sales → paid + completed
      const { error: updateErr } = await supabase
        .from('sales')
        .update({ payment_status: 'paid', order_status: 'completed' })
        .eq('id', saleId)

      if (updateErr) throw updateErr

      // 8. Simpan snapshot struk
      const now = new Date()
      this.receipt = {
        saleId:    saleId,
        tanggal:   now.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }),
        jam:       now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        items:     this.cart.map(i => ({ ...i })),
        total:     this.cartTotal,
        nominal:   this.payMethod === 'cash' ? Number(this.nominalBayar) : this.cartTotal,
        kembalian: this.payMethod === 'cash' ? (Number(this.nominalBayar) - this.cartTotal) : 0,
        kasir:     this.staffUser.name,
        method:    this.payMethod,
        isReprint: false,
      }

      // 9. Tutup modal, tampilkan struk, refresh data
      this.clearProof()
      this.closePayModal()
      this.showReceiptModal = true
      this.showAlert('success', 'Pembayaran berhasil! Transaksi telah tercatat.')
      await Promise.all([
        this.fetchProducts(),
        this.fetchTransactions(),
      ])

    } catch (err) {
      this.showAlert('error', 'Transaksi gagal: ' + err.message)
    } finally {
      this.paying = false
    }
  },

  // ── Receipt ───────────────────────────────────────────────────────────────
  closeReceipt() {
    this.showReceiptModal = false
    this.clearCart()

    const wasReprint = this.receipt.isReprint
    this.receipt = {
      saleId: '', tanggal: '', jam: '', items: [], total: 0,
      nominal: 0, kembalian: 0, kasir: '', method: 'cash', isReprint: false
    }

    if (!wasReprint) {
      this.activeTab = 'produk'
      this.fetchProducts()
    } else {
      this.activeTab = 'riwayat'
    }
  },

  printStruk() {
    window.print()
  },

  // ── Riwayat transaksi ──────────────────────────────────────────────────────────

  async fetchTransactions() {
    this.loadingTrx = true
    try {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date()
      todayEnd.setHours(23, 59, 59, 999)

      const { data, error } = await supabase
        .from('sales')
        .select(`
          id, total_amount, payment_status, order_status, created_at,
          payments ( method, amount, status )
        `)
        .eq('channel', 'offline')
        .gte('created_at', todayStart.toISOString())
        .lte('created_at', todayEnd.toISOString())
        .order('created_at', { ascending: false })

      if (error) throw error

      this.transactions = (data || []).map(s => ({
        ...s,
        payMethod: s.payments?.[0]?.method ?? '—',
        jam: new Date(s.created_at).toLocaleTimeString('id-ID', {
          hour: '2-digit', minute: '2-digit',
        }),
      }))

      this.todayOmzet = this.transactions
        .filter(s => s.payment_status === 'paid')
        .reduce((sum, s) => sum + (s.total_amount ?? 0), 0)

    } catch (err) {
      this.showAlert('error', 'Gagal memuat riwayat transaksi: ' + err.message)
    } finally {
      this.loadingTrx = false
    }
  },

  async openTrxDetail(trx) {
    this.activeTrx = trx
    this.trxDetailItems = []
    this.loadingTrxDetail = true
    this.showTrxDetailModal = true
    try {
      const { data, error } = await supabase
        .from('sale_items')
        .select('quantity, unit_price, subtotal, products ( name, unit )')
        .eq('sale_id', trx.id)
        .order('id')
      if (error) throw error
      this.trxDetailItems = (data || []).map(i => ({
        name:       i.products?.name ?? '—',
        unit:       i.products?.unit ?? 'pcs',
        quantity:   i.quantity,
        unit_price: i.unit_price,
        subtotal:   i.subtotal,
      }))
    } catch (err) {
      this.showAlert('error', 'Gagal memuat detail transaksi: ' + err.message)
    } finally {
      this.loadingTrxDetail = false
    }
  },

  closeTrxDetail() {
    this.showTrxDetailModal = false
    this.activeTrx = null
    this.trxDetailItems = []
  },

  async reprintTrx(trx) {
    this.closeTrxDetail()
    this.loadingTrx = true
    try {
      const { data, error } = await supabase
        .from('sale_items')
        .select(`
          quantity, unit_price,
          products ( name ),
          product_variants (
            colors ( name )
          )
        `)
        .eq('sale_id', trx.id)
        .order('id')

      if (error) throw error

      const items = (data || []).map(i => ({
        name:       i.products?.name ?? '—',
        color_name: i.product_variants?.colors?.name ?? null,
        qty:        i.quantity,
        sell_price: i.unit_price
      }))

      const nominal   = trx.payments?.[0]?.amount ?? trx.total_amount
      const payMethod = trx.payments?.[0]?.method ?? 'cash'
      const kembalian = payMethod === 'cash' ? (nominal - trx.total_amount) : 0

      this.receipt = {
        saleId:    trx.id,
        tanggal:   new Date(trx.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }),
        jam:       trx.jam,
        items:     items,
        total:     trx.total_amount,
        nominal:   nominal,
        kembalian: kembalian,
        kasir:     this.staffUser.name,
        method:    payMethod,
        isReprint: true,
      }

      this.showReceiptModal = true
    } catch (err) {
      this.showAlert('error', 'Gagal memuat data struk cetak ulang: ' + err.message)
    } finally {
      this.loadingTrx = false
    }
  },

  statusLabel(s) {
    const map = { paid: 'Lunas', unpaid: 'Belum Bayar', partial: 'Sebagian' }
    return map[s] ?? s
  },

  methodLabel(m) {
    const map = {
      cash:     'Tunai',
      qris:     'QRIS',
      transfer: 'Transfer Bank',
      gopay:    'GoPay',
      ovo:      'OVO',
      dana:     'Dana',
      debit:    'Debit (EDC)',
    }
    return map[m] ?? m
  },

  // ── Helpers ───────────────────────────────────────────────────────────────
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
