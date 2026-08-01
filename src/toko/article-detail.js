import '../style.css'
import Alpine from 'alpinejs'
import { supabase } from '../supabaseClient.js'
import { injectComponents, storeShellFields } from './store-common.js'

injectComponents()
window.Alpine = Alpine

Alpine.data('storeArticleDetail', () => ({
  ...storeShellFields(),
  loading: true,
  slug: '',
  article: null,
  blocks: [],
  relatedArticles: [],

  // Lightbox Modal
  showLightbox: false,
  lightboxImageUrl: '',

  async init() {
    try {
      await this.initShell()

      const params = new URLSearchParams(window.location.search)
      this.slug = params.get('slug')

      if (!this.slug) {
        window.location.href = '/toko/inspirasi.html'
        return
      }

      await this.fetchArticleDetail()
    } catch (err) {
      console.error('Article detail init error:', err)
    } finally {
      this.loading = false
    }
  },

  async fetchArticleDetail() {
    try {
      this.loading = true

      // 1. Fetch Article by Slug
      const { data: art, error } = await supabase
        .from('articles')
        .select(`
          *,
          article_category_items (
            category_id,
            article_categories ( id, name, slug )
          )
        `)
        .eq('slug', this.slug)
        .eq('status', 'published')
        .single()

      if (error || !art) {
        console.error('Article not found:', error)
        window.location.href = '/toko/inspirasi.html'
        return
      }

      const categories = (art.article_category_items || [])
        .map((item) => item.article_categories)
        .filter(Boolean)

      this.article = {
        ...art,
        categories,
      }

      // 2. Auto-increment View Count
      try {
        await supabase
          .from('articles')
          .update({ view_count: (art.view_count || 0) + 1 })
          .eq('id', art.id)
      } catch (e) {
        console.error('Increment view error:', e)
      }

      // 3. Update SEO Meta tags dynamically
      if (art.meta_title || art.title) {
        document.title = `${art.meta_title || art.title} — Giva Store Inspirasi`
      }
      const metaDesc = document.querySelector('meta[name="description"]')
      if (metaDesc && (art.meta_description || art.excerpt)) {
        metaDesc.setAttribute('content', art.meta_description || art.excerpt)
      }

      // 4. Fetch Article Blocks
      const { data: blockData } = await supabase
        .from('article_blocks')
        .select('*')
        .eq('article_id', art.id)
        .order('sort_order', { ascending: true })

      this.blocks = (blockData || []).map((b) => ({
        ...b,
        content: typeof b.content === 'object' ? b.content : JSON.parse(b.content || '{}'),
      }))

      // Calculate read time
      let wordCount = (art.title || '').split(/\s+/).length + (art.excerpt || '').split(/\s+/).length
      this.blocks.forEach((b) => {
        if (b.content && b.content.text) {
          wordCount += b.content.text.split(/\s+/).length
        }
      })
      this.article.readTimeMinutes = Math.max(1, Math.ceil(wordCount / 200))

      // 5. Fetch Related Articles
      await this.fetchRelatedArticles(art.id, categories)

    } catch (err) {
      console.error('Fetch article error:', err)
    } finally {
      this.loading = false
    }
  },

  async fetchRelatedArticles(currentId, categories) {
    try {
      const catIds = (categories || []).map((c) => c.id)

      let query = supabase
        .from('articles')
        .select(`
          id, title, slug, excerpt, cover_image_url, published_at,
          article_category_items ( article_categories ( id, name ) )
        `)
        .eq('status', 'published')
        .neq('id', currentId)
        .order('published_at', { ascending: false })
        .limit(3)

      const { data } = await query

      this.relatedArticles = (data || []).map((r) => ({
        ...r,
        categories: (r.article_category_items || []).map((ci) => ci.article_categories).filter(Boolean),
      }))
    } catch (e) {
      console.error('Fetch related articles error:', e)
    }
  },

  openLightbox(url) {
    if (!url) return
    this.lightboxImageUrl = url
    this.showLightbox = true
  },

  closeLightbox() {
    this.showLightbox = false
    this.lightboxImageUrl = ''
  },

  getYoutubeEmbedUrl(url) {
    if (!url) return ''
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/)
    if (match && match[1]) {
      return `https://www.youtube.com/embed/${match[1]}`
    }
    return url
  },

  formatDate(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  },
}))

Alpine.start()
