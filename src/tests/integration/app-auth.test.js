jest.mock('../../auth/accessTokenVerifier', () => ({
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

jest.mock('../../controllers/candidateController', () => ({
  createCandidate: (req, res) => res.status(201).json({ data: { route: 'createCandidate' } }),
  listCandidates: (req, res) => res.json({ data: { route: 'listCandidates', auth: req.auth || null } }),
  listCandidatesByJobGuids: (req, res) => res.json({ data: { route: 'listCandidatesByJobGuids', auth: req.auth || null } }),
  getCandidate: (req, res) => res.json({ data: { route: 'getCandidate', auth: req.auth || null } }),
  updateCandidate: (req, res) => res.json({ data: { route: 'updateCandidate', auth: req.auth || null } }),
  deleteCandidate: (req, res) => res.status(204).send(),
  createCvUpload: (req, res) => res.status(200).json({ data: { route: 'createCvUpload' } }),
  getCvDownload: (req, res) => res.status(200).json({ data: { route: 'getCvDownload' } }),
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
const { verifyAccessToken } = require('../../auth/accessTokenVerifier');
const app = require('../../app');

describe('app auth integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyAccessToken.mockResolvedValue({
      sub: 'user-1', scope: ['jobs:write'], groups: ['admins'], accountType: 'COMPANY',
    });
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

  it('protege GET /api/candidates/by-job-guids e retorna 401 sem bearer token', async () => {
    const response = await request(app).get('/api/candidates/by-job-guids?guid_vaga=job-1');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      message: 'Unauthorized',
      details: { reason: 'missing_authorization_header' },
    });
  });

  it('permite COMPANY criar vaga e consultar candidaturas vinculadas', async () => {
    const createResponse = await request(app)
      .post('/api/jobs')
      .set('Authorization', 'Bearer valid-token')
      .send({ guid_id: 'job-1' });
    const candidatesResponse = await request(app)
      .get('/api/candidates/by-job-guids?guid_vaga=job-1')
      .set('Authorization', 'Bearer valid-token');

    expect(createResponse.status).toBe(201);
    expect(candidatesResponse.status).toBe(200);
    expect(candidatesResponse.body.data.auth.accountType).toBe('COMPANY');
  });

  it('retorna 403 quando CANDIDATE tenta criar vaga ou consultar candidaturas', async () => {
    verifyAccessToken.mockResolvedValue({ sub: 'candidate-1', accountType: 'CANDIDATE' });

    const createResponse = await request(app)
      .post('/api/jobs')
      .set('Authorization', 'Bearer candidate-token')
      .send({ guid_id: 'job-1' });
    const candidatesResponse = await request(app)
      .get('/api/candidates/by-job-guids?guid_vaga=job-1')
      .set('Authorization', 'Bearer candidate-token');

    expect(createResponse.status).toBe(403);
    expect(candidatesResponse.status).toBe(403);
    expect(createResponse.body.details).toEqual({
      reason: 'insufficient_account_type',
      requiredAccountType: 'COMPANY',
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
      accountType: 'COMPANY',
    });
    expect(verifyAccessToken).toHaveBeenCalledWith('valid-token');
  });
});
