jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: jest.fn(),
  },
}));

const { CognitoJwtVerifier } = require('aws-jwt-verify');
const {
  clearVerifierCache,
  getAuthProvider,
  getCognitoConfig,
  getSupabaseConfig,
  verifyAccessToken,
  verifySupabaseAccessToken,
} = require('../../auth/accessTokenVerifier');
const { AuthConfigurationError, ExternalServiceError, ForbiddenError, UnauthorizedError } = require('../../utils/errors');

describe('accessTokenVerifier', () => {
  const env = {
    COGNITO_REGION: 'us-east-1',
    COGNITO_USER_POOL_ID: 'us-east-1_abc123',
    COGNITO_APP_CLIENT_ID: 'client-123',
    COGNITO_REQUIRED_SCOPE: 'jobs:write',
    COGNITO_ALLOWED_GROUPS: 'admins,recruiters',
  };

  beforeEach(() => {
    clearVerifierCache();
    jest.clearAllMocks();
  });

  it('retorna contexto autenticado para access token válido', async () => {
    const payload = {
      sub: 'user-1',
      scope: 'openid jobs:write jobs:read',
      client_id: 'client-123',
      token_use: 'access',
      username: 'jane.doe',
      'cognito:groups': ['admins'],
    };

    CognitoJwtVerifier.create.mockReturnValue({
      verify: jest.fn().mockResolvedValue(payload),
    });

    const auth = await verifyAccessToken('valid-token', { env });

    expect(CognitoJwtVerifier.create).toHaveBeenCalledWith({
      userPoolId: 'us-east-1_abc123',
      tokenUse: 'access',
      clientId: 'client-123',
    });
    expect(auth).toEqual(
      expect.objectContaining({
        sub: 'user-1',
        scope: ['openid', 'jobs:write', 'jobs:read'],
        groups: ['admins'],
        username: 'jane.doe',
        clientId: 'client-123',
        tokenUse: 'access',
      }),
    );
  });

  it('lança 403 quando o token válido não possui scope requerida', async () => {
    CognitoJwtVerifier.create.mockReturnValue({
      verify: jest.fn().mockResolvedValue({
        sub: 'user-1',
        scope: 'openid jobs:read',
        client_id: 'client-123',
        token_use: 'access',
        'cognito:groups': ['admins'],
      }),
    });

    await expect(verifyAccessToken('valid-token', { env })).rejects.toMatchObject({
      statusCode: 403,
      details: expect.objectContaining({ reason: 'insufficient_scope', requiredScope: 'jobs:write' }),
    });
  });

  it('lança 403 quando o token válido não pertence a um grupo permitido', async () => {
    CognitoJwtVerifier.create.mockReturnValue({
      verify: jest.fn().mockResolvedValue({
        sub: 'user-1',
        scope: 'openid jobs:write',
        client_id: 'client-123',
        token_use: 'access',
        'cognito:groups': ['candidates'],
      }),
    });

    await expect(verifyAccessToken('valid-token', { env })).rejects.toMatchObject({
      statusCode: 403,
      details: expect.objectContaining({ reason: 'insufficient_group', allowedGroups: ['admins', 'recruiters'] }),
    });
  });

  it('lança 401 quando o verifier rejeita um token inválido', async () => {
    CognitoJwtVerifier.create.mockReturnValue({
      verify: jest.fn().mockRejectedValue(new Error('JWT signature invalid')),
    });

    await expect(verifyAccessToken('invalid-token', { env })).rejects.toEqual(
      expect.objectContaining({
        statusCode: 401,
        details: { reason: 'invalid_token' },
      }),
    );
  });

  it('lança 401 quando o token está expirado', async () => {
    CognitoJwtVerifier.create.mockReturnValue({
      verify: jest.fn().mockRejectedValue(new Error('Token expired')),
    });

    await expect(verifyAccessToken('expired-token', { env })).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('gera erro de configuração quando variáveis obrigatórias do Cognito não existem', () => {
    expect(() => getCognitoConfig({ COGNITO_REGION: 'us-east-1' })).toThrow(AuthConfigurationError);
  });

  it('não reconverte erros de autorização já classificados', async () => {
    const forbidden = new ForbiddenError('Forbidden', { reason: 'insufficient_scope' });

    await expect(
      verifyAccessToken('token', {
        env,
        verifier: {
          verify: jest.fn().mockRejectedValue(forbidden),
        },
      }),
    ).rejects.toBe(forbidden);
  });

  it('uses the Supabase publishable key and ignores service role credentials', () => {
    expect(getSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co/',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
      SUPABASE_SERVICE_ROLE_KEY: 'must-not-be-used',
    })).toEqual({ url: 'https://project.supabase.co', apiKey: 'publishable-key' });
    expect(getSupabaseConfig({ SUPABASE_SERVICE_ROLE_KEY: 'must-not-be-used' })).toBeNull();
  });

  it('selects the configured provider and rejects unknown provider names', () => {
    expect(getAuthProvider({ AUTH_PROVIDER: 'supabase' })).toBe('supabase');
    expect(getAuthProvider({ AUTH_PROVIDER: 'COGNITO' })).toBe('cognito');
    expect(() => getAuthProvider({ AUTH_PROVIDER: 'unknown' })).toThrow(AuthConfigurationError);
  });

  it('validates a Supabase token and builds trusted account metadata', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'company-1',
        email: 'company@example.com',
        app_metadata: { account_type: 'COMPANY' },
        user_metadata: { account_type: 'CANDIDATE' },
      }),
    });

    const auth = await verifySupabaseAccessToken('supabase-token', {
      config: { url: 'https://project.supabase.co', apiKey: 'publishable-key' },
      fetch,
    });

    expect(fetch).toHaveBeenCalledWith('https://project.supabase.co/auth/v1/user', {
      method: 'GET',
      headers: { apikey: 'publishable-key', Authorization: 'Bearer supabase-token' },
    });
    expect(auth).toEqual(expect.objectContaining({
      sub: 'company-1',
      accountType: 'COMPANY',
      claims: expect.objectContaining({ app_metadata: { account_type: 'COMPANY' } }),
    }));
  });

  it('returns 401 when Supabase rejects a token', async () => {
    await expect(verifySupabaseAccessToken('bad-token', {
      config: { url: 'https://project.supabase.co', apiKey: 'publishable-key' },
      fetch: jest.fn().mockResolvedValue({ ok: false, status: 401 }),
    })).rejects.toMatchObject({ statusCode: 401, details: { reason: 'invalid_token' } });
  });

  it('returns 503 when the selected Supabase provider lacks configuration', async () => {
    await expect(verifyAccessToken('token', { env: { AUTH_PROVIDER: 'supabase' } }))
      .rejects.toBeInstanceOf(AuthConfigurationError);
  });

  it('returns 502 when the authentication service is unavailable', async () => {
    await expect(verifySupabaseAccessToken('token', {
      config: { url: 'https://project.supabase.co', apiKey: 'publishable-key' },
      fetch: jest.fn().mockRejectedValue(new Error('network error')),
    })).rejects.toBeInstanceOf(ExternalServiceError);
  });

  it('selects Supabase before Cognito when Supabase is configured', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'company-1', app_metadata: { account_type: 'COMPANY' } }),
    });

    const auth = await verifyAccessToken('token', {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
      },
      fetch,
    });

    expect(auth.accountType).toBe('COMPANY');
    expect(CognitoJwtVerifier.create).not.toHaveBeenCalled();
  });
});
