import {
  signUp,
  confirmSignUp,
  signIn,
  signOut,
  getCurrentUser,
  fetchUserAttributes,
  fetchAuthSession 
} from "aws-amplify/auth";

/**
 * Đăng ký
 */
export async function register(
  displayName: string,
  email: string,
  password: string
) {
  return await signUp({
    username: email,
    password,
    options: {
      userAttributes: {
        email,
        name: displayName
      },
    }, 
  });
}

/**
 * Xác thực email
 */
export async function confirmRegister(
  email: string,
  code: string
) {
  return await confirmSignUp({
    username: email,
    confirmationCode: code,
  });
}

/**
 * Đăng nhập
 */
export async function login(email: string, password: string) {
  try {
    await signOut();
  } catch {}

  return await signIn({
    username: email,
    password,
  });
}

/**
 * Đăng xuất
 */
export async function logout() {
  return await signOut();
}

/**
 * Lấy user hiện tại
 */
export async function getUser() {
  const user = await getCurrentUser();
  const attributes = await fetchUserAttributes();

  return {
    id: user.userId,
    email: attributes.email,
  };
}

/**
 * Lấy Access Token
 */
export async function getAccessToken() {
  const session = await fetchAuthSession();
  return session.tokens?.accessToken?.toString();
}

/**
 * Lấy ID Token
 */
export async function getIdToken() {
  const session = await fetchAuthSession();
  return session.tokens?.idToken?.toString();
}

/**
 * Kiểm tra xem người dùng đã đăng nhập hay chưa
 */
export async function isAuthenticated() {
    try {
        await getCurrentUser();
        return true;
    } catch {
        return false;
    }
}