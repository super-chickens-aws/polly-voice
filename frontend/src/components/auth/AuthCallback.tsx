import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../auth/useAuth'

type CallbackState = 'processing' | 'error'

export function AuthCallback() {
  const { completeCallback, clearPendingAuthorization, login } = useAuth()
  const startedRef = useRef(false)
  const [callbackState, setCallbackState] =
    useState<CallbackState>('processing')

  useEffect(() => {
    if (startedRef.current) {
      return
    }
    startedRef.current = true
    const parameters = new URLSearchParams(window.location.search)
    const code = parameters.get('code')
    const state = parameters.get('state')
    const providerError = parameters.get('error')

    if (providerError || !code || !state) {
      clearPendingAuthorization()
      window.history.replaceState({}, document.title, '/auth/callback')
      setCallbackState('error')
      return
    }

    void completeCallback(code, state)
      .then(() => {
        window.history.replaceState({}, document.title, '/')
        window.location.assign('/')
      })
      .catch(() => {
        window.history.replaceState({}, document.title, '/auth/callback')
        setCallbackState('error')
      })
  }, [clearPendingAuthorization, completeCallback])

  return (
    <div className="app-container">
      <main className="main-content-layout">
        <section className="glass-panel profile-container" aria-live="polite">
          {callbackState === 'processing' ? (
            <>
              <h2>Đang hoàn tất đăng nhập</h2>
              <p>Vui lòng chờ trong giây lát.</p>
            </>
          ) : (
            <>
              <h2>Không thể hoàn tất đăng nhập</h2>
              <p>
                Yêu cầu đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng thử
                lại.
              </p>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => void login()}
              >
                Thử đăng nhập lại
              </button>
            </>
          )}
        </section>
      </main>
    </div>
  )
}
