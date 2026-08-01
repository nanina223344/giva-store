import '../style.css'
import Alpine from 'alpinejs'
import { supabase } from '../supabaseClient.js'
import { injectComponents, storeShellFields } from './store-common.js'

injectComponents()
window.Alpine = Alpine

Alpine.data('storeInspirasi', () => ({
  ...storeShellFields(),
  loading: true,
  categories: [],
  activeCategory: 'all',
  searchQuery: '',
  articles: [],

  async init() {
    try {
      await this.initShell()
      await this.fetchCategories()
      await this.fetchArticles()
    } catch (err) {
      console.error('Inspirasi init error:', err)
    } finally {
      this.loading = false
    }
  },

  async fetchCategories() {
    try {
      const { data, error } = await supabase
        .from('article_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (error) throw error
      this.categories = data || []
    } catch (err) {
      console.error('Fetch categories error:', err)
    }
  },

  async fetchArticles() {
    try {
      this.loading = true
      const { data, error } = await supabase
        .from('articles')
        .select(`
          *,
          article_blocks ( type, content ),
          article_category_items (
            category_id,
            article_categories ( id, name, slug )
          )
        `)
        .eq('status', 'published')
        .order('published_at', { ascending: false })

      if (error) throw error

      this.articles = (data || []).map((art) => {
        const cats = (art.article_category_items || [])
          .map((item) => item.article_categories)
          .filter(Boolean)

        // Compute word count & reading time
        let wordCount = (art.title || '').split(/\s+/).length + (art.excerpt || '').split(/\s+/).length
        ;(art.article_blocks || []).forEach((b) => {
          if (b.content && b.content.text) {
            wordCount += b.content.text.split(/\s+/).length
          }
        })
        const readTimeMinutes = Math.max(1, Math.ceil(wordCount / 200))

        return {
          ...art,
          categories: cats,
          readTimeMinutes,
        }
      })
    } catch (err) {
      console.error('Fetch published articles error:', err)
    } finally {
      this.loading = false
    }
  },

  get filteredArticles() {
    let list = [...this.articles]

    if (this.activeCategory !== 'all') {
      list = list.filter((a) =>
        (a.categories || []).some((c) => c.id === this.activeCategory || c.slug === this.activeCategory)
      )
    }

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.trim().toLowerCase()
      list = list.filter((a) => (a.title || '').toLowerCase().includes(q) || (a.excerpt || '').toLowerCase().includes(q))
    }

    return list
  },

  get featuredArticle() {
    const list = this.filteredArticles
    return list.length > 0 ? list[0] : null
  },

  get regularArticles() {
    const list = this.filteredArticles
    if (list.length === 0) return []
    // If no search & category filter, skip featured in grid so it's not duplicated
    if (this.activeCategory === 'all' && !this.searchQuery.trim()) {
      return list.slice(1)
    }
    return list
  },

  formatDate(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  },
}))

Alpine.start()
