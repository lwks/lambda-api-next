const mockJobs = { create: jest.fn(), update: jest.fn() };

jest.mock('../../services/entityServiceFactory', () => ({
  createEntityService: () => mockJobs,
}));

const { createJob, updateJob } = require('../../controllers/jobController');

function response() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}

beforeEach(() => jest.clearAllMocks());

test('records the verified company identity and ignores a forged owner', async () => {
  mockJobs.create.mockImplementation(async (payload) => payload);
  const res = response();
  await createJob({ body: { guid_id: 'job-1', owner_sub: 'attacker' }, auth: { sub: 'company-1' } }, res, jest.fn());
  expect(mockJobs.create).toHaveBeenCalledWith({ guid_id: 'job-1', owner_sub: 'company-1' });
  expect(res.status).toHaveBeenCalledWith(201);
});

test('rejects a company context without an identity', async () => {
  const next = jest.fn();
  await createJob({ body: { guid_id: 'job-1' }, auth: {} }, response(), next);
  expect(mockJobs.create).not.toHaveBeenCalled();
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
});

test('does not permit updating the owner', async () => {
  mockJobs.update.mockResolvedValue({ guid_id: 'job-1' });
  await updateJob({ params: { id: 'job-1' }, body: { titulo: 'New title', owner_sub: 'attacker' } }, response(), jest.fn());
  expect(mockJobs.update).toHaveBeenCalledWith('job-1', { titulo: 'New title' });
});
