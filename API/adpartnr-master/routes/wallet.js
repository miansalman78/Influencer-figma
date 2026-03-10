const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const transactionController = require('../controllers/transactionController');
const { authenticate } = require('../middleware/auth');
const { validatePagination, validateObjectId } = require('../middleware/validation');

// All wallet routes are protected
router.use(authenticate);

// Wallet operations
router.get('/', walletController.getWallet);
router.post('/convert', walletController.convertBalance);
router.post('/withdraw', walletController.withdrawFunds);
router.post('/withdraw/preview', walletController.previewConversion);

// Payment methods
router.get('/payment-methods', walletController.getPaymentMethods);
router.post('/payment-methods', walletController.addPaymentMethod);
router.put('/payment-methods/:id', validateObjectId('id'), walletController.updatePaymentMethod);
router.delete('/payment-methods/:id', validateObjectId('id'), walletController.deletePaymentMethod);

// Transactions
router.get('/transactions', validatePagination, transactionController.getTransactions);
router.get('/transactions/:id', validateObjectId('id'), transactionController.getTransactionById);
router.post('/transactions/earning', transactionController.createEarningTransactionAPI);
router.put('/transactions/:id', validateObjectId('id'), transactionController.updateTransaction);

module.exports = router;

