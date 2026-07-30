import '../style.css'
import Alpine from 'alpinejs'
import { supabase } from '../supabaseClient.js'
import { requireAuth, getStaffUser, signOut } from './auth.js'
import { initSidebar } from '../../admin/js/sidebar.js'


window.Alpine = Alpine

Alpine.data('suppliersAdmin', () => ({
  // ─── State ───────────────────────────────────────────────────────────────
  suppliers: [],
  loading: true,
  saving: false,
  deleting: false,

  // Mobile sidebar drawer
  sidebarOpen: false,

  // Sidebar staff user
  staffUser: { name: '—', email: '—' },

  // Modal state
  showModal: false,
  isEditing: false,

  // Form fields
  form: {
    id: null,
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
  },

  // Field-level errors
  errors: {
    name: '',
    email: '',
  },

  // Alerts
  alert: {
    show: false,
    type: 'success',
    message: '',
  },

  // Confirm delete dialog
  confirmDelete: {
    show: false,
    supplier: null,
  },

  // ─── Init ─────────────────────────────────────────────────────────────────
  async init() {
    await requireAuth()
    this.staffUser = await getStaffUser()
    initSidebar(this.staffUser, () => this.logout())
    await this.fetchSuppliers()
  },

  // ─── Logout ───────────────────────────────────────────────────────────────
  async logout() {
    await signOut()
  },

  // ─── Data fetching ────────────────────────────────────────────────────────
  async fetchSuppliers() {
    this.loading = true
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, name, contact_person, phone, email, address')
        .order('name', { ascending: true })

      if (error) throw error
      this.suppliers = data || []
    } catch (err) {
      this.showAlert('error', 'Gagal memuat data supplier: ' + err.message)
    } finally {
      this.loading = false
    }
  },

  // ─── Modal control ────────────────────────────────────────────────────────
  openAddModal() {
    this.resetForm()
    this.isEditing = false
    this.showModal = true
  },

  openEditModal(supplier) {
    this.form = {
      id: supplier.id,
      name: supplier.name ?? '',
      contact_person: supplier.contact_person ?? '',
      phone: supplier.phone ?? '',
      email: supplier.email ?? '',
      address: supplier.address ?? '',
    }
    this.errors = { name: '', email: '' }
    this.isEditing = true
    this.showModal = true
  },

  closeModal() {
    this.showModal = false
    this.resetForm()
  },

  resetForm() {
    this.form = { id: null, name: '', contact_person: '', phone: '', email: '', address: '' }
    this.errors = { name: '', email: '' }
  },

  // ─── Inline validation ────────────────────────────────────────────────────
  validateEmail(value) {
    if (!value || !value.trim()) return ''
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return re.test(value.trim()) ? '' : 'Format email tidak valid.'
  },

  onEmailBlur() {
    this.errors.email = this.validateEmail(this.form.email)
  },

  onNameBlur() {
    this.errors.name = this.form.name.trim() ? '' : 'Nama supplier tidak boleh kosong.'
  },

  // ─── Save (insert / update) ───────────────────────────────────────────────
  async saveSupplier() {
    if (this.saving) return

    this.errors.name = this.form.name.trim() ? '' : 'Nama supplier tidak boleh kosong.'
    this.errors.email = this.validateEmail(this.form.email)

    if (this.errors.name || this.errors.email) {
      this.showAlert('warning', 'Harap perbaiki kesalahan pada formulir sebelum menyimpan.')
      return
    }

    this.saving = true
    try {
      const payload = {
        name: this.form.name.trim(),
        contact_person: this.form.contact_person.trim() || null,
        phone: this.form.phone.trim() || null,
        email: this.form.email.trim() || null,
        address: this.form.address.trim() || null,
      }

      if (this.isEditing) {
        const { error } = await supabase
          .from('suppliers')
          .update(payload)
          .eq('id', this.form.id)

        if (error) throw error
        this.showAlert('success', 'Supplier berhasil diperbarui.')
      } else {
        const { error } = await supabase
          .from('suppliers')
          .insert(payload)

        if (error) throw error
        this.showAlert('success', 'Supplier berhasil ditambahkan.')
      }

      this.closeModal()
      await this.fetchSuppliers()
    } catch (err) {
      this.showAlert('error', 'Terjadi kesalahan: ' + err.message)
    } finally {
      this.saving = false
    }
  },

  // ─── Delete flow ─────────────────────────────────────────────────────────
  promptDelete(supplier) {
    this.confirmDelete = { show: true, supplier }
  },

  cancelDelete() {
    this.confirmDelete = { show: false, supplier: null }
  },

  async deleteSupplier() {
    if (this.deleting || !this.confirmDelete.supplier) return
    this.deleting = true
    const { id } = this.confirmDelete.supplier
    try {
      const { error } = await supabase
        .from('suppliers')
        .delete()
        .eq('id', id)

      if (error) {
        if (
          error.code === '23503' ||
          (error.message && error.message.toLowerCase().includes('foreign key'))
        ) {
          this.showAlert(
            'error',
            'Supplier masih digunakan pada data lain, pindahkan dulu sebelum dihapus.'
          )
        } else {
          throw error
        }
        return
      }

      this.showAlert('success', 'Supplier berhasil dihapus.')
      await this.fetchSuppliers()
    } catch (err) {
      this.showAlert('error', 'Terjadi kesalahan saat menghapus: ' + err.message)
    } finally {
      this.deleting = false
      this.cancelDelete()
    }
  },

  // ─── Alert helper ────────────────────────────────────────────────────────
  showAlert(type, message) {
    this.alert = { show: true, type, message }
    setTimeout(() => { this.alert.show = false }, 5000)
  },
}))

Alpine.start()
