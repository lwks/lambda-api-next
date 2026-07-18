const { getDomainSqlMapping } = require('../config/domainSqlMapping');
const { getPool, sql, testConnection } = require('../sql/sqlServerClient');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logger } = require('../utils/logger');

function assertIdentifier(identifier, label) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid SQL identifier for ${label}: ${identifier}`);
  }

  return identifier;
}

function quoteIdentifier(identifier, label) {
  return `[${assertIdentifier(identifier, label)}]`;
}

function buildMapping() {
  const mapping = getDomainSqlMapping();

  return {
    typeTable: quoteIdentifier(mapping.typeTable, 'typeTable'),
    itemTable: quoteIdentifier(mapping.itemTable, 'itemTable'),
    typeCodeColumn: quoteIdentifier(mapping.typeCodeColumn, 'typeCodeColumn'),
    typeLabelColumn: quoteIdentifier(mapping.typeLabelColumn, 'typeLabelColumn'),
    itemTypeCodeColumn: quoteIdentifier(mapping.itemTypeCodeColumn, 'itemTypeCodeColumn'),
    itemCodeColumn: quoteIdentifier(mapping.itemCodeColumn, 'itemCodeColumn'),
    itemLabelColumn: quoteIdentifier(mapping.itemLabelColumn, 'itemLabelColumn'),
    itemActiveColumn: mapping.itemActiveColumn
      ? quoteIdentifier(mapping.itemActiveColumn, 'itemActiveColumn')
      : undefined,
    itemSortOrderColumn: mapping.itemSortOrderColumn
      ? quoteIdentifier(mapping.itemSortOrderColumn, 'itemSortOrderColumn')
      : undefined,
  };
}

function buildSelectClause(mapping) {
  const columns = [
    `t.${mapping.typeCodeColumn} AS domain_tipo`,
    `t.${mapping.typeLabelColumn} AS domain_tipo_label`,
    `i.${mapping.itemCodeColumn} AS domain_code`,
    `i.${mapping.itemLabelColumn} AS domain_label`,
  ];

  if (mapping.itemActiveColumn) {
    columns.push(`i.${mapping.itemActiveColumn} AS domain_active`);
  }

  if (mapping.itemSortOrderColumn) {
    columns.push(`i.${mapping.itemSortOrderColumn} AS domain_sort_order`);
  }

  return columns.join(',\n      ');
}

function buildOrderByClause(mapping) {
  if (mapping.itemSortOrderColumn) {
    return `ORDER BY i.${mapping.itemSortOrderColumn} ASC, i.${mapping.itemLabelColumn} ASC`;
  }

  return `ORDER BY i.${mapping.itemLabelColumn} ASC`;
}

function coerceBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 's' || normalized === 'y';
  }

  return undefined;
}

function normalizeDomainRow(row) {
  const item = {
    tipo: row.domain_tipo,
    code: row.domain_code,
    label: row.domain_label,
  };

  const active = coerceBoolean(row.domain_active);
  if (active !== undefined) {
    item.active = active;
  }

  if (row.domain_sort_order !== undefined && row.domain_sort_order !== null) {
    const sortOrder = Number(row.domain_sort_order);
    if (Number.isFinite(sortOrder)) {
      item.sortOrder = sortOrder;
    }
  }

  return item;
}

function buildQuery(mapping, { includeCodeFilter, includeActiveFilter }) {
  return `
    SELECT TOP (@limit)
      ${buildSelectClause(mapping)}
    FROM ${mapping.itemTable} i
    INNER JOIN ${mapping.typeTable} t
      ON i.${mapping.itemTypeCodeColumn} = t.${mapping.typeCodeColumn}
    WHERE t.${mapping.typeCodeColumn} = @tipo
      ${includeCodeFilter ? `AND i.${mapping.itemCodeColumn} = @code` : ''}
      ${includeActiveFilter ? `AND i.${mapping.itemActiveColumn} = @active` : ''}
    ${buildOrderByClause(mapping)}
  `;
}

async function create() {
  throw new Error('Domain write operations are not supported in SQL Server migration mode.');
}

async function findByCode(tipo, code) {
  const mapping = buildMapping();
  const pool = await getPool();
  const request = pool.request();
  request.input('limit', sql.Int, 1);
  request.input('tipo', sql.NVarChar, tipo);
  request.input('code', sql.NVarChar, code);

  logger.info('Fetching domain from SQL Server by group and code', { tipo, code });
  const response = await request.query(buildQuery(mapping, { includeCodeFilter: true, includeActiveFilter: false }));
  const row = response.recordset?.[0];

  if (!row) {
    logger.warn('Domain not found during SQL Server fetch', { tipo, code });
    throw new NotFoundError(`domain with tipo ${tipo} and code ${code} not found`);
  }

  return normalizeDomainRow(row);
}

async function updateByKey() {
  throw new Error('Domain write operations are not supported in SQL Server migration mode.');
}

async function updateByCode() {
  throw new Error('Domain write operations are not supported in SQL Server migration mode.');
}

async function list({ limit = 20, tipo, active } = {}) {
  if (!tipo) {
    throw new ValidationError('tipo query param is required');
  }

  const mapping = buildMapping();
  if (typeof active === 'boolean' && !mapping.itemActiveColumn) {
    throw new ValidationError('active query param is not supported until SQLSERVER_DOMAIN_ITEM_ACTIVE_COLUMN is configured');
  }

  const pool = await getPool();
  const request = pool.request();
  request.input('limit', sql.Int, limit);
  request.input('tipo', sql.NVarChar, tipo);

  if (typeof active === 'boolean') {
    request.input('active', sql.Bit, active);
  }

  logger.info('Listing domains from SQL Server by group', {
    tipo,
    limit,
    hasActiveFilter: typeof active === 'boolean',
  });

  const response = await request.query(buildQuery(mapping, {
    includeCodeFilter: false,
    includeActiveFilter: typeof active === 'boolean',
  }));

  return {
    items: (response.recordset || []).map(normalizeDomainRow),
    lastEvaluatedKey: null,
  };
}

module.exports = {
  create,
  findByCode,
  list,
  normalizeDomainRow,
  ping: testConnection,
  updateByCode,
  updateByKey,
};
