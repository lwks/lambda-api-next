const { createEntityService } = require('../services/entityServiceFactory');
const { validateRequiredFields } = require('../utils/validators');
const { success, created, noContent } = require('../utils/response');
const { decodeLastKey, encodeLastKey } = require('../utils/pagination');

const candidateService = createEntityService('candidate');

async function createCandidate(req, res, next) {
  try {
    validateRequiredFields(req.body, ['fullName', 'email']);
    const candidate = await candidateService.create(req.body);
    return created(res, candidate);
  } catch (error) {
    return next(error);
  }
}

async function listCandidates(req, res, next) {
  try {
    const limitParam = Number.parseInt(req.query.limit, 10);
    const limit = Number.isNaN(limitParam) ? 20 : Math.min(Math.max(limitParam, 1), 100);
    const lastKey = decodeLastKey(req.query.lastKey);
    const result = await candidateService.list({ limit, lastKey });
    return success(res, {
      items: result.items,
      lastKey: encodeLastKey(result.lastEvaluatedKey),
    });
  } catch (error) {
    return next(error);
  }
}

async function getCandidate(req, res, next) {
  try {
    const candidate = await candidateService.findById(req.params.id);
    return success(res, candidate);
  } catch (error) {
    return next(error);
  }
}

async function updateCandidate(req, res, next) {
  try {
    const candidate = await candidateService.update(req.params.id, req.body);
    return success(res, candidate);
  } catch (error) {
    return next(error);
  }
}

async function deleteCandidate(req, res, next) {
  try {
    await candidateService.remove(req.params.id);
    return noContent(res);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createCandidate,
  listCandidates,
  getCandidate,
  updateCandidate,
  deleteCandidate,
};
