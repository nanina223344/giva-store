/**
 * src/toko/orders.js
 * Logic Halaman Riwayat Pesanan Pelanggan — Giva Store.
 */

import '../style.css'
import Alpine from 'alpinejs'
import { supabase } from '../supabaseClient.js'
import {
  storeShellFields,
  injectComponents,
  formatPrice,
  syncCustomerSession,
  fetchStoreSettings,
} from './store-common.js'

injectComponents()
window.Alpine = Alpine

const _clean = (str) => (str || '').replace(/^["']+|["']+$/g, '').trim()

Alpine.data('storeOrders', () => ({
  ...storeShellFields(),

  loading: true,
  orders: [],
  bankAccounts: [],
  activeTab: 'all', // 'all', 'unpaid', 'pending', 'processing', 'shipped', 'completed', 'cancelled'
  
  // Highlight order from ?new=
  highlightId: null,
  toast: {
    show: false,
    message: '',
    type: 'success',
    timeoutId: null,
  },

  // Modal Detail & Upload State
  selectedOrder: null,
  showDetailModal: false,

  // Upload Proof State
  uploadForm: {
    file: null,
    previewUrl: null,
    uploading: false,
    error: '',
    success: '',
  },

  // Cancel Confirmation Modal State
  cancelModal: {
    show: false,
    order: null,
    cancelling: false,
    error: '',
  },

  async init() {
    // 1. Auth Guard
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      sessionStorage.setItem('redirect_after_login', window.location.pathname + window.location.search)
      window.location.replace('/toko/login.html')
      return
    }

    const { customer } = await syncCustomerSession()
    this.customer = customer

    await this.initShell()
    await Promise.all([
      this.fetchOrders(),
      this.fetchBankAccounts(),
    ])

    this.loading = false

    // Check ?new=[sale_id] query param
    const params = new URLSearchParams(window.location.search)
    const newId = params.get('new')
    if (newId) {
      this.highlightId = newId
      this.showToast('Pesanan berhasil dibuat! Selesaikan pembayaran untuk memproses pesanan.', 'info')
      
      this.$nextTick(() => {
        const el = document.getElementById(`order-card-${newId}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      })

      // Remove query param without reload
      window.history.replaceState({}, '', '/toko/orders.html')

      // Clear highlight effect after 3.5s
      setTimeout(() => {
        this.highlightId = null
      }, 3500)
    }
  },

  showToast(msg, type = 'success') {
    if (this.toast.timeoutId) clearTimeout(this.toast.timeoutId)
    this.toast.message = msg
    this.toast.type = type
    this.toast.show = true
    this.toast.timeoutId = setTimeout(() => {
      this.toast.show = false
    }, 4500)
  },

  async fetchBankAccounts() {
    try {
      const { data } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (data) this.bankAccounts = data
    } catch (err) {
      console.error('Fetch bank accounts error:', err)
    }
  },

  async fetchOrders() {
    if (!this.customer?.id) return
    try {
      const { data, error } = await supabase
        .from('sales')
        .select(`
          id,
          channel,
          subtotal,
          discount_amount,
          total_amount,
          payment_status,
          order_status,
          created_at,
          sale_items (
            id,
            product_id,
            variant_id,
            quantity,
            unit_price,
            subtotal,
            products ( id, name, image_url, brand_name ),
            product_variants ( id, colors ( name, hex_code ) )
          ),
          payments (
            id,
            method,
            status,
            amount,
            proof_url,
            payment_detail,
            paid_at
          ),
          shipping (
            id,
            shipping_cost,
            shipping_address,
            recipient_name,
            recipient_phone,
            city,
            province,
            postal_code,
            tracking_no,
            status,
            shipping_zones ( name, cost )
          )
        `)
        .eq('customer_id', this.customer.id)
        .eq('channel', 'online')
        .order('created_at', { ascending: false })

      if (error) throw error

      if (data) {
        this.orders = data.map((sale) => this.processOrderData(sale))
      }
    } catch (err) {
      console.error('Fetch orders error:', err)
    }
  },

  processOrderData(sale) {
    const items = (sale.sale_items || []).map((item) => ({
      id: item.id,
      product_id: item.product_id,
      name: item.products?.name || 'Produk',
      brand_name: _clean(item.products?.brand_name),
      image_url: item.products?.image_url || null,
      color_name: item.product_variants?.colors?.name || null,
      hex_code: item.product_variants?.colors?.hex_code || null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      subtotal: item.subtotal,
    }))

    const payment = (sale.payments && sale.payments.length > 0) ? sale.payments[0] : null
    const shipping = (sale.shipping && sale.shipping.length > 0) ? sale.shipping[0] : null

    // Determine status badge label & color
    let statusLabel = ''
    let statusBadgeClass = ''

    if (sale.order_status === 'cancelled') {
      statusLabel = 'Dibatalkan'
      statusBadgeClass = 'bg-stone/15 text-stone border-stone/20'
    } else if (sale.payment_status === 'unpaid') {
      statusLabel = 'Menunggu Pembayaran'
      statusBadgeClass = 'bg-amber-100 text-amber-800 border-amber-200'
    } else if (sale.payment_status === 'paid' && sale.order_status === 'pending') {
      statusLabel = 'Menunggu Konfirmasi'
      statusBadgeClass = 'bg-sage/15 text-sage-deep border-sage/20'
    } else if (sale.order_status === 'processing') {
      statusLabel = 'Sedang Diproses'
      statusBadgeClass = 'bg-blue-100 text-blue-800 border-blue-200'
    } else if (sale.order_status === 'shipped') {
      statusLabel = 'Dalam Pengiriman'
      statusBadgeClass = 'bg-purple-100 text-purple-800 border-purple-200'
    } else if (sale.order_status === 'completed') {
      statusLabel = 'Selesai'
      statusBadgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-200'
    } else {
      statusLabel = 'Diproses'
      statusBadgeClass = 'bg-sage/15 text-sage-deep border-sage/20'
    }

    // Payment method label
    let paymentMethodLabel = 'Transfer Bank'
    if (payment?.method) {
      const m = payment.method.toLowerCase()
      if (m === 'qris') paymentMethodLabel = 'QRIS'
      else if (m === 'gopay') paymentMethodLabel = 'GoPay'
      else if (m === 'ovo') paymentMethodLabel = 'OVO'
      else if (m === 'dana') paymentMethodLabel = 'DANA'
      else if (m.includes('transfer') || m === 'transfer') {
        paymentMethodLabel = payment.payment_detail || 'Transfer Bank'
      } else {
        paymentMethodLabel = payment.method
      }
    }

    return {
      ...sale,
      items,
      previewItems: items.slice(0, 3),
      moreCount: Math.max(0, items.length - 3),
      payment,
      shipping,
      statusLabel,
      statusBadgeClass,
      paymentMethodLabel,
      orderCode: '#' + sale.id.substring(0, 8).toUpperCase(),
    }
  },

  // Filtered orders list based on active tab
  get filteredOrders() {
    if (this.activeTab === 'all') return this.orders
    return this.orders.filter((o) => {
      if (this.activeTab === 'unpaid') return o.payment_status === 'unpaid' && o.order_status !== 'cancelled'
      if (this.activeTab === 'pending') return o.payment_status === 'paid' && o.order_status === 'pending'
      if (this.activeTab === 'processing') return o.order_status === 'processing'
      if (this.activeTab === 'shipped') return o.order_status === 'shipped'
      if (this.activeTab === 'completed') return o.order_status === 'completed'
      if (this.activeTab === 'cancelled') return o.order_status === 'cancelled'
      return true
    })
  },

  // Date formatter: "27 Jul 2026, 16.45"
  formatDate(dateStr) {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
    const day = d.getDate()
    const month = months[d.getMonth()]
    const year = d.getFullYear()
    const hours = String(d.getHours()).padStart(2, '0')
    const mins = String(d.getMinutes()).padStart(2, '0')
    return `${day} ${month} ${year}, ${hours}.${mins}`
  },

  // Open Detail Modal
  openDetailModal(order) {
    this.selectedOrder = order
    this.showDetailModal = true
    this.resetUploadForm()
  },

  closeDetailModal() {
    this.showDetailModal = false
    this.selectedOrder = null
    this.resetUploadForm()
  },

  // Reset File Upload Form
  resetUploadForm() {
    this.uploadForm = {
      file: null,
      previewUrl: null,
      uploading: false,
      error: '',
      success: '',
    }
  },

  // File Select Handler
  handleFileSelect(event) {
    const file = event.target.files[0]
    this.uploadForm.error = ''
    this.uploadForm.success = ''

    if (!file) return

    // 5MB Limit check
    if (file.size > 5 * 1024 * 1024) {
      this.uploadForm.error = 'Ukuran file maksimal 5MB.'
      event.target.value = ''
      return
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      this.uploadForm.error = 'Format file harus JPG, PNG, atau WEBP.'
      event.target.value = ''
      return
    }

    this.uploadForm.file = file
    this.uploadForm.previewUrl = URL.createObjectURL(file)
  },

  // Upload Payment Proof Action
  async uploadPaymentProof() {
    if (!this.uploadForm.file || !this.selectedOrder) return

    this.uploadForm.uploading = true
    this.uploadForm.error = ''
    this.uploadForm.success = ''

    try {
      const file = this.uploadForm.file
      const fileExt = file.name.split('.').pop()
      const fileName = `${this.selectedOrder.id}-customer-${Date.now()}.${fileExt}`

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('payment-proofs')
        .upload(fileName, file, { upsert: true })

      if (uploadErr) throw uploadErr

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('payment-proofs')
        .getPublicUrl(fileName)

      const finalUrl = publicUrl || uploadData.path

      // Update payments table
      const paymentId = this.selectedOrder.payment?.id
      if (paymentId) {
        const { error: updateErr } = await supabase
          .from('payments')
          .update({
            proof_url: finalUrl,
            status: 'pending',
            paid_at: new Date().toISOString(),
          })
          .eq('id', paymentId)

        if (updateErr) throw updateErr
      } else {
        // Insert if missing
        const { error: insertErr } = await supabase
          .from('payments')
          .insert({
            sale_id: this.selectedOrder.id,
            method: 'transfer',
            status: 'pending',
            amount: this.selectedOrder.total_amount,
            proof_url: finalUrl,
            uploaded_by: 'customer',
            paid_at: new Date().toISOString(),
          })

        if (insertErr) throw insertErr
      }

      this.uploadForm.success = 'Bukti pembayaran berhasil diupload. Tim kami akan memverifikasi dalam 1x24 jam.'
      this.showToast('Bukti pembayaran berhasil diupload', 'success')

      // Refresh order list & detail modal data
      await this.fetchOrders()
      const updated = this.orders.find((o) => o.id === this.selectedOrder.id)
      if (updated) this.selectedOrder = updated

    } catch (err) {
      console.error('Upload proof error:', err)
      this.uploadForm.error = 'Gagal mengunggah bukti bayar: ' + (err.message || err)
    } finally {
      this.uploadForm.uploading = false
    }
  },

  // Open Cancel Modal
  openCancelModal(order) {
    this.cancelModal = {
      show: true,
      order: order,
      cancelling: false,
      error: '',
    }
  },

  closeCancelModal() {
    this.cancelModal.show = false
    this.cancelModal.order = null
  },

  // Confirm Cancel Order
  async confirmCancelOrder() {
    const order = this.cancelModal.order
    if (!order) return

    this.cancelModal.cancelling = true
    this.cancelModal.error = ''

    try {
      const { error } = await supabase
        .from('sales')
        .update({ order_status: 'cancelled' })
        .eq('id', order.id)

      if (error) throw error

      this.showToast('Pesanan berhasil dibatalkan', 'warning')
      this.closeCancelModal()

      if (this.showDetailModal) {
        this.closeDetailModal()
      }

      // Refresh list
      await this.fetchOrders()

    } catch (err) {
      console.error('Cancel order error:', err)
      this.cancelModal.error = 'Gagal membatalkan pesanan: ' + (err.message || err)
    } finally {
      this.cancelModal.cancelling = false
    }
  },

  formatPrice,
}))

Alpine.start()
