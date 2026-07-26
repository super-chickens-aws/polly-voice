export const awsConfig = {
    Auth: {
        Cognito: {
            userPoolId: import.meta.env.VITE_USER_POOL_ID,
            userPoolClientId: import.meta.env.VITE_APP_CLIENT_ID,

            loginWith: {
                email: true
            }
        }
    }
};