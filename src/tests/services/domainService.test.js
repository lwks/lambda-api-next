jest.mock('../../sql/sqlServerClient', () => ({
  getPool: jest.fn(),
  sql: {
    Int: 'Int',
    NVarChar: 'NVarChar',
    Bit: 'Bit',
  },
  testConnection: jest.fn(),
}));

const { getPool, testConnection } = require('../../sql/sqlServerClient');
const { NotFoundError, ValidationError } = require('../../utils/errors');
const domainService = require('../../services/domainService');

describe('domainService', () => {
  let request;
  let pool;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SQLSERVER_DOMAIN_TYPE_CODE_COLUMN = 'TIPO_CODE';
    process.env.SQLSERVER_DOMAIN_TYPE_LABEL_COLUMN = 'TIPO_LABEL';
    process.env.SQLSERVER_DOMAIN_ITEM_TYPE_CODE_COLUMN = 'TIPO_CODE';
    process.env.SQLSERVER_DOMAIN_ITEM_CODE_COLUMN = 'COMP_CODE';
    process.env.SQLSERVER_DOMAIN_ITEM_LABEL_COLUMN = 'COMP_LABEL';
    delete process.env.SQLSERVER_DOMAIN_ITEM_ACTIVE_COLUMN;
    delete process.env.SQLSERVER_DOMAIN_ITEM_SORT_COLUMN;

    request = {
      input: jest.fn().mockReturnThis(),
      query: jest.fn(),
    };
    pool = {
      request: jest.fn(() => request),
    };
    getPool.mockResolvedValue(pool);
  });

  it('exige tipo na listagem', async () => {
    await expect(domainService.list({ limit: 10 })).rejects.toBeInstanceOf(ValidationError);
  });

  it('lista dominios via SQL Server por grupo', async () => {
    request.query.mockResolvedValue({
      recordset: [
        {
          domain_tipo: 'TEC',
          domain_code: 'qa',
          domain_label: 'QA',
        },
      ],
    });

    const result = await domainService.list({ tipo: 'TEC', limit: 10 });

    expect(getPool).toHaveBeenCalledTimes(1);
    expect(request.input).toHaveBeenCalledWith('limit', 'Int', 10);
    expect(request.input).toHaveBeenCalledWith('tipo', 'NVarChar', 'TEC');
    expect(result).toEqual({
      items: [{ tipo: 'TEC', code: 'qa', label: 'QA' }],
      lastEvaluatedKey: null,
    });
  });

  it('consulta por tipo e code via SQL Server', async () => {
    process.env.SQLSERVER_DOMAIN_ITEM_ACTIVE_COLUMN = 'ACTIVE';
    process.env.SQLSERVER_DOMAIN_ITEM_SORT_COLUMN = 'SORT_ORDER';
    request.query.mockResolvedValue({
      recordset: [
        {
          domain_tipo: 'TEC',
          domain_code: 'qa',
          domain_label: 'QA',
          domain_active: 1,
          domain_sort_order: 7,
        },
      ],
    });

    const result = await domainService.findByCode('TEC', 'qa');

    expect(request.input).toHaveBeenCalledWith('code', 'NVarChar', 'qa');
    expect(result).toEqual({
      tipo: 'TEC',
      code: 'qa',
      label: 'QA',
      active: true,
      sortOrder: 7,
    });
  });

  it('retorna not found quando nao acha item por code', async () => {
    request.query.mockResolvedValue({ recordset: [] });

    await expect(domainService.findByCode('TEC', 'qa')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejeita filtro active sem coluna configurada', async () => {
    await expect(domainService.list({ tipo: 'TEC', active: true })).rejects.toBeInstanceOf(ValidationError);
  });

  it('delegates ping to sql client connection test', async () => {
    testConnection.mockResolvedValue(true);

    const result = await domainService.ping();

    expect(result).toBe(true);
    expect(testConnection).toHaveBeenCalledTimes(1);
  });
});
