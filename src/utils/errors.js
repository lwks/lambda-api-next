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

module.exports = {
  NotFoundError,
  ValidationError,
  ExternalServiceError,
};
