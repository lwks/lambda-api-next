const { v5: uuidv5 } = require('uuid');
const { GetCommand, PutCommand, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { documentClient } = require('../aws_services/dynamoClient');
const { TABLE_NAMES } = require('../config/tableNames');
const { isLocalHarness } = require('../harness/config');
const { ValidationError, ForbiddenError } = require('../utils/errors');
const { createEntityService } = require('./entityServiceFactory');
const cvStorage = require('./cvStorageService');

const PROFILE_TABLE = process.env.CANDIDATE_PROFILE_TABLE_NAME || 'candidato_perfil';
const NAMESPACE = 'aabff8ea-7930-4f2d-86aa-18d6b5a99137';
const LGPD_PERIOD_MS = 21 * 24 * 60 * 60 * 1000;
const PROFILE_FIELDS = [
  'nome', 'documento', 'dataNascimento', 'localResidencia', 'endereco', 'cidade', 'estado',
  'contatoCel', 'contato', 'empresaAtual', 'indicacao', 'indicacoes', 'senioridade',
  'beneficiosAtuais', 'experiencia', 'salarioAtual', 'setorAtual', 'timeAtual',
  'industriaInteresse', 'hardSkillsProfissionais', 'softSkillsProfissionais',
  'tipoContratacao', 'modeloTrabalho', 'setor', 'time', 'senioridadePreferencia',
  'areaPreferencia', 'idiomas', 'hardSkills', 'softSkills', 'viagemTrabalho', 'sobreVoce',
];
const REQUIRED_FIELDS = PROFILE_FIELDS.filter(field => !['indicacao', 'indicacoes'].includes(field));
const ARRAY_FIELDS = new Set(['beneficiosAtuais', 'timeAtual', 'industriaInteresse', 'hardSkillsProfissionais',
  'softSkillsProfissionais', 'tipoContratacao', 'modeloTrabalho', 'setor', 'time',
  'senioridadePreferencia', 'areaPreferencia', 'idiomas', 'hardSkills', 'softSkills']);
const jobs = createEntityService('job', TABLE_NAMES.job);

function conflict(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

function applicationId(sub, jobGuid) { return uuidv5(`${sub}:${jobGuid}`, NAMESPACE); }
function needsLgpd(profile, now = Date.now()) {
  const acceptedAt = Date.parse(profile?.lgpdAcceptedAt || '');
  return !profile?.lgpdAccepted || !Number.isFinite(acceptedAt) || now - acceptedAt >= LGPD_PERIOD_MS;
}
function cleanProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ValidationError('Invalid profile');
  const output = Object.fromEntries(PROFILE_FIELDS.filter(field => input[field] !== undefined).map(field => [field, input[field]]));
  for (const field of REQUIRED_FIELDS) {
    const value = output[field];
    if (value === undefined || value === null || (typeof value === 'string' && !value.trim())
      || (Array.isArray(value) && !value.length)) throw new ValidationError(`Missing profile field: ${field}`);
    if (ARRAY_FIELDS.has(field)) {
      if (!Array.isArray(value) || value.length > 100) throw new ValidationError(`Invalid profile field: ${field}`);
    } else if (typeof value !== 'string' || value.length > 5000) throw new ValidationError(`Invalid profile field: ${field}`);
  }
  if (output.indicacoes !== undefined && (!Array.isArray(output.indicacoes) || output.indicacoes.length > 20))
    throw new ValidationError('Invalid recommendations');
  return output;
}
function publicProfile(item) {
  if (!item) return null;
  const { candidato_sub, ...profile } = item;
  return { ...profile, lgpdRenewalRequired: needsLgpd(item) };
}
async function findProfile(sub) {
  if (!sub) throw new ForbiddenError('Candidate identity missing');
  if (isLocalHarness()) return require('../harness/store').read().profile?.find(row => row.candidato_sub === sub) || null;
  const result = await documentClient.send(new GetCommand({ TableName: PROFILE_TABLE, Key: { candidato_sub: sub }, ConsistentRead: true }));
  return result.Item || null;
}
async function getProfile(sub) { return publicProfile(await findProfile(sub)); }

async function saveProfile(sub, body) {
  const existing = await findProfile(sub);
  if (existing && body.version !== existing.version) throw conflict('Profile version is outdated');
  if (!existing && body.version !== undefined) throw conflict('Profile does not exist');
  const profile = cleanProfile(body.profile);
  const now = new Date().toISOString();
  const lgpdAcceptedAt = body.lgpdAccepted === true ? now : existing?.lgpdAcceptedAt;
  if (needsLgpd({ lgpdAccepted: Boolean(lgpdAcceptedAt), lgpdAcceptedAt }) ) throw new ValidationError('Accept the privacy terms');
  const item = { ...profile, candidato_sub: sub, cv: existing?.cv || null, version: (existing?.version || 0) + 1,
    lgpdAccepted: true, lgpdAcceptedAt, createdAt: existing?.createdAt || now, updatedAt: now };
  if (isLocalHarness()) {
    const store = require('../harness/store');
    const db = store.read(); db.profile ||= [];
    const current = db.profile.find(row => row.candidato_sub === sub);
    if ((current?.version || 0) !== (existing?.version || 0)) throw conflict('Profile version is outdated');
    db.profile = db.profile.filter(row => row.candidato_sub !== sub); db.profile.push(item); store.save(db);
  } else {
    await documentClient.send(new PutCommand({ TableName: PROFILE_TABLE, Item: item,
      ConditionExpression: existing ? '#version = :version' : 'attribute_not_exists(candidato_sub)',
      ...(existing ? { ExpressionAttributeNames: { '#version': 'version' }, ExpressionAttributeValues: { ':version': existing.version } } : {})
    })).catch(error => { if (error.name === 'ConditionalCheckFailedException') throw conflict('Profile version is outdated'); throw error; });
  }
  return publicProfile(item);
}

async function ownApplication(sub, jobGuid) {
  if (!jobGuid || typeof jobGuid !== 'string') throw new ValidationError('guid_vaga is required');
  if (!sub) throw new ForbiddenError('Candidate identity missing');
  const id = applicationId(sub, jobGuid);
  const item = isLocalHarness()
    ? require('../harness/store').read().candidate.find(row => row.guid_id === id)
    : (await documentClient.send(new GetCommand({ TableName: TABLE_NAMES.candidate, Key: { guid_id: id }, ConsistentRead: true }))).Item;
  return item?.candidate_sub === sub ? item : null;
}

async function createApplication(auth, body, { legacyCv = false } = {}) {
  const sub = auth?.sub;
  if (!sub) throw new ForbiddenError('Candidate identity missing');
  const { guid_vaga: jobGuid, mode, profileVersion, application = {} } = body || {};
  if (typeof jobGuid !== 'string' || !jobGuid.trim()) throw new ValidationError('guid_vaga is required');
  if (!['USE_SAVED_PROFILE', 'UPDATE_PROFILE'].includes(mode)) throw new ValidationError('Invalid application mode');
  if (application.compartilhamentoAccepted !== true) throw new ValidationError('Confirm data sharing for this application');
  if (typeof application.pretensaoSalarial !== 'string' || !application.pretensaoSalarial.trim()) throw new ValidationError('Salary expectation is required');
  if (typeof application.mensagemEmpresa !== 'string') throw new ValidationError('Company message is invalid');
  if (!['KEEP', 'REPLACE', 'REMOVE'].includes(application.cvAction)) throw new ValidationError('Invalid CV action');
  const job = await jobs.findById(jobGuid);
  if (job.status === 'Encerrada') throw conflict('Vacancy is closed');
  const existing = await findProfile(sub);
  if (mode === 'USE_SAVED_PROFILE' && !existing) throw new ValidationError('Saved profile not found');
  if (existing && profileVersion !== existing.version) throw conflict('Profile version is outdated');
  if (!existing && profileVersion !== undefined) throw conflict('Profile does not exist');
  if (await ownApplication(sub, jobGuid)) throw conflict('Application already exists for this vacancy');
  const now = new Date().toISOString();
  const renewLgpd = needsLgpd(existing);
  if (renewLgpd && application.lgpdAccepted !== true) throw new ValidationError('Accept the privacy terms again');
  const profileData = mode === 'UPDATE_PROFILE' ? cleanProfile(body.profile) : Object.fromEntries(PROFILE_FIELDS.map(field => [field, existing[field]]).filter(([, value]) => value !== undefined));
  let cv = existing?.cv || null;
  if (application.cvAction === 'REPLACE') {
    cv = application.cv;
    const profileKey = typeof cv?.key === 'string' && /^cvs\/[A-Za-z0-9_-]+\/profile\/[0-9a-f-]{36}\.(pdf|doc|docx)$/i.test(cv.key)
      && cv.key.startsWith(`cvs/${sub}/profile/`);
    const oldKey = legacyCv && typeof cv?.key === 'string' && /^cvs\/[A-Za-z0-9_-]+\/[0-9a-f-]{36}\.(pdf|doc|docx)$/i.test(cv.key)
      && cv.key.startsWith(`cvs/${sub}/`);
    if (!profileKey && !oldKey) throw new ValidationError('Invalid CV reference');
    await cvStorage.verifyUploadedCv(cv);
  }
  const profileChanges = mode === 'UPDATE_PROFILE' || renewLgpd || application.cvAction === 'REPLACE';
  const nextProfile = { ...profileData, candidato_sub: sub, cv, version: (existing?.version || 0) + (profileChanges ? 1 : 0),
    lgpdAccepted: true, lgpdAcceptedAt: renewLgpd ? now : existing.lgpdAcceptedAt,
    createdAt: existing?.createdAt || now, updatedAt: profileChanges ? now : existing.updatedAt };
  const id = applicationId(sub, jobGuid);
  const record = { ...profileData, guid_id: id, id, guid_vaga: jobGuid, candidate_sub: sub,
    profile_version: nextProfile.version, mensagemEmpresa: application.mensagemEmpresa,
    pretensaoSalarial: application.pretensaoSalarial, compartilhamentoAccepted: true,
    lgpdAccepted: true, lgpdAcceptedAt: nextProfile.lgpdAcceptedAt,
    ...(application.cvAction === 'REMOVE' ? {} : cv ? { cv } : {}),
    status: 'Novo', entityType: 'candidate', createdAt: now, updatedAt: now };
  if (isLocalHarness()) {
    const store = require('../harness/store');
    const db = store.read(); db.profile ||= [];
    const currentJob = db.job.find(row => row.guid_id === jobGuid);
    if (!currentJob || currentJob.status === 'Encerrada') throw conflict('Vacancy is closed');
    if (db.candidate.some(row => row.guid_id === id)) throw conflict('Application already exists for this vacancy');
    const current = db.profile.find(row => row.candidato_sub === sub);
    if ((current?.version || 0) !== (existing?.version || 0)) throw conflict('Profile version is outdated');
    if (profileChanges) db.profile = [...db.profile.filter(row => row.candidato_sub !== sub), nextProfile];
    db.candidate.push(record); store.save(db);
  } else {
    const actions = [{ ConditionCheck: { TableName: TABLE_NAMES.job, Key: { guid_id: jobGuid },
      ConditionExpression: 'attribute_exists(guid_id) AND (#status <> :closed OR attribute_not_exists(#status))',
      ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: { ':closed': 'Encerrada' } } }];
    if (profileChanges) actions.push({ Put: { TableName: PROFILE_TABLE, Item: nextProfile,
      ConditionExpression: existing ? '#version = :version' : 'attribute_not_exists(candidato_sub)',
      ...(existing ? { ExpressionAttributeNames: { '#version': 'version' }, ExpressionAttributeValues: { ':version': existing.version } } : {}) } });
    else actions.push({ ConditionCheck: { TableName: PROFILE_TABLE, Key: { candidato_sub: sub },
      ConditionExpression: '#version = :version', ExpressionAttributeNames: { '#version': 'version' },
      ExpressionAttributeValues: { ':version': existing.version } } });
    actions.push({ Put: { TableName: TABLE_NAMES.candidate, Item: record, ConditionExpression: 'attribute_not_exists(guid_id)' } });
    await documentClient.send(new TransactWriteCommand({ TransactItems: actions })).catch(error => {
      if (error.name === 'TransactionCanceledException') throw conflict('Profile, vacancy or application changed; reload and try again');
      throw error;
    });
  }
  return record;
}

module.exports = { getProfile, saveProfile, ownApplication, createApplication, applicationId, needsLgpd, PROFILE_FIELDS };
