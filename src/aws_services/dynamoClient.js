const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';

const dynamoClient = new DynamoDBClient({ region: REGION });

const marshallOptions = {
  removeUndefinedValues: true,
};

const unmarshallOptions = {
  wrapNumbers: false,
};

const translateConfig = { marshallOptions, unmarshallOptions };

const documentClient = DynamoDBDocumentClient.from(dynamoClient, translateConfig);

module.exports = {
  dynamoClient,
  documentClient,
};
