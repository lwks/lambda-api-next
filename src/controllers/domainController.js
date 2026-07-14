const domainService = require('../services/domainService');
const { created, success } = require('../utils/response');
const { decodeLastKey, encodeLastKey } = require('../utils/pagination');
const { ValidationError } = require('../utils/errors');
const { logger } = require('../utils/logger');

function parseLimit(limitValue) {
  const limitParam = Number.parseInt(limitValue, 10);
  return Number.isNaN(limitParam) ? 20 : Math.min(Math.max(limitParam, 1), 100);
}

function parseActiveQuery(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new ValidationError('active query param must be "true" or "false"');
}

function validateDomainPayload(payload, { requireCreateFields = false, requireTechnicalKey = false } = {}) {
  const missing = [];

  if (requireCreateFields) {
    ['tipo', 'code', 'label', 'active', 'sortOrder'].forEach((field) => {
      if (payload[field] === undefined || payload[field] === null) {
        missing.push(field);
      }
    });
  }

  if (requireTechnicalKey) {
    ['tipo', 'codigo'].forEach((field) => {
      if (payload[field] === undefined || payload[field] === null) {
        missing.push(field);
      }
    });
  }

  if (missing.length > 0) {
    throw new ValidationError('Missing required fields', { missing });
  }

  if (payload.active !== undefined && typeof payload.active !== 'boolean') {
    throw new ValidationError('active must be a boolean');
  }

  if (payload.sortOrder !== undefined && !Number.isFinite(payload.sortOrder)) {
    throw new ValidationError('sortOrder must be a number');
  }
}

async function listDomains(req, res, next) {
  try {
    logger.info('Received request to list domains', { query: req.query });
    const limit = parseLimit(req.query.limit);
    const lastKey = decodeLastKey(req.query.lastKey);
    const active = parseActiveQuery(req.query.active);

    const result = await domainService.list({
      limit,
      lastKey,
      tipo: req.query.tipo,
      active,
    });

    return success(res, {
      items: result.items,
      lastKey: encodeLastKey(result.lastEvaluatedKey),
    });
  } catch (error) {
    logger.error('Failed to list domains', { error: error.message, stack: error.stack });
    return next(error);
  }
}

async function getDomainByCode(req, res, next) {
  try {
    logger.info('Received request to fetch domain', { params: req.params });
    const domain = await domainService.findByCode(req.params.tipo, req.params.code);
    return success(res, domain);
  } catch (error) {
    logger.error('Failed to fetch domain', { params: req.params, error: error.message, stack: error.stack });
    return next(error);
  }
}

async function createDomain(req, res, next) {
  try {
    logger.info('Received request to create domain', { body: req.body });
    validateDomainPayload(req.body, { requireCreateFields: true });
    const domain = await domainService.create(req.body);
    return created(res, domain);
  } catch (error) {
    logger.error('Failed to create domain', { error: error.message, stack: error.stack });
    return next(error);
  }
}

async function updateDomainByCode(req, res, next) {
  try {
    logger.info('Received request to update domain by code', { params: req.params, body: req.body });
    validateDomainPayload(req.body);
    const domain = await domainService.updateByCode(req.params.tipo, req.params.code, req.body);
    return success(res, domain);
  } catch (error) {
    logger.error('Failed to update domain by code', {
      params: req.params,
      error: error.message,
      stack: error.stack,
    });
    return next(error);
  }
}

async function updateDomainByKey(req, res, next) {
  try {
    logger.info('Received request to update domain by key', { body: req.body });
    validateDomainPayload(req.body, { requireTechnicalKey: true });
    const domain = await domainService.updateByKey(req.body.tipo, req.body.codigo, req.body);
    return success(res, domain);
  } catch (error) {
    logger.error('Failed to update domain by key', { error: error.message, stack: error.stack });
    return next(error);
  }
}

module.exports = {
  createDomain,
  getDomainByCode,
  listDomains,
  updateDomainByCode,
  updateDomainByKey,
};
