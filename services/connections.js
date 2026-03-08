import { apiRequest } from './api';

/**
 * Brand sends a connect request to a creator.
 * @param {string} creatorId - Creator user ID
 * @param {string} [message] - Optional first message
 * @returns {Promise<{ connection, brandName, creatorName, alreadyConnected? }>}
 */
export const sendConnect = async (creatorId, message) => {
  const res = await apiRequest('/connections/send', {
    method: 'POST',
    body: { creatorId, message },
  });
  return res?.data ?? res;
};

/**
 * List connections for current user.
 * @returns {Promise<{ connections: Array }>}
 */
export const listConnections = async () => {
  const res = await apiRequest('/connections', { method: 'GET' });
  return res?.data ?? res;
};

/**
 * Check if current user is connected with another user.
 * @param {string} userId - Other user's ID (creatorId when brand, brandId when creator)
 * @returns {Promise<{ connected: boolean, connectionId?: string }>}
 */
export const checkConnection = async (userId) => {
  const res = await apiRequest(`/connections/check?userId=${encodeURIComponent(userId)}`, { method: 'GET' });
  return res?.data ?? res;
};

/**
 * Disconnect from a user. Brand: pass creatorId. Creator: pass brandId. Or pass connectionId.
 * @param {{ connectionId?: string, creatorId?: string, brandId?: string }} params
 */
export const disconnect = async (params) => {
  const res = await apiRequest('/connections', {
    method: 'DELETE',
    body: params,
  });
  return res?.data ?? res;
};
