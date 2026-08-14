const express = require('express');
const areaRoutes = require('./areaRoutes');
const candidateRoutes = require('./candidateRoutes');
const companyRoutes = require('./companyRoutes');
const domainRoutes = require('./domainRoutes');
const userRoutes = require('./userRoutes');
const jobRoutes = require('./jobRoutes');
const zipRoutes = require('./zipRoutes');
const { createAuthGuard } = require('../middleware/auth');

const router = express.Router();
const authGuard = createAuthGuard();

router.use(authGuard);
router.use('/candidates', candidateRoutes);
router.use('/areas', areaRoutes);
router.use('/companies', companyRoutes);
router.use('/domains', domainRoutes);
router.use('/users', userRoutes);
router.use('/jobs', jobRoutes);
router.use('/zips', zipRoutes);

module.exports = router;
