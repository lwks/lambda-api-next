jest.mock('../../services/domainService', () => ({
  create: jest.fn(),
  findByCode: jest.fn(),
  list: jest.fn(),
  updateByCode: jest.fn(),
  updateByKey: jest.fn(),
}));

const domainService = require('../../services/domainService');
const {
  createDomain,
  getDomainByCode,
  listDomains,
  updateDomainByCode,
  updateDomainByKey,
} = require('../../controllers/domainController');

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('domainController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lista dominios com limit, tipo e active', async () => {
    const req = {
      query: {
        limit: '5',
        tipo: 'TEC',
        active: 'true',
      },
    };
    const res = createResponse();
    const next = jest.fn();

    domainService.list.mockResolvedValue({
      items: [{ tipo: 'TEC', code: 'qa' }],
      lastEvaluatedKey: null,
    });

    await listDomains(req, res, next);

    expect(domainService.list).toHaveBeenCalledWith({
      limit: 5,
      tipo: 'TEC',
      active: true,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.items).toEqual([{ tipo: 'TEC', code: 'qa' }]);
    expect(res.body.data.lastKey).toBeNull();
    expect(next).not.toHaveBeenCalled();
  });

  it('rejeita listagem sem tipo', async () => {
    const req = { query: {} };
    const res = createResponse();
    const next = jest.fn();

    await listDomains(req, res, next);

    expect(domainService.list).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      message: 'tipo query param is required',
      statusCode: 400,
    }));
  });

  it('rejeita active invalido na listagem', async () => {
    const req = { query: { tipo: 'TEC', active: 'yes' } };
    const res = createResponse();
    const next = jest.fn();

    await listDomains(req, res, next);

    expect(domainService.list).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      message: 'active query param must be "true" or "false"',
      statusCode: 400,
    }));
  });

  it('busca dominio por tipo e code', async () => {
    const req = { params: { tipo: 'TEC', code: 'qa' } };
    const res = createResponse();
    const next = jest.fn();

    domainService.findByCode.mockResolvedValue({ tipo: 'TEC', code: 'qa' });

    await getDomainByCode(req, res, next);

    expect(domainService.findByCode).toHaveBeenCalledWith('TEC', 'qa');
    expect(res.body).toEqual({ data: { tipo: 'TEC', code: 'qa' } });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejeita create durante migracao para SQL Server', async () => {
    const req = { body: { tipo: 'TEC', code: 'qa' } };
    const res = createResponse();
    const next = jest.fn();

    await createDomain(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Domain write operations are disabled while SQL Server migration is in progress',
      statusCode: 501,
    }));
  });

  it('rejeita update por tipo e code durante migracao', async () => {
    const req = {
      params: { tipo: 'TEC', code: 'qa' },
      body: { label: 'QA', active: false },
    };
    const res = createResponse();
    const next = jest.fn();

    await updateDomainByCode(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Domain write operations are disabled while SQL Server migration is in progress',
      statusCode: 501,
    }));
  });

  it('rejeita update por chave tecnica durante migracao', async () => {
    const req = {
      body: {
        tipo: 'TEC',
        codigo: 'ITEM#qa',
        label: 'QA',
      },
    };
    const res = createResponse();
    const next = jest.fn();

    await updateDomainByKey(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Domain write operations are disabled while SQL Server migration is in progress',
      statusCode: 501,
    }));
  });
});
