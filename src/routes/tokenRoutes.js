const express = require('express');
const tokenController = require('../controllers/tokenController');

const router = express.Router();

router.post('/createToken', tokenController.createToken);
router.put('/:id/contract', tokenController.updateTokenWithContract);
router.put('/:id/updateInitialLiquidity', tokenController.updateInitialLiquidity);
router.post('/:id/bundle', tokenController.bundle);

module.exports = router;