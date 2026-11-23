const { createHash, timingSafeEqual, randomUUID } = require('crypto');
const { UnauthorizedError } = require('../utils/errors');
const { unavailable } = require('../config/email');

function digest(value) {
  return createHash('sha256').update(value).digest();
}

function emailAuth(req, res, next) {
  const expected = process.env.EMAIL_SERVICE_TOKEN;
  if (!expected || !/^\S+$/.test(expected)) return next(unavailable());
  const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || '');
  if (!match || !timingSafeEqual(digest(match[1]), digest(expected))) {
    return next(new UnauthorizedError());
  }
  req.authRequestId = req.authRequestId
    || req.apiGateway?.context?.awsRequestId
    || req.apiGateway?.event?.requestContext?.requestId
    || randomUUID();
  return next();
}

module.exports = { emailAuth };
