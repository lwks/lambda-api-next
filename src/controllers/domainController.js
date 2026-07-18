const domainService = require('../services/domainService');
const { success } = require('../utils/response');
const { ValidationError, NotImplementedError } = require('../utils/errors');
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

function createWriteDisabledError() {
  return new NotImplementedError('Domain write operations are disabled while SQL Server migration is in progress');
}

async function listDomains(req, res, next) {
  try {
    logger.info('Received request to list domains', { query: req.query });
    const limit = parseLimit(req.query.limit);
    const active = parseActiveQuery(req.query.active);

    if (!req.query.tipo) {
      throw new ValidationError('tipo query param is required');
    }

    const result = await domainService.list({
      limit,
      tipo: req.query.tipo,
      active,
    });

    return success(res, {
      items: result.items,
      lastKey: null,
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
    throw createWriteDisabledError();
  } catch (error) {
    logger.error('Failed to create domain', { error: error.message, stack: error.stack });
    return next(error);
  }
}

async function updateDomainByCode(req, res, next) {
  try {
    logger.info('Received request to update domain by code', { params: req.params, body: req.body });
    throw createWriteDisabledError();
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
    throw createWriteDisabledError();
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
