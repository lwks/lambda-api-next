const mockJobs = { findById: jest.fn() }, mockCandidates = { listByFieldValue: jest.fn() };
jest.mock('../../aws_services/dynamoClient', () => ({ documentClient: { send: jest.fn(async () => ({})) } }));
jest.mock('../../services/entityServiceFactory', () => ({ createEntityService: type => type === 'job' ? mockJobs : mockCandidates }));
const { listOwnApplications } = require('../../services/candidateApplicationService');
beforeEach(() => {
  jest.clearAllMocks();
  mockCandidates.listByFieldValue.mockResolvedValue([
    { guid_id: 'a', guid_vaga: 'open', status: 'Novo', createdAt: '2026-01-01' },
    { guid_id: 'b', guid_vaga: 'closed', status: 'Entrevista', createdAt: '2026-02-01' },
  ]);
  mockJobs.findById.mockImplementation(async guid => ({ guid_id: guid, titulo: guid, status: guid === 'closed' ? 'Encerrada' : 'Aberto' }));
});
test('restricts lookup to the authenticated identity and filters using the current vacancy status', async () => {
  expect((await listOwnApplications('me', 'closed')).items.map(row => row.id)).toEqual(['b']);
  expect(mockCandidates.listByFieldValue).toHaveBeenCalledWith({ field: 'candidate_sub', value: 'me', consistentRead: true });
  expect((await listOwnApplications('me')).items.map(row => row.id)).toEqual(['a']);
  expect((await listOwnApplications('me', 'all')).items.map(row => row.id)).toEqual(['b', 'a']);
});
test('rejects missing identity and unsupported filters before querying', async () => {
  await expect(listOwnApplications(null)).rejects.toMatchObject({ statusCode: 403 });
  await expect(listOwnApplications('me', 'invalid')).rejects.toMatchObject({ statusCode: 400 });
  expect(mockCandidates.listByFieldValue).not.toHaveBeenCalled();
});
test('retains history for removed vacancies only in all and propagates service failures', async () => {
  mockJobs.findById.mockRejectedValue(Object.assign(new Error('missing'), { statusCode: 404 }));
  expect((await listOwnApplications('me')).items).toEqual([]);
  expect((await listOwnApplications('me', 'all')).items).toHaveLength(2);
  mockJobs.findById.mockRejectedValue(new Error('outage'));
  await expect(listOwnApplications('me', 'closed')).rejects.toThrow('outage');
});
