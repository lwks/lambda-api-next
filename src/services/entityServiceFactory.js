const { v4: uuidv4 } = require('uuid');
const {
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb');
const { documentClient } = require('../aws_services/dynamoClient');
const { NotFoundError } = require('../utils/errors');
const { logger } = require('../utils/logger');

function resolveTableName(entityType, providedTableName) {
  return (
    providedTableName ||
    process.env[`${entityType.toUpperCase()}_TABLE_NAME`] ||
    process.env.TABLE_NAME
  );
}

function ensureTableName(entityType, tableName) {
  if (!tableName) {
    throw new Error(
      `Table name for entity "${entityType}" must be defined. Set ${entityType.toUpperCase()}_TABLE_NAME or TABLE_NAME.`,
    );
  }
  return tableName;
}

function buildKeys(entityType, id) {
  return {
    pk: `${entityType.toUpperCase()}#${id}`,
    sk: 'ENTITY',
  };
}

function buildItem(entityType, payload) {
  const now = new Date().toISOString();
  const id = payload.id || uuidv4();

  return {
    ...payload,
    id,
    entityType,
    ...buildKeys(entityType, id),
    createdAt: payload.createdAt || now,
    updatedAt: now,
  };
}

function buildUpdateExpression(updates) {
  const keys = Object.keys(updates).filter((key) => updates[key] !== undefined && key !== 'id' && key !== 'entityType');
  if (keys.length === 0) {
    return null;
  }

  const expressionParts = keys.map((key, index) => `#field${index} = :value${index}`);
  const ExpressionAttributeNames = keys.reduce((acc, key, index) => ({
    ...acc,
    [`#field${index}`]: key,
  }), { '#updatedAt': 'updatedAt' });
  const ExpressionAttributeValues = keys.reduce((acc, key, index) => ({
    ...acc,
    [`:value${index}`]: updates[key],
  }), { ':updatedAt': new Date().toISOString() });

  return {
    UpdateExpression: `SET ${expressionParts.join(', ')}, #updatedAt = :updatedAt`,
    ExpressionAttributeNames,
    ExpressionAttributeValues,
  };
}

function createEntityService(entityType, providedTableName) {
  const tableName = ensureTableName(entityType, resolveTableName(entityType, providedTableName));

  async function create(payload) {
    const item = buildItem(entityType, payload);
    logger.info('Persisting entity in DynamoDB', { entityType, tableName, item });
    await documentClient.send(new PutCommand({
      TableName: tableName,
      Item: item,
    }));
    logger.info('Entity persisted successfully', { entityType, id: item.id });
    return item;
  }

  async function findById(id) {
    const { pk, sk } = buildKeys(entityType, id);
    logger.info('Fetching entity from DynamoDB', { entityType, tableName, id });
    const response = await documentClient.send(new GetCommand({
      TableName: tableName,
      Key: { pk, sk },
    }));

    if (!response.Item) {
      logger.warn('Entity not found during fetch', { entityType, id });
      throw new NotFoundError(`${entityType} with id ${id} not found`);
    }

    logger.info('Entity fetched successfully', { entityType, id });
    return response.Item;
  }

  async function update(id, updates) {
    const { pk, sk } = buildKeys(entityType, id);
    const updateExpression = buildUpdateExpression(updates);

    if (!updateExpression) {
      logger.warn('No valid updates provided', { entityType, id, updates });
      return findById(id);
    }

    try {
      logger.info('Updating entity in DynamoDB', { entityType, tableName, id, updates });
      const response = await documentClient.send(new UpdateCommand({
        TableName: tableName,
        Key: { pk, sk },
        ...updateExpression,
        ConditionExpression: 'attribute_exists(pk)',
        ReturnValues: 'ALL_NEW',
      }));

      logger.info('Entity updated successfully', { entityType, id });
      return response.Attributes;
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        logger.warn('Entity not found during update', { entityType, id });
        throw new NotFoundError(`${entityType} with id ${id} not found`);
      }
      logger.error('Failed to update entity in DynamoDB', {
        entityType,
        id,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  async function remove(id) {
    const { pk, sk } = buildKeys(entityType, id);
    try {
      logger.info('Removing entity from DynamoDB', { entityType, tableName, id });
      await documentClient.send(new DeleteCommand({
        TableName: tableName,
        Key: { pk, sk },
        ConditionExpression: 'attribute_exists(pk)',
      }));
      logger.info('Entity removed successfully', { entityType, id });
      return true;
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        logger.warn('Entity not found during removal', { entityType, id });
        throw new NotFoundError(`${entityType} with id ${id} not found`);
      }
      logger.error('Failed to remove entity from DynamoDB', {
        entityType,
        id,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  async function list({ limit = 20, lastKey } = {}) {
    const params = {
      TableName: tableName,
      Limit: limit,
      FilterExpression: '#entityType = :entityType',
      ExpressionAttributeNames: {
        '#entityType': 'entityType',
      },
      ExpressionAttributeValues: {
        ':entityType': entityType,
      },
    };

    if (lastKey) {
      params.ExclusiveStartKey = lastKey;
    }

    logger.info('Scanning entities from DynamoDB', {
      entityType,
      tableName,
      limit,
      hasLastKey: Boolean(lastKey),
    });
    const response = await documentClient.send(new ScanCommand(params));
    logger.info('Entity scan completed', {
      entityType,
      itemCount: response.Items ? response.Items.length : 0,
      hasMore: Boolean(response.LastEvaluatedKey),
    });

    return {
      items: response.Items || [],
      lastEvaluatedKey: response.LastEvaluatedKey,
    };
  }

  return {
    create,
    findById,
    update,
    remove,
    list,
  };
}

module.exports = {
  createEntityService,
};
