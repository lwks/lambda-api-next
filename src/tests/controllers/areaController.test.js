jest.mock('../../services/areaService', () => ({
  list: jest.fn(),
}));

const areaService = require('../../services/areaService');
const { listAreas } = require('../../controllers/areaController');

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

describe('areaController', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna ID e DS_AREA no envelope data', async () => {
    areaService.list.mockResolvedValue([{ ID: 1, DS_AREA: 'Tecnologia' }]);
    const res = createResponse();
    const next = jest.fn();

    await listAreas({}, res, next);

    expect(res.body).toEqual({ data: [{ ID: 1, DS_AREA: 'Tecnologia' }] });
    expect(next).not.toHaveBeenCalled();
  });

  it('encaminha erro do banco ao middleware', async () => {
    const databaseError = new Error('database unavailable');
    areaService.list.mockRejectedValue(databaseError);
    const next = jest.fn();

    await listAreas({}, createResponse(), next);

    expect(next).toHaveBeenCalledWith(databaseError);
  });
});
