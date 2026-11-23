jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));
jest.mock('../../auth/accessTokenVerifier', () => ({ verifyAccessToken: jest.fn() }));
jest.mock('../../harness/config', () => ({
  ...jest.requireActual('../../harness/config'), isLocalHarness: jest.fn(() => false),
}));

const request = require('supertest');
const nodemailer = require('nodemailer');
const { verifyAccessToken } = require('../../auth/accessTokenVerifier');
const { isLocalHarness } = require('../../harness/config');
const { logger } = require('../../utils/logger');
const app = require('../../app');

const originalEnv = { ...process.env };
const token = 'test-only-service-token';
const payload = { to: 'recipient@example.com', subject: 'SMTP test', text: 'Private message' };
let sendMail;
let close;

function post(body = payload, authorization = `Bearer ${token}`) {
  const req = request(app).post('/api/emails');
  if (authorization) req.set('Authorization', authorization);
  return req.send(body);
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env = {
<<<<<<< HEAD
    ...originalEnv, SMTP_HOST: 'smtp-relay.brevo.com', SMTP_PORT: '587',
    SMTP_USER: 'smtp-user', SMTP_PASS: 'secret-smtp-password',
    SMTP_FROM_EMAIL: 'contato@cluster.com.br', SMTP_FROM_NAME: 'ClusterJobs',
=======
    ...originalEnv, SMTP_HOST: 'smtp-relay.brevo.com', SMTP_PORT: '465',
    SMTP_USER: 'smtp-user', SMTP_PASS: 'secret-smtp-password',
    SMTP_FROM_EMAIL: 'no-reply@clusterjobs.com.br', SMTP_FROM_NAME: 'Cluster',
>>>>>>> 5127ae4a8a7c8a204a8699ec90e529f60c1620b5
    EMAIL_SERVICE_TOKEN: token,
  };
  isLocalHarness.mockReturnValue(false);
  sendMail = jest.fn().mockResolvedValue({
<<<<<<< HEAD
    accepted: [payload.to], rejected: [], messageId: '<test-message@cluster.com.br>',
=======
    accepted: [payload.to], rejected: [], messageId: '<test-message@clusterjobs.com.br>',
>>>>>>> 5127ae4a8a7c8a204a8699ec90e529f60c1620b5
  });
  close = jest.fn();
  nodemailer.createTransport.mockReturnValue({ sendMail, close });
  jest.spyOn(logger, 'info').mockImplementation(() => {});
  jest.spyOn(logger, 'warn').mockImplementation(() => {});
  jest.spyOn(logger, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...originalEnv };
  jest.restoreAllMocks();
});

test.each([
  { text: 'Text only' }, { html: '<p>HTML only</p>' }, { text: 'Text', html: '<p>HTML</p>' },
])('accepts one email with %j after SMTP acceptance', async (content) => {
  const body = { to: payload.to, subject: payload.subject, ...content };
  const response = await post(body);
  expect(response.status).toBe(202);
<<<<<<< HEAD
  expect(response.body).toEqual({ data: { status: 'accepted', messageId: '<test-message@cluster.com.br>' } });
  expect(sendMail).toHaveBeenCalledTimes(1);
  expect(sendMail).toHaveBeenCalledWith({
    ...body, from: { name: 'ClusterJobs', address: 'contato@cluster.com.br' },
  });
  expect(verifyAccessToken).not.toHaveBeenCalled();
=======
  expect(response.body).toEqual({ data: { status: 'accepted', messageId: '<test-message@clusterjobs.com.br>' } });
  expect(sendMail).toHaveBeenCalledTimes(1);
  expect(sendMail).toHaveBeenCalledWith({
    ...body, from: { name: 'Cluster', address: 'no-reply@clusterjobs.com.br' },
  });
  expect(verifyAccessToken).not.toHaveBeenCalled();
  expect(logger.info).toHaveBeenCalledWith('Email accepted by SMTP server', expect.objectContaining({
    requestId: expect.any(String), messageId: '<test-message@clusterjobs.com.br>',
  }));
>>>>>>> 5127ae4a8a7c8a204a8699ec90e529f60c1620b5
  expect(close).toHaveBeenCalledTimes(1);
});

test('uses secure transport options and fixed server-side credentials', async () => {
  await post();
  expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
<<<<<<< HEAD
    host: 'smtp-relay.brevo.com', port: 587, secure: false, requireTLS: true,
=======
    host: 'smtp-relay.brevo.com', port: 465, secure: true, requireTLS: false,
>>>>>>> 5127ae4a8a7c8a204a8699ec90e529f60c1620b5
    auth: { user: 'smtp-user', pass: 'secret-smtp-password' },
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
    disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false, pool: false,
  }));
});

<<<<<<< HEAD
test('supports implicit TLS on port 465', async () => {
  process.env.SMTP_PORT = '465';
  expect((await post()).status).toBe(202);
  expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
    port: 465, secure: true, requireTLS: false,
=======
test('defaults to Brevo port 465 with implicit TLS and the Cluster sender name', async () => {
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_FROM_NAME;
  expect((await post()).status).toBe(202);
  expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
    host: 'smtp-relay.brevo.com', port: 465, secure: true, requireTLS: false,
  }));
  expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
    from: { name: 'Cluster', address: 'no-reply@clusterjobs.com.br' },
  }));
});

test('preserves STARTTLS and explicitly configured sender and host', async () => {
  process.env.SMTP_PORT = '587';
  process.env.SMTP_HOST = 'smtp.example.com';
  process.env.SMTP_FROM_NAME = 'Custom Sender';
  process.env.SMTP_FROM_EMAIL = 'sender@example.com';
  expect((await post()).status).toBe(202);
  expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
    host: 'smtp.example.com', port: 587, secure: false, requireTLS: true,
  }));
  expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
    from: { name: 'Custom Sender', address: 'sender@example.com' },
>>>>>>> 5127ae4a8a7c8a204a8699ec90e529f60c1620b5
  }));
});

test.each([undefined, '', 'Basic password', 'Bearer invalid', 'Bearer user-jwt', `Bearer ${token} extra`])(
  'rejects absent or invalid service authorization: %s', async (authorization) => {
    verifyAccessToken.mockResolvedValue({ accountType: 'COMPANY' });
    const response = await post(payload, authorization || null);
    expect(response.status).toBe(401);
    expect(sendMail).not.toHaveBeenCalled();
    expect(verifyAccessToken).not.toHaveBeenCalled();
  },
);

test.each([
  {}, [], { ...payload, to: ['recipient@example.com'] },
  { ...payload, to: 'first@example.com,second@example.com' },
  { ...payload, to: 'Name <recipient@example.com>' },
  { ...payload, to: 'recipient@example.com\r\nBcc:other@example.com' },
  { ...payload, to: 'invalid' }, { ...payload, to: 'a@-example.com' },
  { ...payload, subject: '' }, { ...payload, subject: '   ' },
  { ...payload, subject: 'x'.repeat(201) }, { ...payload, subject: 'test\r\nBcc:other@example.com' },
  { ...payload, text: '' }, { ...payload, text: '  ', html: '\n' },
  { ...payload, text: { path: '/private/file' } }, { ...payload, html: { href: 'http://private' } },
  { ...payload, cc: 'other@example.com' }, { ...payload, bcc: 'other@example.com' },
  { ...payload, from: 'attacker@example.com' }, { ...payload, attachments: [] },
  { ...payload, headers: {} }, { ...payload, text: 'a'.repeat(51201) },
  { ...payload, text: 'a'.repeat(25601), html: 'b'.repeat(25600) },
  { ...payload, text: 'é'.repeat(25601) },
])('rejects invalid payload %# without contacting SMTP', async (body) => {
  const response = await post(body);
  expect(response.status).toBe(400);
  expect(response.body.message).toEqual(expect.any(String));
  expect(nodemailer.createTransport).not.toHaveBeenCalled();
});

test('accepts exactly 50 KB of UTF-8 content and 200 subject characters', async () => {
  const response = await post({ ...payload, subject: 'x'.repeat(200), text: 'é'.repeat(25600) });
  expect(response.status).toBe(202);
});

test('does not echo content in malformed JSON errors', async () => {
  const response = await request(app).post('/api/emails')
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'application/json')
    .send('{"text":"Private message", broken}');
  expect(response.status).toBe(400);
  expect(response.body).toEqual({ message: 'Invalid JSON body' });
  expect(nodemailer.createTransport).not.toHaveBeenCalled();
});

test('keeps the global HTTP body limit and never opens SMTP for an oversized request', async () => {
  const response = await post({ ...payload, text: 'x'.repeat(110000) });
  expect(response.status).toBe(413);
  expect(nodemailer.createTransport).not.toHaveBeenCalled();
});

test.each(['SMTP_USER', 'SMTP_PASS', 'SMTP_FROM_EMAIL', 'EMAIL_SERVICE_TOKEN'])(
  'returns 503 when %s is missing without opening SMTP', async (key) => {
    delete process.env[key];
    expect((await post()).status).toBe(503);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  },
);

test.each([
  ['SMTP_PORT', 'invalid'], ['SMTP_PORT', '0'], ['SMTP_PORT', '65536'],
  ['SMTP_FROM_EMAIL', 'invalid'], ['SMTP_FROM_NAME', 'Cluster\r\nBcc:test@example.com'],
  ['EMAIL_SERVICE_TOKEN', 'invalid token'],
])('returns 503 for invalid %s', async (key, value) => {
  process.env[key] = value;
  expect((await post()).status).toBe(503);
  expect(nodemailer.createTransport).not.toHaveBeenCalled();
});

test('blocks SMTP in the local harness, including with valid credentials', async () => {
  isLocalHarness.mockReturnValue(true);
  expect((await post()).status).toBe(503);
  expect(nodemailer.createTransport).not.toHaveBeenCalled();
});

test.each(['EAUTH', 'EENVELOPE', 'ECONNECTION', 'ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT'])(
  'maps %s safely without retrying or leaking credentials/content', async (code) => {
    sendMail.mockRejectedValue(Object.assign(new Error('secret-smtp-password Private message'), {
      code, response: 'secret-smtp-password',
    }));
    const response = await post();
    expect(response.status).toBe(code.includes('TIMEDOUT') ? 504 : 502);
    expect(response.body).toEqual({ message: expect.any(String) });
    expect(JSON.stringify(response.body)).not.toMatch(/secret-smtp-password|Private message/);
    const logs = JSON.stringify([logger.info.mock.calls, logger.warn.mock.calls, logger.error.mock.calls]);
    expect(logs).not.toMatch(/secret-smtp-password|Private message|recipient@example.com|test-only-service-token/);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  },
);

test.each([
  { accepted: [], rejected: [payload.to], messageId: '<id>' },
  { accepted: ['other@example.com'], messageId: '<id>' },
  { accepted: [payload.to], rejected: [] },
])('does not report acceptance on an incomplete SMTP result %#', async (result) => {
  sendMail.mockResolvedValue(result);
  expect((await post()).status).toBe(502);
  expect(sendMail).toHaveBeenCalledTimes(1);
});

test('keeps other API routes protected by JWT', async () => {
  const { UnauthorizedError } = require('../../utils/errors');
  verifyAccessToken.mockRejectedValue(new UnauthorizedError());
  const response = await request(app).get('/api/jobs/mine').set('Authorization', `Bearer ${token}`);
  expect(verifyAccessToken).toHaveBeenCalledWith(token);
  expect(response.status).toBe(401);
});

test('publishes the endpoint and its server-only security scheme in docs.json', async () => {
  const response = await request(app).get('/docs.json');
  expect(response.status).toBe(200);
  const operation = response.body.paths['/api/emails'].post;
  expect(operation.security).toEqual([{ EmailServiceToken: [] }]);
  expect(operation.responses['202'].content['application/json'].schema.$ref)
    .toBe('#/components/schemas/EmailAccepted');
  expect(response.body.components.schemas.EmailRequest.additionalProperties).toBe(false);
  expect(response.body.components.securitySchemes.EmailServiceToken.scheme).toBe('bearer');
  expect(verifyAccessToken).not.toHaveBeenCalled();
});
