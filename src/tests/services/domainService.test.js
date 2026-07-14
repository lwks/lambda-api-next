jest.mock('../../aws_services/dynamoClient', () => ({
  documentClient: {
    send: jest.fn(),
  },
}));

const {
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const { documentClient } = require('../../aws_services/dynamoClient');
const { NotFoundError } = require('../../utils/errors');
const domainService = require('../../services/domainService');

describe('domainService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('gera codigo tecnico no insert', async () => {
    documentClient.send.mockResolvedValue({});

    const payload = {
      tipo: 'DOMINIO#AREA_INTERESSE',
      code: 'tecnologia-informacao',
      label: 'Tecnologia da Informacao',
      active: true,
      sortOrder: 1,
      extra: 'value',
    };

    const result = await domainService.create(payload);

    expect(documentClient.send).toHaveBeenCalledTimes(1);
    const command = documentClient.send.mock.calls[0][0];
    expect(command).toBeInstanceOf(PutCommand);
    expect(command.input.TableName).toBe('Dominio');
    expect(command.input.Item).toEqual({
      ...payload,
      codigo: 'ITEM#tecnologia-informacao',
    });
    expect(result.codigo).toBe('ITEM#tecnologia-informacao');
  });

  it('consulta por tipo e code', async () => {
    documentClient.send.mockResolvedValue({
      Item: {
        tipo: 'DOMINIO#AREA_INTERESSE',
        codigo: 'ITEM#qa',
        label: 'QA',
      },
    });

    const result = await domainService.findByCode('DOMINIO#AREA_INTERESSE', 'qa');

    const command = documentClient.send.mock.calls[0][0];
    expect(command).toBeInstanceOf(GetCommand);
    expect(command.input.Key).toEqual({
      tipo: 'DOMINIO#AREA_INTERESSE',
      codigo: 'ITEM#qa',
    });
    expect(result).toEqual({
      tipo: 'DOMINIO#AREA_INTERESSE',
      codigo: 'ITEM#qa',
      code: 'qa',
      label: 'QA',
    });
  });

  it('retorna not found em GetByCod ausente', async () => {
    documentClient.send.mockResolvedValue({});

    await expect(domainService.findByCode('DOMINIO#AREA_INTERESSE', 'qa')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('usa query quando tipo e informado e filtra por active', async () => {
    documentClient.send.mockResolvedValue({
      Items: [{ tipo: 'DOMINIO#AREA_INTERESSE', codigo: 'ITEM#qa', active: true }],
      LastEvaluatedKey: { tipo: 'DOMINIO#AREA_INTERESSE', codigo: 'ITEM#qa' },
    });

    const result = await domainService.list({
      tipo: 'DOMINIO#AREA_INTERESSE',
      active: true,
      limit: 10,
      lastKey: { tipo: 'DOMINIO#AREA_INTERESSE', codigo: 'ITEM#dev' },
    });

    const command = documentClient.send.mock.calls[0][0];
    expect(command).toBeInstanceOf(QueryCommand);
    expect(command.input.KeyConditionExpression).toBe('#tipo = :tipo');
    expect(command.input.FilterExpression).toBe('#active = :active');
    expect(command.input.ExpressionAttributeValues).toEqual({
      ':tipo': 'DOMINIO#AREA_INTERESSE',
      ':active': true,
    });
    expect(result.lastEvaluatedKey).toEqual({ tipo: 'DOMINIO#AREA_INTERESSE', codigo: 'ITEM#qa' });
  });

  it('usa scan quando tipo nao e informado', async () => {
    documentClient.send.mockResolvedValue({
      Items: [{ tipo: 'DOMINIO#AREA_INTERESSE', codigo: 'ITEM#qa' }],
    });

    await domainService.list({ active: false, limit: 5 });

    const command = documentClient.send.mock.calls[0][0];
    expect(command).toBeInstanceOf(ScanCommand);
    expect(command.input.FilterExpression).toBe('#active = :active');
    expect(command.input.ExpressionAttributeValues).toEqual({ ':active': false });
    expect(command.input.Limit).toBe(5);
  });

  it('atualiza por code usando chave tecnica derivada', async () => {
    documentClient.send.mockResolvedValue({
      Attributes: {
        tipo: 'DOMINIO#AREA_INTERESSE',
        codigo: 'ITEM#qa',
        label: 'QA',
        active: false,
      },
    });

    const result = await domainService.updateByCode('DOMINIO#AREA_INTERESSE', 'qa', {
      label: 'QA',
      active: false,
      code: 'outro-valor',
    });

    const command = documentClient.send.mock.calls[0][0];
    expect(command).toBeInstanceOf(UpdateCommand);
    expect(command.input.Key).toEqual({
      tipo: 'DOMINIO#AREA_INTERESSE',
      codigo: 'ITEM#qa',
    });
    expect(command.input.UpdateExpression).toBe('SET #field0 = :value0, #field1 = :value1');
    expect(command.input.ExpressionAttributeNames).toEqual({
      '#field0': 'label',
      '#field1': 'active',
      '#tipo': 'tipo',
      '#codigo': 'codigo',
    });
    expect(result.code).toBe('qa');
  });

  it('retorna item atual quando update tecnico nao recebe campos mutaveis', async () => {
    documentClient.send.mockResolvedValue({
      Item: {
        tipo: 'DOMINIO#AREA_INTERESSE',
        codigo: 'ITEM#qa',
        label: 'QA',
      },
    });

    const result = await domainService.updateByKey('DOMINIO#AREA_INTERESSE', 'ITEM#qa', {
      tipo: 'DOMINIO#AREA_INTERESSE',
      codigo: 'ITEM#qa',
    });

    const command = documentClient.send.mock.calls[0][0];
    expect(command).toBeInstanceOf(GetCommand);
    expect(result.code).toBe('qa');
  });
});
