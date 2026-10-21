const express = require('express');
const request = require('supertest');
const { createAuthGuard } = require('../../middleware/auth');
const { ForbiddenError, UnauthorizedError } = require('../../utils/errors');

describe('auth middleware', () => {
  function createTestApp(verifyToken = jest.fn().mockResolvedValue({ sub: 'user-1' })) {
    const app = express();
    app.use(express.json());
    app.use(createAuthGuard({ verifyToken }));
    app.get('/jobs', (req, res) => res.json({ route: 'jobs' }));
    app.post('/candidates', (req, res) => res.status(201).json({ route: 'candidates' }));
    app.get('/zips/:zip', (req, res) => res.json({ zip: req.params.zip }));
    app.get('/protected', (req, res) => res.json({ auth: req.auth }));
    app.use((err, req, res, next) => {
      res.status(err.statusCode || 500).json({ message: err.message, details: err.details });
    });
    return { app, verifyToken };
  }

  it('permite acesso com Bearer token válido em rota protegida', async () => {
    const verifyToken = jest.fn().mockResolvedValue({ sub: 'user-1', scope: ['jobs:write'] });
    const { app } = createTestApp(verifyToken);

    const response = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.auth).toEqual({ sub: 'user-1', scope: ['jobs:write'] });
    expect(verifyToken).toHaveBeenCalledWith('valid-token');
  });

  it('retorna 401 quando o header Authorization está ausente', async () => {
    const { app, verifyToken } = createTestApp();

    const response = await request(app).get('/protected');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      message: 'Unauthorized',
      details: { reason: 'missing_authorization_header' },
    });
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it('retorna 401 quando o header Bearer está malformado', async () => {
    const { app } = createTestApp();

    const response = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer token extra');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      message: 'Unauthorized',
      details: { reason: 'malformed_bearer_token' },
    });
  });

  it('retorna 401 quando o token é inválido', async () => {
    const { app } = createTestApp(
      jest.fn().mockRejectedValue(new UnauthorizedError('Unauthorized', { reason: 'invalid_token' })),
    );

    const response = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer invalid-token');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      message: 'Unauthorized',
      details: { reason: 'invalid_token' },
    });
  });

  it('retorna 403 quando o token é válido, mas sem permissão suficiente', async () => {
    const { app } = createTestApp(
      jest.fn().mockRejectedValue(new ForbiddenError('Forbidden', { reason: 'insufficient_scope' })),
    );

    const response = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      message: 'Forbidden',
      details: { reason: 'insufficient_scope' },
    });
  });

  it('faz bypass das rotas públicas configuradas', async () => {
    const { app, verifyToken } = createTestApp();

    const jobsResponse = await request(app).get('/jobs');
    const candidatesResponse = await request(app).post('/candidates').send({ guid_id: '123' });
    const zipsResponse = await request(app).get('/zips/01001000');

    expect(jobsResponse.status).toBe(200);
    expect(candidatesResponse.status).toBe(201);
    expect(zipsResponse.status).toBe(200);
    expect(verifyToken).not.toHaveBeenCalled();
  });
});
