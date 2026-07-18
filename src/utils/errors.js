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

class NotImplementedError extends Error {
  constructor(message = 'Not implemented', details) {
    super(message);
    this.name = 'NotImplementedError';
    this.statusCode = 501;
    this.details = details;
  }
}

module.exports = {
  NotFoundError,
  ValidationError,
  ExternalServiceError,
  UnauthorizedError,
  ForbiddenError,
  NotImplementedError,
};
