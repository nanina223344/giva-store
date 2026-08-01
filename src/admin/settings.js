import '../style.css'
import Alpine from 'alpinejs'
import { supabase } from '../supabaseClient.js'
import { requireAuth, getStaffUser, getStaffRole, signOut } from './auth.js'
import { initSidebar } from '../../admin/js/sidebar.js'


window.Alpine = Alpine

const DEFAULT_SETTINGS = [
  { key: 'toko_nama', group_name: 'toko', label: 'Nama Toko', value: 'Giva Store' },
  { key: 'toko_alamat', group_name: 'toko', label: 'Alamat Toko', value: 'Jl. Contoh Alamat No. 123' },
  { key: 'toko_telepon', group_name: 'toko', label: 'Nomor Telepon', value: '081234567890' },
  { key: 'payment_qris_image_url', group_name: 'pembayaran', label: 'Gambar QRIS', value: '' },
  { key: 'qris_pemilik', group_name: 'pembayaran', label: 'Nama Pemilik QRIS', value: 'Giva Store' },
  { key: 'ewallet_gopay', group_name: 'ewallet', label: 'Nomor GoPay', value: '081234567890' },
  { key: 'ewallet_ovo', group_name: 'ewallet', label: 'Nomor OVO', value: '081234567890' },
  { key: 'ewallet_dana', group_name: 'ewallet', label: 'Nomor Dana', value: '081234567890' },
  { key: 'announcement_bar_active', group_name: 'announcement', label: 'Tampilkan Bar', value: 'false' },
  { key: 'announcement_bar_text', group_name: 'announcement', label: 'Teks Pengumuman', value: '' },
  { key: 'announcement_bar_bg_color', group_name: 'announcement', label: 'Warna Background', value: '#8FA07E' },
  { key: 'announcement_bar_text_color', group_name: 'announcement', label: 'Warna Teks', value: '#FFFFFF' },
]


const QRIS_SETTING_KEY = 'payment_qris_image_url'
const QRIS_BUCKET = 'qris-image'

Alpine.data('settingsAdmin', () => ({
  loading: true,
  sidebarOpen: false,
  staffUser: { name: '—', email: '—' },
  settingsList: [],

  // ── Bank accounts state ───────────────────────────────────────────────
  bankAccounts: [],
  loadingBanks: false,

  // Form tambah/edit rekening
  showBankModal: false,
  editingBank: null,       // null = tambah baru, object = edit existing
  savingBank: false,
  bankForm: {
    bank_name: '',
    account_number: '',
    account_name: '',
    is_active: true,
    sort_order: 0,
  },

  // Hapus rekening
  showDeleteBankModal: false,
  deletingBank: null,
  deletingBankLoading: false,

  // ── Shipping zones state ─────────────────────────────────────────────
  shippingZones: [],
  loadingZones: false,

  // Form tambah zona
  showZoneModal: false,
  savingZone: false,
  zoneForm: {
    name: '',
    description: '',
    base_cost: 0,
    free_shipping_min_order: 0,
    is_active: true,
    sort_order: 0,
  },

  // Hapus zona
  showDeleteZoneModal: false,
  deletingZone: null,
  deletingZoneLoading: false,

  // QRIS image upload
  uploadingQris: false,
  deletingQris: false,

  alert: {
    show: false,
    type: 'success',
    message: ''
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
      await Promise.all([
        this.fetchSettings(),
        this.fetchBankAccounts(),
        this.fetchShippingZones(),
      ])
    } catch (err) {
      console.error('Init error:', err)
      if (err.message !== 'Unauthenticated') {
        this.showAlert('Gagal memuat halaman: ' + err.message, 'error')
        this.loading = false
      }
    }
  },

  async fetchSettings() {
    this.loading = true
    try {
      let { data, error } = await supabase
        .from('settings')
        .select('*')
        
      if (error) {
        // Jika tabel belum ada atau error lain
        throw error
      }

      // Jika kosong, inisialisasi dengan default
      if (!data || data.length === 0) {
        const { error: insertErr } = await supabase
          .from('settings')
          .insert(DEFAULT_SETTINGS)
          
        if (insertErr) throw insertErr
        
        // Ambil ulang setelah insert
        const { data: newData, error: fetchErr } = await supabase
          .from('settings')
          .select('*')
          
        if (fetchErr) throw fetchErr
        data = newData
      }
      
      // Pastikan key payment_qris_image_url ada (migrasi dari qris_url lama bila perlu)
      await this.ensureQrisSettingRow(data)
      // Ambil ulang agar list sinkron
      const { data: fresh, error: freshErr } = await supabase.from('settings').select('*')
      if (freshErr) throw freshErr
      data = fresh || data

      // Tambahkan property `saving` untuk UI tiap item
      this.settingsList = data.map(s => ({ ...s, saving: false }))
      
    } catch (err) {
      console.error('Fetch settings err:', err)
      this.showAlert('Gagal mengambil pengaturan. Pastikan tabel settings sudah ada di database.', 'error')
    } finally {
      this.loading = false
    }
  },

  async ensureQrisSettingRow(rows) {
    const list = rows || []
    const hasNew = list.some(r => r.key === QRIS_SETTING_KEY)
    if (hasNew) return

    const old = list.find(r => r.key === 'qris_url')
    if (old) {
      // Rename key lama → payment_qris_image_url, pertahankan value
      const { error } = await supabase
        .from('settings')
        .update({
          key: QRIS_SETTING_KEY,
          label: 'Gambar QRIS',
          updated_at: new Date().toISOString(),
        })
        .eq('id', old.id)
      if (error) {
        // Fallback: insert key baru + copy value
        await supabase.from('settings').insert({
          key: QRIS_SETTING_KEY,
          group_name: 'pembayaran',
          label: 'Gambar QRIS',
          value: old.value || '',
        })
      }
      return
    }

    const { error: insertErr } = await supabase.from('settings').insert({
      key: QRIS_SETTING_KEY,
      group_name: 'pembayaran',
      label: 'Gambar QRIS',
      value: '',
    })
    if (insertErr) console.warn('ensureQrisSettingRow insert:', insertErr.message)
  },

  getQrisSetting() {
    return this.settingsList.find(s => s.key === QRIS_SETTING_KEY) || null
  },

  get qrisImageUrl() {
    return this.getQrisSetting()?.value || ''
  },

  async upsertQrisUrl(publicUrl) {
    const existing = this.getQrisSetting()
    if (existing) {
      const { error } = await supabase
        .from('settings')
        .update({ value: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (error) throw error
      existing.value = publicUrl
    } else {
      const { data, error } = await supabase
        .from('settings')
        .insert({
          key: QRIS_SETTING_KEY,
          group_name: 'pembayaran',
          label: 'Gambar QRIS',
          value: publicUrl,
        })
        .select('*')
        .single()
      if (error) throw error
      this.settingsList.push({ ...data, saving: false })
    }
  },

  async handleQrisUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowed.includes(file.type) && !file.type.startsWith('image/')) {
      this.showAlert('File harus berupa gambar (JPG, PNG, WebP, dll).', 'error')
      event.target.value = ''
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      this.showAlert('Ukuran file maksimal 5 MB.', 'error')
      event.target.value = ''
      return
    }

    this.uploadingQris = true
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
      const path = `qris.${ext}`

      // Hapus file qris.* lama di bucket agar tidak menumpuk (best-effort)
      try {
        const { data: existingFiles } = await supabase.storage.from(QRIS_BUCKET).list('', { limit: 20 })
        const toRemove = (existingFiles || [])
          .filter(f => f.name.startsWith('qris.'))
          .map(f => f.name)
        if (toRemove.length) {
          await supabase.storage.from(QRIS_BUCKET).remove(toRemove)
        }
      } catch (_) { /* ignore list/remove errors */ }

      const { error: uploadErr } = await supabase.storage
        .from(QRIS_BUCKET)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: true,
          contentType: file.type || 'image/png',
        })
      if (uploadErr) throw uploadErr

      const { data: urlData } = supabase.storage.from(QRIS_BUCKET).getPublicUrl(path)
      // Cache-bust agar preview langsung update setelah overwrite
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`

      await this.upsertQrisUrl(publicUrl)
      this.showAlert('Gambar QRIS berhasil diupload.', 'success')
    } catch (err) {
      console.error('Upload QRIS err:', err)
      this.showAlert('Gagal upload QRIS: ' + err.message, 'error')
    } finally {
      this.uploadingQris = false
      event.target.value = ''
    }
  },

  async deleteQrisImage() {
    if (this.deletingQris) return
    const current = this.qrisImageUrl
    if (!current) return

    this.deletingQris = true
    try {
      try {
        const { data: existingFiles } = await supabase.storage.from(QRIS_BUCKET).list('', { limit: 20 })
        const toRemove = (existingFiles || [])
          .filter(f => f.name.startsWith('qris.'))
          .map(f => f.name)
        if (toRemove.length) {
          await supabase.storage.from(QRIS_BUCKET).remove(toRemove)
        }
      } catch (_) { /* ignore */ }

      await this.upsertQrisUrl('')
      this.showAlert('Gambar QRIS dihapus.', 'success')
    } catch (err) {
      console.error('Delete QRIS err:', err)
      this.showAlert('Gagal menghapus QRIS: ' + err.message, 'error')
    } finally {
      this.deletingQris = false
    }
  },

  getGroup(groupName) {
    return this.settingsList.filter(s => s.group_name === groupName)
  },

  async saveSetting(item) {
    item.saving = true
    try {
      const { error } = await supabase
        .from('settings')
        .update({ value: item.value, updated_at: new Date().toISOString() })
        .eq('id', item.id)

      if (error) throw error
      
      this.showAlert('Berhasil menyimpan ' + item.label, 'success')
    } catch (err) {
      console.error('Save error:', err)
      this.showAlert('Gagal menyimpan ' + item.label, 'error')
    } finally {
      item.saving = false
    }
  },

  // ── Bank accounts CRUD ────────────────────────────────────────────────

  async fetchBankAccounts() {
    this.loadingBanks = true
    try {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('bank_name', { ascending: true })

      if (error) throw error
      this.bankAccounts = data || []
    } catch (err) {
      console.error('Fetch bank accounts err:', err)
      this.showAlert('Gagal mengambil data rekening bank.', 'error')
    } finally {
      this.loadingBanks = false
    }
  },

  openBankForm(bank) {
    if (bank) {
      // Mode edit — isi form dengan data existing
      this.editingBank = bank
      this.bankForm = {
        bank_name:      bank.bank_name,
        account_number: bank.account_number,
        account_name:   bank.account_name,
        is_active:      bank.is_active,
        sort_order:     bank.sort_order ?? 0,
      }
    } else {
      // Mode tambah baru
      this.editingBank = null
      this.bankForm = {
        bank_name:      '',
        account_number: '',
        account_name:   '',
        is_active:      true,
        sort_order:     0,
      }
    }
    this.showBankModal = true
  },

  closeBankModal() {
    this.showBankModal = false
    this.editingBank = null
  },

  async saveBankAccount() {
    if (this.savingBank) return
    this.savingBank = true
    try {
      const payload = {
        bank_name:      this.bankForm.bank_name.trim(),
        account_number: this.bankForm.account_number.trim(),
        account_name:   this.bankForm.account_name.trim(),
        is_active:      this.bankForm.is_active,
        sort_order:     Number(this.bankForm.sort_order) || 0,
      }

      if (this.editingBank) {
        // Update
        const { error } = await supabase
          .from('bank_accounts')
          .update(payload)
          .eq('id', this.editingBank.id)

        if (error) throw error
        this.showAlert('Rekening ' + payload.bank_name + ' berhasil diperbarui.', 'success')
      } else {
        // Insert
        const { error } = await supabase
          .from('bank_accounts')
          .insert(payload)

        if (error) throw error
        this.showAlert('Rekening ' + payload.bank_name + ' berhasil ditambahkan.', 'success')
      }

      this.closeBankModal()
      await this.fetchBankAccounts()
    } catch (err) {
      console.error('Save bank account err:', err)
      this.showAlert('Gagal menyimpan rekening: ' + err.message, 'error')
    } finally {
      this.savingBank = false
    }
  },

  confirmDeleteBank(bank) {
    this.deletingBank = bank
    this.showDeleteBankModal = true
  },

  async deleteBank() {
    if (!this.deletingBank || this.deletingBankLoading) return
    this.deletingBankLoading = true
    try {
      const { error } = await supabase
        .from('bank_accounts')
        .delete()
        .eq('id', this.deletingBank.id)

      if (error) throw error

      this.showAlert('Rekening ' + this.deletingBank.bank_name + ' berhasil dihapus.', 'success')
      this.showDeleteBankModal = false
      this.deletingBank = null
      await this.fetchBankAccounts()
    } catch (err) {
      console.error('Delete bank err:', err)
      this.showAlert('Gagal menghapus rekening: ' + err.message, 'error')
    } finally {
      this.deletingBankLoading = false
    }
  },

  showAlert(message, type = 'success') {
    this.alert = {
      show: true,
      type,
      message
    }
    setTimeout(() => {
      this.alert.show = false
    }, 4000)
  },

  // ── Shipping zones CRUD ────────────────────────────────────────────────
  async fetchShippingZones() {
    this.loadingZones = true
    try {
      const { data, error } = await supabase
        .from('shipping_zones')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

      if (error) throw error
      this.shippingZones = (data || []).map(z => ({
        ...z,
        saving: false
      }))
    } catch (err) {
      console.error('Fetch shipping zones error:', err)
      this.showAlert('Gagal mengambil zona pengiriman: ' + err.message, 'error')
    } finally {
      this.loadingZones = false
    }
  },

  openAddZoneModal() {
    this.zoneForm = {
      name: '',
      description: '',
      base_cost: 0,
      free_shipping_min_order: 0,
      is_active: true,
      sort_order: (this.shippingZones.length + 1) * 10,
    }
    this.showZoneModal = true
  },

  closeZoneModal() {
    this.showZoneModal = false
  },

  async addZone() {
    if (!this.zoneForm.name.trim()) {
      this.showAlert('Nama zona pengiriman wajib diisi.', 'error')
      return
    }

    this.savingZone = true
    try {
      const payload = {
        name: this.zoneForm.name.trim(),
        description: this.zoneForm.description.trim() || null,
        base_cost: Number(this.zoneForm.base_cost) || 0,
        free_shipping_min_order: Number(this.zoneForm.free_shipping_min_order) || 0,
        is_active: this.zoneForm.is_active !== false,
        sort_order: Number(this.zoneForm.sort_order) || 0,
      }

      const { error } = await supabase
        .from('shipping_zones')
        .insert(payload)

      if (error) throw error

      this.showAlert('Zona pengiriman baru berhasil ditambahkan.', 'success')
      this.closeZoneModal()
      await this.fetchShippingZones()
    } catch (err) {
      this.showAlert('Gagal menambah zona pengiriman: ' + err.message, 'error')
    } finally {
      this.savingZone = false
    }
  },

  async saveZone(zone) {
    if (!zone.name || !zone.name.trim()) {
      this.showAlert('Nama zona pengiriman tidak boleh kosong.', 'error')
      return
    }

    zone.saving = true
    try {
      const payload = {
        name: zone.name.trim(),
        description: zone.description ? zone.description.trim() : null,
        base_cost: Number(zone.base_cost) || 0,
        free_shipping_min_order: Number(zone.free_shipping_min_order) || 0,
        is_active: zone.is_active !== false,
        sort_order: Number(zone.sort_order) || 0,
      }

      const { error } = await supabase
        .from('shipping_zones')
        .update(payload)
        .eq('id', zone.id)

      if (error) throw error

      this.showAlert(`Zona "${zone.name}" berhasil diperbarui.`, 'success')
    } catch (err) {
      this.showAlert('Gagal memperbarui zona: ' + err.message, 'error')
    } finally {
      zone.saving = false
    }
  },

  confirmDeleteZone(zone) {
    this.deletingZone = zone
    this.showDeleteZoneModal = true
  },

  async deleteZone() {
    if (!this.deletingZone) return
    this.deletingZoneLoading = true
    try {
      const { error } = await supabase
        .from('shipping_zones')
        .delete()
        .eq('id', this.deletingZone.id)

      if (error) throw error

      this.showAlert(`Zona "${this.deletingZone.name}" berhasil dihapus.`, 'success')
      this.showDeleteZoneModal = false
      this.deletingZone = null
      await this.fetchShippingZones()
    } catch (err) {
      this.showAlert('Gagal menghapus zona: ' + err.message, 'error')
    } finally {
      this.deletingZoneLoading = false
    }
  },

  async logout() {
    await signOut()
  }
}))

Alpine.start()
