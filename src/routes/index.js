const express = require('express');
const candidateRoutes = require('./candidateRoutes');
const companyRoutes = require('./companyRoutes');
const userRoutes = require('./userRoutes');
const jobRoutes = require('./jobRoutes');
const zipRoutes = require('./zipRoutes');

const router = express.Router();

router.use('/candidates', candidateRoutes);
router.use('/companies', companyRoutes);
router.use('/users', userRoutes);
router.use('/jobs', jobRoutes);
router.use('/zips', zipRoutes);

module.exports = router;
