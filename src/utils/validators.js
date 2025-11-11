const { ValidationError } = require('./errors');

function validateRequiredFields(payload, requiredFields) {
  const missing = requiredFields.filter((field) => payload[field] === undefined || payload[field] === null);
  if (missing.length > 0) {
    throw new ValidationError('Missing required fields', { missing });
  }
}

module.exports = {
  validateRequiredFields,
};
