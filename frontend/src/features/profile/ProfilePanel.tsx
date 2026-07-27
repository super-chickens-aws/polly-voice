import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../../auth/useAuth'
import type {
  PreferredLanguage,
  Profile,
  UpdateProfileRequest,
} from './profileTypes'
import { useProfile } from './useProfile'

interface ProfileFormProps {
  email?: string
  firstTime: boolean
  initialProfile: Profile | null
  isSaving: boolean
  isSaved: boolean
  saveError: string
  onChange: () => void
  onSave: (values: UpdateProfileRequest) => Promise<Profile | null>
}

function ProfileForm({
  email,
  firstTime,
  initialProfile,
  isSaving,
  isSaved,
  saveError,
  onChange,
  onSave,
}: ProfileFormProps) {
  const [displayName, setDisplayName] = useState(
    initialProfile?.display_name ?? '',
  )
  const [preferredLanguage, setPreferredLanguage] =
    useState<PreferredLanguage>(
      initialProfile?.preferred_language ?? 'vi-VN',
    )
  const [validationError, setValidationError] = useState('')
  const trimmedDisplayName = displayName.trim()
  const isDisplayNameValid =
    trimmedDisplayName.length >= 1 && trimmedDisplayName.length <= 80

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!isDisplayNameValid || isSaving) {
      setValidationError('Tên hiển thị phải có từ 1 đến 80 ký tự.')
      return
    }
    setValidationError('')
    const savedProfile = await onSave({
      display_name: trimmedDisplayName,
      preferred_language: preferredLanguage,
    })
    if (savedProfile) {
      setDisplayName(savedProfile.display_name ?? trimmedDisplayName)
      setPreferredLanguage(
        savedProfile.preferred_language ?? preferredLanguage,
      )
    }
  }

  const handleDisplayNameChange = (value: string) => {
    setDisplayName(value)
    setValidationError('')
    onChange()
  }

  const handleLanguageChange = (value: PreferredLanguage) => {
    setPreferredLanguage(value)
    onChange()
  }

  return (
    <>
      {firstTime && (
        <p aria-live="polite">
          Đây là lần đầu bạn sử dụng hồ sơ. Hãy nhập thông tin để tạo hồ sơ.
        </p>
      )}
      <form className="profile-card" onSubmit={(event) => void handleSubmit(event)}>
        {email && (
          <div className="form-group">
            <label htmlFor="profile-email">Email Cognito</label>
            <input
              id="profile-email"
              type="email"
              value={email}
              readOnly
              disabled
            />
          </div>
        )}
        <div className="form-group">
          <label htmlFor="profile-display-name">
            Tên hiển thị (1–80 ký tự)
          </label>
          <input
            id="profile-display-name"
            type="text"
            value={displayName}
            maxLength={80}
            required
            autoComplete="name"
            onChange={(event) => handleDisplayNameChange(event.target.value)}
          />
          <small>{displayName.length}/80</small>
        </div>
        <div className="form-group">
          <label htmlFor="profile-language">Ngôn ngữ ưu tiên</label>
          <select
            id="profile-language"
            value={preferredLanguage}
            onChange={(event) =>
              handleLanguageChange(event.target.value as PreferredLanguage)
            }
          >
            <option value="vi-VN">Tiếng Việt (vi-VN)</option>
            <option value="en-US">English (en-US)</option>
          </select>
        </div>

        {validationError && (
          <p className="auth-error" role="alert">
            {validationError}
          </p>
        )}
        {saveError && (
          <p className="auth-error" role="alert">
            {saveError}
          </p>
        )}
        {isSaved && (
          <p aria-live="polite">Hồ sơ đã được lưu thành công.</p>
        )}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={isSaving || !isDisplayNameValid}
        >
          {isSaving ? 'Đang lưu...' : 'Lưu hồ sơ'}
        </button>
      </form>
    </>
  )
}

export function ProfilePanel() {
  const { status, user, login } = useAuth()
  const isAuthenticated = status === 'authenticated'
  const {
    loadState,
    saveState,
    profile,
    saveError,
    load,
    save,
    clearSaveFeedback,
  } = useProfile(isAuthenticated)

  if (status === 'loading') {
    return (
      <div className="profile-container glass-panel" aria-live="polite">
        <h2>Hồ sơ</h2>
        <p>Đang khôi phục phiên đăng nhập...</p>
      </div>
    )
  }

  if (status === 'anonymous') {
    return (
      <div className="profile-container glass-panel">
        <h2>Hồ sơ</h2>
        <p>Bạn cần đăng nhập để xem và chỉnh sửa hồ sơ cá nhân.</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void login()}
        >
          Đăng nhập với Cognito
        </button>
      </div>
    )
  }

  if (loadState === 'idle' || loadState === 'loading') {
    return (
      <div className="profile-container glass-panel" aria-live="polite">
        <h2>Hồ sơ</h2>
        <p>Đang tải hồ sơ...</p>
      </div>
    )
  }

  if (loadState === 'load-error') {
    return (
      <div className="profile-container glass-panel">
        <h2>Hồ sơ</h2>
        <p className="auth-error" role="alert">
          Không thể tải hồ sơ. Vui lòng kiểm tra kết nối và thử lại.
        </p>
        <button type="button" className="btn btn-primary" onClick={load}>
          Thử lại
        </button>
      </div>
    )
  }

  return (
    <div className="profile-container glass-panel">
      <h2>Hồ sơ cá nhân</h2>
      <ProfileForm
        email={user?.email}
        firstTime={loadState === 'first-time'}
        initialProfile={profile}
        isSaving={saveState === 'saving'}
        isSaved={saveState === 'saved'}
        saveError={saveError}
        onChange={clearSaveFeedback}
        onSave={save}
      />
    </div>
  )
}
