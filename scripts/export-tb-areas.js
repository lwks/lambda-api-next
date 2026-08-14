const fs = require('fs');
const path = require('path');
const { closePool, getPool } = require('../src/sql/sqlServerClient');
const { AREAS_QUERY } = require('../src/services/areaService');

function loadLocalEnv() {
  const envPath = path.resolve(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    return;
  }

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

function escapeMarkdown(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function formatTimestamp(date = new Date()) {
  return date.toISOString();
}

function buildMarkdown(rows, queriedAt = new Date()) {
  const lines = [
    '# TB_AREAS',
    '',
    `- Consulta realizada em: ${formatTimestamp(queriedAt)}`,
    `- Quantidade de registros: ${rows.length}`,
    '',
    '| ID | DS_AREA |',
    '| ---: | --- |',
    ...rows.map((row) => `| ${escapeMarkdown(row.ID)} | ${escapeMarkdown(row.DS_AREA)} |`),
    '',
  ];

  return lines.join('\n');
}

async function main() {
  loadLocalEnv();
  try {
    const pool = await getPool();
    const response = await pool.request().query(AREAS_QUERY);
    const rows = response.recordset || [];
    const outputPath = path.resolve(__dirname, '..', 'tb_areas_select.md');

    fs.writeFileSync(outputPath, buildMarkdown(rows), 'utf8');
    console.log(`Exported ${rows.length} TB_AREAS records to ${outputPath}`);
  } finally {
    await closePool();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  buildMarkdown,
  escapeMarkdown,
  loadLocalEnv,
};
