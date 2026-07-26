import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from './config.js';
import { AppError } from './errors.js';
const jwks = config.aws.cognitoIssuerUri
    ? createRemoteJWKSet(new URL(`${config.aws.cognitoIssuerUri}/.well-known/jwks.json`))
    : undefined;
async function identityFromRequest(req) {
    const authorization = req.header('authorization');
    if (config.aws.enabled && authorization?.startsWith('Bearer ') && jwks) {
        const token = authorization.slice(7);
        const { payload } = await jwtVerify(token, jwks, {
            issuer: config.aws.cognitoIssuerUri
        });
        const audienceMatches = payload.aud === config.aws.cognitoClientId ||
            payload.client_id === config.aws.cognitoClientId;
        if (!audienceMatches) {
            throw new AppError(401, 'INVALID_TOKEN', 'JWT không thuộc Cognito App Client đã cấu hình.');
        }
        if (!payload.sub)
            throw new AppError(401, 'INVALID_TOKEN', 'JWT không có subject.');
        return {
            id: payload.sub,
            email: typeof payload.email === 'string' ? payload.email : undefined,
            authenticated: true
        };
    }
    const localUserId = req.header('x-user-id');
    if (!config.aws.enabled && localUserId && localUserId !== 'guest') {
        return { id: localUserId, authenticated: true };
    }
    return { id: 'guest', authenticated: false };
}
export async function optionalAuth(req, _res, next) {
    try {
        req.user = await identityFromRequest(req);
        next();
    }
    catch {
        next(new AppError(401, 'UNAUTHORIZED', 'Token đăng nhập không hợp lệ.'));
    }
}
export async function requireAuth(req, res, next) {
    await optionalAuth(req, res, (error) => {
        if (error)
            return next(error);
        if (!req.user.authenticated) {
            return next(new AppError(401, 'AUTH_REQUIRED', 'Endpoint này yêu cầu đăng nhập.'));
        }
        next();
    });
}
//# sourceMappingURL=auth.js.map