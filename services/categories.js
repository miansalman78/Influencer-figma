/**
 * Categories API – used for campaign niche and offer category filters.
 * Backend: GET /api/categories returns { categories: [ { value, label } ] }
 */

import { apiRequest } from './api';

export const getCategories = async () => {
  const response = await apiRequest('/categories', { method: 'GET' });
  const data = response?.data || response;
  const list = data?.categories || [];
  return Array.isArray(list) ? list : [];
};
