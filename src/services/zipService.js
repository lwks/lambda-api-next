const { ValidationError, NotFoundError, ExternalServiceError } = require('../utils/errors');
const { logger } = require('../utils/logger');

const VIA_CEP_BASE_URL = 'https://viacep.com.br/ws';

function sanitizeZip(zip) {
  return (zip || '').replace(/\D/g, '');
}

function validateZip(zip) {
  const zipPattern = /^\d{5}-?\d{3}$/;
  if (!zipPattern.test(zip)) {
    throw new ValidationError('CEP inválido. Utilize 8 dígitos, com ou sem hífen.', { zip });
  }
}

async function fetchZipData(zip) {
  const sanitizedZip = sanitizeZip(zip);
  if (!/^\d{8}$/.test(sanitizedZip)) {
    throw new ValidationError('CEP inválido. Utilize 8 dígitos, com ou sem hífen.', { zip });
  }

  const url = `${VIA_CEP_BASE_URL}/${sanitizedZip}/json/`;
  logger.info('Consultando ViaCEP', { zip: sanitizedZip, url });

  try {
    const response = await fetch(url);

    if (!response.ok) {
      logger.error('ViaCEP retornou status inesperado', { status: response.status, zip: sanitizedZip });
      throw new ExternalServiceError('Falha ao consultar serviço de CEP.');
    }

    const payload = await response.json();

    if (payload.erro) {
      logger.warn('CEP não encontrado na ViaCEP', { zip: sanitizedZip });
      throw new NotFoundError(`CEP ${sanitizedZip} não encontrado.`);
    }

    if (!payload.uf || !payload.localidade) {
      logger.error('Resposta da ViaCEP incompleta', { zip: sanitizedZip, payload });
      throw new ExternalServiceError('Resposta inesperada do serviço de CEP.');
    }

    logger.info('ViaCEP retornou localização', { zip: sanitizedZip, uf: payload.uf, localidade: payload.localidade });
    return {
      state: payload.uf,
      city: payload.localidade,
    };
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof ExternalServiceError) {
      throw error;
    }

    logger.error('Erro ao consultar ViaCEP', {
      zip: sanitizedZip,
      error: error.message,
      stack: error.stack,
    });
    throw new ExternalServiceError('Erro de rede ao consultar serviço de CEP.');
  }
}

async function getLocationByZip(zip) {
  validateZip(zip);
  return fetchZipData(zip);
}

module.exports = { getLocationByZip };
