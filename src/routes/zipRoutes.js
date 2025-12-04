const express = require('express');
const { getLocationByZip } = require('../controllers/zipController');

const router = express.Router();

router.get('/:zip', getLocationByZip);

module.exports = router;
