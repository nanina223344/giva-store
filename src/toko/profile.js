/**
 * src/toko/profile.js
 * Logic untuk Halaman Profil Pelanggan (Data Diri, Alamat Pengiriman, Keamanan).
 */

import '../style.css'
import Alpine from 'alpinejs'
import { supabase } from '../supabaseClient.js'
import {
  storeShellFields,
  injectComponents,
  formatPrice,
  syncCustomerSession,
} from './store-common.js'

injectComponents()
window.Alpine = Alpine

Alpine.data('storeProfile', () => ({
  ...storeShellFields(),

  loading: true,
  activeTab: 'profil', // 'profil' | 'alamat' | 'keamanan'

  // Tab Data Diri state
  profilForm: {
    name: '',
    email: '',
    phone: '',
  },
  savingProfile: false,
  profilMsg: '',
  profilErr: '',

  // Tab Alamat state
  addresses: [],
  shippingZonesList: [],
  loadingAddresses: false,
  savingAddress: false,

  // Address Modal state
  showAddressModal: false,
  addrForm: {
    id: null,
    label: 'Rumah',
    recipient_name: '',
    phone: '',
    address: '',
    city: '',
    province: '',
    postal_code: '',
    shipping_zone_id: '',
    is_default: false,
  },
  addrErr: '',

  // Tab Keamanan state
  secForm: {
    password: '',
    passwordConfirm: '',
  },
  savingPassword: false,
  secMsg: '',
  secErr: '',

  async init() {
    // 1. Auth guard
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      sessionStorage.setItem('redirect_after_login', window.location.pathname + window.location.search)
      window.location.replace('/toko/login.html')
      return
    }

    const { customer } = await syncCustomerSession()
    this.customer = customer

    await this.initShell()

    // 2. Populate profile form
    if (this.customer) {
      this.profilForm.name = this.customer.name || ''
      this.profilForm.email = this.customer.email || session.user.email || ''
      this.profilForm.phone = this.customer.phone || ''
    }

    // 3. Parallel fetch address & shipping zones data
    await Promise.all([
      this.fetchAddresses(),
      this.fetchShippingZonesList(),
    ])

    this.loading = false
  },

  // ── DATA DIRI ─────────────────────────────────────────────────────────

  async updateProfile() {
    this.profilMsg = ''
    this.profilErr = ''
    this.savingProfile = true

    try {
      if (!this.customer?.auth_user_id) throw new Error('Sesi tidak valid')

      const { error } = await supabase
        .from('customers')
        .update({
          name: this.profilForm.name,
          phone: this.profilForm.phone,
        })
        .eq('auth_user_id', this.customer.auth_user_id)

      if (error) throw error

      await syncCustomerSession()
      this.customer.name = this.profilForm.name
      this.customer.phone = this.profilForm.phone

      this.profilMsg = 'Data diri berhasil diperbarui.'
    } catch (err) {
      console.error('Update profile error:', err)
      this.profilErr = err.message || 'Gagal memperbarui data diri.'
    } finally {
      this.savingProfile = false
    }
  },

  // ── ALAMAT PENGIRIMAN ──────────────────────────────────────────────────

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
        .order('created_at', { ascending: false })

      if (error) throw error
      this.addresses = data || []
    } catch (err) {
      console.error('Fetch addresses error:', err)
    } finally {
      this.loadingAddresses = false
    }
  },

  async fetchShippingZonesList() {
    try {
      const { data } = await supabase
        .from('shipping_zones')
        .select('*')
        .eq('is_active', true)
        .order('cost', { ascending: true })

      if (data) this.shippingZonesList = data
    } catch (err) {
      console.warn('Fetch shipping zones error:', err)
    }
  },

  openAddressModal(addr = null) {
    this.addrErr = ''
    if (addr) {
      this.addrForm = {
        id: addr.id,
        label: addr.label || 'Rumah',
        recipient_name: addr.recipient_name || '',
        phone: addr.phone || '',
        address: addr.address || '',
        city: addr.city || '',
        province: addr.province || '',
        postal_code: addr.postal_code || '',
        shipping_zone_id: addr.shipping_zone_id || '',
        is_default: addr.is_default || false,
      }
    } else {
      this.addrForm = {
        id: null,
        label: 'Rumah',
        recipient_name: this.customer?.name || '',
        phone: this.customer?.phone || '',
        address: '',
        city: '',
        province: '',
        postal_code: '',
        shipping_zone_id: this.shippingZonesList[0]?.id || '',
        is_default: this.addresses.length === 0, // Auto-default if first address
      }
    }
    this.showAddressModal = true
  },

  closeAddressModal() {
    this.showAddressModal = false
  },

  async saveAddress() {
    this.addrErr = ''
    this.savingAddress = true

    try {
      if (!this.customer?.id) throw new Error('Customer tidak valid')

      // Jika alamat ini diset default, reset is_default alamat lain
      if (this.addrForm.is_default) {
        await supabase
          .from('customer_addresses')
          .update({ is_default: false })
          .eq('customer_id', this.customer.id)
      }

      const payload = {
        customer_id: this.customer.id,
        label: this.addrForm.label || 'Rumah',
        recipient_name: this.addrForm.recipient_name,
        phone: this.addrForm.phone,
        address: this.addrForm.address,
        city: this.addrForm.city,
        province: this.addrForm.province,
        postal_code: this.addrForm.postal_code || null,
        shipping_zone_id: this.addrForm.shipping_zone_id || null,
        is_default: this.addrForm.is_default,
      }

      if (this.addrForm.id) {
        const { error } = await supabase
          .from('customer_addresses')
          .update(payload)
          .eq('id', this.addrForm.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('customer_addresses')
          .insert(payload)
        if (error) throw error
      }

      this.closeAddressModal()
      await this.fetchAddresses()
    } catch (err) {
      console.error('Save address error:', err)
      this.addrErr = err.message || 'Gagal menyimpan alamat.'
    } finally {
      this.savingAddress = false
    }
  },

  async setDefaultAddress(addressId) {
    try {
      if (!this.customer?.id) return
      // Reset all addresses to is_default = false
      await supabase
        .from('customer_addresses')
        .update({ is_default: false })
        .eq('customer_id', this.customer.id)

      // Set target address to is_default = true
      await supabase
        .from('customer_addresses')
        .update({ is_default: true })
        .eq('id', addressId)

      await this.fetchAddresses()
    } catch (err) {
      console.error('Set default address error:', err)
    }
  },

  async deleteAddress(addressId) {
    if (!confirm('Apakah Anda yakin ingin menghapus alamat ini?')) return
    try {
      const { error } = await supabase
        .from('customer_addresses')
        .delete()
        .eq('id', addressId)
      if (error) throw error

      await this.fetchAddresses()
    } catch (err) {
      console.error('Delete address error:', err)
    }
  },

  // ── KEAMANAN ──────────────────────────────────────────────────────────

  async updatePassword() {
    this.secMsg = ''
    this.secErr = ''

    if (this.secForm.password !== this.secForm.passwordConfirm) {
      this.secErr = 'Konfirmasi password baru tidak cocok.'
      return
    }

    if (this.secForm.password.length < 8) {
      this.secErr = 'Password minimal 8 karakter.'
      return
    }

    this.savingPassword = true
    try {
      const { error } = await supabase.auth.updateUser({
        password: this.secForm.password,
      })

      if (error) throw error

      this.secMsg = 'Password berhasil diubah.'
      this.secForm = { password: '', passwordConfirm: '' }
    } catch (err) {
      console.error('Update password error:', err)
      this.secErr = err.message || 'Gagal memperbarui password.'
    } finally {
      this.savingPassword = false
    }
  },

  formatPrice,
}))

Alpine.start()
