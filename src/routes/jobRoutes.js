const express = require('express');
const {
  createJob,
  listJobs,
  getJob,
  updateJob,
  deleteJob,
} = require('../controllers/jobController');

const router = express.Router();

router.post('/', createJob);
router.get('/', listJobs);
router.get('/:id', getJob);
router.put('/:id', updateJob);
router.delete('/:id', deleteJob);

module.exports = router;
