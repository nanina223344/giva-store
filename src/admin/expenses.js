/**
 * src/admin/expenses.js
 * Logic Halaman Keuangan (Pengeluaran & Pemasukan) — Giva Store Admin
 */

import '../style.css'
import Alpine from 'alpinejs'
import { supabase } from '../supabaseClient.js'
import { requireAuth, getStaffUser, getStaffRole, signOut } from './auth.js'
import { initSidebar } from '../../admin/js/sidebar.js'

window.Alpine = Alpine

const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Operational', type: 'expense', is_active: true },
  { name: 'Gaji', type: 'expense', is_active: true },
  { name: 'Sewa Tempat', type: 'expense', is_active: true },
  { name: 'Utilities', type: 'expense', is_active: true },
  { name: 'Marketing', type: 'expense', is_active: true },
  { name: 'Lain-lain', type: 'expense', is_active: true },
  { name: 'Investasi', type: 'income', is_active: true },
  { name: 'Refund', type: 'income', is_active: true },
  { name: 'Cash In Non-Sales', type: 'income', is_active: true },
  { name: 'Lain-lain', type: 'income', is_active: true },
]

Alpine.data('expensesAdmin', () => ({
  loading: true,
  staffUser: { id: null, name: '—', email: '—' },

  // Filter tanggal (default: bulan ini)
  dateRange: {
    startDate: '',
    endDate: '',
  },

  // State utama
  activeTab: 'all', // 'all' | 'expense' | 'income'
  searchQuery: '',
  expensesList: [],
  categoriesList: [],

  // Summary
  summary: {
    totalIncome: 0,
    totalExpense: 0,
    netBalance: 0,
  },

  // Pagination
  currentPage: 1,
  pageSize: 25,
  totalItems: 0,

  // Modal Tambah/Edit Transaksi
  showTransactionModal: false,
  editingTransaction: null,
  savingTransaction: false,
  transactionForm: {
    type: 'expense',
    date: new Date().toISOString().split('T')[0],
    category: '',
    description: '',
    amount: '',
    payment_method: 'Cash',
    reference_no: '',
    notes: '',
  },

  // Modal Hapus Transaksi
  showDeleteTransactionModal: false,
  deletingTransaction: null,
  deletingTransactionLoading: false,

  // Modal Kelola Kategori
  showCategoryModal: false,
  categoryTypeTab: 'expense',
  newCategoryName: '',
  newCategoryType: 'expense',
  savingCategory: false,
  editingCategory: null,
  editingCategoryName: '',
  showDeleteCategoryModal: false,
  deletingCategory: null,
  deletingCategoryLoading: false,

  // Alert toast
  alert: {
    show: false,
    type: 'success',
    message: '',
  },

  async init() {
    try {
      await requireAuth()
      const role = await getStaffRole()
      if (role !== 'admin') {
        window.location.replace('/admin/categories.html')
        return
      }

      this.staffUser = await getStaffUser()
      initSidebar(this.staffUser, () => this.logout())

      // Set default bulan ini
      const now = new Date()
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
      const year = firstDay.getFullYear()
      const month = String(firstDay.getMonth() + 1).padStart(2, '0')
      const day = String(firstDay.getDate()).padStart(2, '0')
      
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      const lastDayNum = String(lastDay.getDate()).padStart(2, '0')

      this.dateRange.startDate = `${year}-${month}-${day}`
      this.dateRange.endDate = `${year}-${month}-${lastDayNum}`

      await this.fetchCategories()
      await this.fetchData()
    } catch (err) {
      console.error('Init error:', err)
      if (err.message !== 'Unauthenticated') {
        this.showAlert('Gagal memuat halaman: ' + err.message, 'error')
      }
    } finally {
      this.loading = false
    }
  },

  showAlert(message, type = 'success') {
    this.alert = { show: true, type, message }
    setTimeout(() => { this.alert.show = false }, 4000)
  },

  // ── Categories Fetch & Seed ───────────────────────────────────────────
  async fetchCategories() {
    try {
      let { data, error } = await supabase
        .from('expense_categories')
        .select('*')
        .order('name', { ascending: true })

      if (error) throw error

      if (!data || data.length === 0) {
        // Seed default categories
        const { error: seedErr } = await supabase
          .from('expense_categories')
          .insert(DEFAULT_EXPENSE_CATEGORIES)
        
        if (!seedErr) {
          const { data: fresh } = await supabase.from('expense_categories').select('*').order('name')
          data = fresh || []
        }
      }

      this.categoriesList = data || []
    } catch (err) {
      console.error('Fetch categories error:', err)
    }
  },

  get filteredCategoriesForForm() {
    return this.categoriesList.filter(
      (c) => c.type === this.transactionForm.type && c.is_active
    )
  },

  // ── Fetch Main Data (Expenses & Summary) ──────────────────────────────
  async fetchData() {
    try {
      this.loading = true

      // 1. Calculate Summary in Date Range
      let summaryQuery = supabase
        .from('expenses')
        .select('type, amount')
        .gte('date', this.dateRange.startDate)
        .lte('date', this.dateRange.endDate + 'T23:59:59')

      const { data: summaryData, error: sumErr } = await summaryQuery
      if (sumErr) throw sumErr

      let totalIncome = 0
      let totalExpense = 0
      ;(summaryData || []).forEach((row) => {
        const amt = Number(row.amount || 0)
        if (row.type === 'income') totalIncome += amt
        else if (row.type === 'expense') totalExpense += amt
      })

      this.summary = {
        totalIncome,
        totalExpense,
        netBalance: totalIncome - totalExpense,
      }

      // 2. Fetch Filtered List with Pagination
      let listQuery = supabase
        .from('expenses')
        .select('*, staff(id, name)', { count: 'exact' })
        .gte('date', this.dateRange.startDate)
        .lte('date', this.dateRange.endDate + 'T23:59:59')

      if (this.activeTab !== 'all') {
        listQuery = listQuery.eq('type', this.activeTab)
      }

      if (this.searchQuery.trim()) {
        const q = `%${this.searchQuery.trim()}%`
        listQuery = listQuery.or(`description.ilike.${q},category.ilike.${q},reference_no.ilike.${q}`)
      }

      listQuery = listQuery
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })

      // Pagination
      const from = (this.currentPage - 1) * this.pageSize
      const to = from + this.pageSize - 1
      listQuery = listQuery.range(from, to)

      const { data: listData, count, error: listErr } = await listQuery
      if (listErr) throw listErr

      this.expensesList = listData || []
      this.totalItems = count || 0

    } catch (err) {
      console.error('Fetch expenses data error:', err)
      this.showAlert('Gagal mengambil data transaksi: ' + err.message, 'error')
    } finally {
      this.loading = false
    }
  },

  setTab(tab) {
    this.activeTab = tab
    this.currentPage = 1
    this.fetchData()
  },

  onDateRangeChange() {
    this.currentPage = 1
    this.fetchData()
  },

  onSearchInput() {
    this.currentPage = 1
    this.fetchData()
  },

  get totalPages() {
    return Math.ceil(this.totalItems / this.pageSize) || 1
  },

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++
      this.fetchData()
    }
  },

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--
      this.fetchData()
    }
  },

  // ── Modal Form Transaksi ─────────────────────────────────────────────
  openAddTransactionModal(type = 'expense') {
    this.editingTransaction = null
    this.transactionForm = {
      type: type,
      date: new Date().toISOString().split('T')[0],
      category: '',
      description: '',
      amount: '',
      payment_method: 'Cash',
      reference_no: '',
      notes: '',
    }
    // Auto-select first available category if exists
    const avail = this.categoriesList.find((c) => c.type === type && c.is_active)
    if (avail) this.transactionForm.category = avail.name

    this.showTransactionModal = true
  },

  openEditTransactionModal(item) {
    this.editingTransaction = item
    this.transactionForm = {
      type: item.type || 'expense',
      date: item.date ? item.date.split('T')[0] : new Date().toISOString().split('T')[0],
      category: item.category || '',
      description: item.description || '',
      amount: item.amount || 0,
      payment_method: item.payment_method || 'Cash',
      reference_no: item.reference_no || '',
      notes: item.notes || '',
    }
    this.showTransactionModal = true
  },

  onTypeChange(newType) {
    this.transactionForm.type = newType
    const avail = this.categoriesList.find((c) => c.type === newType && c.is_active)
    if (avail) this.transactionForm.category = avail.name
    else this.transactionForm.category = ''
  },

  closeTransactionModal() {
    this.showTransactionModal = false
    this.editingTransaction = null
  },

  async saveTransaction() {
    if (!this.transactionForm.description.trim()) {
      this.showAlert('Deskripsi transaksi wajib diisi.', 'error')
      return
    }

    const amt = Number(this.transactionForm.amount)
    if (Number.isNaN(amt) || amt <= 0) {
      this.showAlert('Jumlah nominal harus lebih besar dari 0.', 'error')
      return
    }

    this.savingTransaction = true
    try {
      const payload = {
        type: this.transactionForm.type,
        date: this.transactionForm.date,
        category: this.transactionForm.category || 'Lain-lain',
        description: this.transactionForm.description.trim(),
        amount: amt,
        payment_method: this.transactionForm.payment_method || 'Cash',
        reference_no: this.transactionForm.reference_no ? this.transactionForm.reference_no.trim() : null,
        notes: this.transactionForm.notes ? this.transactionForm.notes.trim() : null,
        created_by: this.staffUser.id,
      }

      if (this.editingTransaction) {
        const { error } = await supabase
          .from('expenses')
          .update(payload)
          .eq('id', this.editingTransaction.id)

        if (error) throw error
        this.showAlert('Transaksi berhasil diperbarui.', 'success')
      } else {
        const { error } = await supabase
          .from('expenses')
          .insert(payload)

        if (error) throw error
        this.showAlert('Transaksi baru berhasil dicatat.', 'success')
      }

      this.closeTransactionModal()
      await this.fetchData()
    } catch (err) {
      console.error('Save transaction error:', err)
      this.showAlert('Gagal menyimpan transaksi: ' + err.message, 'error')
    } finally {
      this.savingTransaction = false
    }
  },

  // ── Hapus Transaksi ──────────────────────────────────────────────────
  confirmDeleteTransaction(item) {
    this.deletingTransaction = item
    this.showDeleteTransactionModal = true
  },

  async deleteTransaction() {
    if (!this.deletingTransaction) return
    this.deletingTransactionLoading = true
    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', this.deletingTransaction.id)

      if (error) throw error

      this.showAlert('Transaksi berhasil dihapus.', 'success')
      this.showDeleteTransactionModal = false
      this.deletingTransaction = null
      await this.fetchData()
    } catch (err) {
      console.error('Delete transaction error:', err)
      this.showAlert('Gagal menghapus transaksi: ' + err.message, 'error')
    } finally {
      this.deletingTransactionLoading = false
    }
  },

  // ── Kelola Kategori ──────────────────────────────────────────────────
  openCategoryModal() {
    this.categoryTypeTab = 'expense'
    this.newCategoryName = ''
    this.newCategoryType = 'expense'
    this.editingCategory = null
    this.showCategoryModal = true
  },

  get modalFilteredCategories() {
    return this.categoriesList.filter((c) => c.type === this.categoryTypeTab)
  },

  async addCategory() {
    const name = this.newCategoryName.trim()
    if (!name) {
      this.showAlert('Nama kategori wajib diisi.', 'error')
      return
    }

    this.savingCategory = true
    try {
      const payload = {
        name,
        type: this.categoryTypeTab,
        is_active: true,
      }

      const { error } = await supabase.from('expense_categories').insert(payload)
      if (error) throw error

      this.showAlert(`Kategori "${name}" berhasil ditambahkan.`, 'success')
      this.newCategoryName = ''
      await this.fetchCategories()
    } catch (err) {
      this.showAlert('Gagal menambah kategori: ' + err.message, 'error')
    } finally {
      this.savingCategory = false
    }
  },

  async toggleCategoryActive(cat) {
    try {
      const { error } = await supabase
        .from('expense_categories')
        .update({ is_active: !cat.is_active })
        .eq('id', cat.id)

      if (error) throw error
      cat.is_active = !cat.is_active
      this.showAlert(`Status kategori "${cat.name}" diperbarui.`, 'success')
    } catch (err) {
      this.showAlert('Gagal memperbarui status kategori: ' + err.message, 'error')
    }
  },

  startEditCategory(cat) {
    this.editingCategory = cat
    this.editingCategoryName = cat.name
  },

  cancelEditCategory() {
    this.editingCategory = null
    this.editingCategoryName = ''
  },

  async saveEditCategory(cat) {
    const name = this.editingCategoryName.trim()
    if (!name) {
      this.showAlert('Nama kategori tidak boleh kosong.', 'error')
      return
    }

    try {
      const { error } = await supabase
        .from('expense_categories')
        .update({ name })
        .eq('id', cat.id)

      if (error) throw error

      cat.name = name
      this.cancelEditCategory()
      this.showAlert('Nama kategori berhasil diperbarui.', 'success')
    } catch (err) {
      this.showAlert('Gagal mengedit kategori: ' + err.message, 'error')
    }
  },

  async confirmDeleteCategory(cat) {
    // Check if category is used in expenses
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('id')
        .eq('category', cat.name)
        .limit(1)

      if (error) throw error

      if (data && data.length > 0) {
        this.showAlert(`Kategori "${cat.name}" tidak dapat dihapus karena sudah dipakai dalam transaksi.`, 'error')
        return
      }

      this.deletingCategory = cat
      this.showDeleteCategoryModal = true
    } catch (err) {
      this.showAlert('Gagal mengecek penggunaan kategori: ' + err.message, 'error')
    }
  },

  async deleteCategory() {
    if (!this.deletingCategory) return
    this.deletingCategoryLoading = true
    try {
      const { error } = await supabase
        .from('expense_categories')
        .delete()
        .eq('id', this.deletingCategory.id)

      if (error) throw error

      this.showAlert(`Kategori "${this.deletingCategory.name}" berhasil dihapus.`, 'success')
      this.showDeleteCategoryModal = false
      this.deletingCategory = null
      await this.fetchCategories()
    } catch (err) {
      this.showAlert('Gagal menghapus kategori: ' + err.message, 'error')
    } finally {
      this.deletingCategoryLoading = false
    }
  },

  // ── CSV Export ──────────────────────────────────────────────────────
  async exportCSV() {
    try {
      this.showAlert('Menyiapkan file CSV...', 'success')

      let exportQuery = supabase
        .from('expenses')
        .select('*, staff(name)')
        .gte('date', this.dateRange.startDate)
        .lte('date', this.dateRange.endDate + 'T23:59:59')
        .order('date', { ascending: false })

      if (this.activeTab !== 'all') {
        exportQuery = exportQuery.eq('type', this.activeTab)
      }

      const { data, error } = await exportQuery
      if (error) throw error

      if (!data || data.length === 0) {
        this.showAlert('Tidak ada data transaksi pada rentang tanggal ini.', 'error')
        return
      }

      // Headers
      const headers = ['Tanggal', 'Tipe', 'Kategori', 'Deskripsi', 'Jumlah (Rp)', 'Metode Bayar', 'Ref No', 'Dicatat Oleh', 'Catatan']
      const rows = data.map((item) => [
        item.date ? item.date.split('T')[0] : '',
        item.type === 'income' ? 'Pemasukan' : 'Pengeluaran',
        `"${(item.category || '').replace(/"/g, '""')}"`,
        `"${(item.description || '').replace(/"/g, '""')}"`,
        item.amount || 0,
        item.payment_method || '',
        `"${(item.reference_no || '').replace(/"/g, '""')}"`,
        `"${(item.staff?.name || '').replace(/"/g, '""')}"`,
        `"${(item.notes || '').replace(/"/g, '""')}"`,
      ])

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.setAttribute('href', url)
      link.setAttribute('download', `laporan-keuangan-${this.dateRange.startDate}-sd-${this.dateRange.endDate}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

    } catch (err) {
      console.error('Export CSV error:', err)
      this.showAlert('Gagal mengeksport CSV: ' + err.message, 'error')
    }
  },

  formatPrice(val) {
    const num = Number(val || 0)
    return 'Rp ' + num.toLocaleString('id-ID')
  },

  async logout() {
    await signOut()
    window.location.replace('/admin/login.html')
  },
}))

Alpine.start()
