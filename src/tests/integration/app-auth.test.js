jest.mock('../../auth/cognitoVerifier', () => ({
  verifyAccessToken: jest.fn(),
}));

jest.mock('../../controllers/jobController', () => ({
  createJob: (req, res) => res.status(201).json({ data: { route: 'createJob', auth: req.auth || null } }),
  listJobs: (req, res) => res.json({ data: { route: 'listJobs' } }),
  getJob: (req, res) => res.json({ data: { route: 'getJob', id: req.params.id } }),
  updateJob: (req, res) => res.json({ data: { route: 'updateJob', auth: req.auth || null } }),
  deleteJob: (req, res) => res.status(204).send(),
}));

jest.mock('../../controllers/companyController', () => ({
  createCompany: (req, res) => res.status(201).json({ data: { route: 'createCompany', auth: req.auth || null } }),
  listCompanies: (req, res) => res.json({ data: { route: 'listCompanies', auth: req.auth || null } }),
  getCompany: (req, res) => res.json({ data: { route: 'getCompany', auth: req.auth || null } }),
  updateCompany: (req, res) => res.json({ data: { route: 'updateCompany', auth: req.auth || null } }),
  deleteCompany: (req, res) => res.status(204).send(),
}));

jest.mock('../../controllers/domainController', () => ({
  createDomain: (req, res) => res.status(201).json({ data: { route: 'createDomain', auth: req.auth || null } }),
  listDomains: (req, res) => res.json({ data: { route: 'listDomains', auth: req.auth || null } }),
  getDomainByCode: (req, res) => res.json({ data: { route: 'getDomainByCode', auth: req.auth || null } }),
  updateDomainByCode: (req, res) => res.json({ data: { route: 'updateDomainByCode', auth: req.auth || null } }),
  updateDomainByKey: (req, res) => res.json({ data: { route: 'updateDomainByKey', auth: req.auth || null } }),
}));

jest.mock('../../controllers/candidateController', () => ({
  createCandidate: (req, res) => res.status(201).json({ data: { route: 'createCandidate' } }),
  listCandidates: (req, res) => res.json({ data: { route: 'listCandidates', auth: req.auth || null } }),
  listCandidatesByJobGuids: (req, res) => res.json({ data: { route: 'listCandidatesByJobGuids', auth: req.auth || null } }),
  getCandidate: (req, res) => res.json({ data: { route: 'getCandidate', auth: req.auth || null } }),
  updateCandidate: (req, res) => res.json({ data: { route: 'updateCandidate', auth: req.auth || null } }),
  deleteCandidate: (req, res) => res.status(204).send(),
}));

jest.mock('../../controllers/userController', () => ({
  createUser: (req, res) => res.status(201).json({ data: { route: 'createUser', auth: req.auth || null } }),
  listUsers: (req, res) => res.json({ data: { route: 'listUsers', auth: req.auth || null } }),
  getUser: (req, res) => res.json({ data: { route: 'getUser', auth: req.auth || null } }),
  updateUser: (req, res) => res.json({ data: { route: 'updateUser', auth: req.auth || null } }),
  deleteUser: (req, res) => res.status(204).send(),
}));

jest.mock('../../controllers/zipController', () => ({
  getLocationByZip: (req, res) => res.json({ data: `zip:${req.params.zip}` }),
}));

const request = require('supertest');
const { verifyAccessToken } = require('../../auth/cognitoVerifier');
const app = require('../../app');

describe('app auth integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyAccessToken.mockResolvedValue({ sub: 'user-1', scope: ['jobs:write'], groups: ['admins'] });
  });

  it('mantém /health pública', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('mantém /docs.json pública', async () => {
    const response = await request(app).get('/docs.json');

    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe('3.0.1');
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('faz bypass para GET /api/jobs público', async () => {
    const response = await request(app).get('/api/jobs');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ route: 'listJobs' });
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('mantém /api/zips público', async () => {
    const response = await request(app).get('/api/zips/01001000');

    expect(response.status).toBe(200);
    expect(response.body.data).toBe('zip:01001000');
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('protege POST /api/jobs e retorna 401 sem bearer token', async () => {
    const response = await request(app).post('/api/jobs').send({ guid_id: 'job-1' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      message: 'Unauthorized',
      details: { reason: 'missing_authorization_header' },
    });
  });

  it('anexa o contexto autenticado nas rotas protegidas', async () => {
    const response = await request(app)
      .get('/api/companies')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.data.auth).toEqual({
      sub: 'user-1',
      scope: ['jobs:write'],
      groups: ['admins'],
    });
    expect(verifyAccessToken).toHaveBeenCalledWith('valid-token');
  });

  it('protege GET /api/domains e retorna 401 sem bearer token', async () => {
    const response = await request(app).get('/api/domains');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      message: 'Unauthorized',
      details: { reason: 'missing_authorization_header' },
    });
  });

  it('anexa auth em GET /api/domains com bearer token valido', async () => {
    const response = await request(app)
      .get('/api/domains')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      route: 'listDomains',
      auth: {
        sub: 'user-1',
        scope: ['jobs:write'],
        groups: ['admins'],
      },
    });
  });
});
