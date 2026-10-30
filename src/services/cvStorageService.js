const crypto = require('crypto');
const { fromNodeProviderChain } = require('@aws-sdk/credential-provider-node');
const { ValidationError, NotFoundError, ForbiddenError } = require('../utils/errors');
const { createEntityService } = require('./entityServiceFactory');
const { TABLE_NAMES } = require('../config/tableNames');

const MAX_CV_BYTES = 5 * 1024 * 1024;
const TYPES = {
  pdf: { type: 'application/pdf', ext: 'pdf' },
  doc: { type: 'application/msword', ext: 'doc' },
  docx: { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' },
};
const candidates = createEntityService('candidate', TABLE_NAMES.candidate);
const jobs = createEntityService('job', TABLE_NAMES.job);

function getConfig() {
  const bucket = process.env.CV_S3_BUCKET;
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
  if (!bucket) throw new Error('CV_S3_BUCKET is not configured');
  return { bucket, region };
}

async function presign(method, key, contentType, filename) {
  const { bucket, region } = getConfig();
  const credentials = await fromNodeProviderChain()();
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const path = `/${key.split('/').map(encodeURIComponent).join('/')}`;
  const now = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = now.slice(0, 8);
  const scope = `${date}/${region}/s3/aws4_request`;
  const params = new URLSearchParams({ 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${credentials.accessKeyId}/${scope}`, 'X-Amz-Date': now, 'X-Amz-Expires': '300', 'X-Amz-SignedHeaders': contentType ? 'content-type;host' : 'host' });
  if (credentials.sessionToken) params.set('X-Amz-Security-Token', credentials.sessionToken);
  if (filename) params.set('response-content-disposition', `attachment; filename="${filename.replace(/["\r\n]/g, '')}"`);
  const canonicalQuery = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const headers = contentType ? `content-type:${contentType}\nhost:${host}\n` : `host:${host}\n`;
  const signedHeaders = contentType ? 'content-type;host' : 'host';
  const canonical = `${method}\n${path}\n${canonicalQuery}\n${headers}\n${signedHeaders}\nUNSIGNED-PAYLOAD`;
  const hash = value => crypto.createHash('sha256').update(value).digest('hex');
  const hmac = (keyBytes, value) => crypto.createHmac('sha256', keyBytes).update(value).digest();
  const stringToSign = `AWS4-HMAC-SHA256\n${now}\n${scope}\n${hash(canonical)}`;
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${credentials.secretAccessKey}`, date), region), 's3'), 'aws4_request');
  params.set('X-Amz-Signature', crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex'));
  return { hostname: host, path, query: Object.fromEntries(params) };
}

function urlOf(request) {
  const query = new URLSearchParams(request.query || {}).toString();
  return `https://${request.hostname}${request.path}${query ? `?${query}` : ''}`;
}

async function createUpload(auth, input) {
  if (!auth?.sub) throw new ForbiddenError('Authenticated candidate identity missing');
  const ext = String(input.filename || '').split('.').pop().toLowerCase();
  const format = TYPES[ext];
  if (!format || input.contentType !== format.type) throw new ValidationError('CV must be a PDF, DOC, or DOCX file');
  if (!Number.isInteger(input.size) || input.size < 1 || input.size > MAX_CV_BYTES) throw new ValidationError('CV file must be no larger than 5 MB');
  const candidateId = String(input.candidateId || '');
  if (!/^[0-9a-f-]{36}$/i.test(candidateId)) throw new ValidationError('Invalid candidature id');
  const key = `cvs/${auth.sub}/${candidateId}.${format.ext}`;
  const signed = await presign('PUT', key, format.type);
  return { uploadUrl: urlOf(signed), key, contentType: format.type, maxBytes: MAX_CV_BYTES };
}

async function verifyUploadedCv(cv) {
  if (!cv || typeof cv.key !== 'string' || typeof cv.filename !== 'string') {
    throw new ValidationError('Invalid CV reference');
  }
  const ext = cv.filename.split('.').pop().toLowerCase();
  const format = TYPES[ext];
  if (!format || cv.contentType !== format.type || !/^cvs\/[A-Za-z0-9_-]+\/[0-9a-f-]{36}\.(pdf|doc|docx)$/i.test(cv.key)) {
    throw new ValidationError('Invalid CV reference');
  }
  const head = await presign('HEAD', cv.key);
  const response = await fetch(urlOf(head), { method: 'HEAD' });
  if (response.status === 404) throw new ValidationError('CV upload was not found');
  if (!response.ok) throw new Error(`Could not verify CV upload (${response.status})`);
  const size = Number(response.headers.get('content-length'));
  const contentType = response.headers.get('content-type');
  if (!Number.isFinite(size) || size < 1 || size > MAX_CV_BYTES || contentType !== format.type) {
    throw new ValidationError('Uploaded CV must match the allowed type and be no larger than 5 MB');
  }
}

async function createDownload(auth, id) {
  if (auth?.accountType !== 'COMPANY') throw new ForbiddenError('Company account required');
  const candidate = await candidates.findById(id);
  if (!candidate.cv?.key || !candidate.guid_vaga) throw new NotFoundError('CV not found');
  const job = await jobs.findById(candidate.guid_vaga);
  const companyId = auth.claims?.app_metadata?.cd_cnpj || auth.claims?.user_metadata?.cd_cnpj || auth.claims?.cd_cnpj;
  const ownerId = job.cd_cnpj || job.companyId || job.company_id || job.criado_por;
  if (!companyId || !ownerId || String(companyId).replace(/\D/g, '') !== String(ownerId).replace(/\D/g, '')) throw new ForbiddenError('Company does not own this vacancy');
  return { downloadUrl: urlOf(await presign('GET', candidate.cv.key, null, candidate.cv.filename)), filename: candidate.cv.filename };
}

module.exports = { createUpload, createDownload, verifyUploadedCv, MAX_CV_BYTES, TYPES };
