const {
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const { documentClient } = require('../aws_services/dynamoClient');
const { TABLE_NAMES } = require('../config/tableNames');
const { NotFoundError } = require('../utils/errors');
const { logger } = require('../utils/logger');

const TABLE_NAME = TABLE_NAMES.domain;
const TECHNICAL_KEY_FIELDS = new Set(['tipo', 'codigo', 'code']);

function ensureTableName() {
  if (!TABLE_NAME) {
    throw new Error('Table name for entity "domain" must be defined. Set DOMAIN_TABLE_NAME.');
  }

  return TABLE_NAME;
}

function buildCodigo(code) {
  return `ITEM#${code}`;
}

function extractCodeFromCodigo(codigo) {
  if (typeof codigo !== 'string') {
    return undefined;
  }

  return codigo.startsWith('ITEM#') ? codigo.slice(5) : codigo;
}

function normalizeDomainItem(item) {
  if (!item) {
    return item;
  }

  return {
    ...item,
    code: item.code || extractCodeFromCodigo(item.codigo),
  };
}

function buildUpdateExpression(updates) {
  const keys = Object.keys(updates).filter((key) => updates[key] !== undefined && !TECHNICAL_KEY_FIELDS.has(key));
  if (keys.length === 0) {
    return null;
  }

  const expressionParts = keys.map((key, index) => `#field${index} = :value${index}`);
  const attributeNames = keys.reduce((acc, key, index) => ({
    ...acc,
    [`#field${index}`]: key,
  }), {});
  const attributeValues = keys.reduce((acc, key, index) => ({
    ...acc,
    [`:value${index}`]: updates[key],
  }), {});

  return {
    UpdateExpression: `SET ${expressionParts.join(', ')}`,
    ExpressionAttributeNames: attributeNames,
    ExpressionAttributeValues: attributeValues,
  };
}

async function create(domain) {
  const tableName = ensureTableName();
  const item = {
    ...domain,
    codigo: buildCodigo(domain.code),
  };

  logger.info('Persisting domain in DynamoDB', { tableName, item });
  await documentClient.send(new PutCommand({
    TableName: tableName,
    Item: item,
  }));

  return normalizeDomainItem(item);
}

async function findByCode(tipo, code) {
  const tableName = ensureTableName();
  logger.info('Fetching domain from DynamoDB by code', { tableName, tipo, code });

  const response = await documentClient.send(new GetCommand({
    TableName: tableName,
    Key: {
      tipo,
      codigo: buildCodigo(code),
    },
  }));

  if (!response.Item) {
    logger.warn('Domain not found during fetch by code', { tipo, code });
    throw new NotFoundError(`domain with tipo ${tipo} and code ${code} not found`);
  }

  return normalizeDomainItem(response.Item);
}

async function updateByKey(tipo, codigo, updates) {
  const tableName = ensureTableName();
  const updateExpression = buildUpdateExpression(updates);

  if (!updateExpression) {
    const response = await documentClient.send(new GetCommand({
      TableName: tableName,
      Key: { tipo, codigo },
    }));

    if (!response.Item) {
      throw new NotFoundError(`domain with tipo ${tipo} and codigo ${codigo} not found`);
    }

    return normalizeDomainItem(response.Item);
  }

  try {
    logger.info('Updating domain in DynamoDB', { tableName, tipo, codigo, updates });
    const response = await documentClient.send(new UpdateCommand({
      TableName: tableName,
      Key: { tipo, codigo },
      ...updateExpression,
      ConditionExpression: 'attribute_exists(#tipo) AND attribute_exists(#codigo)',
      ExpressionAttributeNames: {
        ...updateExpression.ExpressionAttributeNames,
        '#tipo': 'tipo',
        '#codigo': 'codigo',
      },
      ReturnValues: 'ALL_NEW',
    }));

    return normalizeDomainItem(response.Attributes);
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      logger.warn('Domain not found during update', { tipo, codigo });
      throw new NotFoundError(`domain with tipo ${tipo} and codigo ${codigo} not found`);
    }

    logger.error('Failed to update domain in DynamoDB', {
      tipo,
      codigo,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

async function updateByCode(tipo, code, updates) {
  return updateByKey(tipo, buildCodigo(code), updates);
}

async function list({ limit = 20, lastKey, tipo, active } = {}) {
  const tableName = ensureTableName();
  const hasActiveFilter = typeof active === 'boolean';

  if (tipo) {
    const params = {
      TableName: tableName,
      KeyConditionExpression: '#tipo = :tipo',
      ExpressionAttributeNames: {
        '#tipo': 'tipo',
      },
      ExpressionAttributeValues: {
        ':tipo': tipo,
      },
      Limit: limit,
    };

    if (hasActiveFilter) {
      params.FilterExpression = '#active = :active';
      params.ExpressionAttributeNames['#active'] = 'active';
      params.ExpressionAttributeValues[':active'] = active;
    }

    if (lastKey) {
      params.ExclusiveStartKey = lastKey;
    }

    logger.info('Querying domains from DynamoDB by tipo', {
      tableName,
      tipo,
      limit,
      hasActiveFilter,
      hasLastKey: Boolean(lastKey),
    });

    const response = await documentClient.send(new QueryCommand(params));
    return {
      items: (response.Items || []).map(normalizeDomainItem),
      lastEvaluatedKey: response.LastEvaluatedKey,
    };
  }

  const params = {
    TableName: tableName,
    Limit: limit,
  };

  if (hasActiveFilter) {
    params.FilterExpression = '#active = :active';
    params.ExpressionAttributeNames = {
      '#active': 'active',
    };
    params.ExpressionAttributeValues = {
      ':active': active,
    };
  }

  if (lastKey) {
    params.ExclusiveStartKey = lastKey;
  }

  logger.info('Scanning domains from DynamoDB', {
    tableName,
    limit,
    hasActiveFilter,
    hasLastKey: Boolean(lastKey),
  });

  const response = await documentClient.send(new ScanCommand(params));
  return {
    items: (response.Items || []).map(normalizeDomainItem),
    lastEvaluatedKey: response.LastEvaluatedKey,
  };
}

module.exports = {
  buildCodigo,
  create,
  findByCode,
  list,
  normalizeDomainItem,
  updateByCode,
  updateByKey,
};
