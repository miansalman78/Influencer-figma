// Check if user can update transaction
const canUpdateTransaction = (transaction, userId, userRole) => {
  return transaction.userId.toString() === userId.toString() ||
    (transaction.metadata.brandId && transaction.metadata.brandId.toString() === userId.toString()) ||
    userRole === 'admin';
};

// Check if user is brand owner
const isBrandOwner = (orderBrandId, userId, userRole) => {
  return orderBrandId.toString() === userId.toString() || userRole === 'admin';
};

module.exports = {
  canUpdateTransaction,
  isBrandOwner
};

