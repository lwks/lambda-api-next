const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');

if (process.env.NODE_ENV === 'production' || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL || process.env.NETLIFY) {
  throw new Error('Local harness cannot run in a hosted/production environment');
}
process.env.NODE_ENV = 'development';
process.env.HARNESS_MODE = 'local';
process.env.AUTH_PROVIDER = 'supabase';
process.env.PORT = process.env.HARNESS_BACK_PORT || '3001';
process.env.SUPABASE_URL = `http://localhost:${process.env.E2E_SUPABASE_PORT || '54329'}`;
process.env.SUPABASE_PUBLISHABLE_KEY = 'e2e-public-key';

const { dataDirectory, isLocalHarness } = require('../src/harness/config');
isLocalHarness();
const { read, save, seed } = require('../src/harness/store');
const { initializeCv } = require('../src/harness/cvStorage');

async function main() {
  // A second writer or a reset while serving would race file transactions.
  fs.mkdirSync(dataDirectory, { recursive: true });
  const lock = path.join(dataDirectory, 'server.lock');
  if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, 'utf8'));
    let alive = true;
    try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; }
    if (alive) throw new Error(`Harness data is in use by process ${pid}. Stop it before starting/resetting.`);
    fs.unlinkSync(lock);
  }
  if (process.argv.includes('--reset')) {
    save(seed());
    // Only files in the dedicated upload directory are cleared.
    fs.rmSync(path.join(dataDirectory, 'uploads'), { recursive: true, force: true });
    initializeCv();
    console.log('Local data restored.');
    return;
  }
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(Number(process.env.PORT), '127.0.0.1', () => probe.close(resolve));
  });
  fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
  process.on('exit', () => { if (fs.existsSync(lock)) fs.unlinkSync(lock); });
  read();
  initializeCv();
  const server = require('../src/app').listen(Number(process.env.PORT), '127.0.0.1', () => {
    console.log(`Local API: http://localhost:${process.env.PORT} (JSON data, no AWS)`);
  });
  server.on('error', error => { console.error(error.message); process.exit(1); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
