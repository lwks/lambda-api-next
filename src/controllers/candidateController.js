const { createEntityService } = require('../services/entityServiceFactory');
const { TABLE_NAMES } = require('../config/tableNames');
const { success, created } = require('../utils/response');
const { decodeLastKey, encodeLastKey } = require('../utils/pagination');
const { ValidationError } = require('../utils/errors');
const { logger } = require('../utils/logger');
const cvStorage = require('../services/cvStorageService');
const jobService = createEntityService('job', TABLE_NAMES.job);
const { ForbiddenError } = require('../utils/errors');
const applications = require('../services/candidateApplicationService');

const candidateService = createEntityService('candidate', TABLE_NAMES.candidate);

async function createCandidate(req, res, next) {
  try {
    logger.info('Received request to create candidate');
    const body = req.body || {};
    const profile = Object.fromEntries(applications.PROFILE_FIELDS.filter(field => body[field] !== undefined).map(field => [field, body[field]]));
    const existingProfile = await applications.getProfile(req.auth.sub);
    const application = await applications.createApplication(req.auth, {
      guid_vaga: body.guid_vaga, mode: 'UPDATE_PROFILE', profile,
      ...(existingProfile ? { profileVersion: existingProfile.version } : {}),
      application: { mensagemEmpresa: body.mensagemEmpresa || '', pretensaoSalarial: body.pretensaoSalarial || '',
        compartilhamentoAccepted: body.compartilhamentoAccepted, lgpdAccepted: body.lgpdAccepted,
        cvAction: body.cv ? 'REPLACE' : 'KEEP', cv: body.cv },
    }, { legacyCv: Boolean(body.cv) });
    return created(res, application);
  } catch (error) {
    logger.error('Failed to create candidate', { error: error.message, stack: error.stack });
    return next(error);
  }
}

async function listCandidatesByJobGuids(req, res, next) {
  try {
    logger.info('Received request to list candidates by guid_vaga', { query: req.query });
    const { guid_vaga: rawJobGuids } = req.query || {};
    const jobGuids = Array.isArray(rawJobGuids) ? rawJobGuids : [rawJobGuids];

    const normalizedJobGuids = [...new Set(
      jobGuids
        .filter((guid) => typeof guid === 'string')
        .flatMap((guid) => guid.split(','))
        .map((guid) => guid.trim())
        .filter(Boolean),
    )];

    if (normalizedJobGuids.length === 0) {
      throw new ValidationError('guid_vaga must contain at least one non-empty string');
    }
    for (const guid of normalizedJobGuids) {
      const job = await jobService.findById(guid);
      if (!req.auth?.sub || job.owner_sub !== req.auth.sub) throw new ForbiddenError('Company does not own this vacancy');
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
    const ownedJobs = await jobService.listByFieldValue({ field: 'owner_sub', value: req.auth.sub });
    const ownedIds = ownedJobs.map(job => job.guid_id);
    const items = ownedIds.length ? await candidateService.listByFieldValues({ field: 'guid_vaga', values: ownedIds }) : [];
    items.sort((a, b) => String(a.guid_id).localeCompare(String(b.guid_id)));
    const afterCursor = lastKey?.guid_id ? items.filter(item => String(item.guid_id) > String(lastKey.guid_id)) : items;
    const page = afterCursor.slice(0, limit);
    const result = { items: page, lastEvaluatedKey: afterCursor.length > limit ? { guid_id: page.at(-1).guid_id } : undefined };
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
    await assertCompanyOwnsCandidate(req.auth, candidate);
    logger.info('Candidate fetched from DynamoDB', { candidateId: candidate.id });
    return success(res, candidate);
  } catch (error) {
    logger.error('Failed to fetch candidate', { params: req.params, error: error.message, stack: error.stack });
    return next(error);
  }
}

async function updateCandidate(req, res, next) {
  try {
    logger.info('Received request to update candidate', { params: req.params });
    const existing = await candidateService.findById(req.params.id);
    await assertCompanyOwnsCandidate(req.auth, existing);
    const allowed = ['status', 'anotacoes'];
    if (Object.keys(req.body || {}).some(field => !allowed.includes(field))) throw new ValidationError('Only status and notes can be updated');
    if (existing.guid_vaga) {
      const job = await jobService.findById(existing.guid_vaga);
      if (job.owner_sub !== req.auth?.sub) {
        const { ForbiddenError } = require('../utils/errors');
        throw new ForbiddenError('Company does not own this vacancy');
      }
      if (job.status === 'Encerrada') throw new ValidationError('Applications for a closed vacancy are read-only');
    }
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
    const candidate = await candidateService.findById(req.params.id);
    await assertCompanyOwnsCandidate(req.auth, candidate);
    throw new ForbiddenError('Application history cannot be deleted');
  } catch (error) {
    logger.error('Failed to delete candidate', { params: req.params, error: error.message, stack: error.stack });
    return next(error);
  }
}

async function assertCompanyOwnsCandidate(auth, candidate) {
  if (!auth?.sub || !candidate.guid_vaga) throw new ForbiddenError('Company does not own this vacancy');
  const job = await jobService.findById(candidate.guid_vaga);
  if (job.owner_sub !== auth.sub) throw new ForbiddenError('Company does not own this vacancy');
}

async function createCvUpload(req, res, next) {
  try { return success(res, await cvStorage.createUpload(req.auth, req.body || {})); }
  catch (error) { return next(error); }
}

async function getCvDownload(req, res, next) {
  try { return success(res, await cvStorage.createDownload(req.auth, req.params.id)); }
  catch (error) { return next(error); }
}

module.exports = {
  createCandidate,
  listCandidates,
  listCandidatesByJobGuids,
  getCandidate,
  updateCandidate,
  deleteCandidate,
  createCvUpload,
  getCvDownload,
};
