/**
 * src/toko/reset-password.js
 * Logic untuk Halaman Reset Password Pelanggan — Giva Store.
 */

import '../style.css'
import Alpine from 'alpinejs'
import { supabase } from '../supabaseClient.js'

window.Alpine = Alpine

Alpine.data('storeResetPassword', () => ({
  loading: false,
  error: '',
  success: '',
  showPassword: false,

  form: {
    password: '',
    passwordConfirm: '',
  },

  async init() {
    // Auth session automatically acquired from URL recovery hash by Supabase client
  },

  async handleReset() {
    this.error = ''
    this.success = ''

    if (this.form.password !== this.form.passwordConfirm) {
      this.error = 'Konfirmasi password baru tidak cocok.'
      return
    }

    if (this.form.password.length < 8) {
      this.error = 'Password minimal 8 karakter.'
      return
    }

    this.loading = true
    try {
      const { error } = await supabase.auth.updateUser({
        password: this.form.password,
      })

      if (error) throw error

      this.success = 'Password berhasil diubah! Mengalihkan ke halaman Masuk...'
      setTimeout(() => {
        window.location.href = '/toko/login.html?msg=' + encodeURIComponent('Password berhasil diubah, silakan masuk.')
      }, 1500)
    } catch (err) {
      console.error('Reset password error:', err)
      this.error = err.message || 'Gagal mengubah password. Silakan coba lagi.'
    } finally {
      this.loading = false
    }
  },
}))

Alpine.start()
