/**
 * Currency Utility Functions
 * 
 * Provides helpers for displaying dual currency (USD and NGN) across the app
 */

/**
 * Get currency symbol for a given currency code
 * @param {string} currency - Currency code (USD or NGN)
 * @returns {string} Currency symbol
 */
export const getCurrencySymbol = (currency) => {
    if (!currency) return '$';
    const currencyUpper = currency.toUpperCase();
    return currencyUpper === 'NGN' ? '₦' : '$';
};

/**
 * Format dual currency display
 * Displays both USD and NGN prices if available
 * @param {object|number} rate - Rate object {usd, ngn} or single number
 * @param {object} options - Display options
 * @returns {string} Formatted price string
 */
export const formatDualCurrency = (rate, options = {}) => {
    const { showBoth = true, preferredCurrency = 'USD', separator = ' / ' } = options;

    if (!rate) return 'Free';

    // Handle number rate (legacy)
    if (typeof rate === 'number') {
        return `$${rate}`;
    }

    // Handle object rate {usd, ngn}
    if (typeof rate === 'object' && rate !== null) {
        const hasUSD = rate.usd && rate.usd > 0;
        const hasNGN = rate.ngn && rate.ngn > 0;

        // If neither currency, it's free
        if (!hasUSD && !hasNGN) {
            return 'Free';
        }

        // If only one currency is available
        if (hasUSD && !hasNGN) {
            return `$${rate.usd}`;
        }
        if (hasNGN && !hasUSD) {
            return `₦${rate.ngn.toLocaleString()}`;
        }

        // Both currencies available
        if (showBoth) {
            // Show both currencies
            return `$${rate.usd}${separator}₦${rate.ngn.toLocaleString()}`;
        } else {
            // Show only preferred currency
            if (preferredCurrency.toUpperCase() === 'NGN') {
                return `₦${rate.ngn.toLocaleString()}`;
            } else {
                return `$${rate.usd}`;
            }
        }
    }

    return 'Free';
};

/**
 * Format price with currency symbol
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code (USD or NGN)
 * @returns {string} Formatted price
 */
export const formatPrice = (amount, currency = 'USD') => {
    if (amount == null || amount === '') return 'Free';
    // If already a formatted string (e.g. '₦2000' or '$100'), return as-is
    if (typeof amount === 'string' && /[₦$€£]|\D/.test(amount.trim()) && amount.trim().length > 0) {
        return amount.trim();
    }
    const num = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/[^\d.-]/g, '')) || 0;
    if (num === 0) return 'Free';
    const symbol = getCurrencySymbol(currency);
    const formattedAmount = currency.toUpperCase() === 'NGN'
        ? num.toLocaleString()
        : num.toFixed(2);
    return `${symbol}${formattedAmount}`;
};

/**
 * Get display price for offer card (compact format)
 * Shows both currencies in a compact way
 * @param {object|number} rate - Rate object {usd, ngn} or single number
 * @returns {string} Compact price display
 */
export const getCompactDualPrice = (rate) => {
    if (!rate) return 'Free';

    if (typeof rate === 'number') {
        return `$${rate}`;
    }

    if (typeof rate === 'object' && rate !== null) {
        const hasUSD = rate.usd && rate.usd > 0;
        const hasNGN = rate.ngn && rate.ngn > 0;

        if (!hasUSD && !hasNGN) return 'Free';
        if (hasUSD && !hasNGN) return `$${rate.usd}`;
        if (hasNGN && !hasUSD) return `₦${rate.ngn.toLocaleString()}`;

        // Both available - show in compact format
        return `$${rate.usd} / ₦${rate.ngn.toLocaleString()}`;
    }

    return 'Free';
};

/**
 * Check if rate is free/product gifting
 * @param {object|number} rate - Rate object or number
 * @returns {boolean} True if free
 */
export const isFreeProduct = (rate) => {
    if (!rate || rate === 0) return true;
    if (typeof rate === 'object' && rate !== null) {
        return (!rate.usd || rate.usd === 0) && (!rate.ngn || rate.ngn === 0);
    }
    return false;
};
