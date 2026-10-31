const mockCandidates = { create: jest.fn(), findById: jest.fn() };
const mockJobs = { findById: jest.fn() };

jest.mock('../../auth/accessTokenVerifier', () => ({ verifyAccessToken: jest.fn() }));
jest.mock('../../services/entityServiceFactory', () => ({
  createEntityService: (type) => (type === 'candidate' ? mockCandidates : mockJobs),
}));
jest.mock('@aws-sdk/credential-provider-node', () => ({
  fromNodeProviderChain: () => async () => ({ accessKeyId: 'test-key', secretAccessKey: 'test-secret' }),
}));

const request = require('supertest');
const app = require('../../app');
const { verifyAccessToken } = require('../../auth/accessTokenVerifier');

const candidateId = '123e4567-e89b-42d3-a456-426614174000';
const cv = {
  key: `cvs/candidate-1/${candidateId}.pdf`,
  filename: 'resume.pdf',
  contentType: 'application/pdf',
};
const bearer = { Authorization: 'Bearer synthetic-token' };

beforeEach(() => {
  process.env.CV_S3_BUCKET = 'synthetic-cv-bucket';
  process.env.AWS_REGION = 'us-east-1';
  verifyAccessToken.mockReset().mockResolvedValue({ sub: 'candidate-1', accountType: 'CANDIDATE' });
  mockCandidates.create.mockReset().mockImplementation(async (body) => body);
  mockCandidates.findById.mockReset().mockResolvedValue({ guid_vaga: 'job-1', cv });
  mockJobs.findById.mockReset().mockResolvedValue({ owner_sub: 'company-1' });
  global.fetch = jest.fn();
});

afterEach(() => {
  delete global.fetch;
});

test('POST /cv-upload issues a signed PUT URL scoped to the candidate', async () => {
  const response = await request(app).post('/api/candidates/cv-upload').set(bearer)
    .send({ candidateId, filename: 'resume.pdf', contentType: 'application/pdf', size: 1024 });

  expect(response.status).toBe(200);
  expect(response.body.data).toMatchObject({ key: cv.key, contentType: cv.contentType, maxBytes: 5 * 1024 * 1024 });
  const url = new URL(response.body.data.uploadUrl);
  expect(url.host).toBe('synthetic-cv-bucket.s3.us-east-1.amazonaws.com');
  expect(url.pathname).toBe(`/${cv.key}`);
  expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-type;host');
  expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
  expect(global.fetch).not.toHaveBeenCalled();
});

test.each([
  [{ filename: 'resume.exe', contentType: 'application/octet-stream', size: 1024 }, 'CV must be a PDF, DOC, or DOCX file'],
  [{ filename: 'resume.pdf', contentType: 'application/pdf', size: 5 * 1024 * 1024 + 1 }, 'CV file must be no larger than 5 MB'],
])('POST /cv-upload rejects invalid file metadata', async (input, message) => {
  const response = await request(app).post('/api/candidates/cv-upload').set(bearer)
    .send({ candidateId, ...input });
  expect(response.status).toBe(400);
  expect(response.body.message).toBe(message);
});

test('CV routes enforce authentication and account type', async () => {
  const anonymous = await request(app).post('/api/candidates/cv-upload').send({});
  expect(anonymous.status).toBe(401);

  verifyAccessToken.mockResolvedValue({ sub: 'company-1', accountType: 'COMPANY' });
  const companyUpload = await request(app).post('/api/candidates/cv-upload').set(bearer).send({});
  expect(companyUpload.status).toBe(403);

  verifyAccessToken.mockResolvedValue({ sub: 'candidate-1', accountType: 'CANDIDATE' });
  const candidateDownload = await request(app).get(`/api/candidates/${candidateId}/cv-download`).set(bearer);
  expect(candidateDownload.status).toBe(403);
  expect(mockCandidates.findById).not.toHaveBeenCalled();
});

test('POST /candidates verifies S3 HEAD before persisting a CV reference', async () => {
  global.fetch.mockResolvedValue({ status: 200, ok: true, headers: new Headers({ 'content-length': '1024', 'content-type': 'application/pdf' }) });
  const response = await request(app).post('/api/candidates').set(bearer)
    .send({ guid_id: candidateId, guid_vaga: 'job-1', cv });

  expect(response.status).toBe(201);
  expect(mockCandidates.create).toHaveBeenCalledWith(expect.objectContaining({ cv }));
  const [url, options] = global.fetch.mock.calls[0];
  expect(options).toEqual({ method: 'HEAD' });
  expect(new URL(url).pathname).toBe(`/${cv.key}`);
});

test.each([
  [{ status: 404, ok: false }, 'CV upload was not found'],
  [{ status: 200, ok: true, headers: new Headers({ 'content-length': '5242881', 'content-type': 'application/pdf' }) }, 'Uploaded CV must match the allowed type and be no larger than 5 MB'],
])('POST /candidates rejects an invalid S3 object before persisting', async (head, message) => {
  global.fetch.mockResolvedValue(head);
  const response = await request(app).post('/api/candidates').set(bearer)
    .send({ guid_id: candidateId, guid_vaga: 'job-1', cv });
  expect(response.status).toBe(400);
  expect(response.body.message).toBe(message);
  expect(mockCandidates.create).not.toHaveBeenCalled();
});

test('POST /candidates rejects another candidate CV key without contacting S3', async () => {
  const response = await request(app).post('/api/candidates').set(bearer)
    .send({ guid_id: candidateId, guid_vaga: 'job-1', cv: { ...cv, key: `cvs/other/${candidateId}.pdf` } });
  expect(response.status).toBe(400);
  expect(global.fetch).not.toHaveBeenCalled();
  expect(mockCandidates.create).not.toHaveBeenCalled();
});

test('GET /cv-download signs a GET URL for the vacancy owner', async () => {
  verifyAccessToken.mockResolvedValue({ sub: 'company-1', accountType: 'COMPANY' });
  const response = await request(app).get(`/api/candidates/${candidateId}/cv-download`).set(bearer);
  expect(response.status).toBe(200);
  expect(response.body.data.filename).toBe('resume.pdf');
  const url = new URL(response.body.data.downloadUrl);
  expect(url.pathname).toBe(`/${cv.key}`);
  expect(url.searchParams.get('response-content-disposition')).toBe('attachment; filename="resume.pdf"');
  expect(mockJobs.findById).toHaveBeenCalledWith('job-1');
  expect(global.fetch).not.toHaveBeenCalled();
});

test('GET /cv-download denies a company that does not own the vacancy', async () => {
  verifyAccessToken.mockResolvedValue({ sub: 'company-2', accountType: 'COMPANY' });
  const response = await request(app).get(`/api/candidates/${candidateId}/cv-download`).set(bearer);
  expect(response.status).toBe(403);
  expect(response.body.message).toBe('Company does not own this vacancy');
});
