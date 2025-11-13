const { createEntityService } = require('../services/entityServiceFactory');
const { TABLE_NAMES } = require('../config/tableNames');
const { validateRequiredFields } = require('../utils/validators');
const { success, created, noContent } = require('../utils/response');
const { decodeLastKey, encodeLastKey } = require('../utils/pagination');

const userService = createEntityService('user', TABLE_NAMES.user);

async function createUser(req, res, next) {
  try {
    validateRequiredFields(req.body, ['username', 'role']);
    const user = await userService.create(req.body);
    return created(res, user);
  } catch (error) {
    return next(error);
  }
}

async function listUsers(req, res, next) {
  try {
    const limitParam = Number.parseInt(req.query.limit, 10);
    const limit = Number.isNaN(limitParam) ? 20 : Math.min(Math.max(limitParam, 1), 100);
    const lastKey = decodeLastKey(req.query.lastKey);
    const result = await userService.list({ limit, lastKey });
    return success(res, {
      items: result.items,
      lastKey: encodeLastKey(result.lastEvaluatedKey),
    });
  } catch (error) {
    return next(error);
  }
}

async function getUser(req, res, next) {
  try {
    const user = await userService.findById(req.params.id);
    return success(res, user);
  } catch (error) {
    return next(error);
  }
}

async function updateUser(req, res, next) {
  try {
    const user = await userService.update(req.params.id, req.body);
    return success(res, user);
  } catch (error) {
    return next(error);
  }
}

async function deleteUser(req, res, next) {
  try {
    await userService.remove(req.params.id);
    return noContent(res);
  } catch (error) {
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
