const express = require('express');
const {
  createDomain,
  getDomainByCode,
  listDomains,
  updateDomainByCode,
  updateDomainByKey,
} = require('../controllers/domainController');

const router = express.Router();

router.post('/', createDomain);
router.get('/', listDomains);
router.put('/', updateDomainByKey);
router.get('/:tipo/:code', getDomainByCode);
router.put('/:tipo/:code', updateDomainByCode);

module.exports = router;
