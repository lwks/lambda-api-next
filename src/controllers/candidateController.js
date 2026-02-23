const { createEntityService } = require('../services/entityServiceFactory');
const { TABLE_NAMES } = require('../config/tableNames');
const { validateRequiredFields } = require('../utils/validators');
const { success, created, noContent } = require('../utils/response');
const { decodeLastKey, encodeLastKey } = require('../utils/pagination');
const { ValidationError } = require('../utils/errors');
const { logger } = require('../utils/logger');

const candidateService = createEntityService('candidate', TABLE_NAMES.candidate);

async function createCandidate(req, res, next) {
  try {
    logger.info('Received request to create candidate', { body: req.body });
    logger.info('Validating required fields for candidate creation', { requiredFields: ['guid_id', 'guid_vaga'] });
    validateRequiredFields(req.body, ['guid_id', 'guid_vaga']);
    logger.info('Validation succeeded for candidate creation');
    const candidate = await candidateService.create(req.body);
    logger.info('Candidate persisted in DynamoDB', { candidateId: candidate.id });
    return created(res, candidate);
  } catch (error) {
    logger.error('Failed to create candidate', { error: error.message, stack: error.stack });
    return next(error);
  }
}

async function listCandidatesByJobGuids(req, res, next) {
  try {
    logger.info('Received request to list candidates by guid_vaga', { body: req.body });
    const { guid_vaga: jobGuids } = req.body || {};

    if (!Array.isArray(jobGuids) || jobGuids.length === 0) {
      throw new ValidationError('guid_vaga must be a non-empty array of strings');
    }

    const normalizedJobGuids = [...new Set(
      jobGuids
        .filter((guid) => typeof guid === 'string')
        .map((guid) => guid.trim())
        .filter(Boolean),
    )];

    if (normalizedJobGuids.length === 0) {
      throw new ValidationError('guid_vaga must contain at least one non-empty string');
    }

    logger.info('Listing candidates by guid_vaga list', { jobGuidCount: normalizedJobGuids.length });
    const candidates = await candidateService.listByFieldValues({
      field: 'guid_vaga',
      values: normalizedJobGuids,
    });

    logger.info('Candidates filtered by guid_vaga', { itemCount: candidates.length });
    return success(res, { items: candidates, total: candidates.length });
  } catch (error) {
    logger.error('Failed to list candidates by guid_vaga', { error: error.message, stack: error.stack });
    return next(error);
  }
}

async function listCandidates(req, res, next) {
  try {
    logger.info('Received request to list candidates', { query: req.query });
    const limitParam = Number.parseInt(req.query.limit, 10);
    const limit = Number.isNaN(limitParam) ? 20 : Math.min(Math.max(limitParam, 1), 100);
    const lastKey = decodeLastKey(req.query.lastKey);
    logger.info('Listing candidates with pagination parameters', { limit, hasLastKey: Boolean(lastKey) });
    const result = await candidateService.list({ limit, lastKey });
    if (!result.items || result.items.length === 0) {
      logger.warn('Candidate list returned no items', { limit, hasLastKey: Boolean(lastKey) });
    }
    logger.info('Candidate list retrieved from DynamoDB', {
      itemCount: result.items ? result.items.length : 0,
      hasMore: Boolean(result.lastEvaluatedKey),
    });
    return success(res, {
      items: result.items,
      lastKey: encodeLastKey(result.lastEvaluatedKey),
    });
  } catch (error) {
    logger.error('Failed to list candidates', { error: error.message, stack: error.stack });
    return next(error);
  }
}

async function getCandidate(req, res, next) {
  try {
    logger.info('Received request to fetch candidate', { params: req.params });
    const candidate = await candidateService.findById(req.params.id);
    logger.info('Candidate fetched from DynamoDB', { candidateId: candidate.id });
    return success(res, candidate);
  } catch (error) {
    logger.error('Failed to fetch candidate', { params: req.params, error: error.message, stack: error.stack });
    return next(error);
  }
}

async function updateCandidate(req, res, next) {
  try {
    logger.info('Received request to update candidate', { params: req.params, body: req.body });
    const candidate = await candidateService.update(req.params.id, req.body);
    logger.info('Candidate updated in DynamoDB', { candidateId: candidate.id });
    return success(res, candidate);
  } catch (error) {
    logger.error('Failed to update candidate', {
      params: req.params,
      error: error.message,
      stack: error.stack,
    });
    return next(error);
  }
}

async function deleteCandidate(req, res, next) {
  try {
    logger.info('Received request to delete candidate', { params: req.params });
    await candidateService.remove(req.params.id);
    logger.info('Candidate removed from DynamoDB', { candidateId: req.params.id });
    return noContent(res);
  } catch (error) {
    logger.error('Failed to delete candidate', { params: req.params, error: error.message, stack: error.stack });
    return next(error);
  }
}

module.exports = {
  createCandidate,
  listCandidates,
  listCandidatesByJobGuids,
  getCandidate,
  updateCandidate,
  deleteCandidate,
};
