const { getLocationByZip: getLocationByZipService } = require('../services/zipService');
const { success } = require('../utils/response');
const { logger } = require('../utils/logger');
const { ValidationError } = require('../utils/errors');

const zipPattern = /^\d{5}-?\d{3}$/;

async function getLocationByZip(req, res, next) {
  const { zip } = req.params;
  try {
    logger.info('Recebida requisição para consulta de CEP', { zip });
    if (!zipPattern.test(zip)) {
      logger.warn('CEP inválido informado', { zip });
      throw new ValidationError('CEP inválido. Utilize 8 dígitos, com ou sem hífen.', { zip });
    }
    const location = await getLocationByZipService(zip);
    logger.info('Localização de CEP retornada com sucesso', { zip, location });
    return success(res, location);
  } catch (error) {
    logger.error('Falha ao consultar CEP', { zip, error: error.message, stack: error.stack });
    return next(error);
  }
}

module.exports = { getLocationByZip };
