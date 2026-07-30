import { requireAuth } from './auth.js'
import '../style.css'

async function init() {
  try {
    // requireAuth handles checking session and staff status
    // If successful, we know they are a logged-in staff member.
    await requireAuth()
    
    // Redirect to categories page as the default dashboard
    window.location.replace('/admin/categories.html')
  } catch (err) {
    // requireAuth automatically redirects to /admin/login.html if they are not authenticated.
    // So if there's an error, we don't need to do anything here because the window is already replacing its location.
  }
}

init()
