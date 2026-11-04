const mockSend = jest.fn();
jest.mock('../../aws_services/dynamoClient', () => ({ documentClient: { send: mockSend } }));
jest.mock('../../services/entityServiceFactory', () => ({ createEntityService: jest.fn(() => ({
  findById: jest.fn(async () => ({ guid_id: 'job-1', status: 'Aberto' })),
})) }));

const { createApplication, PROFILE_FIELDS } = require('../../services/candidateApplicationService');

const arrays = new Set(['beneficiosAtuais', 'timeAtual', 'industriaInteresse', 'hardSkillsProfissionais',
  'softSkillsProfissionais', 'tipoContratacao', 'modeloTrabalho', 'setor', 'time',
  'senioridadePreferencia', 'areaPreferencia', 'idiomas', 'hardSkills', 'softSkills']);
const profile = Object.fromEntries(PROFILE_FIELDS.filter(field => !['indicacao', 'indicacoes'].includes(field))
  .map(field => [field, arrays.has(field) ? ['1'] : 'Candidate']));
const payload = { guid_vaga: 'job-1', mode: 'UPDATE_PROFILE', profile,
  application: { mensagemEmpresa: '', pretensaoSalarial: '10000', compartilhamentoAccepted: true,
    lgpdAccepted: true, cvAction: 'KEEP' } };

beforeEach(() => {
  mockSend.mockReset().mockImplementation(async () => ({}));
});

test('checks the vacancy and conditionally writes profile and application in one DynamoDB transaction', async () => {
  const created = await createApplication({ sub: 'candidate-1' }, payload);
  expect(created).toMatchObject({ candidate_sub: 'candidate-1', profile_version: 1 });
  const transaction = mockSend.mock.calls.map(([command]) => command).find(command => command.constructor.name === 'TransactWriteCommand');
  expect(transaction).toBeTruthy();
  const [job, savedProfile, application] = transaction.input.TransactItems;
  expect(job.ConditionCheck).toMatchObject({ TableName: 'Vagas', Key: { guid_id: 'job-1' } });
  expect(savedProfile.Put).toMatchObject({ TableName: 'candidato_perfil',
    ConditionExpression: 'attribute_not_exists(candidato_sub)', Item: { candidato_sub: 'candidate-1', version: 1 } });
  expect(application.Put).toMatchObject({ TableName: 'Candidaturas',
    ConditionExpression: 'attribute_not_exists(guid_id)', Item: { candidate_sub: 'candidate-1' } });
});

test('maps a canceled transaction to a conflict without writing a second application', async () => {
  mockSend.mockImplementation(async command => {
    if (command.constructor.name === 'TransactWriteCommand') throw Object.assign(new Error('conflict'), { name: 'TransactionCanceledException' });
    return {};
  });
  await expect(createApplication({ sub: 'candidate-1' }, payload)).rejects.toMatchObject({ statusCode: 409 });
});
