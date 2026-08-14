const areaService = require('../services/areaService');
const { success } = require('../utils/response');
const { logger } = require('../utils/logger');

async function listAreas(req, res, next) {
  try {
    const areas = await areaService.list();
    return success(res, areas);
  } catch (error) {
    logger.error('Failed to list areas', { error: error.message, stack: error.stack });
    return next(error);
  }
}

module.exports = {
  listAreas,
};
