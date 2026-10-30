const express = require('express');
const {
  createCandidate,
  listCandidates,
  listCandidatesByJobGuids,
  getCandidate,
  updateCandidate,
  deleteCandidate,
  createCvUpload,
  getCvDownload,
} = require('../controllers/candidateController');
const { requireAccountType } = require('../middleware/auth');

const router = express.Router();

router.post('/', requireAccountType('CANDIDATE'), createCandidate);
router.post('/cv-upload', requireAccountType('CANDIDATE'), createCvUpload);
router.get('/:id/cv-download', requireAccountType('COMPANY'), getCvDownload);
router.get('/', listCandidates);
router.get('/by-job-guids', requireAccountType('COMPANY'), listCandidatesByJobGuids);
router.get('/:id', getCandidate);
router.put('/:id', updateCandidate);
router.delete('/:id', deleteCandidate);

module.exports = router;
