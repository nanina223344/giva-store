/**
 * src/admin/article-editor.js
 * Logic Page Builder & Editor Artikel Panel Admin — Giva Store
 */

import '../style.css'
import Alpine from 'alpinejs'
import { supabase } from '../supabaseClient.js'
import { requireAuth, getStaffUser, getStaffRole, signOut } from './auth.js'
import { initSidebar } from '../../admin/js/sidebar.js'

window.Alpine = Alpine

Alpine.data('articleEditor', () => ({
  loading: true,
  saving: false,
  autoSaveTimer: null,
  isDirty: false,
  lastSavedTime: '—',
  staffUser: null,

  articleId: null,

  // Article metadata
  articleForm: {
    title: '',
    slug: '',
    excerpt: '',
    cover_image_url: '',
    status: 'draft',
    published_at: new Date().toISOString().slice(0, 16),
    meta_title: '',
    meta_description: '',
  },

  // Manual slug lock flag
  slugManuallyEdited: false,

  // Categories & Tags
  categoriesList: [],
  selectedCategoryIds: [],
  tagInput: '',
  tags: [],

  // Cover image uploading
  coverUploading: false,

  // Blocks array
  blocks: [],
  showBlockDropdown: false,

  // Product Search State (for Product Block)
  productSearchQuery: '',
  productSearchResults: [],
  productSearchLoading: false,
  activeProductBlockIndex: null,

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

      // Read ID from URL params
      const params = new URLSearchParams(window.location.search)
      this.articleId = params.get('id')

      await this.fetchCategories()

      if (this.articleId) {
        await this.loadArticleData()
      } else {
        // Mode baru: auto add initial heading & paragraph blocks
        this.addBlock('heading')
        this.addBlock('paragraph')
      }

      // Auto save interval (30 sec)
      this.autoSaveTimer = setInterval(() => {
        if (this.isDirty && !this.saving && this.articleForm.title.trim()) {
          this.saveArticle(this.articleForm.status, true)
        }
      }, 30000)

    } catch (err) {
      console.error('Init editor error:', err)
      if (err.message !== 'Unauthenticated') {
        this.showAlert('Gagal memuat editor: ' + err.message, 'error')
      }
    } finally {
      this.loading = false
    }
  },

  showAlert(message, type = 'success') {
    this.alert = { show: true, type, message }
    setTimeout(() => { this.alert.show = false }, 4000)
  },

  markDirty() {
    this.isDirty = true
  },

  // ── Auto Slug ────────────────────────────────────────────────────────
  onTitleInput() {
    this.markDirty()
    if (!this.slugManuallyEdited) {
      this.articleForm.slug = this.slugify(this.articleForm.title)
    }
    if (!this.articleForm.meta_title) {
      this.articleForm.meta_title = this.articleForm.title.slice(0, 60)
    }
  },

  onSlugInput() {
    this.markDirty()
    this.slugManuallyEdited = true
    this.articleForm.slug = this.slugify(this.articleForm.slug)
  },

  slugify(text) {
    return (text || '')
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '')
  },

  // ── Tag Chips ────────────────────────────────────────────────────────
  addTag() {
    const tag = this.tagInput.trim().replace(/^#/, '')
    if (tag && !this.tags.includes(tag)) {
      this.tags.push(tag)
      this.markDirty()
    }
    this.tagInput = ''
  },

  removeTag(index) {
    this.tags.splice(index, 1)
    this.markDirty()
  },

  // ── Fetch & Load ─────────────────────────────────────────────────────
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
      console.error('Fetch categories error:', err)
    }
  },

  async loadArticleData() {
    try {
      this.loading = true

      // 1. Fetch Article
      const { data: art, error: artErr } = await supabase
        .from('articles')
        .select('*')
        .eq('id', this.articleId)
        .single()

      if (artErr) throw artErr

      this.articleForm = {
        title: art.title || '',
        slug: art.slug || '',
        excerpt: art.excerpt || '',
        cover_image_url: art.cover_image_url || '',
        status: art.status || 'draft',
        published_at: art.published_at ? new Date(art.published_at).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
        meta_title: art.meta_title || '',
        meta_description: art.meta_description || '',
      }

      this.tags = Array.isArray(art.tags) ? art.tags : (art.tags ? String(art.tags).split(',').map((t) => t.trim()) : [])
      this.slugManuallyEdited = true

      // 2. Fetch Category Items
      const { data: catItems } = await supabase
        .from('article_category_items')
        .select('category_id')
        .eq('article_id', this.articleId)

      this.selectedCategoryIds = (catItems || []).map((ci) => ci.category_id)

      // 3. Fetch Blocks
      const { data: blockData, error: bErr } = await supabase
        .from('article_blocks')
        .select('*')
        .eq('article_id', this.articleId)
        .order('sort_order', { ascending: true })

      if (bErr) throw bErr

      this.blocks = (blockData || []).map((b) => ({
        id: b.id || 'blk_' + Math.random().toString(36).substr(2, 9),
        type: b.type,
        content: typeof b.content === 'object' ? b.content : JSON.parse(b.content || '{}'),
        sort_order: b.sort_order,
      }))

    } catch (err) {
      console.error('Load article error:', err)
      this.showAlert('Gagal memuat artikel: ' + err.message, 'error')
    } finally {
      this.loading = false
    }
  },

  // ── Cover Upload ─────────────────────────────────────────────────────
  async uploadCover(event) {
    const file = event.target.files[0]
    if (!file) return

    this.coverUploading = true
    try {
      const ext = file.name.split('.').pop()
      const fileName = `${this.articleId || 'temp_' + Date.now()}-cover.${ext}`

      const { data, error } = await supabase.storage
        .from('article-images')
        .upload(fileName, file, { upsert: true })

      if (error) {
        // Fallback convert to Data URL if storage bucket fails
        const reader = new FileReader()
        reader.onload = (e) => {
          this.articleForm.cover_image_url = e.target.result
          this.markDirty()
          this.coverUploading = false
        }
        reader.readAsDataURL(file)
        return
      }

      const { data: pubData } = supabase.storage
        .from('article-images')
        .getPublicUrl(fileName)

      this.articleForm.cover_image_url = pubData.publicUrl
      this.markDirty()
    } catch (err) {
      console.error('Cover upload error:', err)
      this.showAlert('Gagal mengunggah cover: ' + err.message, 'error')
    } finally {
      this.coverUploading = false
    }
  },

  removeCover() {
    this.articleForm.cover_image_url = ''
    this.markDirty()
  },

  // ── Block Management ─────────────────────────────────────────────────
  addBlock(type) {
    const newId = 'blk_' + Math.random().toString(36).substr(2, 9)
    let defaultContent = {}

    switch (type) {
      case 'heading':
        defaultContent = { level: 2, text: '' }
        break
      case 'paragraph':
        defaultContent = { text: '' }
        break
      case 'image':
        defaultContent = { url: '', alt: '', caption: '' }
        break
      case 'video':
        defaultContent = { type: 'youtube', url: '', thumbnail: '' }
        break
      case 'quote':
        defaultContent = { text: '', attribution: '' }
        break
      case 'product':
        defaultContent = { product_id: '', product_name: '', product_image: '', product_price: 0 }
        break
      case 'gallery':
        defaultContent = { images: [] }
        break
      case 'divider':
        defaultContent = {}
        break
      case 'spacer':
        defaultContent = { height: 24 }
        break
    }

    this.blocks.push({
      id: newId,
      type,
      content: defaultContent,
      sort_order: this.blocks.length + 1,
    })

    this.showBlockDropdown = false
    this.markDirty()
  },

  removeBlock(index) {
    this.blocks.splice(index, 1)
    this.reindexBlocks()
    this.markDirty()
  },

  moveBlockUp(index) {
    if (index <= 0) return
    const temp = this.blocks[index]
    this.blocks[index] = this.blocks[index - 1]
    this.blocks[index - 1] = temp
    this.reindexBlocks()
    this.markDirty()
  },

  moveBlockDown(index) {
    if (index >= this.blocks.length - 1) return
    const temp = this.blocks[index]
    this.blocks[index] = this.blocks[index + 1]
    this.blocks[index + 1] = temp
    this.reindexBlocks()
    this.markDirty()
  },

  reindexBlocks() {
    this.blocks.forEach((b, idx) => {
      b.sort_order = idx + 1
    })
  },

  // ── Block File Uploads ───────────────────────────────────────────────
  async uploadBlockImage(event, blockIndex) {
    const file = event.target.files[0]
    if (!file) return

    try {
      const ext = file.name.split('.').pop()
      const fileName = `${this.articleId || 'art'}-img-${Date.now()}.${ext}`

      const { data, error } = await supabase.storage
        .from('article-images')
        .upload(fileName, file, { upsert: true })

      if (error) {
        // Fallback Base64
        const reader = new FileReader()
        reader.onload = (e) => {
          this.blocks[blockIndex].content.url = e.target.result
          this.markDirty()
        }
        reader.readAsDataURL(file)
        return
      }

      const { data: pubData } = supabase.storage
        .from('article-images')
        .getPublicUrl(fileName)

      this.blocks[blockIndex].content.url = pubData.publicUrl
      this.markDirty()
    } catch (err) {
      this.showAlert('Gagal mengunggah gambar: ' + err.message, 'error')
    }
  },

  async uploadGalleryImages(event, blockIndex) {
    const files = Array.from(event.target.files)
    if (files.length === 0) return

    for (const file of files) {
      try {
        const ext = file.name.split('.').pop()
        const fileName = `${this.articleId || 'art'}-gal-${Date.now()}-${Math.random().toString(36).substr(2,4)}.${ext}`

        const { data, error } = await supabase.storage
          .from('article-images')
          .upload(fileName, file, { upsert: true })

        let finalUrl = ''
        if (error) {
          finalUrl = await new Promise((resolve) => {
            const r = new FileReader()
            r.onload = (e) => resolve(e.target.result)
            r.readAsDataURL(file)
          })
        } else {
          const { data: pubData } = supabase.storage.from('article-images').getPublicUrl(fileName)
          finalUrl = pubData.publicUrl
        }

        if (!this.blocks[blockIndex].content.images) {
          this.blocks[blockIndex].content.images = []
        }
        this.blocks[blockIndex].content.images.push({
          url: finalUrl,
          alt: file.name.split('.')[0],
          caption: '',
        })
        this.markDirty()
      } catch (e) {
        console.error('Gallery file upload error:', e)
      }
    }
  },

  removeGalleryImage(blockIndex, imgIndex) {
    this.blocks[blockIndex].content.images.splice(imgIndex, 1)
    this.markDirty()
  },

  // ── Product Block Search ──────────────────────────────────────────────
  openProductSearchModal(blockIndex) {
    this.activeProductBlockIndex = blockIndex
    this.productSearchQuery = ''
    this.productSearchResults = []
    this.searchProducts()
  },

  async searchProducts() {
    this.productSearchLoading = true
    try {
      let query = supabase
        .from('products')
        .select(`
          id, name, image_url, base_price,
          product_variants ( id, available_quantity )
        `)
        .eq('is_active', true)
        .limit(10)

      if (this.productSearchQuery.trim()) {
        query = query.ilike('name', `%${this.productSearchQuery.trim()}%`)
      }

      const { data, error } = await query
      if (error) throw error

      this.productSearchResults = data || []
    } catch (e) {
      console.error('Product search error:', e)
    } finally {
      this.productSearchLoading = false
    }
  },

  selectProductForBlock(product) {
    if (this.activeProductBlockIndex !== null) {
      this.blocks[this.activeProductBlockIndex].content = {
        product_id: product.id,
        product_name: product.name,
        product_image: product.image_url || '',
        product_price: product.base_price || 0,
      }
      this.markDirty()
    }
    this.activeProductBlockIndex = null
  },

  // ── YouTube Embed Helper ─────────────────────────────────────────────
  getYoutubeEmbedUrl(url) {
    if (!url) return ''
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/)
    if (match && match[1]) {
      return `https://www.youtube.com/embed/${match[1]}`
    }
    return url
  },

  // ── SAVE & PUBLISH ───────────────────────────────────────────────────
  async saveArticle(targetStatus = 'draft', isAutoSave = false) {
    if (!this.articleForm.title.trim()) {
      if (!isAutoSave) this.showAlert('Judul artikel wajib diisi.', 'error')
      return
    }

    this.saving = true
    try {
      const payload = {
        title: this.articleForm.title.trim(),
        slug: this.articleForm.slug || this.slugify(this.articleForm.title),
        excerpt: this.articleForm.excerpt.trim(),
        cover_image_url: this.articleForm.cover_image_url || null,
        status: targetStatus,
        published_at: targetStatus === 'published' ? new Date(this.articleForm.published_at).toISOString() : null,
        meta_title: this.articleForm.meta_title ? this.articleForm.meta_title.trim() : null,
        meta_description: this.articleForm.meta_description ? this.articleForm.meta_description.trim() : null,
        tags: this.tags,
        created_by: this.staffUser.id,
        updated_at: new Date().toISOString(),
      }

      let currentId = this.articleId

      if (currentId) {
        const { error } = await supabase.from('articles').update(payload).eq('id', currentId)
        if (error) throw error
      } else {
        const { data: newArt, error } = await supabase.from('articles').insert(payload).select('id').single()
        if (error) throw error
        currentId = newArt.id
        this.articleId = currentId
        // Update URL query parameter without page reload
        window.history.replaceState(null, '', `/admin/article-editor.html?id=${currentId}`)
      }

      this.articleForm.status = targetStatus

      // 2. Save Category Items
      await supabase.from('article_category_items').delete().eq('article_id', currentId)
      if (this.selectedCategoryIds.length > 0) {
        const catPayload = this.selectedCategoryIds.map((cid) => ({
          article_id: currentId,
          category_id: cid,
        }))
        await supabase.from('article_category_items').insert(catPayload)
      }

      // 3. Save Article Blocks
      await supabase.from('article_blocks').delete().eq('article_id', currentId)
      if (this.blocks.length > 0) {
        const blockPayload = this.blocks.map((b, idx) => ({
          article_id: currentId,
          type: b.type,
          content: b.content,
          sort_order: idx + 1,
        }))
        const { error: blockErr } = await supabase.from('article_blocks').insert(blockPayload)
        if (blockErr) throw blockErr
      }

      this.isDirty = false
      const now = new Date()
      this.lastSavedTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

      if (!isAutoSave) {
        this.showAlert(targetStatus === 'published' ? 'Artikel berhasil diterbitkan!' : 'Draft artikel berhasil disimpan!', 'success')
      }
    } catch (err) {
      console.error('Save article error:', err)
      if (!isAutoSave) this.showAlert('Gagal menyimpan artikel: ' + err.message, 'error')
    } finally {
      this.saving = false
    }
  },

  previewArticle() {
    if (!this.articleForm.slug) {
      this.showAlert('Judul atau slug belum terisi untuk preview.', 'error')
      return
    }
    window.open(`/toko/article.html?slug=${this.articleForm.slug}`, '_blank')
  },

  async logout() {
    if (this.autoSaveTimer) clearInterval(this.autoSaveTimer)
    await signOut()
    window.location.replace('/admin/login.html')
  },
}))

Alpine.start()
