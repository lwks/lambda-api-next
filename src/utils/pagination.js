function encodeLastKey(lastKey) {
  if (!lastKey) {
    return undefined;
  }
  return Buffer.from(JSON.stringify(lastKey)).toString('base64url');
}

function decodeLastKey(token) {
  if (!token) {
    return undefined;
  }
  try {
    const json = Buffer.from(token, 'base64url').toString('utf-8');
    return JSON.parse(json);
  } catch (error) {
    return undefined;
  }
}

module.exports = {
  encodeLastKey,
  decodeLastKey,
};
