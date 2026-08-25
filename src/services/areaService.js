const { getPool } = require('../sql/sqlServerClient');

const AREAS_QUERY = `
  SELECT A.ID, A.DS_AREA, C.DS_COMPETENCIA, TC.DS_TIPO_COMPETENCIA
  FROM TB_AREAS A
  LEFT JOIN TB_COMPETENCIA_AREA CA ON CA.ID_AREA = A.ID
  LEFT JOIN TB_COMPETENCIAS C ON C.ID = CA.ID_COMPETENCIA
  LEFT JOIN TB_TIPO_COMPETENCIAS TC ON TC.ID = C.ID_TIPO_COMPETENCIA
  ORDER BY A.ID, C.DS_COMPETENCIA
`;

function groupAreas(rows) {
  const areas = new Map();
  for (const row of rows) {
    const key = `${row.ID}:${row.DS_AREA}`;
    let area = areas.get(key);
    if (!area) {
      area = { ID: row.ID, DS_AREA: row.DS_AREA, competencias: [] };
      areas.set(key, area);
    }
    if (row.DS_COMPETENCIA == null && row.DS_TIPO_COMPETENCIA == null) continue;
    if (!area.competencias.some((item) => item.DS_COMPETENCIA === row.DS_COMPETENCIA && item.DS_TIPO_COMPETENCIA === row.DS_TIPO_COMPETENCIA)) {
      area.competencias.push({ DS_COMPETENCIA: row.DS_COMPETENCIA, DS_TIPO_COMPETENCIA: row.DS_TIPO_COMPETENCIA });
    }
  }
  return [...areas.values()];
}

async function list() {
  const pool = await getPool();
  const response = await pool.request().query(AREAS_QUERY);

  return groupAreas(response.recordset || []);
}

module.exports = {
  AREAS_QUERY,
  groupAreas,
  list,
};
