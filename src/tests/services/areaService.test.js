jest.mock('../../sql/sqlServerClient', () => ({
  getPool: jest.fn(),
}));

const { getPool } = require('../../sql/sqlServerClient');
const areaService = require('../../services/areaService');

describe('areaService', () => {
  it('consulta TB_AREAS com SELECT literal e preserva os campos', async () => {
    const request = { query: jest.fn().mockResolvedValue({
      recordset: [{ ID: 1, DS_AREA: 'Tecnologia' }],
    }) };
    getPool.mockResolvedValue({ request: () => request });

    await expect(areaService.list()).resolves.toEqual([{ ID: 1, DS_AREA: 'Tecnologia' }]);
    expect(request.query).toHaveBeenCalledWith('SELECT * FROM TB_AREAS');
  });

  it('retorna lista vazia quando o SQL Server nao retorna recordset', async () => {
    const request = { query: jest.fn().mockResolvedValue({}) };
    getPool.mockResolvedValue({ request: () => request });

    await expect(areaService.list()).resolves.toEqual([]);
  });
});
