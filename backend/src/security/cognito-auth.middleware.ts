import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../core/config/environment.js';
import { AppError } from '../core/http/errors.js';
import type { AuthenticatedRequest, UserIdentity } from '../shared/types/http.js';

const jwks = config.aws.cognitoIssuerUri
  ? createRemoteJWKSet(new URL(`${config.aws.cognitoIssuerUri}/.well-known/jwks.json`))
  : undefined;

async function identityFromRequest(req: Request): Promise<UserIdentity> {
  const authorization = req.header('authorization');
  if (config.aws.enabled && authorization?.startsWith('Bearer ') && jwks) {
    const token = authorization.slice(7);
    const { payload } = await jwtVerify(token, jwks, {
      issuer: config.aws.cognitoIssuerUri
    });
    const audienceMatches =
      payload.aud === config.aws.cognitoClientId ||
      payload.client_id === config.aws.cognitoClientId;
    if (!audienceMatches) {
      throw new AppError(401, 'INVALID_TOKEN', 'The JWT does not belong to the configured Cognito app client.');
    }
    if (!payload.sub) throw new AppError(401, 'INVALID_TOKEN', 'The JWT does not contain a subject.');
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

export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    (req as AuthenticatedRequest).user = await identityFromRequest(req);
    next();
  } catch {
    next(new AppError(401, 'UNAUTHORIZED', 'The authentication token is invalid.'));
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  await optionalAuth(req, res, (error?: unknown) => {
    if (error) return next(error);
    if (!(req as AuthenticatedRequest).user.authenticated) {
      return next(new AppError(401, 'AUTH_REQUIRED', 'You must sign in to use this endpoint.'));
    }
    next();
  });
}
