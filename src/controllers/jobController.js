const { createEntityService } = require('../services/entityServiceFactory');
const { validateRequiredFields } = require('../utils/validators');
const { success, created, noContent } = require('../utils/response');
const { decodeLastKey, encodeLastKey } = require('../utils/pagination');

const jobService = createEntityService('job');

async function createJob(req, res, next) {
  try {
    validateRequiredFields(req.body, ['title', 'companyId']);
    const job = await jobService.create(req.body);
    return created(res, job);
  } catch (error) {
    return next(error);
  }
}

async function listJobs(req, res, next) {
  try {
    const limitParam = Number.parseInt(req.query.limit, 10);
    const limit = Number.isNaN(limitParam) ? 20 : Math.min(Math.max(limitParam, 1), 100);
    const lastKey = decodeLastKey(req.query.lastKey);
    const result = await jobService.list({ limit, lastKey });
    return success(res, {
      items: result.items,
      lastKey: encodeLastKey(result.lastEvaluatedKey),
    });
  } catch (error) {
    return next(error);
  }
}

async function getJob(req, res, next) {
  try {
    const job = await jobService.findById(req.params.id);
    return success(res, job);
  } catch (error) {
    return next(error);
  }
}

async function updateJob(req, res, next) {
  try {
    const job = await jobService.update(req.params.id, req.body);
    return success(res, job);
  } catch (error) {
    return next(error);
  }
}

async function deleteJob(req, res, next) {
  try {
    await jobService.remove(req.params.id);
    return noContent(res);
  } catch (error) {
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
