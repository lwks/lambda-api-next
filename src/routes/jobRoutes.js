const express = require('express');
const {
  createJob,
  listJobs,
  listCompanyJobs,
  closeJob,
  getJob,
  updateJob,
  deleteJob,
} = require('../controllers/jobController');
const { requireAccountType } = require('../middleware/auth');

const router = express.Router();

router.post('/', requireAccountType('COMPANY'), createJob);
router.get('/mine', requireAccountType('COMPANY'), listCompanyJobs);
router.post('/:id/close', requireAccountType('COMPANY'), closeJob);
router.get('/', listJobs);
router.get('/:id', getJob);
router.put('/:id', requireAccountType('COMPANY'), updateJob);
router.delete('/:id', requireAccountType('COMPANY'), deleteJob);

module.exports = router;
