const { createEntityService } = require('../services/entityServiceFactory');
const { TABLE_NAMES } = require('../config/tableNames');
const { validateRequiredFields } = require('../utils/validators');
const { success, created, noContent } = require('../utils/response');
const { decodeLastKey, encodeLastKey } = require('../utils/pagination');
const { logger } = require('../utils/logger');

const companyService = createEntityService('company', TABLE_NAMES.company);

async function createCompany(req, res, next) {
  try {
    logger.info('Received request to create company', { body: req.body });
    logger.info('Validating required fields for company creation', { requiredFields: ['cd_cnpj'] });
    validateRequiredFields(req.body, ['cd_cnpj']);
    logger.info('Validation succeeded for company creation');
    const company = await companyService.create(req.body);
    logger.info('Company persisted in DynamoDB', { companyId: company.id });
    return created(res, company);
  } catch (error) {
    logger.error('Failed to create company', { error: error.message, stack: error.stack });
    return next(error);
  }
}

async function listCompanies(req, res, next) {
  try {
    logger.info('Received request to list companies', { query: req.query });
    const limitParam = Number.parseInt(req.query.limit, 10);
    const limit = Number.isNaN(limitParam) ? 20 : Math.min(Math.max(limitParam, 1), 100);
    const lastKey = decodeLastKey(req.query.lastKey);
    logger.info('Listing companies with pagination parameters', { limit, hasLastKey: Boolean(lastKey) });
    const result = await companyService.list({ limit, lastKey });
    if (!result.items || result.items.length === 0) {
      logger.warn('Company list returned no items', { limit, hasLastKey: Boolean(lastKey) });
    }
    logger.info('Company list retrieved from DynamoDB', {
      itemCount: result.items ? result.items.length : 0,
      hasMore: Boolean(result.lastEvaluatedKey),
    });
    return success(res, {
      items: result.items,
      lastKey: encodeLastKey(result.lastEvaluatedKey),
    });
  } catch (error) {
    logger.error('Failed to list companies', { error: error.message, stack: error.stack });
    return next(error);
  }
}

async function getCompany(req, res, next) {
  try {
    logger.info('Received request to fetch company', { params: req.params });
    const company = await companyService.findById(req.params.id);
    logger.info('Company fetched from DynamoDB', { companyId: company.id });
    return success(res, company);
  } catch (error) {
    logger.error('Failed to fetch company', { params: req.params, error: error.message, stack: error.stack });
    return next(error);
  }
}

async function updateCompany(req, res, next) {
  try {
    logger.info('Received request to update company', { params: req.params, body: req.body });
    const company = await companyService.update(req.params.id, req.body);
    logger.info('Company updated in DynamoDB', { companyId: company.id });
    return success(res, company);
  } catch (error) {
    logger.error('Failed to update company', {
      params: req.params,
      error: error.message,
      stack: error.stack,
    });
    return next(error);
  }
}

async function deleteCompany(req, res, next) {
  try {
    logger.info('Received request to delete company', { params: req.params });
    await companyService.remove(req.params.id);
    logger.info('Company removed from DynamoDB', { companyId: req.params.id });
    return noContent(res);
  } catch (error) {
    logger.error('Failed to delete company', { params: req.params, error: error.message, stack: error.stack });
    return next(error);
  }
}

module.exports = {
  createCompany,
  listCompanies,
  getCompany,
  updateCompany,
  deleteCompany,
};
