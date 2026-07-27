import App from './App'
import { AuthCallback } from './components/auth/AuthCallback'

export function Root() {
  if (window.location.pathname === '/auth/callback') {
    return <AuthCallback />
  }
  return <App />
}
