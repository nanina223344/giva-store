/**
 * src/toko/about.js
 * Logic Halaman Tentang Kami Storefront — Giva Store.
 */

import '../style.css'
import Alpine from 'alpinejs'
import { storeShellFields, injectComponents, fetchStoreSettings } from './store-common.js'

injectComponents()
window.Alpine = Alpine

Alpine.data('storeAbout', () => ({
  ...storeShellFields(),

  loading: true,

  async init() {
    await this.initShell()
    try {
      const s = await fetchStoreSettings()
      this.settings = s
    } catch (err) {
      console.error('Fetch store settings error:', err)
    }
    this.loading = false
  },

  get storeTagline() {
    return this.settings.store_tagline || 'Keindahan dan Kualitas Terbaik dalam Setiap Detail.'
  },

  get aboutParagraphs() {
    const text = this.settings.store_about_long || this.settings.store_about || ''
    if (!text) {
      return [
        'Giva Store didirikan dengan semangat untuk menghadirkan tas, dompet, dan produk aksesoris berkualitas tinggi dengan desain timeless yang elegan.',
        'Kami percaya bahwa setiap produk pilihan Anda adalah cerminan dari gaya hidup dan apresiasi terhadap keindahan. Oleh karena itu, kami selalu menyeleksi secara cermat setiap bahan dan detail jahitan untuk memastikan kualitas terbaik sampai di tangan Anda.',
      ]
    }
    return text.split(/\n+/).map((p) => p.trim()).filter((p) => p.length > 0)
  },

  waLink(cleanNumber = false) {
    let num = this.settings.store_whatsapp || ''
    num = num.replace(/\D/g, '')
    if (num.startsWith('0')) {
      num = '62' + num.slice(1)
    }
    return cleanNumber ? num : `https://wa.me/${num}`
  },

  igLink() {
    let handle = (this.settings.store_instagram || '').replace('@', '').trim()
    return handle ? `https://instagram.com/${handle}` : 'https://instagram.com'
  },
}))

Alpine.start()
