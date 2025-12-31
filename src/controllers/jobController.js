const { createEntityService } = require('../services/entityServiceFactory');
const { TABLE_NAMES } = require('../config/tableNames');
const { validateRequiredFields } = require('../utils/validators');
const { success, created, noContent } = require('../utils/response');
const { decodeLastKey, encodeLastKey } = require('../utils/pagination');
const { logger } = require('../utils/logger');

const jobService = createEntityService('job', TABLE_NAMES.job);

async function createJob(req, res, next) {
  try {
    logger.info('Received request to create job', { body: req.body });
    logger.info('Validating required fields for job creation', { requiredFields: ['guid_id'] });
    validateRequiredFields(req.body, ['guid_id']);
    logger.info('Validation succeeded for job creation');
    const job = await jobService.create(req.body);
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
      items: result.items,
      lastKey: encodeLastKey(result.lastEvaluatedKey),
    });
  } catch (error) {
    logger.error('Failed to list jobs', { error: error.message, stack: error.stack });
    return next(error);
  }
}

async function getJob(req, res, next) {
  try {
    logger.info('Received request to fetch job', { params: req.params });
    const job = await jobService.findById(req.params.id);
    logger.info('Job fetched from DynamoDB', { jobId: job.id });
    return success(res, job);
  } catch (error) {
    logger.error('Failed to fetch job', { params: req.params, error: error.message, stack: error.stack });
    return next(error);
  }
}

async function updateJob(req, res, next) {
  try {
    logger.info('Received request to update job', { params: req.params, body: req.body });
    const job = await jobService.update(req.params.id, req.body);
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
  getJob,
  updateJob,
  deleteJob,
};
