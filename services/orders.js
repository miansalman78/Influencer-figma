import { apiRequest } from './api';

/**
 * Orders Services - Both Brand & Creator
 */

// 4.1 Get Active Orders
export const getActiveOrders = async (params = {}) => {
  const queryParams = new URLSearchParams();
  if (params.status) queryParams.append('status', params.status);
  if (params.page) queryParams.append('page', params.page);
  if (params.limit) queryParams.append('limit', params.limit);

  const queryString = queryParams.toString();
  return apiRequest(`/orders/active${queryString ? `?${queryString}` : ''}`, {
    method: 'GET',
  });
};

// 4.2 Get All Orders
export const getAllOrders = async (params = {}) => {
  const queryParams = new URLSearchParams();
  if (params.status) queryParams.append('status', params.status);
  if (params.page) queryParams.append('page', params.page);
  if (params.limit) queryParams.append('limit', params.limit);

  const queryString = queryParams.toString();
  return apiRequest(`/orders${queryString ? `?${queryString}` : ''}`, {
    method: 'GET',
  });
};

// 4.3 Get Order Details
export const getOrderDetails = async (orderId) => {
  return apiRequest(`/orders/${orderId}`, {
    method: 'GET',
  });
};

// 4.4 Submit Deliverables (Creator)
export const submitDeliverables = async (orderId, deliverables) => {
  return apiRequest(`/orders/${orderId}/submit`, {
    method: 'POST',
    body: { deliverables },
  });
};

// 4.5 Approve Deliverables (Brand)
export const approveDeliverables = async (orderId) => {
  return apiRequest(`/orders/${orderId}/approve`, {
    method: 'POST',
  });
};

// 4.6 Request Revisions (Brand)
export const requestRevisions = async (orderId, notes) => {
  return apiRequest(`/orders/${orderId}/revisions`, {
    method: 'POST',
    body: { notes },
  });
};

// 4.7 Update Order
export const updateOrder = async (orderId, updateData) => {
  return apiRequest(`/orders/${orderId}`, {
    method: 'PUT',
    body: updateData,
  });
};

// 4.8 Get Brand Orders (Alias for getActiveOrders/getAllOrders with brand filter implicit in backend logic for brand user)
export const getBrandOrders = async (params = {}) => {
  return getActiveOrders(params);
};

// 4.9 Get Creator Orders (Alias for getActiveOrders/getAllOrders with creator filter implicit in backend logic for creator user)
export const getCreatorOrders = async (params = {}) => {
  return getActiveOrders(params);
};

// 4.10 Get My Orders (Convenience function that could check role or just call active)
export const getMyOrders = async (params = {}) => {
  return getActiveOrders(params);
};




























