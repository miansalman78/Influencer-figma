// Central exchange rate config (manual update)
// Base rate: NGN to USD
const BASE_RATE_NGN_USD = 0.00067;

// Conversion fee (0.5% - similar to Amazon's exchange rate guarantee fee)
const CONVERSION_FEE = 0.005;

// Calculate reciprocal rate dynamically to ensure perfect reciprocity
const EXCHANGE_RATES = {
  NGN_USD: BASE_RATE_NGN_USD,
  USD_NGN: 1 / BASE_RATE_NGN_USD // Perfectly reciprocal
};

const normalizeCurrency = (currency) => (currency || '').toUpperCase();

const getRateKey = (fromCurrency, toCurrency) =>
  `${normalizeCurrency(fromCurrency)}_${normalizeCurrency(toCurrency)}`;

const getExchangeRate = (fromCurrency, toCurrency) => {
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);
  
  // If converting NGN to USD, use base rate
  if (from === 'NGN' && to === 'USD') {
    return EXCHANGE_RATES.NGN_USD;
  }
  
  // If converting USD to NGN, calculate reciprocal
  if (from === 'USD' && to === 'NGN') {
    return EXCHANGE_RATES.USD_NGN;
  }
  
  // Fallback to key-based lookup for backwards compatibility
  const key = getRateKey(fromCurrency, toCurrency);
  return EXCHANGE_RATES[key] || null;
};

// Calculate conversion with fee applied
const calculateConversion = (amount, fromCurrency, toCurrency, applyFee = true) => {
  const rate = getExchangeRate(fromCurrency, toCurrency);
  if (!rate) return null;
  
  let convertedAmount = amount * rate;
  
  // Apply conversion fee if requested (for withdrawals)
  if (applyFee) {
    convertedAmount = convertedAmount * (1 - CONVERSION_FEE);
  }
  
  // Round based on target currency
  if (toCurrency.toUpperCase() === 'USD') {
    convertedAmount = Math.round(convertedAmount * 10000) / 10000; // 4 decimal places
  } else {
    convertedAmount = Math.round(convertedAmount); // Whole number for NGN
  }
  
  // Calculate before fee amount for display
  const beforeFee = amount * rate;
  
  // Calculate fee first, then recalculate final amount to ensure consistency
  // This ensures: beforeFee - fee = finalAmount (exactly)
  let fee = 0;
  if (applyFee) {
    // Calculate fee from beforeFee
    fee = beforeFee * CONVERSION_FEE;
    // Round fee first
    if (toCurrency.toUpperCase() === 'USD') {
      fee = Math.round(fee * 10000) / 10000; // 4 decimal places
    } else {
      fee = Math.round(fee); // Whole number for NGN
    }
    // Recalculate final amount by subtracting rounded fee from beforeFee
    convertedAmount = beforeFee - fee;
    // Round final amount
    if (toCurrency.toUpperCase() === 'USD') {
      convertedAmount = Math.round(convertedAmount * 10000) / 10000; // 4 decimal places
    } else {
      convertedAmount = Math.round(convertedAmount); // Whole number for NGN
    }
  }
  
  return {
    convertedAmount, // Final amount after fee (already rounded)
    beforeFee: applyFee ? beforeFee : convertedAmount, // Amount before fee
    rate,
    fee,
    feePercentage: applyFee ? CONVERSION_FEE * 100 : 0
  };
};

module.exports = {
  EXCHANGE_RATES,
  getExchangeRate,
  calculateConversion,
  CONVERSION_FEE,
  BASE_RATE_NGN_USD
};

