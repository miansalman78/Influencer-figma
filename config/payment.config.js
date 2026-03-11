/**
 * Payment Gateway Configuration
 * Uses environment variables from env.config.js with fallback values
 */

import { PAYMENT_CONFIG } from './env.config';

// Fallback values (will be replaced by .env after react-native-config is installed)
const FALLBACK_KEYS = {
    STRIPE_PUBLIC_KEY: 'pk_test_51SzF1hHx7OeL0L3V3O90gvzOyELkn0DWXJCps6MUsTfaoEYAefOctz84IayI86LuLTsysKiD1NUO8bryHWO0g6C600l5GVWgbK',
    PAYSTACK_PUBLIC_KEY: 'pk_test_19323d17e320889d800976d8b8307577f010a34b',
    PAYPAL_CLIENT_ID: 'AUGMlbssNIzwkEyanGOrQKN4CewfCtavt-AGSATfpNMn3z1Zrizb6Cp_3L6Ihe36KNE4FWSj7hZ_q5DY',
    PAYPAL_MODE: 'sandbox',
    FLUTTERWAVE_PUBLIC_KEY: '',
};

export const PAYMENT_KEYS = {
    // Stripe Configuration (USD payments)
    // IMPORTANT: This must be from the SAME Stripe account as the backend STRIPE_SECRET_KEY (same Dashboard, same mode: both test or both live). Otherwise you get "No such payment_intent".
    STRIPE_PUBLIC_KEY: PAYMENT_CONFIG?.STRIPE_PUBLIC_KEY || FALLBACK_KEYS.STRIPE_PUBLIC_KEY,

    // Stripe Test Cards (for development/testing):
    // 4242 4242 4242 4242 - Test successful payment
    // 4000 0027 6000 3184 - Test 3DS Authentication needs
    // 4000 0000 0000 0002 - Test failed payment

    // Paystack Configuration (NGN payments)
    PAYSTACK_PUBLIC_KEY: PAYMENT_CONFIG?.PAYSTACK_PUBLIC_KEY || FALLBACK_KEYS.PAYSTACK_PUBLIC_KEY,

    // PayPal Configuration (Sandbox; must match backend .env PAYPAL_CLIENT_ID / PAYPAL_MODE)
    PAYPAL_CLIENT_ID: PAYMENT_CONFIG?.PAYPAL_CLIENT_ID || FALLBACK_KEYS.PAYPAL_CLIENT_ID,
    PAYPAL_MODE: PAYMENT_CONFIG?.PAYPAL_MODE || FALLBACK_KEYS.PAYPAL_MODE,

    // Flutterwave Configuration (NGN payments) - Optional
    FLUTTERWAVE_PUBLIC_KEY: PAYMENT_CONFIG?.FLUTTERWAVE_PUBLIC_KEY || FALLBACK_KEYS.FLUTTERWAVE_PUBLIC_KEY,
};

// Export for backward compatibility
export const PAYMENT_CONFIG_LEGACY = PAYMENT_KEYS;

