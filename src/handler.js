const serverless = require('serverless-http');
const app = require('./app');

const handler = serverless(app);

module.exports.lambdaHandler = async (event, context) => handler(event, context);
