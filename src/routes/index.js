const express = require('express');
const candidateRoutes = require('./candidateRoutes');
const companyRoutes = require('./companyRoutes');
const userRoutes = require('./userRoutes');
const jobRoutes = require('./jobRoutes');
const zipRoutes = require('./zipRoutes');
const { createAuthGuard } = require('../middleware/auth');
const { emailAuth } = require('../middleware/emailAuth');
const { createEmail } = require('../controllers/emailController');

const router = express.Router();
const authGuard = createAuthGuard();

// This server-to-server endpoint has its own credential, independent of user JWTs.
router.post('/emails', emailAuth, createEmail);
router.use(authGuard);
router.use('/candidates', candidateRoutes);
router.use('/companies', companyRoutes);
router.use('/users', userRoutes);
router.use('/jobs', jobRoutes);
router.use('/zips', zipRoutes);

module.exports = router;
