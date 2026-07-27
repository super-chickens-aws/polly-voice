const REQUIRED_ENV_KEYS = [
  'VITE_API_BASE_URL',
  'VITE_COGNITO_DOMAIN',
  'VITE_COGNITO_CLIENT_ID',
  'VITE_COGNITO_REDIRECT_URI',
  'VITE_COGNITO_LOGOUT_URI',
  'VITE_COGNITO_SCOPES',
] as const

type RequiredEnvKey = (typeof REQUIRED_ENV_KEYS)[number]

function readRequiredEnv(key: RequiredEnvKey): string {
  const value = import.meta.env[key]?.trim()
  if (!value) {
    throw new Error(`Missing required frontend environment variable: ${key}`)
  }
  return value
}

export interface FrontendConfig {
  apiBaseUrl: string
  cognitoDomain: string
  cognitoClientId: string
  cognitoRedirectUri: string
  cognitoLogoutUri: string
  cognitoScopes: string[]
}

function loadConfig(): FrontendConfig {
  const values = Object.fromEntries(
    REQUIRED_ENV_KEYS.map((key) => [key, readRequiredEnv(key)]),
  ) as Record<RequiredEnvKey, string>
  const scopes = values.VITE_COGNITO_SCOPES.split(/[,\s]+/).filter(Boolean)

  if (scopes.length === 0) {
    throw new Error(
      'Missing required frontend environment variable: VITE_COGNITO_SCOPES',
    )
  }

  return {
    apiBaseUrl: values.VITE_API_BASE_URL.replace(/\/+$/, ''),
    cognitoDomain: values.VITE_COGNITO_DOMAIN.replace(/\/+$/, ''),
    cognitoClientId: values.VITE_COGNITO_CLIENT_ID,
    cognitoRedirectUri: values.VITE_COGNITO_REDIRECT_URI,
    cognitoLogoutUri: values.VITE_COGNITO_LOGOUT_URI,
    cognitoScopes: scopes,
  }
}

export const config = loadConfig()
