const { sendEmail } = require('../services/emailService');
const { ValidationError } = require('../utils/errors');
const { success } = require('../utils/response');
const { isEmailAddress } = require('../utils/emailValidation');

const MAX_CONTENT_BYTES = 50 * 1024;

function validateMessage(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Expected an email object');
  }
  if (Object.keys(body).some((key) => !['to', 'subject', 'text', 'html'].includes(key))) {
    throw new ValidationError('Only to, subject, text and html are supported');
  }
  if (!isEmailAddress(body.to)) throw new ValidationError('to must contain one valid email address');
  if (typeof body.subject !== 'string' || !body.subject.trim()
      || body.subject.length > 200 || /[\r\n\x00]/.test(body.subject)) {
    throw new ValidationError('subject must contain 1 to 200 characters without line breaks');
  }
  for (const field of ['text', 'html']) {
    if (body[field] !== undefined && typeof body[field] !== 'string') {
      throw new ValidationError(`${field} must be a string`);
    }
  }
  if (!body.text?.trim() && !body.html?.trim()) {
    throw new ValidationError('Provide non-empty text or html');
  }
  if (Buffer.byteLength(body.text || '', 'utf8') + Buffer.byteLength(body.html || '', 'utf8') > MAX_CONTENT_BYTES) {
    throw new ValidationError('Email content must not exceed 50 KB');
  }
  return { to: body.to, subject: body.subject.trim(), text: body.text, html: body.html };
}

async function createEmail(req, res, next) {
  try {
    const message = validateMessage(req.body);
    const result = await sendEmail(message, req.authRequestId);
    return success(res, result, 202);
  } catch (error) {
    return next(error);
  }
}

module.exports = { createEmail };
