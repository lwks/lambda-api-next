const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

jest.mock('../../auth/accessTokenVerifier', () => ({
  verifyAccessToken: jest.fn(async token => {
    if (token === 'company') return { sub: 'company', accountType: 'COMPANY' };
    if (token === 'other-company') return { sub: 'other-company', accountType: 'COMPANY' };
    if (token === 'candidate') return { sub: 'candidate', accountType: 'CANDIDATE' };
    throw new (require('../../utils/errors').UnauthorizedError)('Unauthorized');
  }),
}));

const original = { ...process.env };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ats-harness-'));
process.env.HARNESS_MODE = 'local';
process.env.HARNESS_DATA_DIR = dir;
process.env.SUPABASE_URL = 'http://localhost:54329';
const app = require('../../app');
const { read, save, seed, JOB_ID, CANDIDATE_ID } = require('../../harness/store');
const { initializeCv } = require('../../harness/cvStorage');
const { createEntityService } = require('../../services/entityServiceFactory');
const { getLocationByZip } = require('../../services/zipService');

beforeEach(() => { save(seed()); initializeCv(); });
afterAll(() => { process.env = original; fs.rmSync(dir, { recursive: true, force: true }); });

test('uses local persistent data with pagination, filtering and CRUD', async () => {
  const service = createEntityService('job');
  const item = await service.create({ guid_id: 'local-job', titulo: 'Created' });
  expect(read().job).toContainEqual(item);
  const first = await service.list({ limit: 1 });
  const second = await service.list({ limit: 1, lastKey: first.lastEvaluatedKey });
  expect(second.items[0].id).toBe('local-job');
  expect((await service.listByFieldValues({ field: 'titulo', values: ['Created'] })).length).toBe(1);
  await service.update(item.id, { titulo: 'Updated', guid_id: 'cannot-change', id: 'cannot-change' });
  expect(await service.findById(item.id)).toMatchObject({ titulo: 'Updated', guid_id: 'local-job' });
  await service.remove(item.id);
  await expect(service.findById(item.id)).rejects.toMatchObject({ statusCode: 404 });
  await expect(service.create({ titulo: 'Missing key' })).rejects.toMatchObject({ statusCode: 400 });
  await expect(service.update('absent', { titulo: 'Missing' })).rejects.toMatchObject({ statusCode: 404 });
});

test('keeps anonymous and wrong-profile requests blocked in local mode', async () => {
  expect((await request(app).post('/api/jobs').send({ guid_id: 'x' })).status).toBe(401);
  expect((await request(app).post('/api/jobs').set('Authorization', 'Bearer candidate').send({ guid_id: 'x' })).status).toBe(403);
  const response = await request(app).post('/api/jobs').set('Authorization', 'Bearer company').send({ guid_id: 'x' });
  expect(response.status).toBe(201);
  expect(response.body.data.owner_sub).toBe('company');
});

test('uploads a CV, creates an application, and enforces company ownership on download', async () => {
  const id = '33333333-3333-4333-8333-333333333333';
  const cv = Buffer.from('%PDF-1.4 local fixture');
  const prepared = await request(app).post('/api/candidates/cv-upload').set('Authorization', 'Bearer candidate')
    .send({ candidateId: id, filename: 'test.pdf', contentType: 'application/pdf', size: cv.length });
  expect(prepared.status).toBe(200);
  const url = new URL(prepared.body.data.uploadUrl);
  expect((await request(app).put(url.pathname + url.search).set('Content-Type', 'application/pdf').send(cv)).status).toBe(200);
  const created = await request(app).post('/api/candidates').set('Authorization', 'Bearer candidate')
    .send({ guid_id: id, guid_vaga: JOB_ID, nome: 'Candidate', cv: { key: prepared.body.data.key, filename: 'test.pdf', contentType: 'application/pdf' } });
  expect(created.status).toBe(201);
  const downloaded = await request(app).get(`/api/candidates/${id}/cv-download`).set('Authorization', 'Bearer company');
  expect(downloaded.status).toBe(200);
  const downloadUrl = new URL(downloaded.body.data.downloadUrl);
  const file = await request(app).get(downloadUrl.pathname + downloadUrl.search);
  expect(file.status).toBe(200);
  expect(file.body).toEqual(cv);
  expect((await request(app).get(`/api/candidates/${id}/cv-download`).set('Authorization', 'Bearer other-company')).status).toBe(403);
  expect((await request(app).get(`/api/candidates/${id}/cv-download`).set('Authorization', 'Bearer candidate')).status).toBe(403);
  expect((await request(app).get(downloadUrl.pathname + downloadUrl.search.replace('signature=', 'signature=0'))).status).toBe(403);
  expect((await request(app).get(url.pathname + url.search)).status).toBe(403);
});

test('validates CV metadata, missing uploads, size and file content type', async () => {
  const prepare = input => request(app).post('/api/candidates/cv-upload').set('Authorization', 'Bearer candidate').send(input);
  expect((await prepare({ filename: 'virus.exe', contentType: 'application/pdf', size: 10 })).status).toBe(400);
  expect((await prepare({ filename: 'test.pdf', contentType: 'application/pdf', size: 6 * 1024 * 1024, candidateId: CANDIDATE_ID })).status).toBe(400);
  const response = await prepare({ filename: 'test.pdf', contentType: 'application/pdf', size: 10, candidateId: CANDIDATE_ID });
  const url = new URL(response.body.data.uploadUrl);
  expect((await request(app).put(url.pathname + url.search).set('Content-Type', 'text/plain').send('bad')).status).toBe(400);
  const missing = await request(app).post('/api/candidates').set('Authorization', 'Bearer candidate').send({
    guid_id: '44444444-4444-4444-8444-444444444444', guid_vaga: JOB_ID,
    cv: { key: 'cvs/candidate/44444444-4444-4444-8444-444444444444.pdf', filename: 'missing.pdf', contentType: 'application/pdf' },
  });
  expect(missing.status).toBe(400);
});

test('serves deterministic CEP fixtures without a network service', async () => {
  expect(await getLocationByZip('01001-000')).toContain('São Paulo/SP');
  await expect(getLocationByZip('00000000')).rejects.toMatchObject({ statusCode: 404 });
  await expect(getLocationByZip('invalid')).rejects.toMatchObject({ statusCode: 400 });
});
