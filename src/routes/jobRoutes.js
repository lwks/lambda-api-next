const express = require('express');
const {
  createJob,
  listJobs,
  getJob,
  updateJob,
  deleteJob,
} = require('../controllers/jobController');
const { requireAccountType } = require('../middleware/auth');

const router = express.Router();

router.post('/', requireAccountType('COMPANY'), createJob);
router.get('/', listJobs);
router.get('/:id', getJob);
router.put('/:id', updateJob);
router.delete('/:id', deleteJob);

module.exports = router;
