const {
  NotFoundError,
  ValidationError,
  ExternalServiceError,
  UnauthorizedError,
  ForbiddenError,
} = require('../utils/errors');

describe('error classes', () => {
  it('configura NotFoundError corretamente', () => {
    const error = new NotFoundError('Not found');

    expect(error.name).toBe('NotFoundError');
    expect(error.message).toBe('Not found');
    expect(error.statusCode).toBe(404);
  });

  it('configura ValidationError corretamente', () => {
    const details = { field: 'guid_id' };
    const error = new ValidationError('Invalid', details);

    expect(error.name).toBe('ValidationError');
    expect(error.statusCode).toBe(400);
    expect(error.details).toBe(details);
  });

  it('configura ExternalServiceError corretamente', () => {
    const details = { provider: 'viacep' };
    const error = new ExternalServiceError('Unavailable', details);

    expect(error.name).toBe('ExternalServiceError');
    expect(error.statusCode).toBe(502);
    expect(error.details).toBe(details);
  });

  it('configura UnauthorizedError corretamente', () => {
    const details = { reason: 'invalid_token' };
    const error = new UnauthorizedError(undefined, details);

    expect(error.name).toBe('UnauthorizedError');
    expect(error.message).toBe('Unauthorized');
    expect(error.statusCode).toBe(401);
    expect(error.details).toBe(details);
  });

  it('configura ForbiddenError corretamente', () => {
    const details = { reason: 'insufficient_scope' };
    const error = new ForbiddenError(undefined, details);

    expect(error.name).toBe('ForbiddenError');
    expect(error.message).toBe('Forbidden');
    expect(error.statusCode).toBe(403);
    expect(error.details).toBe(details);
  });
});
