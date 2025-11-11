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

const TABLE_NAME = process.env.TABLE_NAME;

if (!TABLE_NAME) {
  // eslint-disable-next-line no-console
  console.warn('TABLE_NAME environment variable is not set. DynamoDB commands will fail until it is configured.');
}

function ensureTableName() {
  if (!TABLE_NAME) {
    throw new Error('TABLE_NAME environment variable must be defined.');
  }
  return TABLE_NAME;
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

function createEntityService(entityType) {
  async function create(payload) {
    const item = buildItem(entityType, payload);
    await documentClient.send(new PutCommand({
      TableName: ensureTableName(),
      Item: item,
    }));
    return item;
  }

  async function findById(id) {
    const { pk, sk } = buildKeys(entityType, id);
    const response = await documentClient.send(new GetCommand({
      TableName: ensureTableName(),
      Key: { pk, sk },
    }));

    if (!response.Item) {
      throw new NotFoundError(`${entityType} with id ${id} not found`);
    }

    return response.Item;
  }

  async function update(id, updates) {
    const { pk, sk } = buildKeys(entityType, id);
    const updateExpression = buildUpdateExpression(updates);

    if (!updateExpression) {
      return findById(id);
    }

    try {
      const response = await documentClient.send(new UpdateCommand({
        TableName: ensureTableName(),
        Key: { pk, sk },
        ...updateExpression,
        ConditionExpression: 'attribute_exists(pk)',
        ReturnValues: 'ALL_NEW',
      }));

      return response.Attributes;
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new NotFoundError(`${entityType} with id ${id} not found`);
      }
      throw error;
    }
  }

  async function remove(id) {
    const { pk, sk } = buildKeys(entityType, id);
    try {
      await documentClient.send(new DeleteCommand({
        TableName: ensureTableName(),
        Key: { pk, sk },
        ConditionExpression: 'attribute_exists(pk)',
      }));
      return true;
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new NotFoundError(`${entityType} with id ${id} not found`);
      }
      throw error;
    }
  }

  async function list({ limit = 20, lastKey } = {}) {
    const params = {
      TableName: ensureTableName(),
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

    const response = await documentClient.send(new ScanCommand(params));

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
