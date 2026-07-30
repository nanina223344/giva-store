import '../style.css'
import Alpine from 'alpinejs'
import { supabase } from '../supabaseClient.js'
import { requireAuth, getStaffUser, signOut } from './auth.js'
import { initSidebar } from '../../admin/js/sidebar.js'


window.Alpine = Alpine

Alpine.data('collectionsAdmin', () => ({
  collections: [],
  loading: true,
  saving: false,
  sidebarOpen: false,

  searchQuery: '',

  staffUser: { name: '—', email: '—' },

  showModal: false,
  isEditing: false,
  form: {
    id: null,
    name: '',
    subtitle: '',
    description: '',
    cover_image_url: '',
    bg_type: 'color',
    bg_color: '#F0ECE3',
    text_color: '#232019',
    text_position: 'bottom-left',
    image_position: 'center',
    bg_image_url: '',
    bg_video_url: '',
    bg_overlay_opacity: 0.0,
    sort_order: 0,
    is_active: true,
  },
  uploadingFile: false,
  errors: {
    name: ''
  },
  alert: {
    show: false,
    type: 'success',
    message: ''
  },

  // Array posisi dipindah ke JS agar tidak gagal di-parse Alpine x-for
  textPositions: [
    { val: 'top-left',      icon: '↖', label: 'Kiri Atas'    },
    { val: 'top-center',    icon: '↑', label: 'Tengah Atas'  },
    { val: 'top-right',     icon: '↗', label: 'Kanan Atas'   },
    { val: 'middle-left',   icon: '←', label: 'Kiri'         },
    { val: 'middle-center', icon: '⊙', label: 'Tengah'       },
    { val: 'middle-right',  icon: '→', label: 'Kanan'        },
    { val: 'bottom-left',   icon: '↙', label: 'Kiri Bawah'   },
    { val: 'bottom-center', icon: '↓', label: 'Tengah Bawah' },
    { val: 'bottom-right',  icon: '↘', label: 'Kanan Bawah'  },
  ],
  imagePositions: [
    { val: 'top-left',    icon: '↖', label: 'Kiri Atas'   },
    { val: 'top',         icon: '↑', label: 'Atas'         },
    { val: 'top-right',   icon: '↗', label: 'Kanan Atas'  },
    { val: 'left',        icon: '←', label: 'Kiri'         },
    { val: 'center',      icon: '⊙', label: 'Tengah'       },
    { val: 'right',       icon: '→', label: 'Kanan'        },
    { val: 'bottom-left', icon: '↙', label: 'Kiri Bawah'  },
    { val: 'bottom',      icon: '↓', label: 'Bawah'        },
    { val: 'bottom-right',icon: '↘', label: 'Kanan Bawah' },
  ],

  async init() {
    await requireAuth()
    this.staffUser = await getStaffUser()
    initSidebar(this.staffUser, () => this.logout())
    await this.fetchCollections()
  },

  async logout() {
    await signOut()
  },

  get filteredCollections() {
    let list = this.collections
    const q = this.searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter(c => 
        (c.name || '').toLowerCase().includes(q) ||
        (c.subtitle || '').toLowerCase().includes(q)
      )
    }
    return list
  },

  async fetchCollections() {
    this.loading = true
    try {
      // Query collections with exact count of related collection_products
      const { data, error } = await supabase
        .from('collections')
        .select(`
          id, name, subtitle, description, cover_image_url, 
          bg_type, bg_color, text_color, text_position, image_position,
          bg_image_url, bg_video_url, bg_overlay_opacity, 
          sort_order, is_active,
          collection_products (count)
        `)
        .order('sort_order', { ascending: true })

      if (error) throw error

      this.collections = (data || []).map(c => ({
        ...c,
        product_count: c.collection_products?.[0]?.count ?? 0
      }))
    } catch (err) {
      console.error('Error fetching collections:', err)
      this.showAlert('error', 'Gagal memuat data koleksi.')
    } finally {
      this.loading = false
    }
  },

  openAddModal() {
    this.resetForm()
    this.isEditing = false
    this.showModal = true
  },

  openEditModal(c) {
    this.form = {
      id: c.id,
      name: c.name || '',
      subtitle: c.subtitle || '',
      description: c.description || '',
      cover_image_url: c.cover_image_url || '',
      bg_type: c.bg_type || 'color',
      bg_color: c.bg_color || '#F0ECE3',
      text_color: c.text_color || '#232019',
      text_position: c.text_position || 'bottom-left',
      image_position: c.image_position || 'center',
      bg_image_url: c.bg_image_url || '',
      bg_video_url: c.bg_video_url || '',
      bg_overlay_opacity: c.bg_overlay_opacity || 0.0,
      sort_order: c.sort_order ?? 0,
      is_active: c.is_active ?? true,
    }
    console.group(`[openEditModal] Koleksi: "${c.name}"`)
    console.log('text_position  :', this.form.text_position, '(DB raw:', c.text_position, ')')
    console.log('image_position :', this.form.image_position, '(DB raw:', c.image_position, ')')
    console.log('text_color     :', this.form.text_color)
    console.log('bg_type        :', this.form.bg_type)
    console.log('bg_color       :', this.form.bg_color)
    console.log('bg_overlay_opacity:', this.form.bg_overlay_opacity)
    console.groupEnd()
    this.errors = { name: '' }
    this.isEditing = true
    this.showModal = true
  },

  closeModal() {
    this.showModal = false
    this.resetForm()
  },

  resetForm() {
    this.form = {
      id: null,
      name: '',
      subtitle: '',
      description: '',
      cover_image_url: '',
      bg_type: 'color',
      bg_color: '#F0ECE3',
      text_color: '#232019',
      text_position: 'bottom-left',
      image_position: 'center',
      bg_image_url: '',
      bg_video_url: '',
      bg_overlay_opacity: 0.0,
      sort_order: 0,
      is_active: true,
    }
    this.errors = { name: '' }
  },

  onNameBlur() {
    this.errors.name = this.form.name.trim() ? '' : 'Nama koleksi tidak boleh kosong.'
  },

  async saveCollection() {
    if (this.saving) return
    this.onNameBlur()
    if (this.errors.name) return

    this.saving = true
    try {
      // PENTING: pakai form.bg_type langsung — jangan override dari URL
      const bgType = this.form.bg_type || 'color'

      const payload = {
        name:               this.form.name?.trim() || '',
        subtitle:           this.form.subtitle?.trim() || null,
        description:        this.form.description?.trim() || null,
        cover_image_url:    this.form.cover_image_url?.trim() || null,
        bg_type:            bgType,
        bg_color:           this.form.bg_color || '#F0ECE3',
        text_color:         this.form.text_color || '#232019',
        text_position:      this.form.text_position || 'bottom-left',
        image_position:     this.form.image_position || 'center',
        bg_image_url:       this.form.bg_image_url?.trim() || null,
        bg_video_url:       this.form.bg_video_url?.trim() || null,
        bg_overlay_opacity: Number(this.form.bg_overlay_opacity) || 0.0,
        sort_order:         Number(this.form.sort_order) || 0,
        is_active:          this.form.is_active
      }

      console.group('[saveCollection] Payload ke Supabase')
      console.log('form.id        :', this.form.id)
      console.log('bg_type        :', payload.bg_type)
      console.log('text_color     :', payload.text_color)
      console.log('text_position  :', payload.text_position)
      console.log('image_position :', payload.image_position)
      console.log('Payload lengkap:', { ...payload })
      console.groupEnd()

      if (this.isEditing) {
        const { data, error } = await supabase
          .from('collections')
          .update(payload)
          .eq('id', this.form.id)
          .select()
        if (error) { console.error('[saveCollection] Supabase error:', error); throw error }
        console.log('[saveCollection] Response UPDATE:', data)
        this.showAlert('success', 'Koleksi berhasil diperbarui.')
      } else {
        const { data, error } = await supabase
          .from('collections')
          .insert(payload)
          .select()
        if (error) { console.error('[saveCollection] Supabase error:', error); throw error }
        console.log('[saveCollection] Response INSERT:', data)
        this.showAlert('success', 'Koleksi berhasil ditambahkan.')
      }

      this.closeModal()
      await this.fetchCollections()
    } catch (err) {
      console.error('Save error:', err)
      this.showAlert('error', 'Terjadi kesalahan saat menyimpan koleksi.')
    } finally {
      this.saving = false
    }
  },

  async handleFileUpload(event, type) {
    const file = event.target.files[0]
    if (!file) return

    this.uploadingFile = true
    this.alert = { show: false, type: 'success', message: '' }
    
    try {
      const ext = file.name.split('.').pop()
      const prefix = this.form.id ? this.form.id : Date.now()
      
      let bucket = ''
      let filename = ''
      let targetField = ''

      if (type === 'cover_image') {
        bucket = 'collection-covers'
        filename = `${prefix}-cover.${ext}`
        targetField = 'cover_image_url'
      } else if (type === 'bg_image') {
        bucket = 'collection-covers'
        filename = `${prefix}-bg.${ext}`
        targetField = 'bg_image_url'
      } else if (type === 'bg_video') {
        bucket = 'section-videos'
        filename = `${prefix}-bg.${ext}`
        targetField = 'bg_video_url'
      }

      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filename, file, { upsert: true })

      if (error) throw error

      const { data: publicUrlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(filename)

      const finalUrl = publicUrlData.publicUrl + '?t=' + Date.now()
      console.log(`Upload berhasil ke kolom ${targetField}. Public URL:`, finalUrl)
      this.form[targetField] = finalUrl
      
      if (type === 'bg_image') {
        this.form.bg_type = 'image'
        this.form.bg_video_url = null
      } else if (type === 'bg_video') {
        this.form.bg_type = 'video'
        this.form.bg_image_url = null
      }
      
      this.showAlert('success', 'File berhasil diunggah.')
    } catch (err) {
      console.error('Upload error:', err)
      this.showAlert('error', 'Gagal mengunggah file: ' + err.message)
    } finally {
      this.uploadingFile = false
      event.target.value = '' // reset input
    }
  },

  showAlert(type, msg) {
    this.alert = { show: true, type, message: msg }
    setTimeout(() => { this.alert.show = false }, 4000)
  },

  async updateSortOrder(collection, newOrder) {
    const val = parseInt(newOrder, 10)
    if (isNaN(val)) return
    
    // Optimistic UI update
    const originalOrder = collection.sort_order
    collection.sort_order = val
    this.collections.sort((a, b) => a.sort_order - b.sort_order)

    try {
      const { error } = await supabase
        .from('collections')
        .update({ sort_order: val })
        .eq('id', collection.id)
      
      if (error) throw error
    } catch (err) {
      console.error('Update sort order error:', err)
      collection.sort_order = originalOrder
      this.collections.sort((a, b) => a.sort_order - b.sort_order)
      alert('Gagal mengubah urutan: ' + err.message)
    }
  },

  async moveUp(collection) {
    const idx = this.collections.findIndex(c => c.id === collection.id)
    if (idx > 0) {
      const target = this.collections[idx - 1]
      await this.swapSortOrder(collection, target)
    }
  },

  async moveDown(collection) {
    const idx = this.collections.findIndex(c => c.id === collection.id)
    if (idx > -1 && idx < this.collections.length - 1) {
      const target = this.collections[idx + 1]
      await this.swapSortOrder(collection, target)
    }
  },

  async swapSortOrder(col1, col2) {
    const originalOrder1 = col1.sort_order
    const originalOrder2 = col2.sort_order

    // Swap visually
    col1.sort_order = originalOrder2
    col2.sort_order = originalOrder1
    this.collections.sort((a, b) => a.sort_order - b.sort_order)

    try {
      await Promise.all([
        supabase.from('collections').update({ sort_order: col1.sort_order }).eq('id', col1.id),
        supabase.from('collections').update({ sort_order: col2.sort_order }).eq('id', col2.id)
      ])
    } catch (err) {
      console.error('Swap error:', err)
      col1.sort_order = originalOrder1
      col2.sort_order = originalOrder2
      this.collections.sort((a, b) => a.sort_order - b.sort_order)
      alert('Gagal menukar urutan.')
    }
  }
}))

Alpine.start()
