/**
 * src/toko/home.js
 * Beranda toko online Giva Store (publik, tanpa login).
 */

import '../style.css'
import Alpine from 'alpinejs'
import { supabase } from '../supabaseClient.js'
import {
  storeShellFields,
  mapProductRow,
  PRODUCT_SELECT,
  injectComponents
} from './store-common.js'

// Inject Navbar and Footer before Alpine starts
injectComponents()

window.Alpine = Alpine

Alpine.data('storeHome', () => ({
  ...storeShellFields(),

  loadingCategories: true,
  categories: [],

  sections: {},
  loadingSections: true,

  loadingCollections: true,
  collections: [],
  async init() {
    await this.initShell()
    document.title = `${this.storeName} — Toko Online`
    
    // Panggil render secara paralel agar independen
    await Promise.all([
      this.renderHero(),
      this.renderCategories(),
      this.renderCollections(),
      this.renderWhyUs()
    ])
    
    this.loadingSections = false
  },



  getBgStyle(section) {
    if (!section) return '';
    const type = section.bg_type || 'color';
    if (type === 'image' && section.bg_image_url) {
      const bgPos = this._imgPos(section.image_position);
      return `background-image: url('${section.bg_image_url}'); background-size: cover; background-position: ${bgPos}; background-repeat: no-repeat;`;
    }
    if (type === 'video') {
      return 'background-color: transparent;';
    }
    return `background-color: ${section.bg_color || '#F0ECE3'};`;
  },

  /** Map image_position DB value → CSS background-position string */
  _imgPos(val) {
    const map = {
      'top-left':    'top left',
      'top':         'top center',
      'top-right':   'top right',
      'left':        'center left',
      'center':      'center center',
      'right':       'center right',
      'bottom-left': 'bottom left',
      'bottom':      'bottom center',
      'bottom-right':'bottom right',
    };
    return map[val] || 'center center';
  },

  /** Inline style string untuk elemen <video> — object-position dari image_position */
  getVideoStyle(section) {
    const objPos = this._imgPos(section?.image_position);
    return `position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:${objPos};`;
  },

  hasVideo(section) {
    return section && section.bg_type === 'video' && section.bg_video_url;
  },

  hasOverlay(section) {
    const type = section ? (section.bg_type || 'color') : 'color';
    return type === 'image' || type === 'video';
  },

  /**
   * Kembalikan inline style string untuk container teks berdasarkan text_position.
   * Container harus position:absolute, inset:0, display:flex, flex-direction:column.
   */
  getTextPositionStyle(section) {
    const pos = section?.text_position || 'bottom-left';
    const map = {
      'top-left':      'justify-content:flex-start; align-items:flex-start; padding:2rem;',
      'top-center':    'justify-content:flex-start; align-items:center; padding:2rem;',
      'top-right':     'justify-content:flex-start; align-items:flex-end; padding:2rem;',
      'middle-left':   'justify-content:center; align-items:flex-start; padding:2rem;',
      'middle-center': 'justify-content:center; align-items:center; padding:2rem;',
      'middle-right':  'justify-content:center; align-items:flex-end; padding:2rem;',
      'bottom-left':   'justify-content:flex-end; align-items:flex-start; padding:2rem;',
      'bottom-center': 'justify-content:flex-end; align-items:center; padding:2rem;',
      'bottom-right':  'justify-content:flex-end; align-items:flex-end; padding:2rem;',
    };
    return map[pos] || map['bottom-left'];
  },

  async renderHero() {
    try {
      const { data, error } = await supabase
        .from('homepage_sections')
        .select('*')
        .eq('section_key', 'hero')
        .eq('is_active', true)
        .maybeSingle()
      if (error) throw error
      if (data) this.sections.hero = data
    } catch (err) {
      console.error('Gagal memuat renderHero:', err)
    }
  },

  async renderWhyUs() {
    try {
      const { data, error } = await supabase
        .from('homepage_sections')
        .select('*')
        .eq('section_key', 'why_us')
        .eq('is_active', true)
        .maybeSingle()
      if (error) throw error
      if (data) this.sections.why_us = data
    } catch (err) {
      console.error('Gagal memuat renderWhyUs:', err)
    }
  },

  async renderCategories() {
    this.loadingCategories = true
    try {
      // 1. Fetch section style
      const { data: sectionData, error: sectionErr } = await supabase
        .from('homepage_sections')
        .select('*')
        .eq('section_key', 'categories')
        .eq('is_active', true)
        .maybeSingle()
      if (sectionErr) throw sectionErr
      if (sectionData) this.sections.categories = sectionData

      // 2. Fetch categories data
      const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .order('name', { ascending: true })

      if (error) throw error
      
      this.categories = data || []
    } catch (err) {
      console.error('Gagal memuat renderCategories:', err)
      this.categories = []
    } finally {
      this.loadingCategories = false
    }
  },

  async renderCollections() {
    this.loadingCollections = true
    try {
      const { data, error } = await supabase
        .from('collections')
        .select(`
          id, name, subtitle,
          bg_type, bg_color, text_color, text_position, image_position,
          bg_image_url, bg_video_url, bg_overlay_opacity,
          sort_order, is_active,
          collection_products (
            product_id, sort_order,
            products (${PRODUCT_SELECT})
          )
        `)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (error) throw error

      console.log(`[renderCollections] Berhasil fetch ${(data || []).length} koleksi aktif dari Supabase.`)

      this.collections = (data || []).map(c => {
        // Sort products by sort_order, filter hanya yang aktif
        let cProducts = (c.collection_products || [])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(cp => cp.products)
          .filter(p => p && p.is_active)
          .slice(0, 6)

        console.log(
          `[renderCollections] Koleksi "${c.name}"` +
          ` → text_position: ${c.text_position || '(null)'}` +
          ` | image_position: ${c.image_position || '(null)'}` +
          ` | ${cProducts.length} produk aktif`
        )

        return {
          ...c,
          products: cProducts.map(mapProductRow)
        }
      })

      console.log(`[renderCollections] Total koleksi dirender: ${this.collections.length}`)
    } catch (err) {
      console.error('[renderCollections] Gagal memuat koleksi:', err)
      this.collections = []
    } finally {
      this.loadingCollections = false
    }
  },

  scrollTo(selector) {
    const el = document.querySelector(selector)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    }
  }
}))

Alpine.start()
