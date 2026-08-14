const { getPool } = require('../sql/sqlServerClient');

const AREAS_QUERY = 'SELECT * FROM TB_AREAS';

async function list() {
  const pool = await getPool();
  const response = await pool.request().query(AREAS_QUERY);

  return response.recordset || [];
}

module.exports = {
  AREAS_QUERY,
  list,
};
