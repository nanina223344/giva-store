/**
 * src/toko/checkout.js
 * Logic Halaman Checkout Storefront — Giva Store.
 */

import '../style.css'
import Alpine from 'alpinejs'
import { supabase } from '../supabaseClient.js'
import {
  storeShellFields,
  formatPrice,
  loadCart,
  saveCart,
  clearCart,
  fetchStoreSettings,
  syncCustomerSession,
} from './store-common.js'

window.Alpine = Alpine

const _clean = (str) => (str || '').replace(/^["']+|["']+$/g, '').trim()

Alpine.data('storeCheckout', () => ({
  ...storeShellFields(),

  loading: true,
  cartItems: [],
  cartSubtotal: 0,

  // Mobile Accordion state for summary
  summaryAccordionOpen: false,

  // Addresses
  loadingAddresses: true,
  addresses: [],
  selectedAddressId: null,
  shippingZonesList: [],
  showAddAddress: false,
  savingAddress: false,
  hasAddressError: false,

  newAddr: {
    label: '',
    recipient_name: '',
    phone: '',
    address: '',
    city: '',
    province: '',
    postal_code: '',
    shipping_zone_id: '',
  },

  // Payment Methods
  bankAccounts: [],
  selectedPaymentType: null, // 'transfer', 'qris', 'gopay', 'ovo', 'dana'
  selectedBankId: null,
  hasPaymentError: false,

  // Calculated Shipping
  shippingCost: 0,
  isFreeShipping: false,
  selectedZone: null,

  // Stock Warning Modal
  stockWarningModal: {
    show: false,
    item: null,
    available: 0,
  },

  // Submission State
  submitting: false,
  submitError: '',

  async init() {
    // 0. Restore cart from sessionStorage if coming back from login
    try {
      const cartBeforeLogin = sessionStorage.getItem('cart_before_login')
      if (cartBeforeLogin) {
        saveCart(JSON.parse(cartBeforeLogin))
        sessionStorage.removeItem('cart_before_login')
      }
    } catch (e) {}

    // 1. Auth Guard
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      // Save current cart before redirecting
      const currentCart = loadCart()
      if (currentCart.length > 0) {
        sessionStorage.setItem('cart_before_login', JSON.stringify(currentCart))
      }
      window.location.replace('/toko/login.html?redirect=/toko/checkout.html')
      return
    }

    const { customer } = await syncCustomerSession()
    this.customer = customer

    // 2. Load Cart Items
    this.cartItems = loadCart()
    if (this.cartItems.length === 0) {
      window.location.replace('/toko/products.html')
      return
    }
    this.cartSubtotal = this.cartItems.reduce((s, i) => s + (i.qty * (i.price || i.sell_price || 0)), 0)

    // 3. Fetch Settings, Bank Accounts, Shipping Zones, Addresses
    await Promise.all([
      fetchStoreSettings().then((s) => { this.settings = s }),
      this.fetchShippingZones(),
      this.fetchBankAccounts(),
      this.fetchAddresses(),
    ])

    // Auto-select default address
    if (this.addresses.length > 0) {
      const def = this.addresses.find((a) => a.is_default) || this.addresses[0]
      this.selectedAddressId = def.id
      this.calculateShipping()
    } else {
      this.showAddAddress = true
    }

    this.loading = false
  },

  async fetchAddresses() {
    if (!this.customer?.id) return
    this.loadingAddresses = true
    try {
      const { data, error } = await supabase
        .from('customer_addresses')
        .select(`
          *,
          shipping_zones ( id, name, cost, free_shipping_min_order )
        `)
        .eq('customer_id', this.customer.id)
        .order('is_default', { ascending: false })

      if (!error && data) {
        this.addresses = data
      }
    } catch (err) {
      console.error('Fetch addresses error:', err)
    } finally {
      this.loadingAddresses = false
    }
  },

  async fetchShippingZones() {
    try {
      const { data } = await supabase
        .from('shipping_zones')
        .select('*')
        .order('cost', { ascending: true })
      if (data) this.shippingZonesList = data
    } catch (err) {
      console.error('Fetch shipping zones error:', err)
    }
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

  calculateShipping() {
    this.hasAddressError = false
    const addr = this.addresses.find((a) => a.id === this.selectedAddressId)
    if (!addr || !addr.shipping_zones) {
      this.shippingCost = 0
      this.isFreeShipping = false
      this.selectedZone = null
      return
    }

    const zone = addr.shipping_zones
    this.selectedZone = zone
    this.shippingCost = Number(zone.cost || 0)

    if (zone.free_shipping_min_order && this.cartSubtotal >= Number(zone.free_shipping_min_order)) {
      this.isFreeShipping = true
    } else {
      this.isFreeShipping = false
    }
  },

  get totalAmount() {
    const finalShipping = this.isFreeShipping ? 0 : this.shippingCost
    return this.cartSubtotal + finalShipping
  },

  async saveNewAddress() {
    this.savingAddress = true
    try {
      const isFirst = this.addresses.length === 0
      const payload = {
        customer_id: this.customer.id,
        label: this.newAddr.label || 'Rumah',
        recipient_name: this.newAddr.recipient_name,
        phone: this.newAddr.phone,
        address: this.newAddr.address,
        city: this.newAddr.city,
        province: this.newAddr.province,
        postal_code: this.newAddr.postal_code || null,
        shipping_zone_id: this.newAddr.shipping_zone_id,
        is_default: isFirst,
      }

      const { data, error } = await supabase
        .from('customer_addresses')
        .insert(payload)
        .select('*, shipping_zones(id, name, cost, free_shipping_min_order)')
        .single()

      if (error) throw error

      await this.fetchAddresses()
      this.selectedAddressId = data.id
      this.calculateShipping()

      this.showAddAddress = false
      this.newAddr = {
        label: '',
        recipient_name: '',
        phone: '',
        address: '',
        city: '',
        province: '',
        postal_code: '',
        shipping_zone_id: '',
      }
    } catch (err) {
      alert('Gagal menyimpan alamat: ' + (err.message || err))
    } finally {
      this.savingAddress = false
    }
  },

  // Validation before submit order
  validateOrder() {
    this.hasAddressError = false
    this.hasPaymentError = false
    this.submitError = ''

    if (!this.selectedAddressId) {
      this.hasAddressError = true
      document.getElementById('section-address')?.scrollIntoView({ behavior: 'smooth' })
      return false
    }

    if (!this.selectedPaymentType) {
      this.hasPaymentError = true
      document.getElementById('section-payment')?.scrollIntoView({ behavior: 'smooth' })
      return false
    }

    if (this.selectedPaymentType === 'transfer' && !this.selectedBankId) {
      this.hasPaymentError = true
      document.getElementById('section-payment')?.scrollIntoView({ behavior: 'smooth' })
      return false
    }

    if (this.cartItems.length === 0) {
      this.submitError = 'Keranjang belanja Anda kosong.'
      return false
    }

    return true
  },

  async submitOrder() {
    if (!this.validateOrder()) return

    this.submitting = true
    this.submitError = ''

    try {
      // 1. Re-check stock from stock_available view
      const prodIds = this.cartItems.map((i) => i.product_id)
      const { data: stockData, error: stockErr } = await supabase
        .from('stock_available')
        .select('*')
        .in('product_id', prodIds)

      if (stockErr) throw stockErr

      for (const item of this.cartItems) {
        let matchingStock = null
        if (item.variant_id) {
          matchingStock = stockData.find((s) => s.variant_id === item.variant_id)
        } else {
          matchingStock = stockData.find((s) => s.product_id === item.product_id && !s.variant_id)
        }

        const avail = matchingStock ? Number(matchingStock.available_quantity || 0) : 0
        if (avail < item.qty) {
          // Stock changed! Show modal warning per item
          this.stockWarningModal = {
            show: true,
            item: item,
            available: avail,
          }
          this.submitting = false
          return
        }
      }

      // Proceed with actual order creation
      await this.executeOrderTransaction()

    } catch (err) {
      console.error('Order creation error:', err)
      this.submitError = 'Gagal membuat pesanan: ' + (err.message || err)
      this.submitting = false
    }
  },

  // Confirm stock reduction and continue
  async continueWithStockAdjustment() {
    const item = this.stockWarningModal.item
    const avail = this.stockWarningModal.available

    if (avail <= 0) {
      // Remove item if stock is 0
      this.cartItems = this.cartItems.filter((i) => !(i.product_id === item.product_id && i.variant_id === item.variant_id))
    } else {
      // Update item qty to available stock
      item.qty = avail
    }

    saveCart(this.cartItems)
    this.cartSubtotal = this.cartItems.reduce((s, i) => s + (i.qty * (i.price || i.sell_price || 0)), 0)
    this.calculateShipping()

    this.stockWarningModal.show = false

    if (this.cartItems.length === 0) {
      window.location.replace('/toko/products.html')
      return
    }

    // Try submitting again
    this.submitting = true
    try {
      await this.executeOrderTransaction()
    } catch (err) {
      console.error('Order retry error:', err)
      this.submitError = 'Gagal membuat pesanan: ' + (err.message || err)
      this.submitting = false
    }
  },

  async executeOrderTransaction() {
    const selectedAddr = this.addresses.find((a) => a.id === this.selectedAddressId)
    const finalShippingCost = this.isFreeShipping ? 0 : this.shippingCost

    // Determine payment method and detail
    let method = this.selectedPaymentType
    let paymentDetail = null

    if (this.selectedPaymentType === 'transfer') {
      method = 'transfer'
      const bank = this.bankAccounts.find((b) => b.id === this.selectedBankId)
      if (bank) {
        paymentDetail = `Transfer Bank ${bank.bank_name} (${bank.account_number} a.n ${bank.account_name})`
      }
    } else if (this.selectedPaymentType === 'qris') {
      method = 'qris'
      paymentDetail = `QRIS (${this.settings.payment_qris_name || 'Giva Store'})`
    } else if (this.selectedPaymentType === 'gopay') {
      method = 'gopay'
      paymentDetail = `GoPay (${this.settings.payment_gopay})`
    } else if (this.selectedPaymentType === 'ovo') {
      method = 'ovo'
      paymentDetail = `OVO (${this.settings.payment_ovo})`
    } else if (this.selectedPaymentType === 'dana') {
      method = 'dana'
      paymentDetail = `DANA (${this.settings.payment_dana})`
    }

    // Step 1: Insert Sales
    const { data: sale, error: saleErr } = await supabase
      .from('sales')
      .insert({
        channel: 'online',
        customer_id: this.customer.id,
        location_id: null,
        staff_id: null,
        subtotal: this.cartSubtotal,
        discount_amount: 0,
        total_amount: this.totalAmount,
        payment_status: 'unpaid',
        order_status: 'pending',
      })
      .select()
      .single()

    if (saleErr) throw saleErr
    const saleId = sale.id

    // Step 2: Insert Sale Items
    const saleItemsPayload = this.cartItems.map((i) => ({
      sale_id: saleId,
      product_id: i.product_id,
      variant_id: i.variant_id || null,
      quantity: i.qty,
      unit_price: i.price || i.sell_price || 0,
      subtotal: i.qty * (i.price || i.sell_price || 0),
    }))

    const { error: itemsErr } = await supabase
      .from('sale_items')
      .insert(saleItemsPayload)

    if (itemsErr) throw itemsErr

    // Step 3: Insert Shipping
    const fullAddress = `${selectedAddr.address}, ${selectedAddr.city}, ${selectedAddr.province}` + (selectedAddr.postal_code ? ` ${selectedAddr.postal_code}` : '')
    const { error: shipErr } = await supabase
      .from('shipping')
      .insert({
        sale_id: saleId,
        shipping_zone_id: selectedAddr.shipping_zone_id,
        shipping_cost: finalShippingCost,
        shipping_address: fullAddress,
        recipient_name: selectedAddr.recipient_name,
        recipient_phone: selectedAddr.phone,
        city: selectedAddr.city,
        province: selectedAddr.province,
        postal_code: selectedAddr.postal_code || null,
      })

    if (shipErr) throw shipErr

    // Step 4: Insert Payments
    const { error: payErr } = await supabase
      .from('payments')
      .insert({
        sale_id: saleId,
        method: method,
        status: 'pending',
        amount: this.totalAmount,
        uploaded_by: 'customer',
        payment_detail: paymentDetail,
      })

    if (payErr) throw payErr

    // Step 5: Call reserve_stock_for_order
    const { error: rpcErr } = await supabase
      .rpc('reserve_stock_for_order', { p_sale_id: saleId })

    if (rpcErr) throw rpcErr

    // Step 6: Clear cart & notify shell
    clearCart()
    this.refreshCartCount()

    // Step 7: Redirect to orders page
    window.location.replace(`/toko/orders.html?new=${saleId}`)
  },

  formatPrice,
}))

Alpine.start()
