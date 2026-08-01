/**
 * src/admin/reports.js
 * Logic Halaman Laporan Panel Admin — Giva Store.
 */

import '../style.css'
import Alpine from 'alpinejs'
import { supabase } from '../supabaseClient.js'
import { requireAuth, getStaffUser, signOut } from './auth.js'
import { initSidebar } from '../../admin/js/sidebar.js'

window.Alpine = Alpine

const _clean = (str) => (str || '').replace(/^["']+|["']+$/g, '').trim()

Alpine.data('reportsAdmin', () => ({
  loading: true,
  staffUser: null,

  // Active Tab
  activeTab: 'ringkasan', // 'ringkasan', 'penjualan', 'produk', 'pelanggan', 'pembelian', 'stok'

  // Date Range (Default: Start of current month to Today)
  startDate: '',
  endDate: '',

  // Raw fetched datasets
  sales: [],
  saleItems: [],
  purchases: [],
  purchaseItems: [],
  products: [],
  productVariants: [],
  customers: [],

  // All sale_items (for non-moving last sold date)
  allSaleItemsForLastSold: [],

  // Previous period sales for metric comparison
  prevSales: [],
  prevSaleItems: [],

  // Tab 1: Ringkasan Metrics
  metrics: {
    totalRevenue: 0,
    prevRevenue: 0,
    pctRevenue: 0,

    totalOrders: 0,
    prevOrders: 0,
    pctOrders: 0,

    avgOrderValue: 0,
    prevAvgOrderValue: 0,
    pctAvgOrder: 0,

    totalItemsSold: 0,
    prevItemsSold: 0,
    pctItems: 0,
  },

  // Breakdown per channel
  channelBreakdown: {
    offline: { revenue: 0, orders: 0, pct: 0 },
    online: { revenue: 0, orders: 0, pct: 0 },
  },

  // Payment methods breakdown
  paymentMethods: [],

  // Tab 2: Penjualan State
  salesFilterChannel: 'all', // 'all', 'pos', 'online'
  salesFilterStatus: 'all', // 'all', 'paid', 'unpaid', 'cancelled'
  salesSortBy: 'date_desc', // 'date_desc', 'total_desc'
  salesPage: 1,
  salesPerPage: 25,
  selectedSaleDetail: null,
  showSaleDetailModal: false,

  // Tab 3: Produk State
  topProducts: [],
  topVariantColors: [],
  nonMovingProducts: [],

  // Tab 4: Pelanggan State
  customerMetrics: {
    newCustomers: 0,
    activeCustomers: 0,
    repeatBuyers: 0,
  },
  customerReportList: [],
  customerSearchQuery: '',
  customerSortBy: 'total_spend_desc', // 'total_spend_desc', 'total_orders_desc', 'last_order_desc'

  // Tab 5: Pembelian & Laba Kotor State
  purchaseSummary: {
    totalPOValue: 0,
    countPO: 0,
    totalItemsReceived: 0,
  },
  purchaseOrdersList: [],
  purchaseStatusFilter: 'all', // 'all', 'draft', 'received', 'cancelled'

  grossProfit: {
    revenue: 0,
    hpp: 0,
    profit: 0,
    marginPct: 0,
  },

  // Tab 6: Stok State
  stockSummary: {
    activeSKUs: 0,
    availableItems: 0,
    reservedItems: 0,
    inventoryValue: 0,
  },
  lowStockItems: [],
  outOfStockItems: [],
  stockMovementsLog: [],
  stockMovementSearch: '',

  // Tab 7: Arus Kas State & Expenses
  expensesData: [],
  cashFlowSummary: {
    salesRevenue: 0,
    nonSalesIncome: 0,
    nonSalesExpense: 0,
    totalHpp: 0,
    labaBersihEstimasi: 0,
  },
  cashFlowList: [],
  rawCashFlowItems: [],

  // Chart Instances
  revenueChartInstance: null,
  paymentChartInstance: null,
  cashFlowChartInstance: null,

  async init() {
    try {
      await requireAuth()
      this.staffUser = await getStaffUser()
      initSidebar(this.staffUser, signOut)

      // Set default date range to current month
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      this.startDate = this.formatInputDate(startOfMonth)
      this.endDate = this.formatInputDate(now)

      await this.fetchAllReportsData()
      this.loading = false
    } catch (err) {
      console.error('Reports init error:', err)
    }
  },

  formatInputDate(d) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  },

  // ── Date Preset Shortcuts ───────────────────────────────────────────────
  setPresetToday() {
    const now = new Date()
    this.startDate = this.formatInputDate(now)
    this.endDate = this.formatInputDate(now)
    this.fetchAllReportsData()
  },

  setPreset7Days() {
    const now = new Date()
    const start = new Date(now)
    start.setDate(start.getDate() - 6)
    this.startDate = this.formatInputDate(start)
    this.endDate = this.formatInputDate(now)
    this.fetchAllReportsData()
  },

  setPresetThisMonth() {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    this.startDate = this.formatInputDate(startOfMonth)
    this.endDate = this.formatInputDate(now)
    this.fetchAllReportsData()
  },

  setPresetLastMonth() {
    const now = new Date()
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)
    this.startDate = this.formatInputDate(startOfLastMonth)
    this.endDate = this.formatInputDate(endOfLastMonth)
    this.fetchAllReportsData()
  },

  setPresetThisYear() {
    const now = new Date()
    const startOfYear = new Date(now.getFullYear(), 0, 1)
    this.startDate = this.formatInputDate(startOfYear)
    this.endDate = this.formatInputDate(now)
    this.fetchAllReportsData()
  },

  async fetchAllReportsData() {
    this.loading = true
    try {
      // 1. Fetch Sales in Date Range
      const startIso = this.startDate + 'T00:00:00'
      const endIso = this.endDate + 'T23:59:59'

      const { data: salesData, error: salesErr } = await supabase
        .from('sales')
        .select(`
          id,
          channel,
          subtotal,
          discount_amount,
          shipping_cost,
          total_amount,
          payment_status,
          order_status,
          created_at,
          customer_id,
          customers ( id, name, email, phone, created_at ),
          staff ( id, name ),
          payments ( id, method, status, amount, payment_detail, proof_url ),
          shipping ( id, recipient_name, recipient_phone, tracking_no, status )
        `)
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .order('created_at', { ascending: false })

      if (salesErr) throw salesErr
      this.sales = salesData || []

      // 2. Fetch Sale Items for these sales
      const saleIds = this.sales.map((s) => s.id)
      let itemsData = []
      if (saleIds.length > 0) {
        const { data: sItems, error: sErr } = await supabase
          .from('sale_items')
          .select(`
            id,
            sale_id,
            product_id,
            variant_id,
            quantity,
            unit_price,
            cost_price,
            subtotal,
            products ( id, name, image_url, brand_name, category_id, categories ( id, name ) ),
            product_variants ( id, sku, cost_price, colors ( id, name, hex_code ) )
          `)
          .in('sale_id', saleIds)

        if (sErr) throw sErr
        itemsData = sItems || []
      }
      this.saleItems = itemsData

      // 3. Fetch Previous Period Data for comparison
      await this.fetchPreviousPeriodData()

      // 4. Fetch Products & Variants (for stock & non-moving analysis)
      const { data: prodData } = await supabase
        .from('products')
        .select(`
          id,
          name,
          brand_name,
          is_active,
          categories ( id, name ),
          product_variants (
            id,
            sku,
            available_quantity,
            reserved_quantity,
            cost_price,
            colors ( id, name, hex_code )
          )
        `)
        .eq('is_active', true)

      this.products = prodData || []

      // Flatten variants
      const vars = []
      this.products.forEach((p) => {
        (p.product_variants || []).forEach((v) => {
          vars.push({
            ...v,
            product_id: p.id,
            product_name: p.name,
            brand_name: _clean(p.brand_name),
            category_name: p.categories?.name || 'Uncategorized',
          })
        })
      })
      this.productVariants = vars

      // 5. Fetch Customers
      const { data: custData } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false })

      this.customers = custData || []

      // 6. Fetch Purchases in Date Range
      const { data: purchData } = await supabase
        .from('purchases')
        .select(`
          id,
          po_number,
          supplier_id,
          total_amount,
          status,
          order_date,
          received_date,
          created_at,
          suppliers ( id, name ),
          purchase_items ( id, variant_id, order_quantity, received_quantity, unit_cost, subtotal )
        `)
        .gte('order_date', this.startDate)
        .lte('order_date', this.endDate)
        .order('order_date', { ascending: false })

      this.purchases = purchData || []

      // 7. Fetch Expenses & Non-sales Income in Date Range
      const { data: expData } = await supabase
        .from('expenses')
        .select('*, staff(name)')
        .gte('date', this.startDate)
        .lte('date', this.endDate + 'T23:59:59')
        .order('date', { ascending: false })

      this.expensesData = expData || []

      // 8. Fetch all-time sale_items for non-moving "last sold" date
      await this.fetchLastSoldData()

      // Process calculations for all tabs
      this.calculateRingkasanMetrics()
      this.processPenjualanTab()
      this.processProdukTab()
      this.processPelangganTab()
      this.processPembelianTab()
      this.processStokTab()
      this.processArusKasTab()

      // Render Charts after Alpine DOM is ready
      this.$nextTick(() => {
        this.renderCharts()
      })

    } catch (err) {
      console.error('Fetch all reports error:', err)
    } finally {
      this.loading = false
    }
  },

  // Fetch last sold dates for non-moving products analysis
  async fetchLastSoldData() {
    try {
      // Get product IDs that were NOT sold in current range
      const paidSalesSet = new Set(this.sales.filter((s) => s.payment_status === 'paid').map((s) => s.id))
      const soldProductIds = new Set(
        this.saleItems.filter((item) => paidSalesSet.has(item.sale_id)).map((i) => i.product_id)
      )
      const nonMovingIds = this.products.filter((p) => !soldProductIds.has(p.id)).map((p) => p.id)

      if (nonMovingIds.length === 0) {
        this.allSaleItemsForLastSold = []
        return
      }

      // Fetch the latest sale_item for each non-moving product (outside current range)
      const { data: lastSoldItems } = await supabase
        .from('sale_items')
        .select('product_id, sale_id, sales!inner(created_at, payment_status)')
        .in('product_id', nonMovingIds)
        .eq('sales.payment_status', 'paid')
        .order('sales(created_at)', { ascending: false })

      this.allSaleItemsForLastSold = lastSoldItems || []
    } catch (e) {
      console.error('Last sold fetch error:', e)
      this.allSaleItemsForLastSold = []
    }
  },

  // Calculate previous period for comparison
  async fetchPreviousPeriodData() {
    try {
      const start = new Date(this.startDate + 'T00:00:00')
      const end = new Date(this.endDate + 'T23:59:59')
      const durationDays = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)))

      const prevStart = new Date(start)
      prevStart.setDate(prevStart.getDate() - durationDays)
      const prevEnd = new Date(end)
      prevEnd.setDate(prevEnd.getDate() - durationDays)

      const prevStartIso = prevStart.toISOString()
      const prevEndIso = prevEnd.toISOString()

      const { data: prevS } = await supabase
        .from('sales')
        .select('id, total_amount, payment_status, order_status')
        .gte('created_at', prevStartIso)
        .lte('created_at', prevEndIso)

      this.prevSales = prevS || []

      const prevSaleIds = this.prevSales.map((s) => s.id)
      if (prevSaleIds.length > 0) {
        const { data: prevItems } = await supabase
          .from('sale_items')
          .select('id, sale_id, quantity')
          .in('sale_id', prevSaleIds)

        this.prevSaleItems = prevItems || []
      } else {
        this.prevSaleItems = []
      }
    } catch (e) {
      console.error('Previous period fetch error:', e)
    }
  },

  // TAB 1: Ringkasan Calculations
  calculateRingkasanMetrics() {
    // Current period
    const paidSales = this.sales.filter((s) => s.payment_status === 'paid')
    const totalRev = paidSales.reduce((acc, s) => acc + (s.total_amount || 0), 0)
    const validOrders = this.sales.filter((s) => s.order_status !== 'cancelled')
    const totalOrdCount = validOrders.length
    const avgOrdVal = totalOrdCount > 0 ? totalRev / totalOrdCount : 0

    const paidSaleIdsSet = new Set(paidSales.map((s) => s.id))
    const totalItems = this.saleItems
      .filter((item) => paidSaleIdsSet.has(item.sale_id))
      .reduce((acc, item) => acc + (item.quantity || 0), 0)

    // Previous period
    const prevPaidSales = this.prevSales.filter((s) => s.payment_status === 'paid')
    const prevRev = prevPaidSales.reduce((acc, s) => acc + (s.total_amount || 0), 0)
    const prevValidOrders = this.prevSales.filter((s) => s.order_status !== 'cancelled')
    const prevOrdCount = prevValidOrders.length
    const prevAvgOrdVal = prevOrdCount > 0 ? prevRev / prevOrdCount : 0

    const prevPaidIdsSet = new Set(prevPaidSales.map((s) => s.id))
    const prevItems = this.prevSaleItems
      .filter((item) => prevPaidIdsSet.has(item.sale_id))
      .reduce((acc, item) => acc + (item.quantity || 0), 0)

    // Pct helper
    const calcPct = (curr, prev) => {
      if (prev === 0) return curr > 0 ? 100 : 0
      return Math.round(((curr - prev) / prev) * 100)
    }

    this.metrics = {
      totalRevenue: totalRev,
      prevRevenue: prevRev,
      pctRevenue: calcPct(totalRev, prevRev),

      totalOrders: totalOrdCount,
      prevOrders: prevOrdCount,
      pctOrders: calcPct(totalOrdCount, prevOrdCount),

      avgOrderValue: avgOrdVal,
      prevAvgOrderValue: prevAvgOrdVal,
      pctAvgOrder: calcPct(avgOrdVal, prevAvgOrdVal),

      totalItemsSold: totalItems,
      prevItemsSold: prevItems,
      pctItems: calcPct(totalItems, prevItems),
    }

    // Breakdown per channel
    const posSales = paidSales.filter((s) => s.channel === 'pos')
    const onlineSales = paidSales.filter((s) => s.channel === 'online')

    const posRev = posSales.reduce((acc, s) => acc + (s.total_amount || 0), 0)
    const onlineRev = onlineSales.reduce((acc, s) => acc + (s.total_amount || 0), 0)

    this.channelBreakdown = {
      offline: {
        revenue: posRev,
        orders: posSales.length,
        pct: totalRev > 0 ? Math.round((posRev / totalRev) * 100) : 0,
      },
      online: {
        revenue: onlineRev,
        orders: onlineSales.length,
        pct: totalRev > 0 ? Math.round((onlineRev / totalRev) * 100) : 0,
      },
    }

    // Payment Methods breakdown
    const methodsMap = {}
    paidSales.forEach((s) => {
      const pay = (s.payments && s.payments.length > 0) ? s.payments[0] : null
      let m = pay?.method || 'Cash'
      if (m.toLowerCase() === 'transfer') m = pay?.payment_detail || 'Transfer'
      methodsMap[m] = (methodsMap[m] || 0) + (s.total_amount || 0)
    })

    this.paymentMethods = Object.keys(methodsMap).map((m) => ({
      name: m,
      amount: methodsMap[m],
      pct: totalRev > 0 ? Math.round((methodsMap[m] / totalRev) * 100) : 0,
    }))
  },

  // Render Chart.js
  renderCharts() {
    if (typeof Chart === 'undefined') return

    // 1. Daily Revenue Chart
    const revCtx = document.getElementById('chartDailyRevenue')
    if (revCtx) {
      if (this.revenueChartInstance) this.revenueChartInstance.destroy()

      // Aggregate revenue per day
      const dailyMap = {}
      const start = new Date(this.startDate + 'T00:00:00')
      const end = new Date(this.endDate + 'T23:59:59')

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = this.formatInputDate(d)
        dailyMap[key] = { revenue: 0, orders: 0 }
      }

      this.sales.forEach((s) => {
        if (s.payment_status === 'paid') {
          const key = s.created_at.substring(0, 10)
          if (dailyMap[key]) {
            dailyMap[key].revenue += s.total_amount || 0
            dailyMap[key].orders += 1
          }
        }
      })

      const labels = Object.keys(dailyMap)
      const dataRev = labels.map((k) => dailyMap[k].revenue)
      const dataOrd = labels.map((k) => dailyMap[k].orders)

      this.revenueChartInstance = new Chart(revCtx, {
        type: 'bar',
        data: {
          labels: labels.map((l) => {
            const parts = l.split('-')
            return `${parts[2]}/${parts[1]}`
          }),
          datasets: [
            {
              label: 'Pendapatan (Rp)',
              data: dataRev,
              backgroundColor: '#8FA07E',
              borderRadius: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const val = ctx.raw || 0
                  const ordCount = dataOrd[ctx.dataIndex]
                  return ` Rp ${val.toLocaleString('id-ID')} (${ordCount} pesanan)`
                },
              },
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: (value) => 'Rp ' + (value / 1000).toLocaleString('id-ID') + 'k',
              },
            },
          },
        },
      })
    }

    // 2. Payment Method Donut Chart
    const payCtx = document.getElementById('chartPaymentMethods')
    if (payCtx && this.paymentMethods.length > 0) {
      if (this.paymentChartInstance) this.paymentChartInstance.destroy()

      const payLabels = this.paymentMethods.map((p) => p.name)
      const payData = this.paymentMethods.map((p) => p.amount)
      const palette = ['#8FA07E', '#6B7D5C', '#D97706', '#3B82F6', '#8B5CF6', '#EC4899', '#64748B']

      this.paymentChartInstance = new Chart(payCtx, {
        type: 'doughnut',
        data: {
          labels: payLabels,
          datasets: [
            {
              data: payData,
              backgroundColor: palette.slice(0, payLabels.length),
              borderWidth: 2,
              borderColor: '#FAF8F3',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${ctx.label}: Rp ${ctx.raw.toLocaleString('id-ID')}`,
              },
            },
          },
        },
      })
    }

    // 3. Cash Flow Stacked Bar Chart
    const cashCtx = document.getElementById('chartCashFlow')
    if (cashCtx) {
      if (this.cashFlowChartInstance) this.cashFlowChartInstance.destroy()

      const dailyCashMap = {}
      const start = new Date(this.startDate + 'T00:00:00')
      const end = new Date(this.endDate + 'T23:59:59')

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = this.formatInputDate(d)
        dailyCashMap[key] = { in: 0, out: 0 }
      }

      ;(this.rawCashFlowItems || []).forEach((item) => {
        if (!item.date) return
        const key = item.date.substring(0, 10)
        if (dailyCashMap[key]) {
          dailyCashMap[key].in += item.in || 0
          dailyCashMap[key].out += item.out || 0
        }
      })

      const labels = Object.keys(dailyCashMap)
      const dataIn = labels.map((k) => dailyCashMap[k].in)
      const dataOut = labels.map((k) => dailyCashMap[k].out)

      this.cashFlowChartInstance = new Chart(cashCtx, {
        type: 'bar',
        data: {
          labels: labels.map((l) => {
            const parts = l.split('-')
            return `${parts[2]}/${parts[1]}`
          }),
          datasets: [
            {
              label: 'Uang Masuk (Rp)',
              data: dataIn,
              backgroundColor: '#8FA07E',
              borderRadius: 6,
            },
            {
              label: 'Uang Keluar (Rp)',
              data: dataOut,
              backgroundColor: '#D97706',
              borderRadius: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${ctx.dataset.label}: Rp ${ctx.raw.toLocaleString('id-ID')}`,
              },
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: (value) => 'Rp ' + (value / 1000).toLocaleString('id-ID') + 'k',
              },
            },
          },
        },
      })
    }
  },

  // TAB 2: Penjualan Tab Logic
  processPenjualanTab() {
    // Handled in computed filteredSales
  },

  // Get item count for a sale
  getSaleItemCount(saleId) {
    return this.saleItems.filter((i) => i.sale_id === saleId).reduce((acc, i) => acc + (i.quantity || 0), 0)
  },

  get filteredSales() {
    let list = [...this.sales]

    // Channel filter
    if (this.salesFilterChannel === 'pos') {
      list = list.filter((s) => s.channel === 'pos')
    } else if (this.salesFilterChannel === 'online') {
      list = list.filter((s) => s.channel === 'online')
    }

    // Status filter
    if (this.salesFilterStatus === 'paid') {
      list = list.filter((s) => s.payment_status === 'paid')
    } else if (this.salesFilterStatus === 'unpaid') {
      list = list.filter((s) => s.payment_status === 'unpaid' || s.payment_status === 'pending')
    } else if (this.salesFilterStatus === 'cancelled') {
      list = list.filter((s) => s.order_status === 'cancelled')
    }

    // Sorting
    if (this.salesSortBy === 'total_desc') {
      list.sort((a, b) => (b.total_amount || 0) - (a.total_amount || 0))
    } else {
      list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    }

    return list
  },

  get paginatedSales() {
    const start = (this.salesPage - 1) * this.salesPerPage
    return this.filteredSales.slice(start, start + this.salesPerPage)
  },

  get salesTotalPages() {
    return Math.ceil(this.filteredSales.length / this.salesPerPage) || 1
  },

  openSaleDetail(sale) {
    // Attach items to selected sale
    const items = this.saleItems.filter((i) => i.sale_id === sale.id)
    this.selectedSaleDetail = { ...sale, items }
    this.showSaleDetailModal = true
  },

  closeSaleDetail() {
    this.showSaleDetailModal = false
    this.selectedSaleDetail = null
  },

  exportSalesCSV() {
    const rows = [
      ['Tanggal', 'Nomor Transaksi', 'Channel', 'Customer/Kasir', 'Subtotal', 'Ongkir', 'Total (Rp)', 'Metode Bayar', 'Status'],
    ]

    this.filteredSales.forEach((s) => {
      const code = '#' + s.id.substring(0, 8).toUpperCase()
      const date = this.formatDate(s.created_at)
      const channel = s.channel === 'pos' ? 'Kasir (POS)' : 'Online'
      const customer = s.customers?.name || s.staff?.name || 'Walk-in Customer'
      const subtotal = s.subtotal || 0
      const shippingCost = s.shipping_cost || 0
      const total = s.total_amount || 0
      const pay = (s.payments && s.payments.length > 0) ? s.payments[0] : null
      const method = pay?.method || 'Cash'
      const status = s.order_status === 'cancelled' ? 'Dibatalkan' : (s.payment_status === 'paid' ? 'Lunas' : 'Menunggu')

      rows.push([date, code, channel, `"${customer}"`, subtotal, shippingCost, total, method, status])
    })

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Laporan-Penjualan-${this.startDate}-to-${this.endDate}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  },

  // TAB 3: Produk Tab Logic
  processProdukTab() {
    const paidSalesSet = new Set(this.sales.filter((s) => s.payment_status === 'paid').map((s) => s.id))
    const paidItems = this.saleItems.filter((item) => paidSalesSet.has(item.sale_id))

    // 1. Top Selling Products
    const prodMap = {}
    paidItems.forEach((item) => {
      const pid = item.product_id
      if (!prodMap[pid]) {
        prodMap[pid] = {
          id: pid,
          name: item.products?.name || 'Produk',
          brand: _clean(item.products?.brand_name),
          category: item.products?.categories?.name || 'Umum',
          totalQty: 0,
          totalRev: 0,
        }
      }
      prodMap[pid].totalQty += item.quantity || 0
      prodMap[pid].totalRev += item.subtotal || 0
    })

    // Attach current total stock from productVariants
    const topList = Object.values(prodMap).map((p) => {
      const vars = this.productVariants.filter((v) => v.product_id === p.id)
      const currentStock = vars.reduce((acc, v) => acc + (v.available_quantity || 0), 0)
      return { ...p, currentStock }
    })

    topList.sort((a, b) => b.totalQty - a.totalQty)
    this.topProducts = topList.slice(0, 20)

    // 2. Best Sellers by Color Variant
    const colorMap = {}
    paidItems.forEach((item) => {
      const vid = item.variant_id
      if (!colorMap[vid]) {
        colorMap[vid] = {
          variant_id: vid,
          product_name: item.products?.name || 'Produk',
          color_name: item.product_variants?.colors?.name || 'Default',
          hex_code: item.product_variants?.colors?.hex_code || '#84807A',
          totalQty: 0,
        }
      }
      colorMap[vid].totalQty += item.quantity || 0
    })

    const topColorList = Object.values(colorMap).map((c) => {
      const matchVar = this.productVariants.find((v) => v.id === c.variant_id)
      return {
        ...c,
        currentStock: matchVar ? matchVar.available_quantity : 0,
      }
    })

    topColorList.sort((a, b) => b.totalQty - a.totalQty)
    this.topVariantColors = topColorList.slice(0, 20)

    // 3. Non-moving Products
    const soldProductIds = new Set(paidItems.map((i) => i.product_id))
    const nonMoving = []

    // Build last sold date map from allSaleItemsForLastSold
    const lastSoldMap = {}
    ;(this.allSaleItemsForLastSold || []).forEach((item) => {
      const pid = item.product_id
      const saleDate = item.sales?.created_at
      if (saleDate && (!lastSoldMap[pid] || new Date(saleDate) > new Date(lastSoldMap[pid]))) {
        lastSoldMap[pid] = saleDate
      }
    })

    this.products.forEach((p) => {
      if (!soldProductIds.has(p.id)) {
        const totalStk = (p.product_variants || []).reduce((acc, v) => acc + (v.available_quantity || 0), 0)
        nonMoving.push({
          id: p.id,
          name: p.name,
          brand: _clean(p.brand_name),
          category: p.categories?.name || 'Umum',
          currentStock: totalStk,
          lastSoldDate: lastSoldMap[p.id] || null,
        })
      }
    })

    this.nonMovingProducts = nonMoving
  },

  // TAB 4: Pelanggan Tab Logic
  processPelangganTab() {
    const startIso = this.startDate + 'T00:00:00'
    const endIso = this.endDate + 'T23:59:59'

    // New customers in date range
    const newCusts = this.customers.filter(
      (c) => c.created_at >= startIso && c.created_at <= endIso
    )

    // Calculate customer activity from sales
    const custMap = {}
    this.sales.forEach((s) => {
      if (s.customer_id) {
        if (!custMap[s.customer_id]) {
          custMap[s.customer_id] = {
            totalOrders: 0,
            totalSpend: 0,
            lastOrderDate: s.created_at,
          }
        }
        custMap[s.customer_id].totalOrders += 1
        if (s.payment_status === 'paid') {
          custMap[s.customer_id].totalSpend += s.total_amount || 0
        }
        if (new Date(s.created_at) > new Date(custMap[s.customer_id].lastOrderDate)) {
          custMap[s.customer_id].lastOrderDate = s.created_at
        }
      }
    })

    const activeCustomersCount = Object.keys(custMap).length
    const repeatBuyersCount = Object.values(custMap).filter((c) => c.totalOrders > 1).length

    // Build customer report list
    const reportList = this.customers.map((c) => {
      const stats = custMap[c.id] || { totalOrders: 0, totalSpend: 0, lastOrderDate: null }
      return {
        id: c.id,
        name: c.name,
        email: c.email || '-',
        phone: c.phone || '-',
        totalOrders: stats.totalOrders,
        totalSpend: stats.totalSpend,
        lastOrderDate: stats.lastOrderDate,
        source: c.email ? 'Online' : 'Manual',
      }
    })

    this.customerMetrics = {
      newCustomers: newCusts.length,
      activeCustomers: activeCustomersCount,
      repeatBuyers: repeatBuyersCount,
    }

    this.customerReportList = reportList
  },

  get filteredCustomerReportList() {
    let list = [...this.customerReportList]

    if (this.customerSearchQuery.trim()) {
      const q = this.customerSearchQuery.trim().toLowerCase()
      list = list.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
    }

    if (this.customerSortBy === 'total_orders_desc') {
      list.sort((a, b) => b.totalOrders - a.totalOrders)
    } else if (this.customerSortBy === 'last_order_desc') {
      list.sort((a, b) => new Date(b.lastOrderDate || 0) - new Date(a.lastOrderDate || 0))
    } else {
      // Default total spend
      list.sort((a, b) => b.totalSpend - a.totalSpend)
    }

    return list
  },

  // TAB 5: Pembelian & Laba Kotor Logic
  processPembelianTab() {
    let totalPOVal = 0
    let itemsRecv = 0

    this.purchases.forEach((po) => {
      totalPOVal += po.total_amount || 0
      ;(po.purchase_items || []).forEach((pi) => {
        itemsRecv += pi.received_quantity || 0
      })
    })

    this.purchaseSummary = {
      totalPOValue: totalPOVal,
      countPO: this.purchases.length,
      totalItemsReceived: itemsRecv,
    }

    // Process PO list
    this.purchaseOrdersList = this.purchases.map((po) => {
      const itemQtySum = (po.purchase_items || []).reduce((acc, pi) => acc + (pi.order_quantity || 0), 0)
      return {
        id: po.id,
        po_number: po.po_number || '#' + po.id,
        order_date: po.order_date,
        supplier_name: po.suppliers?.name || '-',
        total_items: itemQtySum,
        total_amount: po.total_amount || 0,
        status: po.status,
      }
    })

    // Gross Profit calculation (Laba Kotor Sederhana)
    const paidSales = this.sales.filter((s) => s.payment_status === 'paid')
    const paidRevenue = paidSales.reduce((acc, s) => acc + (s.total_amount || 0), 0)

    const paidSalesSet = new Set(paidSales.map((s) => s.id))
    let totalHpp = 0

    this.saleItems.forEach((item) => {
      if (paidSalesSet.has(item.sale_id)) {
        const costPrice = item.cost_price || item.product_variants?.cost_price || 0
        totalHpp += costPrice * (item.quantity || 0)
      }
    })

    const profit = paidRevenue - totalHpp
    const marginPct = paidRevenue > 0 ? Math.round((profit / paidRevenue) * 100) : 0

    this.grossProfit = {
      revenue: paidRevenue,
      hpp: totalHpp,
      profit: profit,
      marginPct: marginPct,
    }
  },

  get filteredPurchaseOrdersList() {
    if (this.purchaseStatusFilter === 'all') return this.purchaseOrdersList
    return this.purchaseOrdersList.filter((po) => po.status === this.purchaseStatusFilter)
  },

  // TAB 6: Stok Tab Logic
  processStokTab() {
    let totalAvailable = 0
    let totalReserved = 0
    let totalValue = 0

    const lowStock = []
    const outOfStock = []

    this.productVariants.forEach((v) => {
      const avail = v.available_quantity || 0
      const resv = v.reserved_quantity || 0
      const cost = v.cost_price || 0

      totalAvailable += avail
      totalReserved += resv
      totalValue += (avail + resv) * cost

      const colorName = v.colors?.name || 'Default'
      const hexCode = v.colors?.hex_code || '#84807A'

      if (avail > 0 && avail <= 5) {
        lowStock.push({
          id: v.id,
          product_name: v.product_name,
          color_name: colorName,
          hex_code: hexCode,
          location: 'Toko Utama',
          available: avail,
          reserved: resv,
        })
      } else if (avail === 0) {
        outOfStock.push({
          id: v.id,
          product_name: v.product_name,
          color_name: colorName,
          hex_code: hexCode,
          location: 'Toko Utama',
          totalQty: resv, // may have reserved
        })
      }
    })

    this.stockSummary = {
      activeSKUs: this.productVariants.length,
      availableItems: totalAvailable,
      reservedItems: totalReserved,
      inventoryValue: totalValue,
    }

    this.lowStockItems = lowStock
    this.outOfStockItems = outOfStock

    // Build Stock Movement Log combining sales (out) and received purchases (in)
    const logs = []

    this.saleItems.forEach((si) => {
      const parentSale = this.sales.find((s) => s.id === si.sale_id)
      if (parentSale && parentSale.payment_status === 'paid') {
        logs.push({
          date: parentSale.created_at,
          product_name: si.products?.name || 'Produk',
          color_name: si.product_variants?.colors?.name || '-',
          hex_code: si.product_variants?.colors?.hex_code || '#84807A',
          type: 'OUT',
          typeLabel: 'Keluar',
          qty: si.quantity,
          refCode: '#' + parentSale.id.substring(0, 8).toUpperCase(),
        })
      }
    })

    this.purchases.forEach((po) => {
      if (po.status === 'received') {
        ;(po.purchase_items || []).forEach((pi) => {
          const matchVar = this.productVariants.find((v) => v.id === pi.variant_id)
          logs.push({
            date: po.received_date || po.order_date,
            product_name: matchVar?.product_name || 'Produk PO',
            color_name: matchVar?.colors?.name || '-',
            hex_code: matchVar?.colors?.hex_code || '#84807A',
            type: 'IN',
            typeLabel: 'Masuk',
            qty: pi.received_quantity || pi.order_quantity,
            refCode: po.po_number || '#' + po.id.substring(0, 8),
          })
        })
      }
    })

    logs.sort((a, b) => new Date(b.date) - new Date(a.date))
    this.stockMovementsLog = logs.slice(0, 100)
  },

  // Filtered stock movements by search
  get filteredStockMovementsLog() {
    if (!this.stockMovementSearch.trim()) return this.stockMovementsLog
    const q = this.stockMovementSearch.trim().toLowerCase()
    return this.stockMovementsLog.filter((log) => log.product_name.toLowerCase().includes(q))
  },

  // TAB 7: Arus Kas Logic
  processArusKasTab() {
    // 1. Sales Revenue (paid sales)
    const paidSales = this.sales.filter((s) => s.payment_status === 'paid')
    const salesRev = paidSales.reduce((acc, s) => acc + (s.total_amount || 0), 0)

    // 2. Non-Sales Income & Expenses
    let nonSalesInc = 0
    let nonSalesExp = 0

    ;(this.expensesData || []).forEach((e) => {
      const amt = Number(e.amount || 0)
      if (e.type === 'income') nonSalesInc += amt
      else if (e.type === 'expense') nonSalesExp += amt
    })

    // 3. HPP
    const paidSalesSet = new Set(paidSales.map((s) => s.id))
    let totalHpp = 0
    this.saleItems.forEach((item) => {
      if (paidSalesSet.has(item.sale_id)) {
        const cost = item.cost_price || item.product_variants?.cost_price || 0
        totalHpp += cost * (item.quantity || 0)
      }
    })

    // Laba Bersih Estimasi = Pendapatan Penjualan + Pemasukan Non-Sales - Pengeluaran Non-Sales - HPP
    const labaBersih = salesRev + nonSalesInc - nonSalesExp - totalHpp

    this.cashFlowSummary = {
      salesRevenue: salesRev,
      nonSalesIncome: nonSalesInc,
      nonSalesExpense: nonSalesExp,
      totalHpp,
      labaBersihEstimasi: labaBersih,
    }

    // Build combined cash flow transaction items
    const items = []

    // Sales (Masuk)
    paidSales.forEach((s) => {
      items.push({
        date: s.created_at ? s.created_at.split('T')[0] : '',
        fullDate: s.created_at,
        jenis: 'Penjualan',
        keterangan: `Penjualan #${s.id.slice(0, 8)} (${s.channel === 'online' ? 'Online' : 'Kasir POS'})`,
        in: s.total_amount || 0,
        out: 0,
      })
    })

    // Received Purchases (Keluar)
    this.purchases.forEach((po) => {
      if (po.status === 'received') {
        items.push({
          date: po.received_date || (po.order_date ? po.order_date.split('T')[0] : ''),
          fullDate: po.received_date || po.order_date,
          jenis: 'Pembelian (PO)',
          keterangan: `PO ${po.po_number || '#' + po.id} (${po.suppliers?.name || 'Supplier'})`,
          in: 0,
          out: po.total_amount || 0,
        })
      }
    })

    // Expenses (Income or Expense)
    ;(this.expensesData || []).forEach((e) => {
      const isInc = e.type === 'income'
      items.push({
        date: e.date ? e.date.split('T')[0] : '',
        fullDate: e.date,
        jenis: isInc ? 'Pemasukan Non-Sales' : 'Pengeluaran Operasional',
        keterangan: `[${e.category || 'Umum'}] ${e.description}`,
        in: isInc ? (e.amount || 0) : 0,
        out: isInc ? 0 : (e.amount || 0),
      })
    })

    this.rawCashFlowItems = items

    // Sort ascending by date to calculate cumulative balance
    const sortedAsc = [...items].sort((a, b) => new Date(a.fullDate || a.date) - new Date(b.fullDate || b.date))
    let runningBalance = 0
    const withCumulative = sortedAsc.map((item) => {
      runningBalance += (item.in - item.out)
      return {
        ...item,
        saldoKumulatif: runningBalance,
      }
    })

    // Display latest first
    this.cashFlowList = withCumulative.reverse()
  },

  formatDate(dateStr) {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
    const day = d.getDate()
    const month = months[d.getMonth()]
    const year = d.getFullYear()
    const hours = String(d.getHours()).padStart(2, '0')
    const mins = String(d.getMinutes()).padStart(2, '0')
    return `${day} ${month} ${year}, ${hours}.${mins}`
  },

  formatPrice(amount) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount || 0)
  },
}))

Alpine.start()
