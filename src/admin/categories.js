import '../style.css'
import Alpine from 'alpinejs'
import { supabase } from '../supabaseClient.js'
import { requireAuth, getStaffUser, signOut } from './auth.js'
import { initSidebar } from '../../admin/js/sidebar.js'



window.Alpine = Alpine

Alpine.data('categoriesAdmin', () => ({
  // ─── State ───────────────────────────────────────────────────────────────
  categories: [],
  allCategories: [],   // used for parent dropdown (excludes current editing item)
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
    parent_category_id: '',
  },

  // Alerts
  alert: {
    show: false,
    type: 'success', // 'success' | 'error' | 'warning'
    message: '',
  },

  // Confirm delete dialog
  confirmDelete: {
    show: false,
    category: null,
  },

  // ─── Init ─────────────────────────────────────────────────────────────────
  async init() {
    // Auth guard — redirect ke login kalau tidak ada sesi aktif
    await requireAuth()
    // Muat data staff untuk sidebar
    this.staffUser = await getStaffUser()
    initSidebar(this.staffUser, () => this.logout())
    await this.fetchCategories()
  },

  // ─── Logout ───────────────────────────────────────────────────────────────
  async logout() {
    await signOut()
  },

  // ─── Data fetching ────────────────────────────────────────────────────────
  async fetchCategories() {
    this.loading = true
    try {
      // Fetch categories with product count via join
      const { data, error } = await supabase
        .from('categories')
        .select(`
          id,
          name,
          parent_category_id,
          products(count)
        `)
        .order('name', { ascending: true })

      if (error) throw error

      // Normalize product count
      this.categories = (data || []).map(cat => ({
        ...cat,
        product_count: cat.products?.[0]?.count ?? 0,
      }))

      // All categories for parent dropdown (flat)
      const { data: allData, error: allError } = await supabase
        .from('categories')
        .select('id, name')
        .order('name', { ascending: true })

      if (allError) throw allError
      this.allCategories = allData || []
    } catch (err) {
      this.showAlert('error', 'Gagal memuat data kategori: ' + err.message)
    } finally {
      this.loading = false
    }
  },

  // ─── Parent category label helper ─────────────────────────────────────────
  getParentName(parent_category_id) {
    if (!parent_category_id) return '—'
    const found = this.allCategories.find(c => c.id === parent_category_id)
    return found ? found.name : '—'
  },

  // ─── Available parent options (exclude self & descendants when editing) ───
  get parentOptions() {
    if (!this.isEditing || !this.form.id) return this.allCategories
    // Exclude self from dropdown to prevent circular reference
    return this.allCategories.filter(c => c.id !== this.form.id)
  },

  // ─── Modal control ────────────────────────────────────────────────────────
  openAddModal() {
    this.form = { id: null, name: '', parent_category_id: '' }
    this.isEditing = false
    this.showModal = true
  },

  openEditModal(category) {
    this.form = {
      id: category.id,
      name: category.name,
      parent_category_id: category.parent_category_id ?? '',
    }
    this.isEditing = true
    this.showModal = true
  },

  closeModal() {
    this.showModal = false
    this.form = { id: null, name: '', parent_category_id: '' }
  },

  // ─── Validation ───────────────────────────────────────────────────────────
  async validateName() {
    const trimmed = this.form.name.trim()
    if (!trimmed) return 'Nama kategori tidak boleh kosong.'

    // Check duplicate (case-insensitive)
    const query = supabase
      .from('categories')
      .select('id')
      .ilike('name', trimmed)

    // Exclude self when editing
    if (this.isEditing && this.form.id) {
      query.neq('id', this.form.id)
    }

    const { data, error } = await query
    if (error) throw error
    if (data && data.length > 0) return 'Nama kategori sudah digunakan, pilih nama lain.'

    return null
  },

  // ─── Save (insert / update) ───────────────────────────────────────────────
  async saveCategory() {
    if (this.saving) return
    this.saving = true
    try {
      // Validate
      const validationError = await this.validateName()
      if (validationError) {
        this.showAlert('warning', validationError)
        return
      }

      const payload = {
        name: this.form.name.trim(),
        parent_category_id: this.form.parent_category_id || null,
      }

      if (this.isEditing) {
        const { error } = await supabase
          .from('categories')
          .update(payload)
          .eq('id', this.form.id)

        if (error) throw error
        this.showAlert('success', 'Kategori berhasil diperbarui.')
      } else {
        const { error } = await supabase
          .from('categories')
          .insert(payload)

        if (error) throw error
        this.showAlert('success', 'Kategori berhasil ditambahkan.')
      }

      this.closeModal()
      await this.fetchCategories()
    } catch (err) {
      this.showAlert('error', 'Terjadi kesalahan: ' + err.message)
    } finally {
      this.saving = false
    }
  },

  // ─── Delete flow ─────────────────────────────────────────────────────────
  promptDelete(category) {
    this.confirmDelete = { show: true, category }
  },

  cancelDelete() {
    this.confirmDelete = { show: false, category: null }
  },

  async deleteCategory() {
    if (this.deleting || !this.confirmDelete.category) return
    this.deleting = true
    const { id } = this.confirmDelete.category
    try {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id)

      if (error) {
        // FK violation codes in PostgreSQL: 23503
        if (
          error.code === '23503' ||
          (error.message && error.message.toLowerCase().includes('foreign key'))
        ) {
          this.showAlert(
            'error',
            'Kategori masih dipakai pada beberapa produk, pindahkan dulu sebelum dihapus.'
          )
        } else {
          throw error
        }
        return
      }

      this.showAlert('success', 'Kategori berhasil dihapus.')
      await this.fetchCategories()
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
    // Auto-dismiss after 5s
    setTimeout(() => { this.alert.show = false }, 5000)
  },
}))

Alpine.start()
