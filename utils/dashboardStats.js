/**
 * Dashboard Stats Utility
 * 
 * Provides utility functions to calculate dashboard statistics
 * from various API responses. Since there's no dedicated dashboard
 * stats API endpoint, these functions aggregate data from multiple sources.
 */

/**
 * Calculate brand dashboard stats
 * @param {Object} params - Parameters object
 * @param {Array} params.campaigns - Array of campaigns
 * @param {Array} params.orders - Array of orders (optional)
 * @param {Array} params.proposals - Array of proposals (optional)
 * @param {Array} params.transactions - Array of transactions (optional)
 * @returns {Object} Stats object
 */
export const calculateBrandStats = ({
  campaigns = [],
  orders = [],
  proposals = [],
  transactions = [],
}) => {
  // Active campaigns count
  const activeCampaigns = campaigns.filter(
    (campaign) =>
      campaign.status === 'open' ||
      campaign.status === 'Open' ||
      campaign.status === 'active' ||
      campaign.status === 'Active'
  ).length;

  // Total spent - calculate from completed/paid orders or transactions
  let totalSpent = 0;

  // Method 1: Calculate from completed orders
  if (orders && orders.length > 0) {
    const completedOrders = orders.filter(
      (order) =>
        order.status === 'completed' ||
        order.status === 'Completed' ||
        order.status === 'paid' ||
        order.status === 'Paid'
    );

    totalSpent = completedOrders.reduce((sum, order) => {
      const amount =
        order.amount ||
        order.totalAmount ||
        order.price ||
        order.total ||
        0;
      return sum + (typeof amount === 'number' ? amount : parseFloat(amount) || 0);
    }, 0);
  }

  // Method 2: If transactions available, use debit/outgoing transactions
  if (totalSpent === 0 && transactions && transactions.length > 0) {
    const debitTransactions = transactions.filter(
      (transaction) =>
        transaction.type === 'debit' ||
        transaction.type === 'payment' ||
        transaction.direction === 'outgoing'
    );

    totalSpent = debitTransactions.reduce((sum, transaction) => {
      const amount = transaction.amount || 0;
      return sum + (typeof amount === 'number' ? amount : parseFloat(amount) || 0);
    }, 0);
  }

  // Pending proposals count
  const pendingProposals = proposals.filter(
    (proposal) =>
      proposal.status === 'pending' ||
      proposal.status === 'Pending' ||
      proposal.status === 'submitted' ||
      proposal.status === 'Submitted'
  ).length;

  // Completed orders count
  const completedOrders = orders.filter(
    (order) =>
      order.status === 'completed' ||
      order.status === 'Completed' ||
      order.status === 'delivered' ||
      order.status === 'Delivered'
  ).length;

  return {
    activeCampaigns,
    totalSpent,
    pendingProposals,
    completedOrders,
    totalCampaigns: campaigns.length,
  };
};

/**
 * Calculate creator dashboard stats
 * @param {Object} params - Parameters object
 * @param {number} params.walletBalance - Wallet balance from wallet API
 * @param {Array} params.orders - Array of orders (optional)
 * @param {Array} params.offers - Array of offers (optional)
 * @param {Array} params.transactions - Array of transactions (optional)
 * @returns {Object} Stats object
 */
export const calculateCreatorStats = ({
  walletBalance = 0,
  orders = [],
  offers = [],
  transactions = [],
}) => {
  // Total earnings - use wallet balance (most accurate)
  let totalEarnings = walletBalance;

  // Fallback: Calculate from completed orders if wallet balance is 0
  if (totalEarnings === 0 && orders && orders.length > 0) {
    const completedOrders = orders.filter(
      (order) =>
        order.status === 'completed' ||
        order.status === 'Completed' ||
        order.status === 'paid' ||
        order.status === 'Paid'
    );

    totalEarnings = completedOrders.reduce((sum, order) => {
      const amount =
        order.amount ||
        order.totalAmount ||
        order.price ||
        order.total ||
        0;
      return sum + (typeof amount === 'number' ? amount : parseFloat(amount) || 0);
    }, 0);
  }

  // Active orders count
  const activeOrders = orders.filter(
    (order) =>
      order.status === 'active' ||
      order.status === 'Active' ||
      order.status === 'in_progress' ||
      order.status === 'In Progress' ||
      order.status === 'pending' ||
      order.status === 'Pending'
  ).length;

  // Pending offers count (if offers provided)
  const pendingOffers = offers.filter(
    (offer) =>
      offer.status === 'pending' ||
      offer.status === 'Pending' ||
      offer.status === 'draft' ||
      offer.status === 'Draft'
  ).length;

  // Completed orders count
  const completedOrders = orders.filter(
    (order) =>
      order.status === 'completed' ||
      order.status === 'Completed' ||
      order.status === 'delivered' ||
      order.status === 'Delivered'
  ).length;

  return {
    totalEarnings,
    activeOrders,
    pendingOffers,
    completedOrders,
    totalOrders: orders.length,
  };
};

/**
 * Format currency value for display
 * @param {number} value - Numeric value
 * @param {string} currency - Currency code (default: 'USD')
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (value, currency = 'USD') => {
  const numValue = typeof value === 'number' ? value : parseFloat(value) || 0;

  if (currency === 'USD') {
    return `$${numValue.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  } else if (currency === 'NGN') {
    return `₦${numValue.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  return numValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

/**
 * Format large numbers (e.g., 1500 -> 1.5K, 1500000 -> 1.5M)
 * @param {number} value - Numeric value
 * @returns {string} Formatted string
 */
export const formatLargeNumber = (value) => {
  const numValue = typeof value === 'number' ? value : parseFloat(value) || 0;

  if (numValue >= 1000000) {
    return `${(numValue / 1000000).toFixed(1)}M`;
  } else if (numValue >= 1000) {
    return `${(numValue / 1000).toFixed(1)}K`;
  }

  return numValue.toString();
};


