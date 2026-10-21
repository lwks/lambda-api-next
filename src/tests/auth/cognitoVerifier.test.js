jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: jest.fn(),
  },
}));

const { CognitoJwtVerifier } = require('aws-jwt-verify');
const {
  clearVerifierCache,
  getCognitoConfig,
  verifyAccessToken,
} = require('../../auth/cognitoVerifier');
const { ForbiddenError, UnauthorizedError } = require('../../utils/errors');

describe('cognitoVerifier', () => {
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
        details: expect.objectContaining({ reason: 'invalid_token', error: 'JWT signature invalid' }),
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
    expect(() => getCognitoConfig({ COGNITO_REGION: 'us-east-1' })).toThrow(
      'Missing Cognito configuration: COGNITO_USER_POOL_ID, COGNITO_APP_CLIENT_ID',
    );
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
});
