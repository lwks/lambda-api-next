const path = require('node:path');

function isLocalHarness(env = process.env) {
  if (env.HARNESS_MODE !== 'local') return false;
  if (!['development', 'test'].includes(env.NODE_ENV)
      || env.AWS_LAMBDA_FUNCTION_NAME || env.VERCEL || env.NETLIFY) {
    throw new Error('Local harness is forbidden outside development/test and in hosted runtimes');
  }
  const url = new URL(env.SUPABASE_URL || 'http://localhost:54329');
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error('Local harness requires a loopback authentication URL');
  }
  return true;
}

const dataDirectory = process.env.HARNESS_DATA_DIR || path.resolve(__dirname, '../../.harness');
module.exports = { isLocalHarness, dataDirectory };
