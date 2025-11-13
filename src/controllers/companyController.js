const { createEntityService } = require('../services/entityServiceFactory');
const { TABLE_NAMES } = require('../config/tableNames');
const { validateRequiredFields } = require('../utils/validators');
const { success, created, noContent } = require('../utils/response');
const { decodeLastKey, encodeLastKey } = require('../utils/pagination');

const companyService = createEntityService('company', TABLE_NAMES.company);

async function createCompany(req, res, next) {
  try {
    validateRequiredFields(req.body, ['cd_cnpj']);
    const company = await companyService.create(req.body);
    return created(res, company);
  } catch (error) {
    return next(error);
  }
}

async function listCompanies(req, res, next) {
  try {
    const limitParam = Number.parseInt(req.query.limit, 10);
    const limit = Number.isNaN(limitParam) ? 20 : Math.min(Math.max(limitParam, 1), 100);
    const lastKey = decodeLastKey(req.query.lastKey);
    const result = await companyService.list({ limit, lastKey });
    return success(res, {
      items: result.items,
      lastKey: encodeLastKey(result.lastEvaluatedKey),
    });
  } catch (error) {
    return next(error);
  }
}

async function getCompany(req, res, next) {
  try {
    const company = await companyService.findById(req.params.id);
    return success(res, company);
  } catch (error) {
    return next(error);
  }
}

async function updateCompany(req, res, next) {
  try {
    const company = await companyService.update(req.params.id, req.body);
    return success(res, company);
  } catch (error) {
    return next(error);
  }
}

async function deleteCompany(req, res, next) {
  try {
    await companyService.remove(req.params.id);
    return noContent(res);
  } catch (error) {
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
