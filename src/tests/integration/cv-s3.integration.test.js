const crypto = require('crypto');

const mockCandidates = { create: jest.fn(), findById: jest.fn() };
const mockJobs = { findById: jest.fn() };

jest.mock('../../auth/accessTokenVerifier', () => ({ verifyAccessToken: jest.fn() }));
jest.mock('../../services/entityServiceFactory', () => ({
  createEntityService: (type) => (type === 'candidate' ? mockCandidates : mockJobs),
}));

const request = require('supertest');
const app = require('../../app');
const { verifyAccessToken } = require('../../auth/accessTokenVerifier');
const enabled = process.env.RUN_S3_INTEGRATION === '1';
const candidateId = crypto.randomUUID();
const candidateSub = `codex-s3-test-${crypto.randomUUID()}`;
const companySub = 'codex-s3-test-company';
const contentType = 'application/pdf';
const content = Buffer.from('%PDF-1.4 synthetic S3 integration test');
const filename = 'synthetic-resume.pdf';
const bucket = process.env.CV_S3_BUCKET;
const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
let objectKey;

async function deleteObject(url) {
  const parsed = new URL(url);
  const credentials = await require('@aws-sdk/credential-provider-node').defaultProvider()();
  const now = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = now.slice(0, 8);
  const scope = `${date}/${region}/s3/aws4_request`;
  const params = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${credentials.accessKeyId}/${scope}`,
    'X-Amz-Date': now,
    'X-Amz-Expires': '60',
    'X-Amz-SignedHeaders': 'host',
  });
  if (credentials.sessionToken) params.set('X-Amz-Security-Token', credentials.sessionToken);
  const canonicalQuery = [...params.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
  const canonical = `DELETE\n${parsed.pathname}\n${canonicalQuery}\nhost:${parsed.host}\n\nhost\nUNSIGNED-PAYLOAD`;
  const hash = value => crypto.createHash('sha256').update(value).digest('hex');
  const hmac = (keyBytes, value) => crypto.createHmac('sha256', keyBytes).update(value).digest();
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${credentials.secretAccessKey}`, date), region), 's3'), 'aws4_request');
  const stringToSign = `AWS4-HMAC-SHA256\n${now}\n${scope}\n${hash(canonical)}`;
  params.set('X-Amz-Signature', crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex'));
  const response = await fetch(`${parsed.origin}${parsed.pathname}?${params}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Could not clean synthetic S3 object (${response.status})`);
}

const s3Integration = enabled ? describe : describe.skip;

s3Integration('real S3 CV integration', () => {
  beforeAll(() => {
    if (!bucket) throw new Error('Set CV_S3_BUCKET to a dedicated test bucket before enabling S3 integration tests');
    if (!process.env.AWS_REGION && !process.env.AWS_DEFAULT_REGION) {
      throw new Error('Set AWS_REGION or AWS_DEFAULT_REGION before enabling S3 integration tests');
    }
  });

  beforeEach(() => {
    verifyAccessToken.mockReset().mockResolvedValue({ sub: candidateSub, accountType: 'CANDIDATE' });
    mockCandidates.create.mockReset().mockImplementation(async body => body);
    mockCandidates.findById.mockReset();
    mockJobs.findById.mockReset().mockResolvedValue({ owner_sub: companySub });
  });

  afterEach(async () => {
    if (objectKey) {
      const deleteUrl = `https://${bucket}.s3.${region}.amazonaws.com/${objectKey.split('/').map(encodeURIComponent).join('/')}`;
      await deleteObject(deleteUrl);
      objectKey = undefined;
    }
  });

  test('uploads, verifies, downloads, and removes a synthetic CV in S3', async () => {
    const upload = await request(app).post('/api/candidates/cv-upload').set({ Authorization: 'Bearer synthetic' })
      .send({ candidateId, filename, contentType, size: content.length });
    expect(upload.status).toBe(200);
    objectKey = upload.body.data.key;

    const put = await fetch(upload.body.data.uploadUrl, { method: 'PUT', headers: { 'content-type': contentType }, body: content });
    expect(put.status).toBe(200);

    const cv = { key: objectKey, filename, contentType };
    const created = await request(app).post('/api/candidates').set({ Authorization: 'Bearer synthetic' })
      .send({ guid_id: candidateId, guid_vaga: 'synthetic-job', cv });
    expect(created.status).toBe(201);
    expect(mockCandidates.create).toHaveBeenCalledWith(expect.objectContaining({ cv }));

    verifyAccessToken.mockResolvedValue({ sub: companySub, accountType: 'COMPANY' });
    mockCandidates.findById.mockResolvedValue({ guid_vaga: 'synthetic-job', cv });
    const download = await request(app).get(`/api/candidates/${candidateId}/cv-download`)
      .set({ Authorization: 'Bearer synthetic' });
    expect(download.status).toBe(200);
    const downloaded = await fetch(download.body.data.downloadUrl);
    expect(downloaded.status).toBe(200);
    expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(content);
  });
});
