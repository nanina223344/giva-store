/**
 * src/admin/orders.js
 * Logic Halaman Manajemen Pesanan Online Panel Admin — Giva Store.
 */

import '../style.css'
import Alpine from 'alpinejs'
import { supabase } from '../supabaseClient.js'
import { requireAuth, getStaffUser, signOut } from './auth.js'
import { initSidebar, fetchPendingOrdersCount } from '../../admin/js/sidebar.js'

window.Alpine = Alpine

const _clean = (str) => (str || '').replace(/^["']+|["']+$/g, '').trim()

Alpine.data('ordersAdmin', () => ({
  loading: true,
  staffUser: null,

  orders: [],
  pendingVerificationCount: 0,

  // Filters & Search
  activeStatusTab: 'all', // 'all', 'unpaid', 'pending_verification', 'processing', 'shipped', 'completed', 'cancelled'
  searchQuery: '',
  startDate: '',
  endDate: '',

  // Modal Detail State
  selectedOrder: null,
  showDetailModal: false,

  // Resi & Shipping status form state
  trackingInput: '',
  shippingStatusInput: 'pending',
  savingShippingInfo: false,
  shippingSuccessMsg: '',

  // Rejection Modal State
  rejectModal: {
    show: false,
    reason: '',
    submitting: false,
    error: '',
  },

  // Cancel Order Modal State
  cancelModal: {
    show: false,
    submitting: false,
    error: '',
  },

  // Toast Notification
  toast: {
    show: false,
    message: '',
    type: 'success',
    timeoutId: null,
  },

  async init() {
    try {
      await requireAuth()
      this.staffUser = await getStaffUser()
      initSidebar(this.staffUser, signOut)

      await this.fetchOrders()
      this.loading = false
    } catch (err) {
      // requireAuth handles redirect
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

  async fetchOrders() {
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
          customers (
            id,
            name,
            email,
            phone
          ),
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
            notes,
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
        .eq('channel', 'online')
        .order('created_at', { ascending: false })

      if (error) throw error

      if (data) {
        this.orders = data.map((o) => this.processOrderData(o))
        this.pendingVerificationCount = this.orders.filter(
          (o) => o.payment && o.payment.status === 'pending'
        ).length
      }

      fetchPendingOrdersCount()
    } catch (err) {
      console.error('Fetch admin orders error:', err)
      this.showToast('Gagal memuat pesanan: ' + err.message, 'warning')
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
      payment,
      shipping,
      customerName: sale.customers?.name || 'Guest',
      customerEmail: sale.customers?.email || '-',
      customerPhone: sale.customers?.phone || '-',
      statusLabel,
      statusBadgeClass,
      paymentMethodLabel,
      orderCode: '#' + sale.id.substring(0, 8).toUpperCase(),
    }
  },

  // Filtered orders list by Tab, Search & Date Range
  get filteredOrders() {
    return this.orders.filter((o) => {
      // 1. Status Tab Filter
      if (this.activeStatusTab === 'unpaid') {
        if (o.payment_status !== 'unpaid' || o.order_status === 'cancelled') return false
      } else if (this.activeStatusTab === 'pending_verification') {
        if (!o.payment || o.payment.status !== 'pending') return false
      } else if (this.activeStatusTab === 'processing') {
        if (o.order_status !== 'processing') return false
      } else if (this.activeStatusTab === 'shipped') {
        if (o.order_status !== 'shipped') return false
      } else if (this.activeStatusTab === 'completed') {
        if (o.order_status !== 'completed') return false
      } else if (this.activeStatusTab === 'cancelled') {
        if (o.order_status !== 'cancelled') return false
      }

      // 2. Search Query Filter
      if (this.searchQuery.trim().length > 0) {
        const q = this.searchQuery.trim().toLowerCase()
        const codeMatch = o.orderCode.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)
        const nameMatch = o.customerName.toLowerCase().includes(q)
        if (!codeMatch && !nameMatch) return false
      }

      // 3. Date Range Filter
      if (this.startDate) {
        const start = new Date(this.startDate + 'T00:00:00')
        const orderDate = new Date(o.created_at)
        if (orderDate < start) return false
      }
      if (this.endDate) {
        const end = new Date(this.endDate + 'T23:59:59')
        const orderDate = new Date(o.created_at)
        if (orderDate > end) return false
      }

      return true
    })
  },

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

  // Modal Actions
  openDetailModal(order) {
    this.selectedOrder = order
    this.trackingInput = order.shipping?.tracking_no || ''
    this.shippingStatusInput = order.shipping?.status || 'pending'
    this.shippingSuccessMsg = ''
    this.showDetailModal = true
  },

  closeDetailModal() {
    this.showDetailModal = false
    this.selectedOrder = null
  },

  // Save Shipping Info (Resi & Status)
  async saveShippingInfo() {
    if (!this.selectedOrder?.shipping?.id) return
    this.savingShippingInfo = true
    this.shippingSuccessMsg = ''

    try {
      const { error } = await supabase
        .from('shipping')
        .update({
          tracking_no: this.trackingInput.trim() || null,
          status: this.shippingStatusInput,
        })
        .eq('id', this.selectedOrder.shipping.id)

      if (error) throw error

      this.shippingSuccessMsg = 'Informasi pengiriman berhasil diperbarui.'
      this.showToast('Resi & status pengiriman diperbarui', 'success')
      await this.refreshSelectedOrder()

    } catch (err) {
      console.error('Save shipping info error:', err)
      this.showToast('Gagal memperbarui pengiriman: ' + err.message, 'warning')
    } finally {
      this.savingShippingInfo = false
    }
  },

  // Verify Payment Action
  async verifyPayment() {
    if (!this.selectedOrder || !this.selectedOrder.payment) return

    try {
      const paymentId = this.selectedOrder.payment.id
      const saleId = this.selectedOrder.id

      // 1. Update payments
      const { error: payErr } = await supabase
        .from('payments')
        .update({
          status: 'success',
          paid_at: new Date().toISOString(),
        })
        .eq('id', paymentId)

      if (payErr) throw payErr

      // 2. Update sales
      const { error: saleErr } = await supabase
        .from('sales')
        .update({
          payment_status: 'paid',
          order_status: 'processing',
        })
        .eq('id', saleId)

      if (saleErr) throw saleErr

      this.showToast('Pembayaran terverifikasi. Pesanan siap diproses.', 'success')
      await this.refreshSelectedOrder()

    } catch (err) {
      console.error('Verify payment error:', err)
      this.showToast('Gagal memverifikasi pembayaran: ' + err.message, 'warning')
    }
  },

  // Open Reject Modal
  openRejectModal() {
    this.rejectModal = {
      show: true,
      reason: '',
      submitting: false,
      error: '',
    }
  },

  closeRejectModal() {
    this.rejectModal.show = false
  },

  // Confirm Reject Payment Action
  async confirmRejectPayment() {
    if (!this.rejectModal.reason.trim()) {
      this.rejectModal.error = 'Alasan penolakan wajib diisi.'
      return
    }

    if (!this.selectedOrder || !this.selectedOrder.payment) return

    this.rejectModal.submitting = true
    this.rejectModal.error = ''

    try {
      const paymentId = this.selectedOrder.payment.id
      const saleId = this.selectedOrder.id

      // 1. Update payments: status='failed', notes=reason
      const { error: payErr } = await supabase
        .from('payments')
        .update({
          status: 'failed',
          notes: this.rejectModal.reason.trim(),
        })
        .eq('id', paymentId)

      if (payErr) throw payErr

      // 2. Update sales: payment_status='unpaid'
      const { error: saleErr } = await supabase
        .from('sales')
        .update({
          payment_status: 'unpaid',
        })
        .eq('id', saleId)

      if (saleErr) throw saleErr

      this.showToast('Pembayaran ditolak. Customer perlu upload ulang bukti bayar.', 'warning')
      this.closeRejectModal()
      await this.refreshSelectedOrder()

    } catch (err) {
      console.error('Reject payment error:', err)
      this.rejectModal.error = 'Gagal menolak pembayaran: ' + err.message
    } finally {
      this.rejectModal.submitting = false
    }
  },

  // Manual Update Order Status (from dropdown)
  async updateOrderStatus(newStatus) {
    if (!this.selectedOrder) return

    if (newStatus === this.selectedOrder.order_status) return

    // If changing to 'shipped', tracking_no MUST be filled first!
    if (newStatus === 'shipped') {
      const currentResi = (this.trackingInput || this.selectedOrder.shipping?.tracking_no || '').trim()
      if (!currentResi) {
        alert('Isi nomor resi pengiriman terlebih dahulu sebelum mengubah status ke Dalam Pengiriman.')
        return
      }
    }

    // If setting to 'cancelled', open confirm modal instead
    if (newStatus === 'cancelled') {
      this.openCancelModal()
      return
    }

    try {
      const { error } = await supabase
        .from('sales')
        .update({ order_status: newStatus })
        .eq('id', this.selectedOrder.id)

      if (error) throw error

      this.showToast(`Status pesanan diperbarui ke ${newStatus}`, 'success')
      await this.refreshSelectedOrder()

    } catch (err) {
      console.error('Update order status error:', err)
      this.showToast('Gagal mengubah status: ' + err.message, 'warning')
    }
  },

  // Open Cancel Modal
  openCancelModal() {
    this.cancelModal = {
      show: true,
      submitting: false,
      error: '',
    }
  },

  closeCancelModal() {
    this.cancelModal.show = false
  },

  // Confirm Cancel Order Action
  async confirmCancelOrder() {
    if (!this.selectedOrder) return
    this.cancelModal.submitting = true
    this.cancelModal.error = ''

    try {
      const { error } = await supabase
        .from('sales')
        .update({ order_status: 'cancelled' })
        .eq('id', this.selectedOrder.id)

      if (error) throw error

      this.showToast('Pesanan berhasil dibatalkan.', 'warning')
      this.closeCancelModal()
      await this.refreshSelectedOrder()

    } catch (err) {
      console.error('Cancel order error:', err)
      this.cancelModal.error = 'Gagal membatalkan pesanan: ' + err.message
    } finally {
      this.cancelModal.submitting = false
    }
  },

  async refreshSelectedOrder() {
    await this.fetchOrders()
    if (this.selectedOrder) {
      const updated = this.orders.find((o) => o.id === this.selectedOrder.id)
      if (updated) {
        this.selectedOrder = updated
        this.trackingInput = updated.shipping?.tracking_no || ''
        this.shippingStatusInput = updated.shipping?.status || 'pending'
      }
    }
  },

  formatPrice(amount) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount || 0)
  },
}))

Alpine.start()
