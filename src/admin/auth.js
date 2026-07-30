/**
 * src/admin/auth.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Auth guard + sidebar user state untuk semua halaman /admin/* dan /kasir/*.
 *
 * Cara pakai:
 *   import { requireAuth, getStaffUser, getStaffId, getStaffRole,
 *            requireKasirAuth, signOut } from './auth.js'
 *
 * `requireAuth()`      → cek sesi aktif, redirect ke login jika tidak ada.
 * `requireKasirAuth()` → cek sesi + role kasir/admin, redirect atau throw jika tidak punya akses.
 * `getStaffUser()`     → { name, email } untuk tampilan sidebar.
 * `getStaffId()`       → staff.id (integer PK) untuk kolom FK ke tabel staff.
 * `getStaffRole()`     → string role staff ('admin' | 'kasir' | dll) | null.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { supabase } from '../supabaseClient.js'

const LOGIN_URL = '/admin/login.html'

/**
 * Cek apakah ada sesi aktif.
 * Kalau tidak ada → redirect ke halaman login.
 * Kalau ada → kembalikan { session, user }.
 */
export async function requireAuth() {
  const { data: { session }, error } = await supabase.auth.getSession()

  if (error || !session) {
    window.location.replace(LOGIN_URL)
    // Throw agar eksekusi init() berhenti dan tidak melanjutkan fetch data
    throw new Error('Unauthenticated')
  }

  return session
}

/**
 * Ambil data staff (nama, email) dari tabel `staff` berdasarkan user_id sesi aktif.
 * Return { name, email } atau fallback ke email auth jika baris staff tidak ditemukan.
 */
export async function getStaffUser() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { name: '—', email: '—' }

  const { data, error } = await supabase
    .from('staff')
    .select('name')                 // email tidak ada di tabel staff
    .eq('auth_user_id', session.user.id)  // kolom yang benar
    .eq('is_active', true)
    .maybeSingle()

  if (error || !data) {
    // Fallback: tampilkan email dari auth jika baris staff tidak ada
    return {
      name: session.user.user_metadata?.full_name ?? 'Staff',
      email: session.user.email ?? '—',
    }
  }

  return {
    name: data.name,
    email: session.user.email ?? '—',  // email dari auth, bukan dari tabel staff
  }
}

/**
 * Ambil staff.id (primary key tabel staff) berdasarkan sesi aktif.
 *
 * PENTING: Gunakan ini — bukan session.user.id — untuk mengisi kolom created_by
 * yang merupakan foreign key ke staff.id.
 *
 * Return: staff.id (number) | null jika staff tidak ditemukan.
 */
export async function getStaffId() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const { data, error } = await supabase
    .from('staff')
    .select('id')
    .eq('auth_user_id', session.user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !data) return null
  return data.id
}

/**
 * Ambil role staff dari tabel staff berdasarkan sesi aktif.
 * Return: string role ('admin' | 'kasir' | ...) | null jika tidak ditemukan.
 */
export async function getStaffRole() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const { data, error } = await supabase
    .from('staff')
    .select('id, role')
    .eq('auth_user_id', session.user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !data) return null
  return data.role ?? null
}

/**
 * Guard khusus halaman Kasir.
 * Cek: (1) ada sesi aktif → kalau tidak redirect ke login.
 *      (2) role staff adalah 'kasir' atau 'admin' → kalau bukan, throw error dengan pesan.
 *
 * Return: { session, staffId, staffRole } jika lolos semua pengecekan.
 */
export async function requireKasirAuth() {
  const { data: { session }, error } = await supabase.auth.getSession()

  if (error || !session) {
    window.location.replace(LOGIN_URL)
    throw new Error('Unauthenticated')
  }

  const { data: staffRow, error: staffErr } = await supabase
    .from('staff')
    .select('id, role')
    .eq('auth_user_id', session.user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (staffErr || !staffRow) {
    // User login tapi tidak punya baris staff aktif
    await supabase.auth.signOut()
    window.location.replace(LOGIN_URL)
    throw new Error('Staff not found')
  }

  const allowedRoles = ['admin', 'kasir']
  if (!allowedRoles.includes(staffRow.role)) {
    // Login tapi bukan role yang diizinkan
    throw new Error(`ACCESS_DENIED:${staffRow.role}`)
  }

  return { session, staffId: staffRow.id, staffRole: staffRow.role }
}

/**
 * Sign out user dan redirect ke halaman login.
 */
export async function signOut() {
  await supabase.auth.signOut()
  window.location.replace(LOGIN_URL)
}
