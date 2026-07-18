function readRequiredEnv(name) {
  const value = process.env[name];

  if (!value || !value.trim()) {
    throw new Error(`Missing SQL Server domain mapping env var ${name}.`);
  }

  return value.trim();
}

function readOptionalEnv(name) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

function getDomainSqlMapping() {
  return {
    typeTable: process.env.SQLSERVER_DOMAIN_TYPE_TABLE || 'TB_TIPO_COMPETENCIAS',
    itemTable: process.env.SQLSERVER_DOMAIN_ITEM_TABLE || 'TB_COMPETENCIAS',
    typeCodeColumn: readRequiredEnv('SQLSERVER_DOMAIN_TYPE_CODE_COLUMN'),
    typeLabelColumn: readRequiredEnv('SQLSERVER_DOMAIN_TYPE_LABEL_COLUMN'),
    itemTypeCodeColumn: readRequiredEnv('SQLSERVER_DOMAIN_ITEM_TYPE_CODE_COLUMN'),
    itemCodeColumn: readRequiredEnv('SQLSERVER_DOMAIN_ITEM_CODE_COLUMN'),
    itemLabelColumn: readRequiredEnv('SQLSERVER_DOMAIN_ITEM_LABEL_COLUMN'),
    itemActiveColumn: readOptionalEnv('SQLSERVER_DOMAIN_ITEM_ACTIVE_COLUMN'),
    itemSortOrderColumn: readOptionalEnv('SQLSERVER_DOMAIN_ITEM_SORT_COLUMN'),
  };
}

module.exports = {
  getDomainSqlMapping,
};
