interface ProfilePageProps {
  cognitoSub: string;
  email: string;
}

export function ProfilePage({ cognitoSub, email }: ProfilePageProps) {
  return (
    <div className="profile-container glass-panel">
      <h2>Cognito Account Information</h2>
      <div className="profile-card">
        <div className="profile-row">
          <span className="label">Cognito Sub ID (PK):</span>
          <code>{cognitoSub}</code>
        </div>
        <div className="profile-row">
          <span className="label">Email:</span>
          <span>{email}</span>
        </div>
        <div className="profile-row">
          <span className="label">Role:</span>
          <span className="badge badge-user">Authenticated User</span>
        </div>
        <div className="profile-row">
          <span className="label">TTS character limit:</span>
          <span>3,000 characters per request</span>
        </div>
      </div>
    </div>
  );
}
