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

const PRIMARY_KEYS = {
  candidate: 'guid_id',
  company: 'cd_cnpj',
  job: 'guid_id',
  user: 'cd_cpf',
};

function buildItem(entityType, payload) {
  const now = new Date().toISOString();
  const id = payload.id || (['job', 'candidate'].includes(entityType) ? payload.guid_id : null) || uuidv4();

  return {
    ...payload,
    id,
    entityType,
    createdAt: payload.createdAt || now,
    updatedAt: now,
  };
}

function buildUpdateExpression(updates, primaryKey) {
  const keys = Object.keys(updates).filter((key) => updates[key] !== undefined
    && key !== 'id' && key !== 'entityType' && key !== primaryKey);
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
  if (require('../harness/config').isLocalHarness()) {
    return require('../harness/store').createLocalEntityService(entityType);
  }
  const tableName = ensureTableName(entityType, resolveTableName(entityType, providedTableName));
  const primaryKey = PRIMARY_KEYS[entityType];
  if (!primaryKey) throw new Error(`Unsupported entity type: ${entityType}`);

  async function findItemById(id, { consistentRead = false } = {}) {
    const direct = await documentClient.send(new GetCommand({
      TableName: tableName,
      Key: { [primaryKey]: id },
      ConsistentRead: consistentRead,
    }));
    if (direct.Item?.entityType === entityType) return direct.Item;

    // Older records have a generated id distinct from the DynamoDB key.
    let exclusiveStartKey;
    do {
      const response = await documentClient.send(new ScanCommand({
        TableName: tableName,
        ConsistentRead: consistentRead,
        FilterExpression: '#id = :id AND #entityType = :entityType',
        ExpressionAttributeNames: { '#id': 'id', '#entityType': 'entityType' },
        ExpressionAttributeValues: { ':id': id, ':entityType': entityType },
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      }));
      if (response.Items?.length) return response.Items[0];
      exclusiveStartKey = response.LastEvaluatedKey;
    } while (exclusiveStartKey);
    return null;
  }

  async function create(payload) {
    const item = buildItem(entityType, payload);
    logger.info('Persisting entity in DynamoDB', { entityType, tableName, id: item.id });
    await documentClient.send(new PutCommand({
      TableName: tableName,
      Item: item,
      ...(entityType === 'job' ? { ConditionExpression: 'attribute_not_exists(guid_id)' } : {}),
    })).catch(error => {
      if (error.name === 'ConditionalCheckFailedException') throw Object.assign(new Error('Vacancy already exists'), { statusCode: 409 });
      throw error;
    });
    logger.info('Entity persisted successfully', { entityType, id: item.id });
    return item;
  }

  async function findById(id, options) {
    logger.info('Fetching entity from DynamoDB', { entityType, tableName, id });
    const item = await findItemById(id, options);

    if (!item) {
      logger.warn('Entity not found during fetch', { entityType, id });
      throw new NotFoundError(`${entityType} with id ${id} not found`);
    }

    logger.info('Entity fetched successfully', { entityType, id });
    return item;
  }

  async function update(id, updates, options = {}) {
    const updateExpression = buildUpdateExpression(updates, primaryKey);

    if (!updateExpression) {
      logger.warn('No valid updates provided', { entityType, id });
      return findById(id);
    }

    try {
      const item = await findById(id, { consistentRead: entityType === 'job' });
      let jobGuard;
      if (entityType === 'job') {
        const lifecycle = require('./jobLifecycleService');
        if (item.status === 'Encerrada' || (options.expectedCycle !== undefined && options.expectedCycle !== lifecycle.cycleOf(item))) {
          throw Object.assign(new Error('A vaga mudou ou foi encerrada. Recarregue a página.'), { statusCode: 409 });
        }
        jobGuard = lifecycle.cycleCondition(item, { open: true, owner: options.ownerSub });
      }
      logger.info('Updating entity in DynamoDB', { entityType, tableName, id });
      const response = await documentClient.send(new UpdateCommand({
        TableName: tableName,
        Key: { [primaryKey]: item[primaryKey] },
        ...updateExpression,
        ConditionExpression: 'attribute_exists(#primaryKey) AND #id = :expectedId'
          + (jobGuard ? ` AND (${jobGuard.ConditionExpression})` : ''),
        ExpressionAttributeNames: { ...updateExpression.ExpressionAttributeNames, ...jobGuard?.ExpressionAttributeNames, '#primaryKey': primaryKey, '#id': 'id' },
        ExpressionAttributeValues: { ...updateExpression.ExpressionAttributeValues, ...jobGuard?.ExpressionAttributeValues, ':expectedId': item.id },
        ReturnValues: 'ALL_NEW',
      }));

      logger.info('Entity updated successfully', { entityType, id });
      return response.Attributes;
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        logger.warn('Entity not found during update', { entityType, id });
        if (entityType === 'job') throw Object.assign(new Error('A vaga mudou ou foi encerrada. Recarregue a página.'), { statusCode: 409 });
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
    try {
      const item = await findById(id);
      logger.info('Removing entity from DynamoDB', { entityType, tableName, id });
      await documentClient.send(new DeleteCommand({
        TableName: tableName,
        Key: { [primaryKey]: item[primaryKey] },
        ConditionExpression: 'attribute_exists(#primaryKey) AND #id = :expectedId'
          + (entityType === 'job' ? ' AND (attribute_not_exists(#cycle) OR #cycle = :first) AND (attribute_not_exists(#status) OR #status <> :closed)' : ''),
        ExpressionAttributeNames: { '#primaryKey': primaryKey, '#id': 'id',
          ...(entityType === 'job' ? { '#cycle': 'ciclo_atual', '#status': 'status' } : {}) },
        ExpressionAttributeValues: { ':expectedId': item.id,
          ...(entityType === 'job' ? { ':first': 1, ':closed': 'Encerrada' } : {}) },
      }));
      logger.info('Entity removed successfully', { entityType, id });
      return true;
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        logger.warn('Entity not found during removal', { entityType, id });
        if (entityType === 'job') throw Object.assign(new Error('A vaga mudou ou possui histórico de encerramento. Recarregue a página.'), { statusCode: 409 });
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

  async function list({ limit = 20, lastKey, jobStatus } = {}) {
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

    if (entityType === 'job' && jobStatus) {
      params.FilterExpression += jobStatus === 'closed'
        ? ' AND #status = :closed'
        : ' AND (attribute_not_exists(#status) OR #status <> :closed)';
      params.ExpressionAttributeNames['#status'] = 'status';
      params.ExpressionAttributeValues[':closed'] = 'Encerrada';
    }

    if (lastKey) {
      params.ExclusiveStartKey = lastKey;
    }

    logger.info('Scanning entities from DynamoDB', {
      entityType,
      tableName,
      limit,
      hasLastKey: Boolean(lastKey),
    });
    // DynamoDB applies its filter after Limit. Continue across empty scan pages
    // until the requested number of matching jobs or the end of the table.
    const items = [];
    let response;
    do {
      response = await documentClient.send(new ScanCommand({ ...params, Limit: limit - items.length }));
      items.push(...(response.Items || []));
      params.ExclusiveStartKey = response.LastEvaluatedKey;
    } while (jobStatus && response.LastEvaluatedKey && items.length < limit);
    logger.info('Entity scan completed', {
      entityType,
      itemCount: items.length,
      hasMore: Boolean(response.LastEvaluatedKey),
    });

    return {
      items,
      lastEvaluatedKey: response.LastEvaluatedKey,
    };
  }

  async function listByFieldValues({ field, values, consistentRead = false }) {
    logger.info('Scanning entities by field values from DynamoDB', {
      entityType,
      tableName,
      field,
      valueCount: values.length,
    });

    const collectedItems = [];
    let exclusiveStartKey;
    const valueTokens = values.map((_, index) => `:fieldValue${index}`);

    do {
      const params = {
        TableName: tableName,
        FilterExpression: `#entityType = :entityType AND #field IN (${valueTokens.join(', ')})`,
        ConsistentRead: consistentRead,
        ExpressionAttributeNames: {
          '#entityType': 'entityType',
          '#field': field,
        },
        ExpressionAttributeValues: {
          ':entityType': entityType,
          ...values.reduce((acc, value, index) => ({
            ...acc,
            [`:fieldValue${index}`]: value,
          }), {}),
        },
      };

      if (exclusiveStartKey) {
        params.ExclusiveStartKey = exclusiveStartKey;
      }

      const response = await documentClient.send(new ScanCommand(params));
      if (response.Items && response.Items.length > 0) {
        collectedItems.push(...response.Items);
      }

      exclusiveStartKey = response.LastEvaluatedKey;
    } while (exclusiveStartKey);

    logger.info('Entity scan by field values completed', {
      entityType,
      itemCount: collectedItems.length,
    });

    return collectedItems;
  }

  async function listByFieldValue({ field, value, consistentRead = false }) {
    const collectedItems = [];
    let exclusiveStartKey;
    do {
      const response = await documentClient.send(new ScanCommand({
        TableName: tableName,
        FilterExpression: '#entityType = :entityType AND #field = :value',
        ConsistentRead: consistentRead,
        ExpressionAttributeNames: { '#entityType': 'entityType', '#field': field },
        ExpressionAttributeValues: { ':entityType': entityType, ':value': value },
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      }));
      collectedItems.push(...(response.Items || []));
      exclusiveStartKey = response.LastEvaluatedKey;
    } while (exclusiveStartKey);
    return collectedItems;
  }

  async function close(id, ownerSub, reason) {
    return require('./jobLifecycleService').transition(id, ownerSub, 'close', { reason });
  }


  return {
    create,
    findById,
    update,
    remove,
    list,
    listByFieldValues,
    listByFieldValue,
    close,
  };
}

module.exports = {
  createEntityService,
};
