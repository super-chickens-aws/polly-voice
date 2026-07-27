interface ProfilePanelProps {
  cognitoSub: string
  userEmail: string
}

export function ProfilePanel({
  cognitoSub,
  userEmail,
}: ProfilePanelProps) {
  return (
    <div className="profile-container glass-panel">
      <h2>Thông Tin Tài Khoản Cognito</h2>
      <div className="profile-card">
        <div className="profile-row">
          <span className="label">Cognito Sub ID (PK):</span>
          <code>{cognitoSub}</code>
        </div>
        <div className="profile-row">
          <span className="label">Email:</span>
          <span>{userEmail}</span>
        </div>
        <div className="profile-row">
          <span className="label">Vai trò (Role):</span>
          <span className="badge badge-user">Authenticated User</span>
        </div>
        <div className="profile-row">
          <span className="label">Giới hạn ký tự TTS:</span>
          <span>3,000 ký tự / lượt</span>
        </div>
      </div>
    </div>
  )
}
