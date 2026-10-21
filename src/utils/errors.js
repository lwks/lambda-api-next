class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

class ValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.details = details;
  }
}

class ExternalServiceError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ExternalServiceError';
    this.statusCode = 502;
    this.details = details;
  }
}

class AuthConfigurationError extends Error {
  constructor() {
    super('Authentication service is not configured');
    this.name = 'AuthConfigurationError';
    this.statusCode = 503;
    this.details = { reason: 'authentication_not_configured' };
  }
}

class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized', details) {
    super(message);
    this.name = 'UnauthorizedError';
    this.statusCode = 401;
    this.details = details;
  }
}

class ForbiddenError extends Error {
  constructor(message = 'Forbidden', details) {
    super(message);
    this.name = 'ForbiddenError';
    this.statusCode = 403;
    this.details = details;
  }
}

module.exports = {
  NotFoundError,
  ValidationError,
  ExternalServiceError,
  AuthConfigurationError,
  UnauthorizedError,
  ForbiddenError,
};
