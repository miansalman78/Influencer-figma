import { apiRequest } from './api';

/**
 * Wallet Services - Creator focused
 */

// 11.1 Get Wallet
export const getWallet = async () => {
  return apiRequest('/wallet', {
    method: 'GET',
  });
};

// 11.2 Withdraw Funds
// 11.2 Withdraw Funds
export const withdrawFunds = async (amount, paymentMethodId, sourceCurrency = 'USD') => {
  const payload = {
    amount,
    paymentMethodId,
    sourceCurrency, // Fixed: Changed from currency to sourceCurrency to match backend expectation
  };

  console.log('[Wallet Service] Withdraw request payload:', payload);

  return apiRequest('/wallet/withdraw', {
    method: 'POST',
    body: payload,
  });
};

// 11.2.1 Get Withdrawal Preview
export const getWithdrawalPreview = async (amount, paymentMethodId, sourceCurrency = 'USD') => {
  const payload = {
    amount,
    paymentMethodId,
    sourceCurrency,
  };

  console.log('[Wallet Service] Withdraw preview payload:', payload);

  return apiRequest('/wallet/withdraw/preview', {
    method: 'POST',
    body: payload,
  });
};

// 11.3 Add Payment Method
export const addPaymentMethod = async (paymentMethodData) => {
  return apiRequest('/wallet/payment-methods', {
    method: 'POST',
    body: paymentMethodData,
  });
};

// 11.4 Get Payment Methods
export const getPaymentMethods = async () => {
  return apiRequest('/wallet/payment-methods', {
    method: 'GET',
  });
};

// 11.5 Update Payment Method
export const updatePaymentMethod = async (paymentMethodId, updateData) => {
  return apiRequest(`/wallet/payment-methods/${paymentMethodId}`, {
    method: 'PUT',
    body: updateData,
  });
};

// 11.6 Delete Payment Method
export const deletePaymentMethod = async (paymentMethodId) => {
  return apiRequest(`/wallet/payment-methods/${paymentMethodId}`, {
    method: 'DELETE',
  });
};
























