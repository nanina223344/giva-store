import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        adminLogin: resolve(__dirname, 'admin/login.html'),
        adminIndex: resolve(__dirname, 'admin/index.html'),
        adminCategories: resolve(__dirname, 'admin/categories.html'),
        adminSuppliers: resolve(__dirname, 'admin/suppliers.html'),
        adminCustomers: resolve(__dirname, 'admin/customers.html'),
        adminProducts:  resolve(__dirname, 'admin/products.html'),
        adminPurchases: resolve(__dirname, 'admin/purchases.html'),
        adminColors:    resolve(__dirname, 'admin/colors.html'),
        adminStock:     resolve(__dirname, 'admin/stock.html'),
        adminSettings:  resolve(__dirname, 'admin/settings.html'),
        adminCollections: resolve(__dirname, 'admin/collections.html'),
        adminCollectionProducts: resolve(__dirname, 'admin/collection-products.html'),
        kasir:          resolve(__dirname, 'kasir/index.html'),
        tokoHome:       resolve(__dirname, 'toko/index.html'),
        tokoProducts:   resolve(__dirname, 'toko/products.html'),
        tokoProductDetail: resolve(__dirname, 'toko/product-detail.html'),
        tokoLogin:      resolve(__dirname, 'toko/login.html'),
        tokoProfile:    resolve(__dirname, 'toko/profile.html'),
        tokoCart:       resolve(__dirname, 'toko/cart.html'),
        tokoCheckout:   resolve(__dirname, 'toko/checkout.html'),
        tokoOrders:     resolve(__dirname, 'toko/orders.html'),
        tokoOrderDetail: resolve(__dirname, 'toko/order-detail.html'),
        tokoAbout:      resolve(__dirname, 'toko/about.html'),
      },
    },
  },
})