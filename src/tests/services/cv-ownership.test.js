const mockCandidates = { findById: jest.fn() };
const mockJobs = { findById: jest.fn() };

jest.mock('../../services/entityServiceFactory', () => ({
  createEntityService: (type) => (type === 'candidate' ? mockCandidates : mockJobs),
}));
jest.mock('@aws-sdk/credential-provider-node', () => ({
  defaultProvider: () => async () => ({ accessKeyId: 'test-key', secretAccessKey: 'test-secret' }),
}));

const { createDownload } = require('../../services/cvStorageService');

beforeEach(() => {
  process.env.CV_S3_BUCKET = 'clusterjobs';
  process.env.AWS_REGION = 'us-east-1';
  mockCandidates.findById.mockReset().mockResolvedValue({ guid_vaga: 'job-1', cv: { key: 'cvs/candidate-1/file.pdf', filename: 'cv.pdf' } });
  mockJobs.findById.mockReset().mockResolvedValue({ owner_sub: 'company-1' });
});

test('issues a download URL to the vacancy owner', async () => {
  const result = await createDownload({ accountType: 'COMPANY', sub: 'company-1' }, 'candidate-1');
  expect(result.downloadUrl).toContain('clusterjobs.s3.us-east-1.amazonaws.com');
  expect(result.filename).toBe('cv.pdf');
});

test('denies another company even if it supplies a matching CNPJ claim', async () => {
  await expect(createDownload({ accountType: 'COMPANY', sub: 'company-2', claims: { cd_cnpj: '123' } }, 'candidate-1'))
    .rejects.toMatchObject({ statusCode: 403 });
});

test('denies ownerless legacy vacancies', async () => {
  mockJobs.findById.mockResolvedValue({});
  await expect(createDownload({ accountType: 'COMPANY', sub: 'company-1' }, 'candidate-1'))
    .rejects.toMatchObject({ statusCode: 403 });
});
