jest.mock('../../aws_services/dynamoClient', () => ({ documentClient: { send: jest.fn() } }));

const { GetCommand, PutCommand, ScanCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { documentClient } = require('../../aws_services/dynamoClient');
const { createEntityService } = require('../../services/entityServiceFactory');

describe('entity service keys matching deployed DynamoDB tables', () => {
  beforeEach(() => documentClient.send.mockReset());

  it('creates a job with guid_id as both its API id and DynamoDB key', async () => {
    documentClient.send.mockResolvedValue({});
    const service = createEntityService('job', 'Vagas');
    const created = await service.create({ guid_id: 'job-guid', titulo: 'Test' });
    expect(created).toMatchObject({ id: 'job-guid', guid_id: 'job-guid', entityType: 'job' });
    expect(created).not.toHaveProperty('pk');
    expect(documentClient.send.mock.calls[0][0]).toBeInstanceOf(PutCommand);
    expect(documentClient.send.mock.calls[0][0].input).toMatchObject({ TableName: 'Vagas', Item: created });
  });

  it('gets a candidate directly by guid_id', async () => {
    documentClient.send.mockResolvedValue({ Item: { id: 'candidate-guid', guid_id: 'candidate-guid', entityType: 'candidate' } });
    const item = await createEntityService('candidate', 'Candidaturas').findById('candidate-guid');
    expect(item.guid_id).toBe('candidate-guid');
    expect(documentClient.send.mock.calls[0][0]).toBeInstanceOf(GetCommand);
    expect(documentClient.send.mock.calls[0][0].input.Key).toEqual({ guid_id: 'candidate-guid' });
  });

  it('finds a legacy job by generated id and deletes by guid_id', async () => {
    const legacy = { id: 'legacy-id', guid_id: 'legacy-guid', entityType: 'job' };
    documentClient.send
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Items: [legacy] })
      .mockResolvedValueOnce({});
    await createEntityService('job', 'Vagas').remove('legacy-id');
    expect(documentClient.send.mock.calls[1][0]).toBeInstanceOf(ScanCommand);
    expect(documentClient.send.mock.calls[2][0]).toBeInstanceOf(DeleteCommand);
    expect(documentClient.send.mock.calls[2][0].input).toMatchObject({
      Key: { guid_id: 'legacy-guid' },
      ExpressionAttributeValues: { ':expectedId': 'legacy-id' },
    });
  });

  it('updates a job without attempting to change its primary key', async () => {
    const existing = { id: 'job-guid', guid_id: 'job-guid', entityType: 'job' };
    documentClient.send.mockResolvedValueOnce({ Item: existing }).mockResolvedValueOnce({ Attributes: { ...existing, titulo: 'Updated' } });
    const result = await createEntityService('job', 'Vagas').update('job-guid', { guid_id: 'different', titulo: 'Updated' });
    expect(result.titulo).toBe('Updated');
    const command = documentClient.send.mock.calls[1][0];
    expect(command).toBeInstanceOf(UpdateCommand);
    expect(command.input.Key).toEqual({ guid_id: 'job-guid' });
    expect(Object.values(command.input.ExpressionAttributeValues)).not.toContain('different');
  });

  it('prevents an edit from racing a closure or being applied to a different cycle', async () => {
    documentClient.send.mockResolvedValueOnce({ Item: { id: 'job-guid', guid_id: 'job-guid', entityType: 'job', status: 'Encerrada' } });
    await expect(createEntityService('job', 'Vagas').update('job-guid', { titulo: 'Late edit' }, { expectedCycle: 1, ownerSub: 'company' }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(documentClient.send).toHaveBeenCalledTimes(1);
    documentClient.send.mockReset().mockResolvedValue({ Item: { id: 'job-guid', guid_id: 'job-guid', entityType: 'job', status: 'Aberto', ciclo_atual: 2 } });
    await expect(createEntityService('job', 'Vagas').update('job-guid', { titulo: 'Stale edit' }, { expectedCycle: 1, ownerSub: 'company' }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(documentClient.send).toHaveBeenCalledTimes(1);
  });

  it('checks the company and open cycle again in the actual database update', async () => {
    const existing = { id: 'job-guid', guid_id: 'job-guid', entityType: 'job', status: 'Aberto', owner_sub: 'company', ciclo_atual: 2 };
    documentClient.send.mockResolvedValueOnce({ Item: existing }).mockResolvedValueOnce({ Attributes: existing });
    await createEntityService('job', 'Vagas').update('job-guid', { titulo: 'Updated' }, { expectedCycle: 2, ownerSub: 'company' });
    const { ConditionExpression, ExpressionAttributeValues } = documentClient.send.mock.calls[1][0].input;
    expect(ConditionExpression).toContain('#status <> :closed');
    expect(ConditionExpression).toContain('#cycle = :cycle');
    expect(ExpressionAttributeValues).toMatchObject({ ':cycle': 2, ':owner': 'company' });
  });

  it.each([
    ['company', 'Empresas', 'cd_cnpj'],
    ['user', 'Usuarios', 'cd_cpf'],
  ])('uses the deployed %s key', async (type, table, primaryKey) => {
    documentClient.send.mockResolvedValue({ Item: { id: 'value', [primaryKey]: 'value', entityType: type } });
    await createEntityService(type, table).findById('value');
    expect(documentClient.send.mock.calls[0][0].input.Key).toEqual({ [primaryKey]: 'value' });
  });
});
