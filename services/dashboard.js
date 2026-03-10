/**
 * Dashboard API – creator/brand dashboard data.
 * Uses access token via apiRequest.
 */

import { apiRequest } from './api';

/**
 * Get recent activities for the authenticated creator (dashboard "Recent Activity").
 * @param {Object} params - { limit } (default 10, max 20)
 */
export const getCreatorRecentActivities = async (params = {}) => {
  const limit = params.limit != null ? params.limit : 10;
  const q = new URLSearchParams();
  q.append('limit', limit);
  return apiRequest(`/dashboard/creator/activities?${q.toString()}`, { method: 'GET' });
};
