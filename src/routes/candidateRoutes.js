const express = require('express');
const {
  createCandidate,
  listCandidates,
  listCandidatesByJobGuids,
  getCandidate,
  updateCandidate,
  deleteCandidate,
} = require('../controllers/candidateController');

const router = express.Router();

router.post('/', createCandidate);
router.get('/', listCandidates);
router.post('/by-job-guids', listCandidatesByJobGuids);
router.get('/:id', getCandidate);
router.put('/:id', updateCandidate);
router.delete('/:id', deleteCandidate);

module.exports = router;
