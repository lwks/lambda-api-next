jest.mock('../../auth/accessTokenVerifier', () => ({ verifyAccessToken: jest.fn() }));

jest.mock('../../services/entityServiceFactory', () => ({
  createEntityService: jest.fn((type) => ({
    create: jest.fn(async (payload) => ({ id: `${type}-test-id`, ...payload })),
    listByFieldValues: jest.fn(async () => []),
  })),
}));

const request = require('supertest');
const { verifyAccessToken } = require('../../auth/accessTokenVerifier');
const { AuthConfigurationError, ExternalServiceError, UnauthorizedError } = require('../../utils/errors');
const app = require('../../app');

describe('company routes with real handlers and simulated persistence', () => {
  beforeEach(() => {
    verifyAccessToken.mockReset();
    verifyAccessToken.mockResolvedValue({ sub: 'company-1', accountType: 'COMPANY' });
  });

  it('returns 401 without a bearer header on both routes', async () => {
    const create = await request(app).post('/api/jobs').send({ guid_id: 'job-test' });
    const list = await request(app).get('/api/candidates/by-job-guids?guid_vaga=job-test');
    expect(create.status).toBe(401);
    expect(list.status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    verifyAccessToken.mockRejectedValue(new UnauthorizedError('Unauthorized', { reason: 'invalid_token' }));
    const create = await request(app).post('/api/jobs').set('Authorization', 'Bearer invalid').send({ guid_id: 'job-test' });
    const list = await request(app).get('/api/candidates/by-job-guids?guid_vaga=job-test').set('Authorization', 'Bearer invalid');
    expect(create.status).toBe(401);
    expect(list.status).toBe(401);
  });

  it('returns 503 for missing authentication configuration', async () => {
    verifyAccessToken.mockRejectedValue(new AuthConfigurationError());
    const create = await request(app).post('/api/jobs').set('Authorization', 'Bearer token').send({ guid_id: 'job-test' });
    const list = await request(app).get('/api/candidates/by-job-guids?guid_vaga=job-test').set('Authorization', 'Bearer token');
    expect(create.status).toBe(503);
    expect(list.status).toBe(503);
  });

  it('returns 502 when the authentication provider is unavailable', async () => {
    verifyAccessToken.mockRejectedValue(new ExternalServiceError('Authentication service unavailable'));
    const create = await request(app).post('/api/jobs').set('Authorization', 'Bearer token').send({ guid_id: 'job-test' });
    const list = await request(app).get('/api/candidates/by-job-guids?guid_vaga=job-test').set('Authorization', 'Bearer token');
    expect(create.status).toBe(502);
    expect(list.status).toBe(502);
  });

  it('returns 403 for a CANDIDATE account', async () => {
    verifyAccessToken.mockResolvedValue({ sub: 'candidate-1', accountType: 'CANDIDATE' });
    const create = await request(app).post('/api/jobs').set('Authorization', 'Bearer candidate').send({ guid_id: 'job-test' });
    const list = await request(app).get('/api/candidates/by-job-guids?guid_vaga=job-test').set('Authorization', 'Bearer candidate');
    expect(create.status).toBe(403);
    expect(list.status).toBe(403);
  });

  it('returns 400 when guid_id is missing', async () => {
    const response = await request(app).post('/api/jobs').set('Authorization', 'Bearer company').send({ titulo: 'Test' });
    expect(response.status).toBe(400);
  });

  it('creates a job and lists its applications for COMPANY', async () => {
    const create = await request(app).post('/api/jobs').set('Authorization', 'Bearer company').send({ guid_id: 'job-test' });
    const list = await request(app).get('/api/candidates/by-job-guids?guid_vaga=job-test').set('Authorization', 'Bearer company');
    expect(create.status).toBe(201);
    expect(create.body.data).toMatchObject({ id: 'job-test-id', guid_id: 'job-test' });
    expect(list.status).toBe(200);
    expect(list.body.data).toEqual({ items: [], total: 0 });
  });
});
