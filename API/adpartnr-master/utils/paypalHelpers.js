// PayPal Payment Helpers
// Uses PayPal REST API directly

const axios = require('axios');

// Get PayPal access token
const getPayPalAccessToken = async () => {
  // PayPal uses "API Key" (Client ID) and "Secret" (Client Secret)
  const clientId = process.env.PAYPAL_CLIENT_ID || process.env.PAYPAL_API_KEY;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET || process.env.PAYPAL_SECRET;
  const mode = process.env.PAYPAL_MODE || 'sandbox';
  const baseURL = mode === 'live' 
    ? 'https://api-m.paypal.com' 
    : 'https://api-m.sandbox.paypal.com';

  try {
    const response = await axios.post(
      `${baseURL}/v1/oauth2/token`,
      'grant_type=client_credentials',
      {
        headers: {
          'Accept': 'application/json',
          'Accept-Language': 'en_US',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        auth: {
          username: clientId,
          password: clientSecret
        }
      }
    );

    return response.data.access_token;
  } catch (error) {
    throw new Error(`Failed to get PayPal access token: ${error.message}`);
  }
};

// Create PayPal order
// Note: PAYEE_ACCOUNT_RESTRICTED means the merchant (sandbox business) account is restricted.
// Fix: log in at https://sandbox.paypal.com with the account that owns the app and complete any onboarding.
const createPayPalOrder = async (amount, currency, description, returnUrl, cancelUrl) => {
  const clientId = process.env.PAYPAL_CLIENT_ID || process.env.PAYPAL_API_KEY;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET || process.env.PAYPAL_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('PayPal is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env');
  }

  const mode = (process.env.PAYPAL_MODE || 'sandbox').toLowerCase();
  const baseURL = mode === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

  const accessToken = await getPayPalAccessToken();

  // Currency: PayPal expects uppercase code
  let finalCurrency = (currency || 'USD').toString().toUpperCase();
  const supportedCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CNY', 'MXN', 'BRL', 'INR', 'SGD', 'HKD', 'NZD', 'PLN', 'SEK', 'DKK', 'NOK', 'CHF', 'CZK', 'HUF', 'ILS', 'PHP', 'THB', 'TWD', 'TRY', 'ZAR'];
  if (!supportedCurrencies.includes(finalCurrency)) {
    finalCurrency = 'USD';
    console.warn('Currency not supported by PayPal; using USD.');
  }

  // Amount: must be string with exactly 2 decimal places (PayPal requirement)
  const amountValue = parseFloat(amount);
  if (isNaN(amountValue) || amountValue <= 0) {
    throw new Error('Invalid amount. Amount must be greater than 0');
  }
  const amountStr = Number(amountValue.toFixed(2)).toFixed(2);

  if (!returnUrl || !cancelUrl) {
    throw new Error('Return URL and Cancel URL are required for PayPal');
  }

  // Do not send payee: receiving account = the one tied to PAYPAL_CLIENT_ID (merchant).
  const orderData = {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: 'default',
      amount: {
        currency_code: finalCurrency,
        value: amountStr
      },
      description: (description || 'Payment for order').substring(0, 127)
    }],
    application_context: {
      brand_name: 'AdPartnr',
      landing_page: 'NO_PREFERENCE',
      user_action: 'PAY_NOW',
      return_url: returnUrl,
      cancel_url: cancelUrl
    }
  };

  try {
    const response = await axios.post(
      `${baseURL}/v2/checkout/orders`,
      orderData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    // Validate that we got approval link
    const approvalLink = response.data.links?.find(link => link.rel === 'approve');
    if (!approvalLink) {
      console.error('PayPal Order Created but no approval link found:', response.data);
      throw new Error('PayPal order created but approval URL not found');
    }

    // Log for debugging (remove in production)
    console.log('PayPal Order Created:', {
      orderId: response.data.id,
      status: response.data.status,
      mode: mode,
      approvalUrl: approvalLink.href,
      amount: amountValue,
      currency: finalCurrency
    });

    return {
      orderId: response.data.id,
      status: response.data.status,
      links: response.data.links,
      approvalUrl: approvalLink.href
    };
  } catch (error) {
    // Log full error for debugging
    const errorDetails = error.response?.data || {};
    const errorMessage = errorDetails.message || errorDetails.name || error.message;
    const errorDetailsStr = JSON.stringify(errorDetails, null, 2);
    
    console.error('PayPal Order Creation Error:', {
      message: errorMessage,
      details: errorDetails,
      orderData: orderData
    });
    
    throw new Error(`Failed to create PayPal order: ${errorMessage}. Details: ${errorDetailsStr}`);
  }
};

// Capture PayPal order
const capturePayPalOrder = async (orderId) => {
  const mode = process.env.PAYPAL_MODE || 'sandbox';
  const baseURL = mode === 'live' 
    ? 'https://api-m.paypal.com' 
    : 'https://api-m.sandbox.paypal.com';

  const accessToken = await getPayPalAccessToken();

  try {
    const response = await axios.post(
      `${baseURL}/v2/checkout/orders/${orderId}/capture`,
      {},
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    return {
      success: response.data.status === 'COMPLETED',
      orderId: response.data.id,
      status: response.data.status,
      payer: response.data.payer,
      purchase_units: response.data.purchase_units,
      captureId: response.data.purchase_units[0]?.payments?.captures[0]?.id
    };
  } catch (error) {
    throw new Error(`Failed to capture PayPal order: ${error.response?.data?.message || error.message}`);
  }
};

// Get PayPal order details
const getPayPalOrder = async (orderId) => {
  const mode = process.env.PAYPAL_MODE || 'sandbox';
  const baseURL = mode === 'live' 
    ? 'https://api-m.paypal.com' 
    : 'https://api-m.sandbox.paypal.com';

  const accessToken = await getPayPalAccessToken();

  try {
    const response = await axios.get(
      `${baseURL}/v2/checkout/orders/${orderId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    return response.data;
  } catch (error) {
    throw new Error(`Failed to get PayPal order: ${error.response?.data?.message || error.message}`);
  }
};

module.exports = {
  getPayPalAccessToken,
  createPayPalOrder,
  capturePayPalOrder,
  getPayPalOrder
};

