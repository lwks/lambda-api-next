const { isLocalHarness } = require('../harness/config');

test('local harness requires an explicit flag, development/test, and local auth', () => {
  expect(isLocalHarness({ NODE_ENV: 'development' })).toBe(false);
  expect(isLocalHarness({ HARNESS_MODE: 'local', NODE_ENV: 'development' })).toBe(true);
  for (const env of [
    { NODE_ENV: 'production' }, { NODE_ENV: undefined }, { AWS_LAMBDA_FUNCTION_NAME: 'lambda' },
    { VERCEL: '1' }, { NETLIFY: 'true' }, { SUPABASE_URL: 'https://real.supabase.co' },
  ]) expect(() => isLocalHarness({ HARNESS_MODE: 'local', NODE_ENV: 'test', ...env })).toThrow();
});

test('Lambda entry point refuses local mode before loading the application', () => {
  const old = process.env.HARNESS_MODE;
  process.env.HARNESS_MODE = 'local';
  try { expect(() => require('../handler')).toThrow('Local harness cannot run in the Lambda handler'); }
  finally { if (old === undefined) delete process.env.HARNESS_MODE; else process.env.HARNESS_MODE = old; }
});
