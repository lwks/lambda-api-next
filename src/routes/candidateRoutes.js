const express = require('express');
const {
  createCandidate,
  listCandidates,
  getCandidate,
  updateCandidate,
  deleteCandidate,
} = require('../controllers/candidateController');

const router = express.Router();

router.post('/', createCandidate);
router.get('/', listCandidates);
router.get('/:id', getCandidate);
router.put('/:id', updateCandidate);
router.delete('/:id', deleteCandidate);

module.exports = router;
