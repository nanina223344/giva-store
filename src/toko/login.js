/**
 * src/toko/login.js
 * Logic untuk halaman Autentikasi Pelanggan (Login / Register / Forgot Password).
 */

import '../style.css'
import Alpine from 'alpinejs'
import { supabase } from '../supabaseClient.js'
import { syncCustomerSession, isStaffUser } from './store-common.js'

window.Alpine = Alpine

function formatAuthError(msg) {
  if (!msg) return 'Terjadi kesalahan. Silakan coba lagi.'
  const lower = String(msg).toLowerCase()
  if (lower.includes('user already registered') || lower.includes('already exists')) {
    return 'Email sudah terdaftar. Silakan gunakan tab Masuk atau email lain.'
  }
  if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
    return 'Email atau password salah. Silakan periksa kembali.'
  }
  if (lower.includes('email not confirmed')) {
    return 'Email belum diverifikasi. Cek inbox email Anda.'
  }
  if (lower.includes('password should be at least')) {
    return 'Password minimal 8 karakter.'
  }
  return msg
}

Alpine.data('storeAuth', () => ({
  activeTab: 'login', // 'login' | 'register'
  showForgot: false,

  loading: false,
  error: '',
  success: '',
  paramMsg: '',
  showPassword: false,

  login: {
    email: '',
    password: '',
  },

  register: {
    name: '',
    email: '',
    password: '',
    passwordConfirm: '',
    agreeTerms: false,
  },

  forgot: {
    email: '',
  },

  async init() {
    const params = new URLSearchParams(window.location.search)
    const msg = params.get('msg')
    if (msg) {
      this.paramMsg = msg
    }

    // Checking existing session
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const isStaff = await isStaffUser(session.user.id)
        if (isStaff) {
          window.location.href = '/admin/categories.html'
          return
        }
        this.doRedirect()
      }
    } catch (e) {
      // not logged in
    }
  },

  get passwordStrength() {
    const p = this.register.password || ''
    if (!p) return { label: '', score: 0, color: 'text-stone', bar: 'w-0 bg-sand' }
    if (p.length < 8) return { label: 'Lemah', score: 1, color: 'text-red-500', bar: 'w-1/3 bg-red-500' }

    const hasLetter = /[a-zA-Z]/.test(p)
    const hasNumber = /[0-9]/.test(p)
    const hasSpecialOrUpper = /[^a-z0-9]/.test(p) || /[A-Z]/.test(p)

    if (p.length >= 10 && hasLetter && hasNumber && hasSpecialOrUpper) {
      return { label: 'Kuat', score: 3, color: 'text-emerald-600', bar: 'w-full bg-emerald-500' }
    }
    if (p.length >= 8 && hasLetter && hasNumber) {
      return { label: 'Sedang', score: 2, color: 'text-amber-500', bar: 'w-2/3 bg-amber-500' }
    }
    return { label: 'Lemah', score: 1, color: 'text-red-500', bar: 'w-1/3 bg-red-500' }
  },

  async handleLogin() {
    this.error = ''
    this.success = ''
    this.loading = true

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: this.login.email,
        password: this.login.password,
      })

      if (error) throw error

      // Cek apakah user ini adalah staff
      const isStaff = await isStaffUser(data.user.id)
      if (isStaff) {
        window.location.href = '/admin/categories.html'
        return
      }

      await syncCustomerSession()
      this.doRedirect()
    } catch (err) {
      console.error('Login error:', err)
      this.error = formatAuthError(err.message)
    } finally {
      this.loading = false
    }
  },

  async handleRegister() {
    this.error = ''
    this.success = ''

    if (this.register.password !== this.register.passwordConfirm) {
      this.error = 'Konfirmasi password tidak cocok.'
      return
    }

    if (!this.register.agreeTerms) {
      this.error = 'Anda harus menyetujui Syarat & Ketentuan.'
      return
    }

    this.loading = true
    try {
      const { data, error } = await supabase.auth.signUp({
        email: this.register.email,
        password: this.register.password,
        options: {
          data: {
            name: this.register.name,
            is_staff: false,
          },
        },
      })

      if (error) throw error

      // Tampilkan pesan sukses — jangan auto-redirect agar user sempat membaca
      this.success = 'Akun berhasil dibuat! Cek email kamu untuk verifikasi akun.'
      this.register = { name: '', email: '', password: '', passwordConfirm: '', agreeTerms: false }
    } catch (err) {
      console.error('Register error:', err)
      this.error = formatAuthError(err.message)
    } finally {
      this.loading = false
    }
  },

  async handleForgot() {
    this.error = ''
    this.success = ''
    this.loading = true

    try {
      const resetUrl = window.location.origin + '/toko/reset-password.html'
      const { error } = await supabase.auth.resetPasswordForEmail(this.forgot.email, {
        redirectTo: resetUrl,
      })

      if (error) throw error

      this.success = 'Link reset password sudah dikirim ke email kamu. Cek inbox atau folder spam.'
      this.forgot.email = ''
    } catch (err) {
      console.error('Forgot password error:', err)
      this.error = formatAuthError(err.message)
    } finally {
      this.loading = false
    }
  },

  doRedirect() {
    const params = new URLSearchParams(window.location.search)
    let redirect = params.get('redirect') || sessionStorage.getItem('redirect_after_login')
    sessionStorage.removeItem('redirect_after_login')

    if (!redirect || redirect.includes('login.html') || redirect.includes('reset-password.html')) {
      redirect = '/toko/index.html'
    }
    window.location.href = redirect
  },
}))

Alpine.start()
