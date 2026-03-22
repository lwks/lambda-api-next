const { CognitoJwtVerifier } = require('aws-jwt-verify');
const { ForbiddenError, UnauthorizedError } = require('../utils/errors');

let cachedVerifier;
let cachedVerifierKey;

function splitList(value, separators = /[\s,]+/) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(separators)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getCognitoConfig(env = process.env) {
  const config = {
    region: env.COGNITO_REGION,
    userPoolId: env.COGNITO_USER_POOL_ID,
    appClientId: env.COGNITO_APP_CLIENT_ID,
    requiredScope: env.COGNITO_REQUIRED_SCOPE || '',
    allowedGroups: splitList(env.COGNITO_ALLOWED_GROUPS),
  };

  const missing = Object.entries({
    COGNITO_REGION: config.region,
    COGNITO_USER_POOL_ID: config.userPoolId,
    COGNITO_APP_CLIENT_ID: config.appClientId,
  })
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing Cognito configuration: ${missing.join(', ')}`);
  }

  return config;
}

function createVerifier(config = getCognitoConfig()) {
  return CognitoJwtVerifier.create({
    userPoolId: config.userPoolId,
    tokenUse: 'access',
    clientId: config.appClientId,
  });
}

function getVerifier(config = getCognitoConfig()) {
  const cacheKey = `${config.region}:${config.userPoolId}:${config.appClientId}`;

  if (!cachedVerifier || cachedVerifierKey !== cacheKey) {
    cachedVerifier = createVerifier(config);
    cachedVerifierKey = cacheKey;
  }

  return cachedVerifier;
}

function getScopes(payload) {
  return splitList(payload.scope, /\s+/);
}

function getGroups(payload) {
  const groups = payload['cognito:groups'];

  if (Array.isArray(groups)) {
    return groups.filter(Boolean);
  }

  if (typeof groups === 'string') {
    return splitList(groups);
  }

  return [];
}

function assertScopeAccess(payload, requiredScope) {
  if (!requiredScope) {
    return;
  }

  const scopes = getScopes(payload);
  if (!scopes.includes(requiredScope)) {
    throw new ForbiddenError('Forbidden', {
      reason: 'insufficient_scope',
      requiredScope,
      scope: scopes,
    });
  }
}

function assertGroupAccess(payload, allowedGroups) {
  if (!allowedGroups || allowedGroups.length === 0) {
    return;
  }

  const groups = getGroups(payload);
  const hasAllowedGroup = groups.some((group) => allowedGroups.includes(group));

  if (!hasAllowedGroup) {
    throw new ForbiddenError('Forbidden', {
      reason: 'insufficient_group',
      allowedGroups,
      groups,
    });
  }
}

function buildAuthenticatedContext(payload) {
  return {
    sub: payload.sub,
    scope: getScopes(payload),
    groups: getGroups(payload),
    username: payload.username || payload['cognito:username'] || null,
    clientId: payload.client_id || payload.aud || null,
    tokenUse: payload.token_use,
    claims: payload,
  };
}

async function verifyAccessToken(token, options = {}) {
  const config = options.config || getCognitoConfig(options.env);
  const verifier = options.verifier || getVerifier(config);

  try {
    const payload = await verifier.verify(token);

    assertScopeAccess(payload, config.requiredScope);
    assertGroupAccess(payload, config.allowedGroups);

    return buildAuthenticatedContext(payload);
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof UnauthorizedError) {
      throw error;
    }

    throw new UnauthorizedError('Unauthorized', {
      reason: 'invalid_token',
      error: error.message,
    });
  }
}

function clearVerifierCache() {
  cachedVerifier = undefined;
  cachedVerifierKey = undefined;
}

module.exports = {
  buildAuthenticatedContext,
  clearVerifierCache,
  createVerifier,
  getCognitoConfig,
  getGroups,
  getScopes,
  verifyAccessToken,
};
