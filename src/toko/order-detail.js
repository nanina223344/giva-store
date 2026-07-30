/**
 * Detail pesanan + upload bukti + batalkan — /toko/order-detail.html
 */

import '../style.css'
import Alpine from 'alpinejs'
import { supabase } from '../supabaseClient.js'
import {
  storeShellFields,
  requireCustomerAuth,
  formatPrice,
} from './store-common.js'
import {
  orderNumber,
  displayOrderStatus,
  firstPayment,
  firstShipping,
  formatOrderDate,
  methodLabel,
  paymentStatusLabel,
  mapSaleItem,
  SALE_LIST_SELECT,
  SALE_LIST_SELECT_FALLBACK,
} from './order-helpers.js'

window.Alpine = Alpine

Alpine.data('storeOrderDetail', () => ({
  ...storeShellFields(),

  loading: true,
  order: null,
  notFound: false,
  error: '',
  customerId: null,

  // payment info for unpaid
  bankAccounts: [],
  paySettings: {},

  // upload
  proofFile: null,
  proofPreview: '',
  uploading: false,
  uploadSuccess: false,
  uploadError: '',

  cancelling: false,

  get saleId() {
    return new URLSearchParams(window.location.search).get('id')
  },

  get pay() {
    return firstPayment(this.order)
  },

  get ship() {
    return firstShipping(this.order)
  },

  get statusLabel() {
    return displayOrderStatus(this.order)
  },

  get canUploadProof() {
    if (!this.order) return false
    if (this.order.order_status === 'cancelled') return false
    return this.order.payment_status === 'unpaid'
  },

  get canCancel() {
    if (!this.order) return false
    return (
      this.order.order_status === 'pending' &&
      this.order.payment_status === 'unpaid'
    )
  },

  get method() {
    return this.pay?.method || ''
  },

  get qrisImageUrl() {
    return (
      this.paySettings.payment_qris_image_url ||
      this.paySettings.qris_url ||
      ''
    )
  },

  get ewalletNumber() {
    const map = {
      gopay: 'ewallet_gopay',
      ovo: 'ewallet_ovo',
      dana: 'ewallet_dana',
    }
    const key = map[this.method]
    return key ? this.paySettings[key] || '' : ''
  },

  async init() {
    await this.initShell()
    const { customer } = await requireCustomerAuth(
      `/toko/order-detail.html?id=${encodeURIComponent(this.saleId || '')}`,
    )
    this.customer = customer
    this.customerId = customer?.id || null

    if (!this.saleId) {
      this.notFound = true
      this.loading = false
      return
    }

    if (!this.customerId) {
      this.error = 'Data customer tidak ditemukan.'
      this.loading = false
      return
    }

    await Promise.all([this.fetchOrder(), this.fetchPaymentInfo()])
    if (this.order) {
      document.title = `Pesanan #${orderNumber(this.order.id)} — ${this.storeName}`
    }
    this.loading = false
  },

  async fetchOrder() {
    try {
      let { data, error } = await supabase
        .from('sales')
        .select(SALE_LIST_SELECT)
        .eq('id', this.saleId)
        .eq('customer_id', this.customerId)
        .eq('channel', 'online')
        .maybeSingle()

      if (error) {
        const retry = await supabase
          .from('sales')
          .select(SALE_LIST_SELECT_FALLBACK)
          .eq('id', this.saleId)
          .eq('customer_id', this.customerId)
          .maybeSingle()
        if (retry.error) throw retry.error
        data = retry.data
      }

      if (!data) {
        this.notFound = true
        this.order = null
        return
      }

      const items = (data.sale_items || []).map(mapSaleItem)
      this.order = { ...data, items }
    } catch (err) {
      this.error = err.message
      this.notFound = true
    }
  },

  async fetchPaymentInfo() {
    try {
      const [settingsRes, banksRes] = await Promise.all([
        supabase.from('settings').select('key, value'),
        supabase
          .from('bank_accounts')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
      ])
      const map = {}
      for (const row of settingsRes.data || []) {
        map[row.key] = row.value ?? ''
      }
      this.paySettings = map
      this.bankAccounts = banksRes.data || []
    } catch (err) {
      console.warn(err)
    }
  },

  /** Parse bank from payment_detail string if possible */
  get transferHint() {
    const detail = this.pay?.payment_detail
    if (typeof detail === 'string' && detail) return detail
    if (this.bankAccounts.length === 1) {
      const b = this.bankAccounts[0]
      return `Transfer ${b.bank_name} - ${b.account_number} a/n ${b.account_name}`
    }
    return null
  },

  shipCost() {
    const s = this.ship
    if (!s) return null
    return s.shipping_cost ?? s.cost ?? null
  },

  zoneName() {
    const s = this.ship
    const z = s?.shipping_zones
    if (!z) return null
    return Array.isArray(z) ? z[0]?.name : z.name
  },

  onProofPick(event) {
    const file = event.target.files?.[0]
    this.uploadError = ''
    this.uploadSuccess = false
    if (this.proofPreview) URL.revokeObjectURL(this.proofPreview)
    this.proofFile = null
    this.proofPreview = ''
    if (!file) return

    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) {
      this.uploadError = 'Format harus JPG, PNG, atau WebP.'
      event.target.value = ''
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      this.uploadError = 'Maksimal 5 MB.'
      event.target.value = ''
      return
    }
    this.proofFile = file
    this.proofPreview = URL.createObjectURL(file)
  },

  async uploadProof() {
    if (!this.proofFile || !this.order || this.uploading) return
    this.uploading = true
    this.uploadError = ''
    this.uploadSuccess = false

    try {
      const ext = this.proofFile.name.split('.').pop() || 'jpg'
      const filename = `${this.order.id}-customer.${ext}`

      const { error: upErr } = await supabase.storage
        .from('payment-proofs')
        .upload(filename, this.proofFile, {
          cacheControl: '3600',
          upsert: true,
        })
      if (upErr) throw upErr

      const { data: urlData } = supabase.storage
        .from('payment-proofs')
        .getPublicUrl(filename)
      const publicUrl = urlData?.publicUrl
      if (!publicUrl) throw new Error('Gagal mendapatkan URL bukti.')

      const paymentId = this.pay?.id
      if (paymentId) {
        const { error: payErr } = await supabase
          .from('payments')
          .update({
            proof_url: publicUrl,
            status: 'pending',
            uploaded_by: 'customer',
          })
          .eq('id', paymentId)
        if (payErr) {
          // retry without uploaded_by
          const { error: e2 } = await supabase
            .from('payments')
            .update({ proof_url: publicUrl, status: 'pending' })
            .eq('id', paymentId)
          if (e2) throw e2
        }
      } else {
        // create payment row if missing
        const row = {
          sale_id: this.order.id,
          method: 'transfer',
          amount: this.order.total_amount,
          status: 'pending',
          proof_url: publicUrl,
          uploaded_by: 'customer',
        }
        const { error: insErr } = await supabase.from('payments').insert(row)
        if (insErr) {
          delete row.uploaded_by
          const r2 = await supabase.from('payments').insert(row)
          if (r2.error) throw insErr
        }
      }

      this.uploadSuccess = true
      this.proofFile = null
      if (this.proofPreview) URL.revokeObjectURL(this.proofPreview)
      this.proofPreview = ''
      await this.fetchOrder()
    } catch (err) {
      this.uploadError = 'Upload gagal: ' + err.message
    } finally {
      this.uploading = false
    }
  },

  async cancelOrder() {
    if (!this.canCancel || this.cancelling) return
    if (
      !confirm(
        'Batalkan pesanan ini? Tindakan ini tidak bisa dibatalkan.',
      )
    ) {
      return
    }
    this.cancelling = true
    try {
      const { error } = await supabase
        .from('sales')
        .update({ order_status: 'cancelled' })
        .eq('id', this.order.id)
        .eq('customer_id', this.customerId)
      if (error) throw error
      await this.fetchOrder()
    } catch (err) {
      this.error = 'Gagal membatalkan: ' + err.message
    } finally {
      this.cancelling = false
    }
  },

  orderNumber,
  formatOrderDate,
  formatPrice,
  methodLabel,
  paymentStatusLabel,
}))

Alpine.start()
