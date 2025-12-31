function success(res, data, status = 200) {
  return res.status(status).json({ data });
}

function created(res, data) {
  return success(res, data, 201);
}

function noContent(res) {
  return res.status(204).send();
}

function error(res, message, status = 500, details) {
  const payload = { message };
  if (details) {
    payload.details = details;
  }
  return res.status(status).json(payload);
}

module.exports = {
  success,
  created,
  noContent,
  error,
};
