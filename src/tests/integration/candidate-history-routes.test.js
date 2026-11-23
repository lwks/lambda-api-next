jest.mock('../../auth/accessTokenVerifier', () => ({ verifyAccessToken: jest.fn() }));
jest.mock('../../services/candidateApplicationService', () => ({ listOwnApplications: jest.fn(), ownApplication: jest.fn() }));
const request = require('supertest');
const app = require('../../app');
const { verifyAccessToken } = require('../../auth/accessTokenVerifier');
const { listOwnApplications, ownApplication } = require('../../services/candidateApplicationService');
beforeEach(() => {
  jest.clearAllMocks();
  verifyAccessToken.mockResolvedValue({ sub: 'verified-candidate', accountType: 'CANDIDATE' });
  listOwnApplications.mockResolvedValue({ items: [{ id: 'mine' }] });
  ownApplication.mockResolvedValue({ guid_id: 'mine' });
});
test('requires authentication and candidate role for history', async () => {
  expect((await request(app).get('/api/candidates/me/applications?status=closed')).status).toBe(401);
  verifyAccessToken.mockResolvedValue({ sub: 'company', accountType: 'COMPANY' });
  expect((await request(app).get('/api/candidates/me/applications').set('Authorization', 'Bearer synthetic')).status).toBe(403);
  expect(listOwnApplications).not.toHaveBeenCalled();
});
test('uses the verified identity rather than a supplied identity and preserves individual lookup', async () => {
  const response = await request(app).get('/api/candidates/me/applications?status=closed&candidate_sub=another-person').set('Authorization', 'Bearer synthetic');
  expect(response.status).toBe(200);
  expect(listOwnApplications).toHaveBeenCalledWith('verified-candidate', 'closed');
  const own = await request(app).get('/api/candidates/me/applications?guid_vaga=job').set('Authorization', 'Bearer synthetic');
  expect(own.status).toBe(200);
  expect(ownApplication).toHaveBeenCalledWith('verified-candidate', 'job');
});
test('returns a controlled service error', async () => {
  listOwnApplications.mockRejectedValue(Object.assign(new Error('invalid status'), { statusCode: 400 }));
  expect((await request(app).get('/api/candidates/me/applications?status=invalid').set('Authorization', 'Bearer synthetic')).status).toBe(400);
});
