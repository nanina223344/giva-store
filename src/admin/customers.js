import '../style.css'
import Alpine from 'alpinejs'
import { supabase } from '../supabaseClient.js'
import { requireAuth, getStaffUser, signOut } from './auth.js'
import { initSidebar } from '../../admin/js/sidebar.js'


window.Alpine = Alpine

Alpine.data('customersAdmin', () => ({
  // ─── State ───────────────────────────────────────────────────────────────
  customers: [],      // full list from Supabase
  loading: true,
  saving: false,

  // Mobile sidebar drawer
  sidebarOpen: false,

  // Search
  searchQuery: '',

  // Sidebar staff user
  staffUser: { name: '—', email: '—' },

  // Modal state
  showModal: false,
  isEditing: false,

  // Form fields
  form: {
    id: null,
    name: '',
    phone: '',
    email: '',
    address: '',
  },

  // Field-level errors
  errors: {
    name: '',
    phone: '',
    email: '',
  },

  // Alerts
  alert: {
    show: false,
    type: 'success', // 'success' | 'error' | 'warning'
    message: '',
  },

  // ─── Computed: filtered list ──────────────────────────────────────────────
  get filtered() {
    const q = this.searchQuery.trim().toLowerCase()
    if (!q) return this.customers
    return this.customers.filter(c =>
      (c.name  && c.name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.toLowerCase().includes(q))
    )
  },

  // ─── Init ─────────────────────────────────────────────────────────────────
  async init() {
    await requireAuth()
    this.staffUser = await getStaffUser()
    initSidebar(this.staffUser, () => this.logout())
    await this.fetchCustomers()
  },

  // ─── Logout ───────────────────────────────────────────────────────────────
  async logout() {
    await signOut()
  },

  // ─── Data fetching ────────────────────────────────────────────────────────
  async fetchCustomers() {
    this.loading = true
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('id, auth_user_id, name, phone, email, address')
        .order('name', { ascending: true })

      if (error) throw error
      this.customers = data || []
    } catch (err) {
      this.showAlert('error', 'Gagal memuat data customer: ' + err.message)
    } finally {
      this.loading = false
    }
  },

  // ─── Source label helper ──────────────────────────────────────────────────
  sourceLabel(customer) {
    return customer.auth_user_id ? 'Online' : 'Manual'
  },

  // ─── Modal control ────────────────────────────────────────────────────────
  openAddModal() {
    this.resetForm()
    this.isEditing = false
    this.showModal = true
  },

  openEditModal(customer) {
    this.form = {
      id: customer.id,
      name: customer.name ?? '',
      phone: customer.phone ?? '',
      email: customer.email ?? '',
      address: customer.address ?? '',
    }
    this.errors = { name: '', phone: '', email: '' }
    this.isEditing = true
    this.showModal = true
  },

  closeModal() {
    this.showModal = false
    this.resetForm()
  },

  resetForm() {
    this.form = { id: null, name: '', phone: '', email: '', address: '' }
    this.errors = { name: '', phone: '', email: '' }
  },

  // ─── Inline validation ────────────────────────────────────────────────────
  validateEmail(value) {
    if (!value || !value.trim()) return ''
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return re.test(value.trim()) ? '' : 'Format email tidak valid.'
  },

  onNameBlur() {
    this.errors.name = this.form.name.trim() ? '' : 'Nama customer tidak boleh kosong.'
  },

  onPhoneBlur() {
    if (!this.form.phone.trim()) {
      // phone is required only when adding (new customer). When editing it may already be null.
      if (!this.isEditing) {
        this.errors.phone = 'Nomor telepon tidak boleh kosong.'
      } else {
        this.errors.phone = ''
      }
    } else {
      this.errors.phone = ''
    }
  },

  onEmailBlur() {
    this.errors.email = this.validateEmail(this.form.email)
  },

  // ─── Save (insert / update) ───────────────────────────────────────────────
  async saveCustomer() {
    if (this.saving) return

    // Run all validations
    this.errors.name = this.form.name.trim() ? '' : 'Nama customer tidak boleh kosong.'
    if (!this.isEditing) {
      this.errors.phone = this.form.phone.trim() ? '' : 'Nomor telepon tidak boleh kosong.'
    }
    this.errors.email = this.validateEmail(this.form.email)

    if (this.errors.name || this.errors.phone || this.errors.email) {
      this.showAlert('warning', 'Harap perbaiki kesalahan pada formulir sebelum menyimpan.')
      return
    }

    this.saving = true
    try {
      if (this.isEditing) {
        const payload = {
          name:    this.form.name.trim(),
          phone:   this.form.phone.trim()   || null,
          email:   this.form.email.trim()   || null,
          address: this.form.address.trim() || null,
        }
        const { error } = await supabase
          .from('customers')
          .update(payload)
          .eq('id', this.form.id)

        if (error) throw error
        this.showAlert('success', 'Data customer berhasil diperbarui.')
      } else {
        // Manual walk-in: auth_user_id = null
        const payload = {
          name:         this.form.name.trim(),
          phone:        this.form.phone.trim()   || null,
          email:        this.form.email.trim()   || null,
          address:      this.form.address.trim() || null,
          auth_user_id: null,
        }
        const { error } = await supabase
          .from('customers')
          .insert(payload)

        if (error) throw error
        this.showAlert('success', 'Customer berhasil ditambahkan.')
      }

      this.closeModal()
      await this.fetchCustomers()
    } catch (err) {
      this.showAlert('error', 'Terjadi kesalahan: ' + err.message)
    } finally {
      this.saving = false
    }
  },

  // ─── Alert helper ────────────────────────────────────────────────────────
  showAlert(type, message) {
    this.alert = { show: true, type, message }
    setTimeout(() => { this.alert.show = false }, 5000)
  },
}))

Alpine.start()
