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

  it('lista dominios com limit, lastKey, tipo e active', async () => {
    const req = {
      query: {
        limit: '5',
        lastKey: Buffer.from(JSON.stringify({ tipo: 'DOMINIO#AREA_INTERESSE', codigo: 'ITEM#qa' })).toString('base64url'),
        tipo: 'DOMINIO#AREA_INTERESSE',
        active: 'true',
      },
    };
    const res = createResponse();
    const next = jest.fn();

    domainService.list.mockResolvedValue({
      items: [{ tipo: 'DOMINIO#AREA_INTERESSE', code: 'qa' }],
      lastEvaluatedKey: { tipo: 'DOMINIO#AREA_INTERESSE', codigo: 'ITEM#dev' },
    });

    await listDomains(req, res, next);

    expect(domainService.list).toHaveBeenCalledWith({
      limit: 5,
      lastKey: { tipo: 'DOMINIO#AREA_INTERESSE', codigo: 'ITEM#qa' },
      tipo: 'DOMINIO#AREA_INTERESSE',
      active: true,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.items).toEqual([{ tipo: 'DOMINIO#AREA_INTERESSE', code: 'qa' }]);
    expect(typeof res.body.data.lastKey).toBe('string');
    expect(next).not.toHaveBeenCalled();
  });

  it('rejeita active invalido na listagem', async () => {
    const req = { query: { active: 'yes' } };
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
    const req = { params: { tipo: 'DOMINIO#AREA_INTERESSE', code: 'qa' } };
    const res = createResponse();
    const next = jest.fn();

    domainService.findByCode.mockResolvedValue({ tipo: 'DOMINIO#AREA_INTERESSE', code: 'qa' });

    await getDomainByCode(req, res, next);

    expect(domainService.findByCode).toHaveBeenCalledWith('DOMINIO#AREA_INTERESSE', 'qa');
    expect(res.body).toEqual({ data: { tipo: 'DOMINIO#AREA_INTERESSE', code: 'qa' } });
    expect(next).not.toHaveBeenCalled();
  });

  it('cria dominio e valida campos obrigatorios', async () => {
    const req = {
      body: {
        tipo: 'DOMINIO#AREA_INTERESSE',
        code: 'qa',
        label: 'Qualidade',
        active: true,
        sortOrder: 1,
      },
    };
    const res = createResponse();
    const next = jest.fn();

    domainService.create.mockResolvedValue({ ...req.body, codigo: 'ITEM#qa' });

    await createDomain(req, res, next);

    expect(domainService.create).toHaveBeenCalledWith(req.body);
    expect(res.statusCode).toBe(201);
    expect(res.body.data.codigo).toBe('ITEM#qa');
    expect(next).not.toHaveBeenCalled();
  });

  it('falha ao criar dominio sem campos obrigatorios', async () => {
    const req = { body: { tipo: 'DOMINIO#AREA_INTERESSE' } };
    const res = createResponse();
    const next = jest.fn();

    await createDomain(req, res, next);

    expect(domainService.create).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Missing required fields',
      statusCode: 400,
      details: { missing: ['code', 'label', 'active', 'sortOrder'] },
    }));
  });

  it('atualiza dominio por tipo e code', async () => {
    const req = {
      params: { tipo: 'DOMINIO#AREA_INTERESSE', code: 'qa' },
      body: { label: 'QA', active: false },
    };
    const res = createResponse();
    const next = jest.fn();

    domainService.updateByCode.mockResolvedValue({
      tipo: 'DOMINIO#AREA_INTERESSE',
      code: 'qa',
      label: 'QA',
      active: false,
    });

    await updateDomainByCode(req, res, next);

    expect(domainService.updateByCode).toHaveBeenCalledWith('DOMINIO#AREA_INTERESSE', 'qa', {
      label: 'QA',
      active: false,
    });
    expect(res.body.data.active).toBe(false);
    expect(next).not.toHaveBeenCalled();
  });

  it('atualiza dominio por chave tecnica', async () => {
    const req = {
      body: {
        tipo: 'DOMINIO#AREA_INTERESSE',
        codigo: 'ITEM#qa',
        label: 'QA',
      },
    };
    const res = createResponse();
    const next = jest.fn();

    domainService.updateByKey.mockResolvedValue({
      tipo: 'DOMINIO#AREA_INTERESSE',
      codigo: 'ITEM#qa',
      code: 'qa',
      label: 'QA',
    });

    await updateDomainByKey(req, res, next);

    expect(domainService.updateByKey).toHaveBeenCalledWith('DOMINIO#AREA_INTERESSE', 'ITEM#qa', req.body);
    expect(res.body.data.code).toBe('qa');
    expect(next).not.toHaveBeenCalled();
  });

  it('rejeita update tecnico sem chave literal', async () => {
    const req = { body: { label: 'QA' } };
    const res = createResponse();
    const next = jest.fn();

    await updateDomainByKey(req, res, next);

    expect(domainService.updateByKey).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Missing required fields',
      statusCode: 400,
      details: { missing: ['tipo', 'codigo'] },
    }));
  });
});
