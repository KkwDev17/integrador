const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reports.controller');

router.get('/', reportsController.getAllReports);
router.post('/', reportsController.createReport);

module.exports = router;
