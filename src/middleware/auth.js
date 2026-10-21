const { verifyAccessToken } = require('../auth/accessTokenVerifier');
const { ForbiddenError, UnauthorizedError } = require('../utils/errors');
const { logger } = require('../utils/logger');
const { randomUUID } = require('crypto');

const DEFAULT_PUBLIC_ROUTES = [
  { method: 'GET', pattern: /^\/jobs(?:\/[^/]+)?$/ },
  { method: 'POST', pattern: /^\/candidates$/ },
  { method: 'GET', pattern: /^\/zips\/[^/]+$/ },
];

function isPublicRoute(req, publicRoutes = DEFAULT_PUBLIC_ROUTES) {
  if (req.method === 'OPTIONS') {
    return true;
  }

  return publicRoutes.some((route) => route.method === req.method && route.pattern.test(req.path));
}

function extractBearerToken(authorizationHeader) {
  if (!authorizationHeader) {
    throw new UnauthorizedError('Unauthorized', {
      reason: 'missing_authorization_header',
    });
  }

  const [scheme, token, ...rest] = authorizationHeader.trim().split(/\s+/);

  if (scheme !== 'Bearer' || !token || rest.length > 0) {
    throw new UnauthorizedError('Unauthorized', {
      reason: 'malformed_bearer_token',
    });
  }

  return token;
}

/**
 * @typedef {object} AuthenticatedContext
 * @property {string | undefined} sub
 * @property {string[]} scope
 * @property {string[]} groups
 * @property {string | null} username
 * @property {string | null} clientId
 * @property {string | undefined} tokenUse
 * @property {Record<string, unknown>} claims
 */

/**
 * @param {{ verifyToken?: typeof verifyAccessToken, publicRoutes?: Array<{method: string, pattern: RegExp}> }} [options]
 */
function createAuthGuard(options = {}) {
  const verifyToken = options.verifyToken || verifyAccessToken;
  const publicRoutes = options.publicRoutes || DEFAULT_PUBLIC_ROUTES;

  return async function authGuard(req, res, next) {
    if (isPublicRoute(req, publicRoutes)) {
      return next();
    }

    const requestId = req.apiGateway?.context?.awsRequestId
      || req.apiGateway?.event?.requestContext?.requestId
      || randomUUID();
    req.authRequestId = requestId;
    const route = `${req.method} ${req.baseUrl}${req.path}`;
    const provider = process.env.AUTH_PROVIDER || 'auto';
    let stage = 'bearer_header';
    try {
      const token = extractBearerToken(req.headers.authorization);
      stage = 'token_verification';
      const auth = await verifyToken(token);
      req.auth = auth;
      logger.info('Authentication succeeded', { route, stage, provider, requestId });
      return next();
    } catch (error) {
      logger.warn('Authentication failed', {
        route, stage, provider, errorClass: error.name || 'Error', requestId,
      });
      return next(error);
    }
  };
}

function requireAccountType(accountType) {
  return function accountTypeGuard(req, res, next) {
    if (req.auth && req.auth.accountType === accountType) {
      return next();
    }

    logger.warn('Authentication failed', {
      route: `${req.method} ${req.baseUrl}${req.path}`,
      stage: 'account_type',
      provider: process.env.AUTH_PROVIDER || 'auto',
      errorClass: 'ForbiddenError',
      requestId: req.authRequestId || randomUUID(),
    });
    return next(new ForbiddenError('Forbidden', {
      reason: 'insufficient_account_type',
      requiredAccountType: accountType,
    }));
  };
}

module.exports = {
  DEFAULT_PUBLIC_ROUTES,
  createAuthGuard,
  extractBearerToken,
  isPublicRoute,
  requireAccountType,
};
