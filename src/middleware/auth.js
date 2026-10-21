const { verifyAccessToken } = require('../auth/cognitoVerifier');
const { UnauthorizedError } = require('../utils/errors');

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

    try {
      const token = extractBearerToken(req.headers.authorization);
      const auth = await verifyToken(token);
      req.auth = auth;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  DEFAULT_PUBLIC_ROUTES,
  createAuthGuard,
  extractBearerToken,
  isPublicRoute,
};
