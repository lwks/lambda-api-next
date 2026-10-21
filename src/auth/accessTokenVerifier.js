const { CognitoJwtVerifier } = require('aws-jwt-verify');
const { AuthConfigurationError, ExternalServiceError, ForbiddenError, UnauthorizedError } = require('../utils/errors');

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
    throw new AuthConfigurationError();
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
  const appMetadata = payload.app_metadata && typeof payload.app_metadata === 'object'
    ? payload.app_metadata
    : {};

  return {
    sub: payload.sub,
    scope: getScopes(payload),
    groups: getGroups(payload),
    username: payload.username || payload['cognito:username'] || null,
    clientId: payload.client_id || payload.aud || null,
    tokenUse: payload.token_use,
    accountType: appMetadata.account_type || payload.account_type || payload['custom:account_type'] || null,
    claims: payload,
  };
}

function getSupabaseConfig(env = process.env) {
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const apiKey = env.SUPABASE_PUBLISHABLE_KEY
    || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || env.SUPABASE_ANON_KEY;

  if (!url || !apiKey) {
    return null;
  }

  return { url: url.replace(/\/+$/, ''), apiKey };
}

function getAuthProvider(env = process.env) {
  const configuredProvider = String(env.AUTH_PROVIDER || '').trim().toLowerCase();
  if (configuredProvider) {
    if (configuredProvider !== 'supabase' && configuredProvider !== 'cognito') {
      throw new AuthConfigurationError();
    }
    return configuredProvider;
  }

  return getSupabaseConfig(env) ? 'supabase' : 'cognito';
}

async function verifySupabaseAccessToken(token, options = {}) {
  const config = options.config || getSupabaseConfig(options.env);
  const fetchImpl = options.fetch || globalThis.fetch;

  if (!config) {
    throw new AuthConfigurationError();
  }

  let response;
  try {
    response = await fetchImpl(`${config.url}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: config.apiKey,
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (error) {
    throw new ExternalServiceError('Authentication service unavailable', {
      reason: 'authentication_service_unavailable',
    });
  }

  if (response.status === 401 || response.status === 403) {
    throw new UnauthorizedError('Unauthorized', { reason: 'invalid_token' });
  }

  if (!response.ok) {
    throw new ExternalServiceError('Authentication service unavailable', {
      reason: 'authentication_service_unavailable',
      status: response.status,
    });
  }

  let user;
  try {
    user = await response.json();
  } catch {
    throw new ExternalServiceError('Authentication service returned an invalid response', {
      reason: 'invalid_authentication_response',
    });
  }

  if (!user || typeof user.id !== 'string' || !user.id) {
    throw new UnauthorizedError('Unauthorized', { reason: 'invalid_token' });
  }

  const claims = {
    sub: user.id,
    email: user.email,
    app_metadata: user.app_metadata || {},
    user_metadata: user.user_metadata || {},
  };

  return {
    sub: user.id,
    scope: [],
    groups: [],
    username: user.email || null,
    clientId: null,
    tokenUse: 'access',
    accountType: claims.app_metadata.account_type || null,
    claims,
  };
}

async function verifyAccessToken(token, options = {}) {
  const env = options.env || process.env;
  const provider = getAuthProvider(env);
  if (provider === 'supabase') {
    return verifySupabaseAccessToken(token, { config: getSupabaseConfig(env), fetch: options.fetch });
  }

  const config = options.config || getCognitoConfig(env);
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
  getAuthProvider,
  getCognitoConfig,
  getGroups,
  getSupabaseConfig,
  getScopes,
  verifyAccessToken,
  verifySupabaseAccessToken,
};
