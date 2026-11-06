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
const applications = require('../services/candidateApplicationService');
const { success, created } = require('../utils/response');

const router = express.Router();

router.get('/me/profile', requireAccountType('CANDIDATE'), async (req, res, next) => {
  try { return success(res, await applications.getProfile(req.auth.sub)); } catch (error) { return next(error); }
});
router.put('/me/profile', requireAccountType('CANDIDATE'), async (req, res, next) => {
  try { return success(res, await applications.saveProfile(req.auth.sub, req.body || {})); } catch (error) { return next(error); }
});
router.post('/me/cv-upload', requireAccountType('CANDIDATE'), async (req, res, next) => {
  try { return success(res, await require('../services/cvStorageService').createProfileUpload(req.auth, req.body || {})); } catch (error) { return next(error); }
});
router.get('/me/cv-download', requireAccountType('CANDIDATE'), async (req, res, next) => {
  try {
    const profile = await applications.getProfile(req.auth.sub);
    return success(res, await require('../services/cvStorageService').createProfileDownload(req.auth, profile?.cv));
  } catch (error) { return next(error); }
});
router.get('/me/applications', requireAccountType('CANDIDATE'), async (req, res, next) => {
  try { return success(res, await applications.ownApplication(req.auth.sub, req.query.guid_vaga)); } catch (error) { return next(error); }
});
router.post('/applications', requireAccountType('CANDIDATE'), async (req, res, next) => {
  try { return created(res, await applications.createApplication(req.auth, req.body)); } catch (error) { return next(error); }
});

router.post('/', requireAccountType('CANDIDATE'), createCandidate);
router.post('/cv-upload', requireAccountType('CANDIDATE'), createCvUpload);
router.get('/:id/cv-download', requireAccountType('COMPANY'), getCvDownload);
router.get('/', requireAccountType('COMPANY'), listCandidates);
router.get('/by-job-guids', requireAccountType('COMPANY'), listCandidatesByJobGuids);
router.get('/:id', requireAccountType('COMPANY'), getCandidate);
router.put('/:id', requireAccountType('COMPANY'), updateCandidate);
router.delete('/:id', requireAccountType('COMPANY'), deleteCandidate);

module.exports = router;
