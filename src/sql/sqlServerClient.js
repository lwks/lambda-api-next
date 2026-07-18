const sql = require('mssql');

function parseBooleanEnv(value, defaultValue) {
  if (value === undefined) {
    return defaultValue;
  }

  return String(value).toLowerCase() === 'true';
}

function buildSqlServerConfig() {
  const port = Number.parseInt(process.env.SQLSERVER_PORT || '1433', 10);

  if (!process.env.SQLSERVER_HOST || !process.env.SQLSERVER_DATABASE || !process.env.SQLSERVER_USER || !process.env.SQLSERVER_PASSWORD) {
    throw new Error(
      'SQL Server configuration is incomplete. Set SQLSERVER_HOST, SQLSERVER_DATABASE, SQLSERVER_USER and SQLSERVER_PASSWORD.',
    );
  }

  return {
    server: process.env.SQLSERVER_HOST,
    port: Number.isNaN(port) ? 1433 : port,
    database: process.env.SQLSERVER_DATABASE,
    user: process.env.SQLSERVER_USER,
    password: process.env.SQLSERVER_PASSWORD,
    options: {
      encrypt: parseBooleanEnv(process.env.SQLSERVER_ENCRYPT, true),
      trustServerCertificate: parseBooleanEnv(process.env.SQLSERVER_TRUST_SERVER_CERTIFICATE, false),
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };
}

let poolPromise;

async function getPool() {
  if (!poolPromise) {
    const config = buildSqlServerConfig();
    poolPromise = new sql.ConnectionPool(config).connect().catch((error) => {
      poolPromise = undefined;
      throw error;
    });
  }

  return poolPromise;
}

async function closePool() {
  if (!poolPromise) {
    return;
  }

  const pool = await poolPromise.catch(() => null);
  poolPromise = undefined;

  if (pool) {
    await pool.close();
  }
}

async function testConnection() {
  const pool = await getPool();
  const response = await pool.request().query('SELECT 1 AS ok');
  return response.recordset?.[0]?.ok === 1;
}

module.exports = {
  sql,
  buildSqlServerConfig,
  closePool,
  getPool,
  testConnection,
};
