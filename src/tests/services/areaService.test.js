jest.mock('../../sql/sqlServerClient', () => ({
  getPool: jest.fn(),
}));

const { getPool } = require('../../sql/sqlServerClient');
const areaService = require('../../services/areaService');

describe('areaService', () => {
  it('consulta tabelas relacionadas e agrupa competencias sem duplicidades', async () => {
    const request = { query: jest.fn().mockResolvedValue({
      recordset: [{ ID: 1, DS_AREA: 'Tecnologia', DS_COMPETENCIA: 'Dev', DS_TIPO_COMPETENCIA: 'Hard' }, { ID: 1, DS_AREA: 'Tecnologia', DS_COMPETENCIA: 'Dev', DS_TIPO_COMPETENCIA: 'Hard' }, { ID: 1, DS_AREA: 'Tecnologia', DS_COMPETENCIA: 'Com', DS_TIPO_COMPETENCIA: 'Soft' }, { ID: 2, DS_AREA: 'Dados', DS_COMPETENCIA: null, DS_TIPO_COMPETENCIA: null }],
    }) };
    getPool.mockResolvedValue({ request: () => request });

    await expect(areaService.list()).resolves.toEqual([{ ID: 1, DS_AREA: 'Tecnologia', competencias: [{ DS_COMPETENCIA: 'Dev', DS_TIPO_COMPETENCIA: 'Hard' }, { DS_COMPETENCIA: 'Com', DS_TIPO_COMPETENCIA: 'Soft' }] }, { ID: 2, DS_AREA: 'Dados', competencias: [] }]);
    expect(request.query).toHaveBeenCalledWith(areaService.AREAS_QUERY);
    expect(areaService.AREAS_QUERY).toContain('TB_COMPETENCIA_AREA');
    expect(areaService.AREAS_QUERY).toContain('TB_COMPETENCIAS');
    expect(areaService.AREAS_QUERY).toContain('TB_TIPO_COMPETENCIAS');
  });

  it('retorna lista vazia quando o SQL Server nao retorna recordset', async () => {
    const request = { query: jest.fn().mockResolvedValue({}) };
    getPool.mockResolvedValue({ request: () => request });

    await expect(areaService.list()).resolves.toEqual([]);
  });
});
