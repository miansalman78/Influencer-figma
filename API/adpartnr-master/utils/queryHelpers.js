// Build transaction query filters
const buildTransactionQuery = (userId, { type, status }) => {
  const queryObj = { userId };
  
  if (type === 'earnings') {
    queryObj.type = { $in: ['payment', 'earning', 'deposit'] };
  } else if (type === 'withdrawals') {
    queryObj.type = 'withdrawal';
  }
  
  if (status) queryObj.status = status;
  
  return queryObj;
};

// Get brand name from transaction metadata
const getBrandNameFromTransaction = (transaction) => {
  if (transaction.metadata.brandId?.name) {
    return transaction.metadata.brandId.name;
  }
  if (transaction.metadata.campaignId?.name) {
    return transaction.metadata.campaignId.name;
  }
  if (transaction.description) {
    const match = transaction.description.match(/from\s+(.+)/i);
    if (match) return match[1];
  }
  return 'Unknown Brand';
};

// Format transaction metadata
const formatTransactionMetadata = (transaction) => {
  const metadata = {};
  if (transaction.metadata.orderId) {
    metadata.orderId = transaction.metadata.orderId._id || transaction.metadata.orderId;
  }
  if (transaction.metadata.brandId) {
    metadata.brandId = transaction.metadata.brandId._id || transaction.metadata.brandId;
  }
  return metadata;
};

module.exports = {
  buildTransactionQuery,
  getBrandNameFromTransaction,
  formatTransactionMetadata
};

