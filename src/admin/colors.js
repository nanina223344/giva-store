import '../style.css'
import Alpine from 'alpinejs'
import { supabase } from '../supabaseClient.js'
import { requireAuth, getStaffUser, signOut } from './auth.js'
import { initSidebar } from '../../admin/js/sidebar.js'


window.Alpine = Alpine

Alpine.data('colorsAdmin', () => ({
  // ─── State ───────────────────────────────────────────────────────────────
  colors:  [],
  loading: true,
  saving:  false,

  // Mobile sidebar drawer
  sidebarOpen: false,

  // Sidebar staff user
  staffUser: { name: '—', email: '—' },

  // Modal state
  showModal: false,
  isEditing: false,

  // Form fields
  form: {
    id:       null,
    name:     '',
    hex_code: '#8FA07E',
  },

  // Alerts
  alert: {
    show:    false,
    type:    'success',
    message: '',
  },

  // Confirm delete dialog
  confirmDelete: {
    show:  false,
    color: null,
  },

  // ─── Init ─────────────────────────────────────────────────────────────────
  async init() {
    await requireAuth()
    this.staffUser = await getStaffUser()
    initSidebar(this.staffUser, () => this.logout())
    await this.fetchColors()
  },

  // ─── Logout ───────────────────────────────────────────────────────────────
  async logout() {
    await signOut()
  },

  // ─── Data fetching ────────────────────────────────────────────────────────
  async fetchColors() {
    this.loading = true
    try {
      const { data, error } = await supabase
        .from('colors')
        .select('id, name, hex_code')
        .order('name', { ascending: true })

      if (error) throw error
      this.colors = data || []
    } catch (err) {
      this.showAlert('error', 'Gagal memuat data warna: ' + err.message)
    } finally {
      this.loading = false
    }
  },

  // ─── Modal control ────────────────────────────────────────────────────────
  openAddModal() {
    this.form = { id: null, name: '', hex_code: '#8FA07E' }
    this.isEditing = false
    this.showModal = true
  },

  openEditModal(color) {
    this.form = {
      id:       color.id,
      name:     color.name,
      hex_code: color.hex_code || '#8FA07E',
    }
    this.isEditing = true
    this.showModal = true
  },

  closeModal() {
    this.showModal = false
  },

  // ─── Color picker ↔ text sync ─────────────────────────────────────────────
  onPickerChange(e) {
    this.form.hex_code = e.target.value.toUpperCase()
  },

  onTextChange(e) {
    const val = e.target.value.trim()
    // Tambahkan '#' otomatis jika tidak ada
    const normalized = val.startsWith('#') ? val : '#' + val
    // Update picker jika nilai valid 6-digit hex
    if (/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
      this.form.hex_code = normalized.toUpperCase()
    } else {
      // Simpan raw input; picker tidak diupdate sampai valid
      this.form.hex_code = val
    }
  },

  // Nilai yang dipakai color picker (harus valid '#xxxxxx')
  get pickerValue() {
    const v = this.form.hex_code
    return /^#[0-9A-Fa-f]{6}$/.test(v) ? v : '#8FA07E'
  },

  // ─── Save (add/edit) ──────────────────────────────────────────────────────
  async saveColor() {
    if (!this.form.name.trim()) {
      this.showAlert('warning', 'Nama warna wajib diisi.')
      return
    }

    // Normalisasi hex_code
    let hex = this.form.hex_code.trim()
    if (!hex.startsWith('#')) hex = '#' + hex
    hex = hex.toUpperCase()
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      this.showAlert('warning', 'Kode hex tidak valid. Gunakan format #RRGGBB.')
      return
    }

    this.saving = true
    try {
      const payload = {
        name:     this.form.name.trim(),
        hex_code: hex,
      }

      if (this.isEditing) {
        const { error } = await supabase
          .from('colors')
          .update(payload)
          .eq('id', this.form.id)
        if (error) throw error
        this.showAlert('success', 'Warna berhasil diperbarui.')
      } else {
        const { error } = await supabase
          .from('colors')
          .insert(payload)
        if (error) throw error
        this.showAlert('success', 'Warna berhasil ditambahkan.')
      }

      this.closeModal()
      await this.fetchColors()
    } catch (err) {
      this.showAlert('error', 'Gagal menyimpan: ' + err.message)
    } finally {
      this.saving = false
    }
  },

  // ─── Delete ───────────────────────────────────────────────────────────────
  confirmDeleteColor(color) {
    this.confirmDelete = { show: true, color }
  },

  cancelDelete() {
    this.confirmDelete = { show: false, color: null }
  },

  async deleteColor() {
    if (!this.confirmDelete.color) return
    const { id, name } = this.confirmDelete.color
    this.cancelDelete()
    try {
      const { error } = await supabase
        .from('colors')
        .delete()
        .eq('id', id)
      if (error) throw error
      this.showAlert('success', `Warna "${name}" berhasil dihapus.`)
      await this.fetchColors()
    } catch (err) {
      this.showAlert('error', 'Gagal menghapus warna: ' + err.message)
    }
  },

  // ─── Alert helper ─────────────────────────────────────────────────────────
  showAlert(type, message) {
    this.alert = { show: true, type, message }
    setTimeout(() => { this.alert.show = false }, 4000)
  },
}))

Alpine.start()
