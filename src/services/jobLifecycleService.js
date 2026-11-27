const { v5: uuidv5 } = require('uuid');
const { GetCommand, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { documentClient } = require('../aws_services/dynamoClient');
const { TABLE_NAMES } = require('../config/tableNames');
const { isLocalHarness } = require('../harness/config');
const { ForbiddenError, ValidationError } = require('../utils/errors');
const { createEntityService } = require('./entityServiceFactory');

const jobs = createEntityService('job', TABLE_NAMES.job);
const CYCLE_NAMESPACE = 'bd31679f-6bb0-42aa-a672-076a40b2acb2';
const cycleOf = item => Number.isSafeInteger(item?.ciclo_atual) && item.ciclo_atual > 0 ? item.ciclo_atual : 1;
const applicationCycle = item => Number.isSafeInteger(item?.ciclo) && item.ciclo > 0 ? item.ciclo : 1;
const closureId = (guid, cycle) => uuidv5(`${guid}:${cycle}`, CYCLE_NAMESPACE);
const conflict = message => Object.assign(new Error(message), { statusCode: 409 });

function stage(status) {
  const normalized = String(status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (/rejeitado|reprovado|nao aderente/.test(normalized)) return 'Rejeitado';
  if (/contratado|admissao|hired/.test(normalized)) return 'Contratado';
  if (/oferta|proposta/.test(normalized)) return 'Proposta';
  if (/tecnica|gestor|case|teste/.test(normalized) || normalized === 'hm') return 'Entrevista Técnica';
  if (/recrutador|people/.test(normalized) || ['rh', 'entrevista-rh'].includes(normalized)) return 'Entrevista RH';
  return 'Novos';
}
const isFinal = item => ['Contratado', 'Rejeitado'].includes(stage(item.status));

function validateCycle(value, required = false) {
  if ((required || value !== undefined) && (!Number.isSafeInteger(value) || value < 1)) {
    throw new ValidationError('Informe um ciclo válido para a vaga.');
  }
}

// Shared by application writes and lifecycle transitions. A legacy vacancy belongs to cycle 1.
function cycleCondition(job, { open = false, owner } = {}) {
  const cycle = cycleOf(job);
  return {
    ConditionExpression: 'attribute_exists(guid_id) AND #entity = :entity AND '
      + (cycle === 1 ? '(attribute_not_exists(#cycle) OR #cycle = :cycle)' : '#cycle = :cycle')
      + (open ? ' AND (attribute_not_exists(#status) OR #status <> :closed)' : '')
      + (owner ? ' AND #owner = :owner' : ''),
    ExpressionAttributeNames: { '#entity': 'entityType', '#cycle': 'ciclo_atual',
      ...(open ? { '#status': 'status' } : {}), ...(owner ? { '#owner': 'owner_sub' } : {}) },
    ExpressionAttributeValues: { ':entity': 'job', ':cycle': cycle,
      ...(open ? { ':closed': 'Encerrada' } : {}), ...(owner ? { ':owner': owner } : {}) },
  };
}

function closureRecord(job, now) {
  const id = closureId(job.guid_id, cycleOf(job));
  return { guid_id: id, id, entityType: 'job-cycle', guid_vaga: job.guid_id, ciclo: cycleOf(job),
    titulo: job.titulo || 'Vaga', encerrada_em: now, createdAt: now, updatedAt: now,
    ...(job.motivo_encerramento ? { motivo_encerramento: job.motivo_encerramento } : {}) };
}

async function getClosure(job, cycle) {
  const id = closureId(job.guid_id, cycle);
  const item = isLocalHarness()
    ? require('../harness/store').read().jobCycle?.find(row => row.guid_id === id)
    : (await documentClient.send(new GetCommand({ TableName: TABLE_NAMES.job,
      Key: { guid_id: id }, ConsistentRead: true }))).Item;
  if (item?.entityType === 'job-cycle') return item;
  // Old closed jobs are readable before their first lifecycle operation migrates the closure.
  if (job.status === 'Encerrada' && cycle === cycleOf(job)) {
    return { ...closureRecord(job, job.encerrada_em || null), ciclo: cycle };
  }
  return null;
}

async function describeApplications(records, jobByGuid) {
  const closures = new Map();
  for (const record of records) {
    const job = jobByGuid.get(record.guid_vaga);
    const cycle = applicationCycle(record);
    if (job && (cycle < cycleOf(job) || job.status === 'Encerrada')) {
      const key = `${job.guid_id}:${cycle}`;
      if (!closures.has(key)) closures.set(key, await getClosure(job, cycle));
    }
  }
  return records.map(record => {
    const job = jobByGuid.get(record.guid_vaga);
    const cycle = applicationCycle(record);
    const ended = Boolean(job && (cycle < cycleOf(job) || job.status === 'Encerrada'));
    const closure = closures.get(`${record.guid_vaga}:${cycle}`);
    const title = closure?.titulo || job?.titulo || 'Vaga indisponível';
    const removed = ended && !isFinal(record);
    const closedAt = closure?.encerrada_em || null;
    const date = closedAt ? new Date(closedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'data não informada';
    return { ...record, ciclo: cycle, cicloAnterior: Boolean(job && cycle < cycleOf(job)),
      somenteLeitura: !job || ended || cycle !== cycleOf(job),
      candidaturaEncerrada: ended, removidaDaSelecao: removed, encerradaEm: closedAt,
      tituloVaga: title, etapa: stage(record.status),
      historico: ended ? [{ tipo: removed ? 'REMOVIDA_POR_ENCERRAMENTO' : 'CICLO_ENCERRADO',
        ciclo: cycle, data: closedAt, etapa: stage(record.status),
        mensagem: `${removed ? 'Candidatura removida da seleção pelo encerramento da vaga' : 'Processo encerrado para a vaga'} ${title}, em ${date}. Última etapa: ${stage(record.status)}.` }] : [],
    };
  });
}

async function transition(id, owner, action, { reason, expectedCycle } = {}) {
  validateCycle(expectedCycle, action === 'reopen');
  expectedCycle ??= 1;
  const job = await jobs.findById(id, { consistentRead: true });
  if (!owner || job.owner_sub !== owner) throw new ForbiddenError('Esta vaga não pertence à empresa autenticada.');
  const cycle = cycleOf(job);
  if (action === 'reopen' && job.status !== 'Encerrada' && cycle === expectedCycle + 1) return job;
  if (expectedCycle !== cycle) throw conflict('O ciclo da vaga mudou. Recarregue a página.');
  if (action === 'close' && job.status === 'Encerrada') return { ...job, ciclo_atual: cycle };
  if (action === 'reopen' && job.status !== 'Encerrada') throw conflict('A vaga já está aberta.');

  const now = new Date().toISOString();
  const reopening = action === 'reopen';
  const closure = reopening ? await getClosure(job, cycle) : closureRecord({ ...job, motivo_encerramento: reason }, now);
  const next = { ...job, status: reopening ? 'Aberto' : 'Encerrada',
    ciclo_atual: reopening ? cycle + 1 : cycle, updatedAt: now };
  if (reopening) {
    delete next.encerrada_em;
    delete next.motivo_encerramento;
    next.reaberta_em = now;
  } else {
    next.encerrada_em = now;
    if (reason) next.motivo_encerramento = reason;
    else delete next.motivo_encerramento;
  }

  if (isLocalHarness()) {
    const store = require('../harness/store');
    const db = store.read();
    const current = db.job.find(row => row.guid_id === job.guid_id);
    if (!current || current.owner_sub !== owner || cycleOf(current) !== cycle || current.status !== job.status) {
      throw conflict('A vaga mudou. Recarregue a página.');
    }
    db.jobCycle ||= [];
    if (closure && !db.jobCycle.some(row => row.guid_id === closure.guid_id)) db.jobCycle.push(closure);
    Object.assign(current, next);
    if (reopening) { delete current.encerrada_em; delete current.motivo_encerramento; }
    else if (!reason) delete current.motivo_encerramento;
    store.save(db);
  } else {
    const condition = cycleCondition(job, { open: !reopening, owner });
    if (reopening) {
      condition.ConditionExpression += ' AND #status = :closed';
      condition.ExpressionAttributeNames['#status'] = 'status';
      condition.ExpressionAttributeValues[':closed'] = 'Encerrada';
    }
    const update = { TableName: TABLE_NAMES.job, Key: { guid_id: job.guid_id }, ...condition,
      UpdateExpression: 'SET #status = :nextStatus, #cycle = :nextCycle, #updated = :now'
        + (reopening ? ', #reopened = :now REMOVE #closedAt, #reason' : ', #closedAt = :now' + (reason ? ', #reason = :reason' : ' REMOVE #reason')),
      ExpressionAttributeNames: { ...condition.ExpressionAttributeNames, '#status': 'status', '#updated': 'updatedAt',
        '#closedAt': 'encerrada_em', '#reason': 'motivo_encerramento', ...(reopening ? { '#reopened': 'reaberta_em' } : {}) },
      ExpressionAttributeValues: { ...condition.ExpressionAttributeValues, ':nextStatus': next.status, ':nextCycle': next.ciclo_atual,
        ':now': now, ...(!reopening && reason ? { ':reason': reason } : {}) } };
    const actions = [{ Update: update }];
    // Current closures already exist; legacy closed vacancies get their event on first reopening.
    if (!reopening || (closure && !await storedClosureExists(closure.guid_id))) {
      actions.push({ Put: { TableName: TABLE_NAMES.job, Item: closure,
        ConditionExpression: 'attribute_not_exists(guid_id)' } });
    }
    try { await documentClient.send(new TransactWriteCommand({ TransactItems: actions })); }
    catch (error) {
      if (error.name === 'TransactionCanceledException') throw conflict('A vaga mudou. Recarregue a página.');
      throw error;
    }
  }
  return next;
}

async function storedClosureExists(id) {
  return Boolean((await documentClient.send(new GetCommand({ TableName: TABLE_NAMES.job,
    Key: { guid_id: id }, ConsistentRead: true }))).Item);
}

async function updateApplication(record, job, owner, updates) {
  if (job.owner_sub !== owner) throw new ForbiddenError('Esta vaga não pertence à empresa autenticada.');
  if (job.status === 'Encerrada' || applicationCycle(record) !== cycleOf(job)) {
    throw conflict('Esta candidatura pertence a um ciclo encerrado e está disponível somente para consulta.');
  }
  if (updates.status !== undefined && !['novo', 'entrevista-rh', 'entrevista-tecnica', 'proposta', 'contratado', 'rejeitado'].includes(updates.status)) {
    throw new ValidationError('Etapa da candidatura inválida.');
  }
  if (updates.anotacoes !== undefined && (typeof updates.anotacoes !== 'string' || updates.anotacoes.length > 20000)) {
    throw new ValidationError('Anotação inválida.');
  }
  const next = { ...record, ...updates, updatedAt: new Date().toISOString() };
  if (isLocalHarness()) {
    const store = require('../harness/store');
    const db = store.read();
    const currentJob = db.job.find(row => row.guid_id === job.guid_id);
    const current = db.candidate.find(row => row.guid_id === record.guid_id);
    if (!currentJob || currentJob.owner_sub !== owner || currentJob.status === 'Encerrada'
      || cycleOf(currentJob) !== applicationCycle(record) || !current || current.updatedAt !== record.updatedAt) {
      throw conflict('A candidatura ou a vaga mudou. Recarregue a página.');
    }
    Object.assign(current, next);
    store.save(db);
  } else {
    const fields = Object.keys(updates);
    if (!fields.length) return record;
    try {
      await documentClient.send(new TransactWriteCommand({ TransactItems: [
        { ConditionCheck: { TableName: TABLE_NAMES.job, Key: { guid_id: job.guid_id }, ...cycleCondition(job, { open: true, owner }) } },
        { Update: { TableName: TABLE_NAMES.candidate, Key: { guid_id: record.guid_id },
          ConditionExpression: 'attribute_exists(guid_id) AND #job = :job AND '
            + (record.updatedAt ? '#updated = :previous' : 'attribute_not_exists(#updated)'),
          UpdateExpression: 'SET #updated = :now, ' + fields.map((_, i) => `#f${i} = :v${i}`).join(', '),
          ExpressionAttributeNames: { '#job': 'guid_vaga', '#updated': 'updatedAt', ...Object.fromEntries(fields.map((field, i) => [`#f${i}`, field])) },
          ExpressionAttributeValues: { ':job': job.guid_id, ':now': next.updatedAt,
            ...(record.updatedAt ? { ':previous': record.updatedAt } : {}),
            ...Object.fromEntries(fields.map((field, i) => [`:v${i}`, updates[field]])) } } },
      ] }));
    } catch (error) {
      if (error.name === 'TransactionCanceledException') throw conflict('A candidatura ou a vaga mudou. Recarregue a página.');
      throw error;
    }
  }
  return next;
}

module.exports = { cycleOf, applicationCycle, stage, isFinal, cycleCondition, describeApplications, transition, updateApplication };
