/**
 * /admin/js/sidebar.js
 * Sidebar terpusat untuk semua halaman admin.
 * Di-load sebagai module script lewat Vite.
 * Gunakan: import '/admin/js/sidebar.js' di file JS tiap halaman admin.
 */

const SIDEBAR_NAV = [
  {
    group: 'Katalog',
    items: [
      { href: '/admin/categories.html', label: 'Kategori Produk', icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z' },
      { href: '/admin/colors.html',     label: 'Warna',           icon: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01' },
      { href: '/admin/products.html',   label: 'Produk',          icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10' },
      { href: '/admin/collections.html',label: 'Koleksi',         icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
      { href: '/admin/discounts.html', label: 'Diskon',           icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z' },
    ],
  },
  {
    group: 'Pelanggan',
    items: [
      { href: '/admin/customers.html', label: 'Customer', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
    ],
  },
  {
    group: 'Pengadaan',
    items: [
      { href: '/admin/suppliers.html', label: 'Supplier',  icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
      { href: '/admin/purchases.html', label: 'Pembelian', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
      { href: '/admin/stock.html',     label: 'Stok',      icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M10 12v5m4-5v5' },
    ],
  },
  {
    group: 'Sistem',
    items: [
      { href: '/admin/reports.html',   label: 'Laporan',          icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
      { href: '/kasir/index.html',    label: 'Kasir (POS)',      icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 7h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V8a1 1 0 011-1z', noActive: true },
      { href: '/admin/sections.html', label: 'Sections Beranda', icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' },
      { href: '/admin/settings.html', label: 'Pengaturan',       icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z' },
      { href: '/toko/index.html',     label: 'Ke Storefront ↗',  icon: 'M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14', target: '_blank', noActive: true },
    ],
  },
]

function buildNavItem(item, currentPath) {
  const isActive = !item.noActive && currentPath.endsWith(item.href.split('/').pop())
  const activeClass = isActive
    ? 'text-sage-deep bg-sage/10 border-sage/25 font-semibold'
    : 'text-stone hover:text-ink hover:bg-cream border-transparent'
  const iconColor = isActive ? 'color: var(--color-sage)' : ''
  const target = item.target ? ` target="${item.target}"` : ''
  const badgeHTML = item.badgeId ? `<span id="${item.badgeId}" class="ml-auto hidden px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none shadow-sm"></span>` : ''

  return `
    <a href="${item.href}"${target}
      class="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium border transition-all ${activeClass}">
      <svg class="w-4 h-4 flex-shrink-0" style="${iconColor}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${item.icon}" />
      </svg>
      <span class="flex-1">${item.label}</span>
      ${badgeHTML}
    </a>`
}

function buildSidebar(staffUser) {
  const currentPath = window.location.pathname

  const navHTML = SIDEBAR_NAV.map(group => `
    <p class="px-3 pt-4 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-stone first:pt-3">${group.group}</p>
    ${group.items.map(item => buildNavItem(item, currentPath)).join('')}
  `).join('')

  const initial = staffUser?.name?.charAt(0)?.toUpperCase() || 'A'
  const name = staffUser?.name || 'Loading...'
  const email = staffUser?.email || ''

  return `
    <!-- Mobile backdrop -->
    <div id="sidebar-backdrop"
      class="fixed inset-0 z-30 bg-ink/30 backdrop-blur-sm lg:hidden"
      style="display:none;"
      onclick="closeSidebar()">
    </div>

    <!-- Sidebar panel -->
    <aside id="admin-sidebar-panel"
      class="sidebar-panel fixed inset-y-0 left-0 z-40 w-64 flex-shrink-0 bg-sand border-r border-border flex flex-col transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 lg:w-60"
      style="transform: translateX(-100%);">

      <!-- Brand -->
      <div class="px-6 py-5 border-b border-border flex items-center justify-between">
        <a href="/admin/categories.html" class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-sage flex items-center justify-center flex-shrink-0">
            <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          </div>
          <div>
            <p class="text-sm font-semibold text-ink leading-tight">Giva Store</p>
            <p class="text-xs text-stone leading-tight">Admin Panel</p>
          </div>
        </a>
        <!-- Close button (mobile only) -->
        <button onclick="closeSidebar()"
          class="lg:hidden w-9 h-9 rounded-lg text-stone hover:text-ink hover:bg-cream flex items-center justify-center transition-all">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Nav -->
      <nav class="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        ${navHTML}
      </nav>

      <!-- User footer -->
      <div class="px-4 py-4 border-t border-border">
        <div class="flex items-center gap-3 mb-3">
          <div id="sidebar-avatar"
            class="w-8 h-8 rounded-full bg-sage/20 border border-sage/30 flex items-center justify-center text-xs font-semibold text-sage-deep flex-shrink-0">
            ${initial}
          </div>
          <div class="min-w-0">
            <p id="sidebar-name" class="text-sm font-medium text-ink truncate">${name}</p>
            <p id="sidebar-email" class="text-xs text-stone truncate">${email}</p>
          </div>
        </div>
        <button id="sidebar-logout-btn"
          class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-stone hover:text-red-600 hover:bg-red-50 border border-border hover:border-red-200 transition-all">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Keluar
        </button>
      </div>
    </aside>`
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Buka mobile sidebar */
window.openSidebar = function () {
  const backdrop = document.getElementById('sidebar-backdrop')
  const panel = document.getElementById('admin-sidebar-panel')
  if (backdrop) backdrop.style.display = ''
  if (panel) panel.style.transform = 'translateX(0)'
}

/** Tutup mobile sidebar */
window.closeSidebar = function () {
  const backdrop = document.getElementById('sidebar-backdrop')
  const panel = document.getElementById('admin-sidebar-panel')
  if (backdrop) backdrop.style.display = 'none'
  if (panel) panel.style.transform = 'translateX(-100%)'
}

/**
 * Inisialisasi sidebar — dipanggil dari tiap halaman admin setelah auth selesai.
 * @param {object} staffUser — { name, email } dari getStaffUser()
 * @param {function} logoutFn — fungsi logout halaman (opsional, default signOut dari auth.js)
 */
import { supabase } from '/src/supabaseClient.js'

export async function fetchPendingOrdersCount() {
  try {
    const { count, error } = await supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')

    if (!error && typeof count === 'number') {
      const badgeEl = document.getElementById('sidebar-orders-pending-badge')
      if (badgeEl) {
        if (count > 0) {
          badgeEl.textContent = count > 99 ? '99+' : count
          badgeEl.classList.remove('hidden')
        } else {
          badgeEl.classList.add('hidden')
        }
      }
    }
  } catch (e) {}
}

export function initSidebar(staffUser, logoutFn) {
  const container = document.getElementById('admin-sidebar')
  if (!container) return

  container.outerHTML = buildSidebar(staffUser)

  // Desktop: pastikan panel selalu terlihat
  const panel = document.getElementById('admin-sidebar-panel')
  if (panel && window.innerWidth >= 1024) {
    panel.style.transform = 'translateX(0)'
  }

  // Wire logout button
  const logoutBtn = document.getElementById('sidebar-logout-btn')
  if (logoutBtn && typeof logoutFn === 'function') {
    logoutBtn.addEventListener('click', logoutFn)
  }

  // Update user info jika sudah tersedia
  if (staffUser) {
    const avatarEl = document.getElementById('sidebar-avatar')
    const nameEl   = document.getElementById('sidebar-name')
    const emailEl  = document.getElementById('sidebar-email')
    if (avatarEl) avatarEl.textContent = staffUser.name?.charAt(0)?.toUpperCase() || 'A'
    if (nameEl)   nameEl.textContent   = staffUser.name || '—'
    if (emailEl)  emailEl.textContent  = staffUser.email || ''
  }

  // Fetch pending payment badge & start 60s polling
  fetchPendingOrdersCount()
  setInterval(fetchPendingOrdersCount, 60000)
}

// ── Resize listener: pastikan sidebar visible saat resize ke desktop ─────────
window.addEventListener('resize', () => {
  const panel    = document.getElementById('admin-sidebar-panel')
  const backdrop = document.getElementById('sidebar-backdrop')
  if (!panel) return

  if (window.innerWidth >= 1024) {
    // Desktop: paksa sidebar tampil, tutup backdrop kalau kebuka
    panel.style.transform = 'translateX(0)'
    if (backdrop) backdrop.style.display = 'none'
  }
  // Mobile: tidak otomatis tutup — biarkan state hamburger yang kontrol
})
