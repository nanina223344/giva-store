import '../style.css'
import Alpine from 'alpinejs'
import { supabase } from '../supabaseClient.js'
import { requireAuth, getStaffUser, signOut } from './auth.js'
import { initSidebar } from '../../admin/js/sidebar.js'


window.Alpine = Alpine

Alpine.data('sectionsAdmin', () => ({
  sections: [],
  loading: true,
  saving: false,
  sidebarOpen: false,

  searchQuery: '',

  staffUser: { name: '—', email: '—' },

  showModal: false,
  form: {
    id: null,
    section_key: '',
    title: '',
    subtitle: '',
    cta_text: '',
    cta_url: '',
    bg_type: 'color',
    bg_color: '#F0ECE3',
    text_color: '#232019',
    text_position: 'middle-center',
    image_position: 'center',
    bg_image_url: '',
    bg_video_url: '',
    bg_overlay_opacity: 0.0,
    sort_order: 0,
  },
  uploadingFile: false,
  errors: {
    title: ''
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
    await this.fetchSections()
  },

  async logout() {
    await signOut()
  },

  get filteredSections() {
    let list = this.sections
    const q = this.searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter(c => 
        (c.title || '').toLowerCase().includes(q) ||
        (c.subtitle || '').toLowerCase().includes(q) ||
        (c.section_key || '').toLowerCase().includes(q)
      )
    }
    return list
  },

  async fetchSections() {
    this.loading = true
    try {
      // Query collections with exact count of related collection_products
      const { data, error } = await supabase
        .from('homepage_sections')
        .select('*')
        .order('sort_order', { ascending: true })

      if (error) throw error

      this.sections = data || []
    } catch (err) {
      console.error('Error fetching sections:', err)
      this.showAlert('error', 'Gagal memuat data sections.')
    } finally {
      this.loading = false
    }
  },

  openEditModal(c) {
    this.form = {
      id: c.id,
      section_key: c.section_key,
      title: c.title || '',
      subtitle: c.subtitle || '',
      cta_text: c.cta_text || '',
      cta_url: c.cta_url || '',
      bg_type: c.bg_type || 'color',
      bg_color: c.bg_color || '#F0ECE3',
      text_color: c.text_color || '#232019',
      text_position: c.text_position || 'middle-center',
      image_position: c.image_position || 'center',
      bg_image_url: c.bg_image_url || '',
      bg_video_url: c.bg_video_url || '',
      bg_overlay_opacity: c.bg_overlay_opacity || 0.0,
      sort_order: c.sort_order ?? 0,
    }
    this.errors = { title: '' }
    this.showModal = true
  },

  closeModal() {
    this.showModal = false
    this.resetForm()
  },

  resetForm() {
    this.form = {
      id: null,
      section_key: '',
      title: '',
      subtitle: '',
      cta_text: '',
      cta_url: '',
      bg_type: 'color',
      bg_color: '#F0ECE3',
      text_color: '#232019',
      text_position: 'middle-center',
      image_position: 'center',
      bg_image_url: '',
      bg_video_url: '',
      bg_overlay_opacity: 0.0,
      sort_order: 0,
    }
    this.errors = { title: '' }
  },

  onTitleBlur() {
    this.errors.title = this.form.title.trim() ? '' : 'Title tidak boleh kosong.'
  },

  async saveSection() {
    if (this.saving) return
    this.onTitleBlur()
    if (this.errors.title) return

    this.saving = true
    try {
      // PENTING: pakai form.bg_type langsung — jangan override dari URL
      // karena URL bisa kosong kalau user tidak mengubahnya
      const bgType = this.form.bg_type || 'color'

      const payload = {
        title:               this.form.title?.trim() || '',
        subtitle:            this.form.subtitle?.trim() || null,
        cta_text:            this.form.cta_text?.trim() || null,
        cta_url:             this.form.cta_url?.trim() || null,
        bg_type:             bgType,
        bg_color:            this.form.bg_color || '#F0ECE3',
        text_color:          this.form.text_color || '#232019',
        text_position:       this.form.text_position || 'middle-center',
        image_position:      this.form.image_position || 'center',
        bg_image_url:        this.form.bg_image_url?.trim() || null,
        bg_video_url:        this.form.bg_video_url?.trim() || null,
        bg_overlay_opacity:  Number(this.form.bg_overlay_opacity) || 0.0,
        sort_order:          Number(this.form.sort_order) || 0
      }

      console.group('[saveSection] Payload ke Supabase')
      console.log('form.id        :', this.form.id)
      console.log('bg_type        :', payload.bg_type)
      console.log('text_color     :', payload.text_color)
      console.log('text_position  :', payload.text_position)
      console.log('image_position :', payload.image_position)
      console.log('Payload lengkap:', { ...payload })
      console.groupEnd()

      const { data, error } = await supabase
        .from('homepage_sections')
        .update(payload)
        .eq('id', this.form.id)
        .select()

      if (error) {
        console.error('[saveSection] Supabase error:', error)
        throw error
      }

      console.log('[saveSection] Supabase response:', data)
      this.showAlert('success', 'Section berhasil diperbarui.')

      this.closeModal()
      await this.fetchSections()
    } catch (err) {
      console.error('[saveSection] Exception:', err)
      this.showAlert('error', 'Terjadi kesalahan saat menyimpan section.')
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
      const prefix = this.form.section_key ? this.form.section_key : Date.now()
      
      let bucket = ''
      let filename = ''
      let targetField = ''

      if (type === 'bg_image') {
        bucket = 'section-backgrounds'
        filename = `${prefix}-bg.${ext}`
        targetField = 'bg_image_url'
      } else if (type === 'bg_video') {
        bucket = 'section-videos'
        filename = `${prefix}-bg.${ext}`
        targetField = 'bg_video_url'
      } else if (type === 'thumb_image') {
        bucket = 'section-backgrounds'
        filename = `${prefix}-thumb.${ext}`
        targetField = 'bg_image_url'
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

  async updateSortOrder(section, newOrder) {
    const val = parseInt(newOrder, 10)
    if (isNaN(val)) return
    
    // Optimistic UI update
    const originalOrder = section.sort_order
    section.sort_order = val
    this.sections.sort((a, b) => a.sort_order - b.sort_order)

    try {
      const { error } = await supabase
        .from('homepage_sections')
        .update({ sort_order: val })
        .eq('id', section.id)
      
      if (error) throw error
    } catch (err) {
      console.error('Update sort order error:', err)
      section.sort_order = originalOrder
      this.sections.sort((a, b) => a.sort_order - b.sort_order)
      alert('Gagal mengubah urutan: ' + err.message)
    }
  },

  async moveUp(section) {
    const idx = this.sections.findIndex(s => s.id === section.id)
    if (idx > 0) {
      const target = this.sections[idx - 1]
      await this.swapSortOrder(section, target)
    }
  },

  async moveDown(section) {
    const idx = this.sections.findIndex(s => s.id === section.id)
    if (idx > -1 && idx < this.sections.length - 1) {
      const target = this.sections[idx + 1]
      await this.swapSortOrder(section, target)
    }
  },

  async swapSortOrder(section1, section2) {
    const originalOrder1 = section1.sort_order
    const originalOrder2 = section2.sort_order

    // Swap visually
    section1.sort_order = originalOrder2
    section2.sort_order = originalOrder1
    this.sections.sort((a, b) => a.sort_order - b.sort_order)

    try {
      await Promise.all([
        supabase.from('homepage_sections').update({ sort_order: section1.sort_order }).eq('id', section1.id),
        supabase.from('homepage_sections').update({ sort_order: section2.sort_order }).eq('id', section2.id)
      ])
    } catch (err) {
      console.error('Swap error:', err)
      section1.sort_order = originalOrder1
      section2.sort_order = originalOrder2
      this.sections.sort((a, b) => a.sort_order - b.sort_order)
      alert('Gagal menukar urutan.')
    }
  }
}))

Alpine.start()
