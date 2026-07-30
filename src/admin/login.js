/**
 * src/admin/login.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Logika halaman login admin Giva Store.
 * Flow:
 *   1. Kalau sudah ada sesi aktif → langsung redirect ke /admin/categories.html
 *   2. Submit form → signInWithPassword()
 *   3. Cek tabel `staff` (is_active = true) → kalau tidak ada → sign out + error
 *   4. Berhasil → redirect ke halaman admin utama
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '../style.css'
import Alpine from 'alpinejs'
import { supabase } from '../supabaseClient.js'

window.Alpine = Alpine

const ADMIN_HOME = '/admin/categories.html'

Alpine.data('loginPage', () => ({
  email: '',
  password: '',
  loading: false,
  showPassword: false,

  error: '',   // pesan error yang ditampilkan ke user

  // ── Init: kalau sudah login, langsung masuk ──────────────────────────────
  async init() {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      window.location.replace(ADMIN_HOME)
    }
  },

  // ── Submit form login ─────────────────────────────────────────────────────
  async handleLogin() {
    this.error = ''
    const email = this.email.trim()
    const password = this.password

    if (!email || !password) {
      this.error = 'Email dan password wajib diisi.'
      return
    }

    this.loading = true
    try {
      // 1. Autentikasi dengan Supabase Auth
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })

      if (authError) {
        // Pesan ramah untuk kasus umum
        if (authError.message.toLowerCase().includes('invalid login')) {
          this.error = 'Email atau password salah. Silakan coba lagi.'
        } else {
          this.error = authError.message
        }
        return
      }

      // 2. Pastikan sesi aktif di client sebelum query (fix timing RLS)
      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      })

      // 3. Cek apakah user ini terdaftar sebagai staff aktif
      const { data: staffRow, error: staffError } = await supabase
        .from('staff')
        .select('id')
        .eq('auth_user_id', data.user.id)   // kolom yang benar di tabel staff
        .eq('is_active', true)
        .maybeSingle()

      if (staffError) {
        console.error('[Login] Staff check error:', staffError)
        await supabase.auth.signOut()
        this.error = `Gagal memverifikasi akses staff: ${staffError.message}`
        return
      }

      if (!staffRow) {
        // User ada di auth tapi bukan staff aktif → sign out dan tolak
        await supabase.auth.signOut()
        this.error = 'Akun ini tidak memiliki akses staff.'
        return
      }

      // 4. Berhasil → masuk ke admin
      window.location.replace(ADMIN_HOME)

    } catch (err) {
      this.error = `Terjadi kesalahan: ${err?.message ?? 'Silakan coba lagi.'}`
      console.error('[Login]', err)
    } finally {
      this.loading = false
    }
  },
}))

Alpine.start()
