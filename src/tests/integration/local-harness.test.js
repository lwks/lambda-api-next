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

test('closes a company vacancy once, keeps its reason private, and blocks new or updated applications', async () => {
  const jobId = 'closed-local-job';
  const headers = { Authorization: 'Bearer company' };
  expect((await request(app).post(`/api/jobs/${JOB_ID}/close`).send({})).status).toBe(401);
  expect((await request(app).post(`/api/jobs/${JOB_ID}/close`).set('Authorization', 'Bearer candidate').send({})).status).toBe(403);
  expect((await request(app).post('/api/jobs').set(headers).send({ guid_id: jobId, titulo: 'Local close test' })).status).toBe(201);

  const closed = await request(app).post(`/api/jobs/${jobId}/close`).set(headers).send({ motivo_encerramento: 'Contratação concluída' });
  expect(closed.status).toBe(200);
  expect(closed.body.data).toMatchObject({ status: 'Encerrada', motivo_encerramento: 'Contratação concluída' });
  expect(closed.body.data.encerrada_em).toBeTruthy();
  expect((await request(app).post(`/api/jobs/${jobId}/close`).set(headers).send({})).status).toBe(409);
  expect((await request(app).put(`/api/jobs/${jobId}`).set(headers).send({ status: 'Aberto' })).status).toBe(409);
  expect((await request(app).delete(`/api/jobs/${jobId}`).set(headers)).status).toBe(409);

  await request(app).post('/api/jobs').set({ Authorization: 'Bearer other-company' }).send({ guid_id: 'other-owned-job' });
  expect((await request(app).post('/api/jobs/other-owned-job/close').set(headers).send({})).status).toBe(403);
  expect((await request(app).post(`/api/jobs/${jobId}/close`).set(headers).send({ motivo_encerramento: 'x'.repeat(1001) })).status).toBe(400);

  await request(app).post('/api/jobs').set(headers).send({ guid_id: 'closed-without-reason' });
  const noReason = await request(app).post('/api/jobs/closed-without-reason/close').set(headers).send({});
  expect(noReason.body.data).toMatchObject({ status: 'Encerrada' });
  expect(noReason.body.data).not.toHaveProperty('motivo_encerramento');

  const mine = await request(app).get('/api/jobs/mine').set(headers);
  expect(mine.body.data.items.find(job => job.guid_id === jobId).motivo_encerramento).toBe('Contratação concluída');
  const publicJobs = await request(app).get('/api/jobs');
  expect(publicJobs.body.data.items.find(job => job.guid_id === jobId)).toMatchObject({ status: 'Encerrada' });
  expect(publicJobs.body.data.items.find(job => job.guid_id === jobId)).not.toHaveProperty('motivo_encerramento');
  expect((await request(app).get(`/api/jobs/${jobId}`)).body.data).not.toHaveProperty('motivo_encerramento');

  const newApplication = await request(app).post('/api/candidates/applications').set('Authorization', 'Bearer candidate')
    .send({ guid_vaga: jobId, mode: 'UPDATE_PROFILE', application: {
      mensagemEmpresa: '', pretensaoSalarial: '10000', compartilhamentoAccepted: true, cvAction: 'KEEP', lgpdAccepted: true,
    }, profile: {} });
  expect(newApplication.status).toBe(409);
  await request(app).post(`/api/jobs/${JOB_ID}/close`).set(headers).send({});
  const update = await request(app).put(`/api/candidates/${CANDIDATE_ID}`).set(headers).send({ status: 'contratado' });
  expect(update.status).toBe(400);
});

test('company vacancy list is scoped to the authenticated owner', async () => {
  await request(app).post('/api/jobs').set('Authorization', 'Bearer company').send({ guid_id: 'owned-by-company' });
  await request(app).post('/api/jobs').set('Authorization', 'Bearer other-company').send({ guid_id: 'owned-by-other' });
  const result = await request(app).get('/api/jobs/mine').set('Authorization', 'Bearer company');
  expect(result.body.data.items.map(job => job.guid_id)).toContain('owned-by-company');
  expect(result.body.data.items.map(job => job.guid_id)).not.toContain('owned-by-other');
});

test('uploads a CV, creates an application, and enforces company ownership on download', async () => {
  const id = '33333333-3333-4333-8333-333333333333';
  const cv = Buffer.from('%PDF-1.4 local fixture');
  const prepared = await request(app).post('/api/candidates/cv-upload').set('Authorization', 'Bearer candidate')
    .send({ candidateId: id, filename: 'test.pdf', contentType: 'application/pdf', size: cv.length });
  expect(prepared.status).toBe(200);
  const url = new URL(prepared.body.data.uploadUrl);
  expect((await request(app).put(url.pathname + url.search).set('Content-Type', 'application/pdf').send(cv)).status).toBe(200);
  const { PROFILE_FIELDS } = require('../../services/candidateApplicationService');
  const profile = Object.fromEntries(PROFILE_FIELDS.filter(field => !['indicacao', 'indicacoes'].includes(field))
    .map(field => [field, ['beneficiosAtuais', 'timeAtual', 'industriaInteresse', 'hardSkillsProfissionais', 'softSkillsProfissionais',
      'tipoContratacao', 'modeloTrabalho', 'setor', 'time', 'senioridadePreferencia', 'areaPreferencia', 'idiomas', 'hardSkills', 'softSkills'].includes(field) ? ['1'] : 'Candidate']));
  const created = await request(app).post('/api/candidates').set('Authorization', 'Bearer candidate')
    .send({ guid_id: id, guid_vaga: JOB_ID, ...profile, pretensaoSalarial: '10000', mensagemEmpresa: '',
      compartilhamentoAccepted: true, lgpdAccepted: true,
      cv: { key: prepared.body.data.key, filename: 'test.pdf', contentType: 'application/pdf' } });
  expect(created.status).toBe(201);
  const applicationId = created.body.data.guid_id;
  const downloaded = await request(app).get(`/api/candidates/${applicationId}/cv-download`).set('Authorization', 'Bearer company');
  expect(downloaded.status).toBe(200);
  const downloadUrl = new URL(downloaded.body.data.downloadUrl);
  const file = await request(app).get(downloadUrl.pathname + downloadUrl.search);
  expect(file.status).toBe(200);
  expect(file.body).toEqual(cv);
  expect((await request(app).get(`/api/candidates/${applicationId}/cv-download`).set('Authorization', 'Bearer other-company')).status).toBe(403);
  expect((await request(app).get(`/api/candidates/${applicationId}/cv-download`).set('Authorization', 'Bearer candidate')).status).toBe(403);
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

function completeProfile(name = 'Candidate Local') {
  const { PROFILE_FIELDS } = require('../../services/candidateApplicationService');
  const arrays = new Set(['beneficiosAtuais', 'timeAtual', 'industriaInteresse', 'hardSkillsProfissionais', 'softSkillsProfissionais',
    'tipoContratacao', 'modeloTrabalho', 'setor', 'time', 'senioridadePreferencia', 'areaPreferencia', 'idiomas', 'hardSkills', 'softSkills']);
  return Object.fromEntries(PROFILE_FIELDS.filter(field => !['indicacao', 'indicacoes'].includes(field))
    .map(field => [field, arrays.has(field) ? ['1'] : name]));
}

test('creates own profile and immutable application snapshots, then reuses without refilling', async () => {
  const candidate = { Authorization: 'Bearer candidate' };
  const company = { Authorization: 'Bearer company' };
  await request(app).post('/api/jobs').set(company).send({ guid_id: 'second-job', status: 'Aberto' });
  expect((await request(app).get('/api/candidates/me/profile').set(candidate)).body.data).toBeNull();
  const first = await request(app).post('/api/candidates/applications').set(candidate).send({ guid_vaga: JOB_ID, mode: 'UPDATE_PROFILE',
    profile: completeProfile('First Name'), application: { mensagemEmpresa: 'First', pretensaoSalarial: '10000',
      compartilhamentoAccepted: true, lgpdAccepted: true, cvAction: 'KEEP' } });
  expect(first.status).toBe(201);
  expect(first.body.data).toMatchObject({ candidate_sub: 'candidate', nome: 'First Name', profile_version: 1 });
  const profile = (await request(app).get('/api/candidates/me/profile').set(candidate)).body.data;
  expect(profile).toMatchObject({ nome: 'First Name', version: 1, lgpdRenewalRequired: false });
  expect(profile).not.toHaveProperty('candidato_sub');
  const second = await request(app).post('/api/candidates/applications').set(candidate).send({ guid_vaga: 'second-job',
    mode: 'USE_SAVED_PROFILE', profileVersion: 1, application: { mensagemEmpresa: 'Second', pretensaoSalarial: '12000',
      compartilhamentoAccepted: true, cvAction: 'KEEP' } });
  expect(second.status).toBe(201);
  expect(second.body.data).toMatchObject({ nome: 'First Name', profile_version: 1, mensagemEmpresa: 'Second' });
  const updated = await request(app).put('/api/candidates/me/profile').set(candidate)
    .send({ version: 1, profile: completeProfile('Updated Name') });
  expect(updated.status).toBe(200);
  expect(updated.body.data.version).toBe(2);
  expect((await request(app).get(`/api/candidates/${first.body.data.guid_id}`).set(company)).body.data.nome).toBe('First Name');
  expect((await request(app).get('/api/candidates/me/applications?guid_vaga=second-job').set(candidate)).body.data.guid_id)
    .toBe(second.body.data.guid_id);
  expect((await request(app).put('/api/candidates/me/profile').set(candidate).send({ version: 1, profile: completeProfile() })).status).toBe(409);
});

test('rejects duplicate submissions and renews LGPD after 21 days', async () => {
  const candidate = { Authorization: 'Bearer candidate' };
  const payload = { guid_vaga: JOB_ID, mode: 'UPDATE_PROFILE', profile: completeProfile(),
    application: { mensagemEmpresa: '', pretensaoSalarial: '10000', compartilhamentoAccepted: true,
      lgpdAccepted: true, cvAction: 'KEEP' } };
  const [a, b] = await Promise.all([request(app).post('/api/candidates/applications').set(candidate).send(payload),
    request(app).post('/api/candidates/applications').set(candidate).send(payload)]);
  expect([a.status, b.status].sort()).toEqual([201, 409]);
  expect(read().candidate.filter(row => row.candidate_sub === 'candidate')).toHaveLength(1);
  const db = read(); db.profile[0].lgpdAcceptedAt = '2020-01-01T00:00:00.000Z'; save(db);
  await request(app).post('/api/jobs').set('Authorization', 'Bearer company').send({ guid_id: 'renew-job', status: 'Aberto' });
  const reuse = { guid_vaga: 'renew-job', mode: 'USE_SAVED_PROFILE', profileVersion: 1,
    application: { mensagemEmpresa: '', pretensaoSalarial: '10000', compartilhamentoAccepted: true, cvAction: 'REMOVE' } };
  expect((await request(app).post('/api/candidates/applications').set(candidate).send(reuse)).status).toBe(400);
  const renewed = await request(app).post('/api/candidates/applications').set(candidate)
    .send({ ...reuse, application: { ...reuse.application, lgpdAccepted: true } });
  expect(renewed.status).toBe(201);
  expect(renewed.body.data.profile_version).toBe(2);
  expect(renewed.body.data).not.toHaveProperty('cv');
});

test('limits company reads to owned vacancies, including historical records', async () => {
  expect((await request(app).get(`/api/candidates/${CANDIDATE_ID}`).set('Authorization', 'Bearer other-company')).status).toBe(403);
  expect((await request(app).get('/api/candidates/by-job-guids?guid_vaga=' + JOB_ID).set('Authorization', 'Bearer other-company')).status).toBe(403);
  expect((await request(app).delete(`/api/candidates/${CANDIDATE_ID}`).set('Authorization', 'Bearer company')).status).toBe(403);
  expect((await request(app).get(`/api/candidates/${CANDIDATE_ID}`).set('Authorization', 'Bearer company')).status).toBe(200);
});

test('replaces profile CV with a new key and omits it from one application without erasing profile CV', async () => {
  const candidate = { Authorization: 'Bearer candidate' };
  const company = { Authorization: 'Bearer company' };
  await request(app).post('/api/jobs').set(company).send({ guid_id: 'cv-second-job', status: 'Aberto' });
  const bytes = Buffer.from('%PDF-1.4 profile fixture');
  const prepared = await request(app).post('/api/candidates/me/cv-upload').set(candidate)
    .send({ filename: 'profile.pdf', contentType: 'application/pdf', size: bytes.length });
  expect(prepared.status).toBe(200);
  const url = new URL(prepared.body.data.uploadUrl);
  expect((await request(app).put(url.pathname + url.search).set('Content-Type', 'application/pdf').set('If-None-Match', '*').send(bytes)).status).toBe(200);
  expect((await request(app).put(url.pathname + url.search).set('Content-Type', 'application/pdf').set('If-None-Match', '*').send(bytes)).status).toBe(412);
  const cv = { key: prepared.body.data.key, filename: 'profile.pdf', contentType: 'application/pdf', size: bytes.length };
  const first = await request(app).post('/api/candidates/applications').set(candidate).send({ guid_vaga: JOB_ID,
    mode: 'UPDATE_PROFILE', profile: completeProfile(), application: { mensagemEmpresa: '', pretensaoSalarial: '10000',
      compartilhamentoAccepted: true, lgpdAccepted: true, cvAction: 'REPLACE', cv } });
  expect(first.status).toBe(201);
  expect(first.body.data.cv.key).toBe(cv.key);
  const second = await request(app).post('/api/candidates/applications').set(candidate).send({ guid_vaga: 'cv-second-job',
    mode: 'USE_SAVED_PROFILE', profileVersion: 1, application: { mensagemEmpresa: '', pretensaoSalarial: '10000',
      compartilhamentoAccepted: true, cvAction: 'REMOVE' } });
  expect(second.status).toBe(201);
  expect(second.body.data).not.toHaveProperty('cv');
  expect((await request(app).get('/api/candidates/me/profile').set(candidate)).body.data.cv.key).toBe(cv.key);
  expect((await request(app).get(`/api/candidates/${first.body.data.guid_id}/cv-download`).set(company)).status).toBe(200);
  expect((await request(app).get(`/api/candidates/${second.body.data.guid_id}/cv-download`).set(company)).status).toBe(404);
  await request(app).post('/api/jobs').set(company).send({ guid_id: 'cv-third-job', status: 'Aberto' });
  const replacement = await request(app).post('/api/candidates/me/cv-upload').set(candidate)
    .send({ filename: 'new.pdf', contentType: 'application/pdf', size: bytes.length });
  const replacementUrl = new URL(replacement.body.data.uploadUrl);
  expect((await request(app).put(replacementUrl.pathname + replacementUrl.search)
    .set('Content-Type', 'application/pdf').set('If-None-Match', '*').send(bytes)).status).toBe(200);
  const third = await request(app).post('/api/candidates/applications').set(candidate).send({ guid_vaga: 'cv-third-job',
    mode: 'USE_SAVED_PROFILE', profileVersion: 1, application: { mensagemEmpresa: '', pretensaoSalarial: '10000',
      compartilhamentoAccepted: true, cvAction: 'REPLACE',
      cv: { key: replacement.body.data.key, filename: 'new.pdf', contentType: 'application/pdf', size: bytes.length } } });
  expect(third.status).toBe(201);
  expect(third.body.data.profile_version).toBe(2);
  expect((await request(app).get('/api/candidates/me/profile').set(candidate)).body.data.cv.key).toBe(replacement.body.data.key);
  expect((await request(app).get(`/api/candidates/${first.body.data.guid_id}`).set(company)).body.data.cv.key).toBe(cv.key);
  expect((await request(app).get(`/api/candidates/${first.body.data.guid_id}/cv-download`).set(company)).status).toBe(200);
});
