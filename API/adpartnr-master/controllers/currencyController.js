const { EXCHANGE_RATES, CONVERSION_FEE } = require('../utils/exchangeRates');
const { ENABLE_CURRENCY_CONVERSION } = require('../utils/adminConfig');
const { successResponse, errorResponse } = require('../utils/response');

const getExchangeRates = async (req, res) => {
  try {
    return successResponse(res, { 
      rates: EXCHANGE_RATES,
      conversionFee: CONVERSION_FEE,
      conversionFeePercentage: CONVERSION_FEE * 100,
      conversionEnabled: ENABLE_CURRENCY_CONVERSION
    }, 'Exchange rates retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

module.exports = { getExchangeRates };

