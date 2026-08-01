/**
 * src/admin/articles.js
 * Logic Halaman List Artikel Admin — Giva Store Panel
 */

import '../style.css'
import Alpine from 'alpinejs'
import { supabase } from '../supabaseClient.js'
import { requireAuth, getStaffUser, getStaffRole, signOut } from './auth.js'
import { initSidebar } from '../../admin/js/sidebar.js'

window.Alpine = Alpine

Alpine.data('articlesAdmin', () => ({
  loading: true,
  staffUser: { id: null, name: '—', email: '—' },

  activeTab: 'all', // 'all' | 'draft' | 'published' | 'archived'
  searchQuery: '',
  selectedCategory: 'all',

  articlesList: [],
  categoriesList: [],

  // Hapus Modal
  showDeleteModal: false,
  deletingArticle: null,
  deletingLoading: false,

  // Alert
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

      await this.fetchCategories()
      await this.fetchArticles()
    } catch (err) {
      console.error('Init articles error:', err)
      if (err.message !== 'Unauthenticated') {
        this.showAlert('Gagal memuat artikel: ' + err.message, 'error')
      }
    } finally {
      this.loading = false
    }
  },

  showAlert(message, type = 'success') {
    this.alert = { show: true, type, message }
    setTimeout(() => { this.alert.show = false }, 4000)
  },

  async fetchCategories() {
    try {
      const { data, error } = await supabase
        .from('article_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (error) throw error
      this.categoriesList = data || []
    } catch (err) {
      console.error('Fetch article categories error:', err)
    }
  },

  async fetchArticles() {
    try {
      this.loading = true

      let query = supabase
        .from('articles')
        .select(`
          *,
          article_category_items (
            category_id,
            article_categories ( id, name, slug )
          )
        `)
        .order('created_at', { ascending: false })

      const { data, error } = await query
      if (error) throw error

      this.articlesList = (data || []).map((art) => {
        const cats = (art.article_category_items || [])
          .map((item) => item.article_categories)
          .filter(Boolean)
        return {
          ...art,
          categories: cats,
        }
      })
    } catch (err) {
      console.error('Fetch articles error:', err)
      this.showAlert('Gagal mengambil daftar artikel: ' + err.message, 'error')
    } finally {
      this.loading = false
    }
  },

  get filteredArticles() {
    let list = [...this.articlesList]

    // Tab filter
    if (this.activeTab !== 'all') {
      list = list.filter((a) => a.status === this.activeTab)
    }

    // Search query
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.trim().toLowerCase()
      list = list.filter((a) => (a.title || '').toLowerCase().includes(q) || (a.slug || '').toLowerCase().includes(q))
    }

    // Category filter
    if (this.selectedCategory !== 'all') {
      list = list.filter((a) =>
        (a.categories || []).some((c) => c.id === this.selectedCategory)
      )
    }

    return list
  },

  confirmDelete(article) {
    this.deletingArticle = article
    this.showDeleteModal = true
  },

  async deleteArticle() {
    if (!this.deletingArticle) return
    this.deletingLoading = true
    try {
      // 1. Delete category relations
      await supabase.from('article_category_items').delete().eq('article_id', this.deletingArticle.id)
      // 2. Delete blocks
      await supabase.from('article_blocks').delete().eq('article_id', this.deletingArticle.id)
      // 3. Delete article
      const { error } = await supabase.from('articles').delete().eq('id', this.deletingArticle.id)
      if (error) throw error

      this.showAlert('Artikel berhasil dihapus.', 'success')
      this.showDeleteModal = false
      this.deletingArticle = null
      await this.fetchArticles()
    } catch (err) {
      console.error('Delete article error:', err)
      this.showAlert('Gagal menghapus artikel: ' + err.message, 'error')
    } finally {
      this.deletingLoading = false
    }
  },

  formatDate(dateStr) {
    if (!dateStr) return '—'
    const d = new Date(dateStr)
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  },

  async logout() {
    await signOut()
    window.location.replace('/admin/login.html')
  },
}))

Alpine.start()
