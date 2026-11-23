const mockJobs = { list: jest.fn() };
jest.mock('../../services/entityServiceFactory', () => ({ createEntityService: () => mockJobs }));
const { listJobs } = require('../../controllers/jobController');
const res = () => { const r = { status: jest.fn(), json: jest.fn() }; r.status.mockReturnValue(r); return r; };
beforeEach(() => { jest.clearAllMocks(); mockJobs.list.mockResolvedValue({ items: [], lastEvaluatedKey: undefined }); });
test.each([[undefined, 'open'], ['open', 'open'], ['closed', 'closed']])('filters public jobs: %s', async (status, expected) => {
  const next = jest.fn();
  await listJobs({ query: { status, limit: '2' } }, res(), next);
  expect(next).not.toHaveBeenCalled();
  expect(mockJobs.list).toHaveBeenCalledWith({ limit: 2, lastKey: undefined, jobStatus: expected });
});
test('rejects unsupported status without querying data', async () => {
  const next = jest.fn(); await listJobs({ query: { status: 'all' } }, res(), next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  expect(mockJobs.list).not.toHaveBeenCalled();
});
test('propagates database failures', async () => {
  mockJobs.list.mockRejectedValue(new Error('unavailable'));
  const next = jest.fn(); await listJobs({ query: {} }, res(), next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'unavailable' }));
});
