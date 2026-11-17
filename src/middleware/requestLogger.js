const { randomUUID } = require('crypto');
const { logger } = require('../utils/logger');

function routeName(req) {
  if (req.route && req.route.path) {
    return `${req.baseUrl}${req.route.path}`;
  }

  // Unknown routes can contain user supplied identifiers. Keep only a safe,
  // bounded path shape in logs.
  return req.path
    .split('/')
    .map((segment) => {
      if (!segment) return segment;
      if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ':id';
      if (/^\d{5,}$/.test(segment)) return ':id';
      return segment.slice(0, 64);
    })
    .join('/')
    .slice(0, 256);
}

function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();
  const requestId = req.apiGateway?.context?.awsRequestId
    || req.apiGateway?.event?.requestContext?.requestId
    || req.authRequestId
    || randomUUID();
  req.authRequestId = requestId;

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const statusCode = res.statusCode;
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    logger[level]('HTTP request completed', {
      requestId,
      method: req.method,
      route: routeName(req),
      statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
    });
  });

  return next();
}

module.exports = { requestLogger, routeName };
