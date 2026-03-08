import { apiRequest } from './api';

/**
 * Transactions Services - Creator focused
 */

// 9.1 Get Transactions
export const getTransactions = async (params = {}) => {
  const queryParams = new URLSearchParams();
  if (params.type) queryParams.append('type', params.type);
  if (params.page) queryParams.append('page', params.page);
  if (params.limit) queryParams.append('limit', params.limit);

  const queryString = queryParams.toString();
  return apiRequest(`/wallet/transactions${queryString ? `?${queryString}` : ''}`, {
    method: 'GET',
  });
};

// 9.2 Get Transaction by ID
export const getTransactionById = async (transactionId) => {
  return apiRequest(`/wallet/transactions/${transactionId}`, {
    method: 'GET',
  });
};

// 9.3 Create Earning Transaction (backend expects POST; typically used server-side when order completes)
// Body: { orderId, creatorId, brandId, amount, description?, currency? } – required for brand/admin creating earning for an order
export const createEarningTransaction = async (body = {}) => {
  return apiRequest('/wallet/transactions/earning', {
    method: 'POST',
    body: body.orderId && body.creatorId && body.brandId && body.amount ? body : undefined,
  });
};

// 9.4 Update Earning Transactions Manually
export const updateTransaction = async (transactionId, updateData) => {
  return apiRequest(`/wallet/transactions/${transactionId}`, {
    method: 'PUT',
    body: updateData,
  });
};




























