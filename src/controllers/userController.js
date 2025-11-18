const { createEntityService } = require('../services/entityServiceFactory');
const { TABLE_NAMES } = require('../config/tableNames');
const { validateRequiredFields } = require('../utils/validators');
const { success, created, noContent } = require('../utils/response');
const { decodeLastKey, encodeLastKey } = require('../utils/pagination');
const { logger } = require('../utils/logger');

const userService = createEntityService('user', TABLE_NAMES.user);

async function createUser(req, res, next) {
  try {
    logger.info('Received request to create user', { body: req.body });
    logger.info('Validating required fields for user creation', { requiredFields: ['cd_cpf'] });
    validateRequiredFields(req.body, ['cd_cpf']);
    logger.info('Validation succeeded for user creation');
    const user = await userService.create(req.body);
    logger.info('User persisted in DynamoDB', { userId: user.id });
    return created(res, user);
  } catch (error) {
    logger.error('Failed to create user', { error: error.message, stack: error.stack });
    return next(error);
  }
}

async function listUsers(req, res, next) {
  try {
    logger.info('Received request to list users', { query: req.query });
    const limitParam = Number.parseInt(req.query.limit, 10);
    const limit = Number.isNaN(limitParam) ? 20 : Math.min(Math.max(limitParam, 1), 100);
    const lastKey = decodeLastKey(req.query.lastKey);
    logger.info('Listing users with pagination parameters', { limit, hasLastKey: Boolean(lastKey) });
    const result = await userService.list({ limit, lastKey });
    if (!result.items || result.items.length === 0) {
      logger.warn('User list returned no items', { limit, hasLastKey: Boolean(lastKey) });
    }
    logger.info('User list retrieved from DynamoDB', {
      itemCount: result.items ? result.items.length : 0,
      hasMore: Boolean(result.lastEvaluatedKey),
    });
    return success(res, {
      items: result.items,
      lastKey: encodeLastKey(result.lastEvaluatedKey),
    });
  } catch (error) {
    logger.error('Failed to list users', { error: error.message, stack: error.stack });
    return next(error);
  }
}

async function getUser(req, res, next) {
  try {
    logger.info('Received request to fetch user', { params: req.params });
    const user = await userService.findById(req.params.id);
    logger.info('User fetched from DynamoDB', { userId: user.id });
    return success(res, user);
  } catch (error) {
    logger.error('Failed to fetch user', { params: req.params, error: error.message, stack: error.stack });
    return next(error);
  }
}

async function updateUser(req, res, next) {
  try {
    logger.info('Received request to update user', { params: req.params, body: req.body });
    const user = await userService.update(req.params.id, req.body);
    logger.info('User updated in DynamoDB', { userId: user.id });
    return success(res, user);
  } catch (error) {
    logger.error('Failed to update user', {
      params: req.params,
      error: error.message,
      stack: error.stack,
    });
    return next(error);
  }
}

async function deleteUser(req, res, next) {
  try {
    logger.info('Received request to delete user', { params: req.params });
    await userService.remove(req.params.id);
    logger.info('User removed from DynamoDB', { userId: req.params.id });
    return noContent(res);
  } catch (error) {
    logger.error('Failed to delete user', { params: req.params, error: error.message, stack: error.stack });
    return next(error);
  }
}

module.exports = {
  createUser,
  listUsers,
  getUser,
  updateUser,
  deleteUser,
};
