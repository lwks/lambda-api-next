const express = require('express');
const { listAreas } = require('../controllers/areaController');

const router = express.Router();

router.get('/', listAreas);

module.exports = router;
