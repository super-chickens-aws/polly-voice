import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool
} from 'amazon-cognito-identity-js';

const awsEnabled = import.meta.env.VITE_AWS_ENABLED === 'true';
const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID ?? '';
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID ?? '';
const pool = awsEnabled && userPoolId && clientId
  ? new CognitoUserPool({ UserPoolId: userPoolId, ClientId: clientId })
  : null;

export type SessionUser = { id: string; email: string };

export async function signIn(email: string, password: string): Promise<SessionUser> {
  if (!pool) {
    const id = `local-${crypto.randomUUID()}`;
    localStorage.setItem('local_user_id', id);
    localStorage.setItem('user_email', email);
    return { id, email };
  }
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: pool });
    user.authenticateUser(new AuthenticationDetails({ Username: email, Password: password }), {
      onSuccess(session) {
        localStorage.setItem('access_token', session.getAccessToken().getJwtToken());
        localStorage.setItem('id_token', session.getIdToken().getJwtToken());
        localStorage.setItem('user_email', email);
        resolve({ id: session.getIdToken().payload.sub, email });
      },
      onFailure: reject,
      newPasswordRequired: reject
    });
  });
}

export async function signUp(name: string, email: string, password: string): Promise<void> {
  if (!pool) {
    await signIn(email, password);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    pool.signUp(
      email,
      password,
      [
        new CognitoUserAttribute({ Name: 'email', Value: email }),
        new CognitoUserAttribute({ Name: 'name', Value: name })
      ],
      [],
      (error, result) => {
        if (error) return reject(error);
        if (result?.userConfirmed) return resolve();
        const code = window.prompt('Nhập mã xác nhận Cognito đã gửi qua email:');
        if (!code) return reject(new Error('Cần mã xác nhận để hoàn tất đăng ký.'));
        result?.user.confirmRegistration(code, true, (confirmError) =>
          confirmError ? reject(confirmError) : resolve()
        );
      }
    );
  });
}

export function currentUser(): SessionUser | null {
  const email = localStorage.getItem('user_email');
  const localId = localStorage.getItem('local_user_id');
  if (email && localId) return { id: localId, email };
  const cognitoUser = pool?.getCurrentUser();
  return cognitoUser && email ? { id: cognitoUser.getUsername(), email } : null;
}

export function signOut(): void {
  pool?.getCurrentUser()?.signOut();
  localStorage.removeItem('access_token');
  localStorage.removeItem('id_token');
  localStorage.removeItem('local_user_id');
  localStorage.removeItem('user_email');
}
