interface AuthModalProps {
  onClose: () => void
  onLogin: () => void
  onRegister: () => void
}

export function AuthModal({
  onClose,
  onLogin,
  onRegister,
}: AuthModalProps) {
  return (
    <div className="modal-backdrop">
      <div className="modal-content glass-panel">
        <button
          className="modal-close"
          type="button"
          aria-label="Đóng"
          onClick={onClose}
        >
          ×
        </button>
        <h2>🔐 Đăng nhập an toàn</h2>
        <p>
          Bạn sẽ được chuyển đến trang xác thực Amazon Cognito để đăng nhập
          hoặc tạo tài khoản. Ứng dụng này không nhận hay lưu mật khẩu của bạn.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onLogin}
        >
          Đăng nhập với Cognito
        </button>
        <div className="modal-footer">
          <span>Chưa có tài khoản? </span>
          <button
            type="button"
            className="link-span"
            onClick={onRegister}
          >
            Đăng ký
          </button>
        </div>
      </div>
    </div>
  )
}
