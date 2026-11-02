const { createEntityService } = require('../services/entityServiceFactory');
const { TABLE_NAMES } = require('../config/tableNames');
const { validateRequiredFields } = require('../utils/validators');
const { success, created, noContent } = require('../utils/response');
const { decodeLastKey, encodeLastKey } = require('../utils/pagination');
const { ValidationError } = require('../utils/errors');
const { ForbiddenError } = require('../utils/errors');
const { logger } = require('../utils/logger');

const jobService = createEntityService('job', TABLE_NAMES.job);

async function createJob(req, res, next) {
  try {
    logger.info('Received request to create job', { requestId: req.authRequestId });
    logger.info('Validating required fields for job creation', { requiredFields: ['guid_id'] });
    validateRequiredFields(req.body, ['guid_id']);
    if (!req.auth?.sub) throw new ValidationError('Authenticated company identity missing');
    logger.info('Validation succeeded for job creation');
    const job = await jobService.create({ ...req.body, owner_sub: req.auth.sub });
    logger.info('Job persisted in DynamoDB', { jobId: job.id });
    return created(res, job);
  } catch (error) {
    logger.error('Failed to create job', { error: error.message, stack: error.stack });
    return next(error);
  }
}

async function listJobs(req, res, next) {
  try {
    logger.info('Received request to list jobs', { query: req.query });
    const limitParam = Number.parseInt(req.query.limit, 10);
    const limit = Number.isNaN(limitParam) ? 20 : Math.min(Math.max(limitParam, 1), 100);
    const lastKey = decodeLastKey(req.query.lastKey);
    logger.info('Listing jobs with pagination parameters', { limit, hasLastKey: Boolean(lastKey) });
    const result = await jobService.list({ limit, lastKey });
    if (!result.items || result.items.length === 0) {
      logger.warn('Job list returned no items', { limit, hasLastKey: Boolean(lastKey) });
    }
    logger.info('Job list retrieved from DynamoDB', {
      itemCount: result.items ? result.items.length : 0,
      hasMore: Boolean(result.lastEvaluatedKey),
    });
    return success(res, {
      items: result.items.map(({ motivo_encerramento, ...job }) => job),
      lastKey: encodeLastKey(result.lastEvaluatedKey),
    });
  } catch (error) {
    logger.error('Failed to list jobs', { error: error.message, stack: error.stack });
    return next(error);
  }
}

async function listCompanyJobs(req, res, next) {
  try {
    if (!req.auth?.sub) throw new ForbiddenError('Authenticated company identity missing');
    const items = await jobService.listByFieldValue({ field: 'owner_sub', value: req.auth.sub });
    return success(res, { items });
  } catch (error) {
    return next(error);
  }
}

async function closeJob(req, res, next) {
  try {
    if (!req.auth?.sub) throw new ForbiddenError('Authenticated company identity missing');
    const reason = req.body?.motivo_encerramento;
    if (reason !== undefined && (typeof reason !== 'string' || reason.trim().length > 1000)) {
      throw new ValidationError('motivo_encerramento must be a string of at most 1000 characters');
    }
    const job = await jobService.close(req.params.id, req.auth.sub, reason?.trim() || undefined);
    return success(res, job);
  } catch (error) {
    return next(error);
  }
}

async function getJob(req, res, next) {
  try {
    logger.info('Received request to fetch job', { params: req.params });
    const job = await jobService.findById(req.params.id);
    logger.info('Job fetched from DynamoDB', { jobId: job.id });
    const { motivo_encerramento, ...publicJob } = job;
    return success(res, publicJob);
  } catch (error) {
    logger.error('Failed to fetch job', { params: req.params, error: error.message, stack: error.stack });
    return next(error);
  }
}

async function updateJob(req, res, next) {
  try {
    logger.info('Received request to update job', { params: req.params, requestId: req.authRequestId });
    const updates = { ...req.body };
    delete updates.owner_sub;
    delete updates.status;
    const existing = await jobService.findById(req.params.id);
    if (req.auth?.sub && existing.owner_sub !== req.auth.sub) throw new ForbiddenError('Company does not own this vacancy');
    if (existing.status === 'Encerrada') {
      const conflict = new Error('Closed vacancies cannot be changed');
      conflict.statusCode = 409;
      throw conflict;
    }
    const job = await jobService.update(req.params.id, updates);
    logger.info('Job updated in DynamoDB', { jobId: job.id });
    return success(res, job);
  } catch (error) {
    logger.error('Failed to update job', {
      params: req.params,
      error: error.message,
      stack: error.stack,
    });
    return next(error);
  }
}

async function deleteJob(req, res, next) {
  try {
    logger.info('Received request to delete job', { params: req.params });
    const existing = await jobService.findById(req.params.id);
    if (req.auth?.sub && existing.owner_sub !== req.auth.sub) throw new ForbiddenError('Company does not own this vacancy');
    if (existing.status === 'Encerrada') {
      const conflict = new Error('Closed vacancies cannot be deleted');
      conflict.statusCode = 409;
      throw conflict;
    }
    await jobService.remove(req.params.id);
    logger.info('Job removed from DynamoDB', { jobId: req.params.id });
    return noContent(res);
  } catch (error) {
    logger.error('Failed to delete job', { params: req.params, error: error.message, stack: error.stack });
    return next(error);
  }
}

module.exports = {
  createJob,
  listJobs,
  listCompanyJobs,
  closeJob,
  getJob,
  updateJob,
  deleteJob,
};
