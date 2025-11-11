const express = require('express');
const routes = require('./routes');
const { error } = require('./utils/response');
const { NotFoundError, ValidationError } = require('./utils/errors');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', routes);

app.use((req, res, next) => {
  next(new NotFoundError('Resource not found'));
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof ValidationError) {
    return error(res, err.message, err.statusCode, err.details);
  }
  if (err instanceof NotFoundError) {
    return error(res, err.message, err.statusCode);
  }
  if (err.statusCode) {
    return error(res, err.message || 'Unexpected error', err.statusCode, err.details);
  }

  // eslint-disable-next-line no-console
  console.error('Unhandled error', err);
  return error(res, 'Internal server error', 500);
});

module.exports = app;
