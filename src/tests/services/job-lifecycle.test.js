const mockSend = jest.fn();
const mockFindJob = jest.fn();
jest.mock('../../aws_services/dynamoClient', () => ({ documentClient: { send: mockSend } }));
jest.mock('../../services/entityServiceFactory', () => ({ createEntityService: () => ({ findById: mockFindJob }) }));
const { transition, updateApplication, describeApplications } = require('../../services/jobLifecycleService');
const { applicationId } = require('../../services/candidateApplicationService');
const job = { guid_id: 'job-guid', id: 'job-guid', entityType: 'job', owner_sub: 'company', titulo: 'Original title', status: 'Aberto' };
const lastTransaction = () => mockSend.mock.calls.map(([command]) => command).findLast(command => command.constructor.name === 'TransactWriteCommand').input.TransactItems;

beforeEach(() => {
  mockFindJob.mockReset().mockResolvedValue({ ...job });
  mockSend.mockReset().mockResolvedValue({});
});

test('closes a legacy cycle and persists the immutable closure in one transaction', async () => {
  const result = await transition(job.guid_id, 'company', 'close', { expectedCycle: 1, reason: 'Private reason' });
  expect(result).toMatchObject({ status: 'Encerrada', ciclo_atual: 1 });
  const [{ Update: update }, { Put: event }] = lastTransaction();
  expect(update.ConditionExpression).toContain('#owner = :owner');
  expect(update.ConditionExpression).toContain('attribute_not_exists(#cycle) OR #cycle = :cycle');
  expect(update.ConditionExpression).toContain('#status <> :closed');
  expect(event.Item).toMatchObject({ entityType: 'job-cycle', guid_vaga: job.guid_id, ciclo: 1, titulo: job.titulo, motivo_encerramento: 'Private reason' });
  expect(event.Item.encerrada_em).toBe(result.encerrada_em);
  expect(event.ConditionExpression).toBe('attribute_not_exists(guid_id)');
});

test('reopening a legacy closed job preserves its original closure before clearing current metadata', async () => {
  mockFindJob.mockResolvedValue({ ...job, status: 'Encerrada', encerrada_em: '2026-01-01T12:00:00.000Z', motivo_encerramento: 'Private' });
  const result = await transition(job.guid_id, 'company', 'reopen', { expectedCycle: 1 });
  expect(result).toMatchObject({ status: 'Aberto', ciclo_atual: 2, guid_id: job.guid_id });
  expect(result).not.toHaveProperty('encerrada_em');
  expect(result).not.toHaveProperty('motivo_encerramento');
  const [{ Update: update }, { Put: event }] = lastTransaction();
  expect(update.ConditionExpression).toContain('#status = :closed');
  expect(event.Item).toMatchObject({ encerrada_em: '2026-01-01T12:00:00.000Z', motivo_encerramento: 'Private' });
});

test('reopening a current job reuses its closure rather than duplicating it', async () => {
  const closed = { ...job, status: 'Encerrada', ciclo_atual: 2 };
  mockFindJob.mockResolvedValue(closed);
  mockSend.mockResolvedValue({ Item: { guid_id: 'existing-event', entityType: 'job-cycle', ciclo: 2 } });
  expect(await transition(job.guid_id, 'company', 'reopen', { expectedCycle: 2 })).toMatchObject({ ciclo_atual: 3 });
  expect(lastTransaction()).toHaveLength(1);
});

test.each([undefined, 0, -1, 1.5, '1'])('rejects an invalid reopen cycle %s before writing', async cycle => {
  await expect(transition(job.guid_id, 'company', 'reopen', { expectedCycle: cycle })).rejects.toMatchObject({ statusCode: 400 });
  expect(mockSend).not.toHaveBeenCalled();
});

test('rejects other owners and stale tabs without writing', async () => {
  await expect(transition(job.guid_id, 'other', 'close', { expectedCycle: 1 })).rejects.toMatchObject({ statusCode: 403 });
  mockFindJob.mockResolvedValue({ ...job, ciclo_atual: 2 });
  await expect(transition(job.guid_id, 'company', 'close')).rejects.toMatchObject({ statusCode: 409 });
  await expect(transition(job.guid_id, 'company', 'close', { expectedCycle: 1 })).rejects.toMatchObject({ statusCode: 409 });
  expect(mockSend).not.toHaveBeenCalled();
});

test('repeated close and reopen responses do not create another cycle or event', async () => {
  mockFindJob.mockResolvedValue({ ...job, status: 'Encerrada' });
  await expect(transition(job.guid_id, 'company', 'close', { expectedCycle: 1 })).resolves.toMatchObject({ status: 'Encerrada', ciclo_atual: 1 });
  mockFindJob.mockResolvedValue({ ...job, ciclo_atual: 2 });
  await expect(transition(job.guid_id, 'company', 'reopen', { expectedCycle: 1 })).resolves.toMatchObject({ ciclo_atual: 2 });
  expect(mockSend).not.toHaveBeenCalled();
});

test('reports a conditional race and propagates infrastructure errors without a partial success', async () => {
  mockSend.mockRejectedValue(Object.assign(new Error('race'), { name: 'TransactionCanceledException' }));
  await expect(transition(job.guid_id, 'company', 'close', { expectedCycle: 1 })).rejects.toMatchObject({ statusCode: 409 });
  mockSend.mockRejectedValue(new Error('storage unavailable'));
  await expect(transition(job.guid_id, 'company', 'close', { expectedCycle: 1 })).rejects.toThrow('storage unavailable');
});

test('movements check the open cycle and the previous application version atomically', async () => {
  const record = { guid_id: 'application', guid_vaga: job.guid_id, status: 'novo', updatedAt: 'previous' };
  expect(await updateApplication(record, job, 'company', { status: 'entrevista-rh' })).toMatchObject({ status: 'entrevista-rh' });
  const [{ ConditionCheck: check }, { Update: update }] = lastTransaction();
  expect(check.ConditionExpression).toContain('#status <> :closed');
  expect(check.ExpressionAttributeValues).toMatchObject({ ':cycle': 1, ':owner': 'company' });
  expect(update.ConditionExpression).toContain('#updated = :previous');
  expect(update.ExpressionAttributeValues[':previous']).toBe('previous');
  await expect(updateApplication(record, { ...job, ciclo_atual: 2 }, 'company', { status: 'contratado' })).rejects.toMatchObject({ statusCode: 409 });
  await expect(updateApplication(record, job, 'other', { anotacoes: 'forged' })).rejects.toMatchObject({ statusCode: 403 });
});

test('preserves the cycle title and frozen stage without disclosing private closure reasons', async () => {
  mockSend.mockResolvedValue({ Item: { entityType: 'job-cycle', titulo: 'Original title', encerrada_em: '2026-01-01T12:00:00Z', motivo_encerramento: 'Private' } });
  const records = [{ guid_id: 'pending', guid_vaga: job.guid_id, status: 'proposta' }, { guid_id: 'hired', guid_vaga: job.guid_id, status: 'admissão' }];
  const result = await describeApplications(records, new Map([[job.guid_id, { ...job, titulo: 'Edited title', ciclo_atual: 2 }]]));
  expect(result[0]).toMatchObject({ somenteLeitura: true, removidaDaSelecao: true, cicloAnterior: true, tituloVaga: 'Original title' });
  expect(result[0].historico[0].mensagem).toContain('Última etapa: Proposta');
  expect(result[1]).toMatchObject({ somenteLeitura: true, removidaDaSelecao: false, etapa: 'Contratado' });
  expect(JSON.stringify(result)).not.toContain('Private');
  expect(mockSend).toHaveBeenCalledTimes(1);
});

test('uses distinct application identities per cycle while preserving legacy identities', () => {
  expect(applicationId('candidate', 'job')).toBe(applicationId('candidate', 'job', 1));
  expect(new Set([1, 2, 3].map(cycle => applicationId('candidate', 'job', cycle))).size).toBe(3);
});
