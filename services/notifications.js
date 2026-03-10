/**
 * Notifications API – uses access token from apiRequest (AsyncStorage / in-memory).
 * Role is determined by backend from token; list is always for the authenticated user.
 */

import { apiRequest } from './api';

/**
 * Get notifications for the current user (creator or brand).
 * @param {Object} params - { page, limit, read } (read: true | false | omit for all)
 */
export const getNotifications = async (params = {}) => {
  const q = new URLSearchParams();
  if (params.page != null) q.append('page', params.page);
  if (params.limit != null) q.append('limit', params.limit);
  if (params.read === true || params.read === 'true') q.append('read', 'true');
  if (params.read === false || params.read === 'false') q.append('read', 'false');
  const query = q.toString();
  return apiRequest(`/notifications${query ? `?${query}` : ''}`, { method: 'GET' });
};

/**
 * Get unread count for the current user.
 */
export const getUnreadCount = async () => {
  return apiRequest('/notifications/unread-count', { method: 'GET' });
};

/**
 * Mark a single notification as read.
 * @param {string} id - Notification _id
 */
export const markAsRead = async (id) => {
  return apiRequest(`/notifications/${id}/read`, { method: 'PATCH' });
};

/**
 * Mark all notifications as read for the current user.
 */
export const markAllAsRead = async () => {
  return apiRequest('/notifications/read-all', { method: 'PATCH' });
};
