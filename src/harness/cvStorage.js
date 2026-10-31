const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const { dataDirectory } = require('./config');
const { createLocalEntityService, CANDIDATE_ID } = require('./store');
const { ValidationError, ForbiddenError, NotFoundError } = require('../utils/errors');

const MAX_CV_BYTES = 5 * 1024 * 1024;
const TYPES = {
  pdf: { type: 'application/pdf', ext: 'pdf' },
  doc: { type: 'application/msword', ext: 'doc' },
  docx: { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' },
};
const secret = crypto.randomBytes(32);
const root = path.join(dataDirectory, 'uploads');
const keyPattern = /^cvs\/[A-Za-z0-9_-]+\/[0-9a-f-]{36}\.(pdf|doc|docx)$/i;

function filenameFor(key) {
  if (typeof key !== 'string' || !keyPattern.test(key)) throw new ValidationError('Invalid CV key');
  return path.join(root, `${crypto.createHash('sha256').update(key).digest('hex')}.json`);
}

function sign(payload) { return crypto.createHmac('sha256', secret).update(payload).digest('hex'); }

function urlFor(method, key, contentType, filename) {
  const payload = Buffer.from(JSON.stringify({ method, key, contentType, filename, expires: Date.now() + 300000 })).toString('base64url');
  return `http://localhost:${process.env.PORT || 3001}/__local/files?payload=${payload}&signature=${sign(payload)}`;
}

function writeFile(key, contentType, bytes) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(filenameFor(key), JSON.stringify({ contentType, bytes: bytes.toString('base64') }));
}

function initializeCv() {
  const key = `cvs/candidate/${CANDIDATE_ID}.pdf`;
  if (!fs.existsSync(filenameFor(key))) {
    // A small valid PDF fixture, with no external fonts or personal data.
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R >>', '<< /Length 0 >>\nstream\n\nendstream'];
    let pdf = '%PDF-1.4\n'; const offsets = [0];
    objects.forEach((obj, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`; });
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    writeFile(key, 'application/pdf', Buffer.from(pdf));
  }
}

function readFile(key) {
  const file = filenameFor(key);
  if (!fs.existsSync(file)) throw new NotFoundError('CV not found');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function createUpload(auth, input) {
  if (!auth?.sub) throw new ForbiddenError('Authenticated candidate identity missing');
  const format = TYPES[String(input.filename || '').split('.').pop().toLowerCase()];
  if (!format || format.type !== input.contentType) throw new ValidationError('CV must be a PDF, DOC, or DOCX file');
  if (!Number.isInteger(input.size) || input.size < 1 || input.size > MAX_CV_BYTES) throw new ValidationError('CV file must be no larger than 5 MB');
  if (!/^[0-9a-f-]{36}$/i.test(input.candidateId || '')) throw new ValidationError('Invalid candidature id');
  const key = `cvs/${auth.sub}/${input.candidateId}.${format.ext}`;
  filenameFor(key);
  return { uploadUrl: urlFor('PUT', key, format.type), key, contentType: format.type, maxBytes: MAX_CV_BYTES };
}

async function verifyUploadedCv(cv) {
  if (!cv || typeof cv.filename !== 'string') throw new ValidationError('Invalid CV reference');
  const format = TYPES[cv.filename.split('.').pop().toLowerCase()];
  if (!format || format.type !== cv.contentType || !cv.key?.endsWith(`.${format.ext}`)) throw new ValidationError('Invalid CV reference');
  let file;
  try { file = readFile(cv.key); } catch (error) {
    if (error instanceof NotFoundError) throw new ValidationError('CV upload was not found');
    throw error;
  }
  const size = Buffer.from(file.bytes, 'base64').length;
  if (!size || size > MAX_CV_BYTES || file.contentType !== cv.contentType) throw new ValidationError('Invalid uploaded CV');
}

async function createDownload(auth, id) {
  if (auth?.accountType !== 'COMPANY') throw new ForbiddenError('Company account required');
  const candidate = await createLocalEntityService('candidate').findById(id);
  if (!candidate.cv?.key || !candidate.guid_vaga) throw new NotFoundError('CV not found');
  const job = await createLocalEntityService('job').findById(candidate.guid_vaga);
  if (!auth.sub || !job.owner_sub || job.owner_sub !== auth.sub) throw new ForbiddenError('Company does not own this vacancy');
  readFile(candidate.cv.key);
  return { downloadUrl: urlFor('GET', candidate.cv.key, null, candidate.cv.filename), filename: candidate.cv.filename };
}

function fileRouter() {
  const router = express.Router();
  router.get('/health', (req, res) => res.json({ service: 'ats-local-api', mode: 'local' }));
  router.all('/files', express.raw({ type: () => true, limit: MAX_CV_BYTES }), (req, res, next) => {
    try {
      const { payload, signature } = req.query;
      if (typeof payload !== 'string' || typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)
          || !crypto.timingSafeEqual(Buffer.from(sign(payload)), Buffer.from(signature))) throw new ForbiddenError('Invalid local file signature');
      const grant = JSON.parse(Buffer.from(payload, 'base64url').toString());
      if (grant.method !== req.method || grant.expires < Date.now()) throw new ForbiddenError('Expired or invalid local file grant');
      if (req.method === 'PUT') {
        if (!Buffer.isBuffer(req.body) || !req.body.length || req.get('Content-Type') !== grant.contentType) throw new ValidationError('Invalid CV upload');
        writeFile(grant.key, grant.contentType, req.body);
        return res.status(200).end();
      }
      const file = readFile(grant.key);
      res.set('Content-Type', file.contentType);
      res.attachment(String(grant.filename || 'curriculo').replace(/["\r\n]/g, ''));
      return res.send(Buffer.from(file.bytes, 'base64'));
    } catch (error) { return next(error); }
  });
  return router;
}

module.exports = { createUpload, verifyUploadedCv, createDownload, fileRouter, initializeCv, MAX_CV_BYTES, TYPES };
