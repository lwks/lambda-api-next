const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { dataDirectory } = require('./config');

const databasePath = path.join(dataDirectory, 'database.json');
const primaryKeys = { job: 'guid_id', candidate: 'guid_id', company: 'cd_cnpj', user: 'cd_cpf' };
const JOB_ID = '11111111-1111-4111-8111-111111111111';
const CANDIDATE_ID = '22222222-2222-4222-8222-222222222222';
const COMPANY_SUB = 'company';

function seed() {
  const dates = { createdAt: '2026-01-01T12:00:00.000Z', updatedAt: '2026-01-01T12:00:00.000Z' };
  return {
    job: [{ ...dates, id: JOB_ID, guid_id: JOB_ID, entityType: 'job', owner_sub: COMPANY_SUB,
      titulo: 'Engenheiro de Software Local', empresa: 'Empresa Local', descricao: 'Vaga fictícia para desenvolver aplicações web e serviços de backend.',
      cidade: 'São Paulo', estado: 'SP', localizacao: '01001000', modelo_trabalho: 'remoto',
      formato_contratacao: 'integral', status: 'Aberto', publicada_em: '2026-01-01',
      area: [3], time: ['Desenvolvimento Back-end'], skills: ['JavaScript', 'Node.js'], beneficios: ['Vale refeição'],
      orcamento: { valor_inicial: 8000, valor_final: 12000 }, exibir_salario: true }],
    candidate: [{ ...dates, id: CANDIDATE_ID, guid_id: CANDIDATE_ID, guid_vaga: JOB_ID, entityType: 'candidate',
      nome: 'Mariana Local', contato: 'candidate@example.com', contatoCel: '11999999999', status: 'Novo',
      cidade: 'São Paulo', estado: 'SP', experiencia: '3-5 anos', senioridade: 'Senior',
      hardSkills: ['JavaScript'], softSkills: ['Colaboracao'], anotacoes: 'Candidatura fictícia do harness.',
      cv: { key: `cvs/candidate/${CANDIDATE_ID}.pdf`, filename: 'curriculo-local.pdf', contentType: 'application/pdf' } }],
    company: [{ ...dates, id: 'local-company', cd_cnpj: '00000000000100', entityType: 'company', nome: 'Empresa Local' }],
    user: [],
  };
}

function save(database) {
  fs.mkdirSync(dataDirectory, { recursive: true });
  const temp = `${databasePath}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(database, null, 2));
  fs.renameSync(temp, databasePath);
}

function read() {
  if (!fs.existsSync(databasePath)) save(seed());
  return JSON.parse(fs.readFileSync(databasePath, 'utf8'));
}

// Synchronous file transactions keep each read/modify/write atomic within this single-process harness.
function createLocalEntityService(entityType) {
  const key = primaryKeys[entityType];
  if (!key) throw new Error(`Unsupported entity type: ${entityType}`);
  function find(rows, id) {
    const item = rows.find(row => row.id === id || row[key] === id);
    if (!item) throw new NotFoundError(`${entityType} with id ${id} not found`);
    return item;
  }
  return {
    async create(payload) {
      if (!payload[key]) throw new ValidationError(`Missing primary key: ${key}`);
      const db = read();
      const now = new Date().toISOString();
      const item = { ...payload, id: payload.id || payload[key] || randomUUID(), entityType,
        createdAt: payload.createdAt || now, updatedAt: now };
      db[entityType] = db[entityType].filter(row => row[key] !== item[key]);
      db[entityType].push(item);
      save(db);
      return item;
    },
    async findById(id) { return find(read()[entityType], id); },
    async update(id, updates) {
      const db = read();
      const item = find(db[entityType], id);
      const allowed = Object.fromEntries(Object.entries(updates).filter(([field, value]) =>
        !['id', 'entityType', key, 'updatedAt'].includes(field) && value !== undefined));
      Object.assign(item, allowed, { updatedAt: new Date().toISOString() });
      save(db);
      return item;
    },
    async remove(id) {
      const db = read();
      const item = find(db[entityType], id);
      db[entityType] = db[entityType].filter(row => row !== item);
      save(db);
      return true;
    },
    async list({ limit = 20, lastKey } = {}) {
      const rows = read()[entityType];
      const start = lastKey ? rows.findIndex(row => row[key] === lastKey[key]) + 1 : 0;
      const items = rows.slice(start, start + limit);
      return { items, lastEvaluatedKey: start + limit < rows.length ? { [key]: items.at(-1)[key] } : undefined };
    },
    async listByFieldValues({ field, values }) {
      return read()[entityType].filter(row => values.includes(row[field]));
    },
  };
}

module.exports = { createLocalEntityService, seed, save, read, JOB_ID, CANDIDATE_ID, COMPANY_SUB };
