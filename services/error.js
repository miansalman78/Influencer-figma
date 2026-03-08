/**
 * Error Handling Service
 * 
 * Standardizes error processing across the frontend.
 * Provides user-friendly messages for complex API and Gateway errors.
 */

/**
 * Parse an error into a user-friendly message
 * 
 * @param {Error|Object} error - The error object to parse
 * @param {string} fallbackMessage - Message to use if parsing fails
 * @returns {string} User-friendly error message
 */
export const parseError = (error, fallbackMessage = 'An unexpected error occurred. Please try again.') => {
    if (!error) return fallbackMessage;

    // Handle API response errors (from apiRequest)
    if (error.message) {
        const msg = error.message.toLowerCase();

        // Payment specific errors
        if (msg.includes('insufficient funds')) {
            return 'Your card has insufficient funds. Please use another payment method.';
        }
        if (msg.includes('declined') || msg.includes('card_declined')) {
            return 'Your card was declined. Please contact your bank or try a different card.';
        }
        if (msg.includes('expired') || msg.includes('expired_card')) {
            return 'Your card has expired. Please use a different card.';
        }
        if (msg.includes('incorrect_cvc') || msg.includes('cvc check failed')) {
            return 'Incorrect CVC. Please check your card details.';
        }
        if (msg.includes('stripe') && msg.includes('parameter')) {
            return 'There was an issue with the payment details provided. Please check your card information.';
        }
        if (msg.includes('network') || msg.includes('timeout')) {
            return 'Network connection issue. Please check your internet and try again.';
        }
        if (msg.includes('authentication') || msg.includes('3d secure')) {
            return '3D Secure authentication failed. Please try again.';
        }
        if (msg.includes('handlecardaction') || msg.includes('is not a function')) {
            return 'Payment authentication is temporarily unavailable. Please try again or use a different payment method.';
        }
        if (msg.includes('paypal_payment_already_captured')) {
            return 'This payment has already been processed.';
        }
        if (msg.includes('paypal')) {
            return 'There was an issue with PayPal. Please try again or use a credit card.';
        }

        // Generic API errors
        if (msg.includes('unauthorized') || msg.includes('token expired')) {
            return 'Your session has expired. Please log in again.';
        }
        if (msg.includes('not found')) {
            return 'The requested resource was not found.';
        }
        if (msg.includes('validation failed')) {
            return 'Please check your input and try again.';
        }

        return error.message;
    }

    // Handle Stripe SDK error objects
    if (error.code) {
        switch (error.code) {
            case 'Failed':
                return 'The payment failed. Please check your card details and try again.';
            case 'Canceled':
                return 'Payment was canceled.';
            default:
                return error.localizedMessage || error.message || fallbackMessage;
        }
    }

    return fallbackMessage;
};

/**
 * Handle and alert the user about an error
 * 
 * @param {Error|Object} error - The error object
 * @param {string} title - Title for the alert
 */
export const handlePaymentError = (error, title = 'Payment Error') => {
    const { Alert } = require('react-native');
    const message = parseError(error);
    console.error(`[${title}]`, error);
    Alert.alert(title, message);
};
