const axios = require('axios');
const { Country, State, City } = require('country-state-city');
const { successResponse, errorResponse } = require('../utils/response');

// Simple in-memory cache
const locationCache = {
  countries: null,
  states: {},
  cities: {}
};

const CSC_API_BASE_URL = 'https://api.countrystatecity.in/v1';
const REQUEST_TIMEOUT_MS = 15000;

const getCscApiKey = () => (
  process.env.COUNTRY_STATE_CITY_API_KEY ||
  process.env.CSC_API_KEY ||
  process.env.COUNTRYSTATECITY_API_KEY ||
  ''
).trim();

const normalizeCode = (value) => String(value || '').trim().toUpperCase();

const normalizeCountry = (country = {}) => ({
  ...country,
  iso2: country.iso2 || country.isoCode,
  isoCode: country.isoCode || country.iso2
});

const normalizeState = (state = {}) => ({
  ...state,
  iso2: state.iso2 || state.isoCode,
  isoCode: state.isoCode || state.iso2
});

const normalizeCity = (city = {}, countryCode = '', stateCode = '') => {
  const name = typeof city === 'string' ? city : city.name;
  return {
    ...city,
    name,
    id: city.id || `${countryCode}-${stateCode}-${name || ''}`.toLowerCase(),
    countryCode: city.countryCode || countryCode,
    stateCode: city.stateCode || stateCode
  };
};

const fetchFromCscApi = async (path) => {
  const apiKey = getCscApiKey();
  if (!apiKey) {
    throw new Error('COUNTRY_STATE_CITY_API_KEY is missing');
  }

  const response = await axios.get(`${CSC_API_BASE_URL}${path}`, {
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      'X-CSCAPI-KEY': apiKey
    }
  });

  return response.data;
};

const getCountriesFromLocal = () =>
  Country.getAllCountries()
    .map((country) => normalizeCountry({
      id: country.isoCode,
      name: country.name,
      isoCode: country.isoCode,
      phonecode: country.phonecode,
      flag: country.flag,
      currency: country.currency,
      latitude: country.latitude,
      longitude: country.longitude
    }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

const getStatesFromLocal = (countryCode) => {
  const country = Country.getCountryByCode(countryCode);
  if (!country) return null;

  return State.getStatesOfCountry(countryCode)
    .map((state) => normalizeState({
      id: state.isoCode,
      name: state.name,
      isoCode: state.isoCode,
      countryCode: state.countryCode,
      latitude: state.latitude,
      longitude: state.longitude
    }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
};

const getCitiesFromLocal = (countryCode, stateCode) => {
  const state = State.getStateByCodeAndCountry(stateCode, countryCode);
  if (!state) return null;

  return City.getCitiesOfState(countryCode, stateCode)
    .map((city) => normalizeCity({
      name: city.name,
      latitude: city.latitude,
      longitude: city.longitude
    }, countryCode, stateCode))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
};

// Get all countries
const getCountries = async (req, res) => {
  try {
    if (locationCache.countries) {
      return successResponse(res, locationCache.countries, 'Countries retrieved successfully (from cache)');
    }

    let countries;
    try {
      countries = (await fetchFromCscApi('/countries')).map(normalizeCountry);
    } catch (externalError) {
      console.warn('External countries API failed, using local dataset:', externalError.message);
      countries = getCountriesFromLocal();
    }

    locationCache.countries = countries;
    return successResponse(res, countries, 'Countries retrieved successfully');
  } catch (error) {
    console.error('Error fetching countries:', error);
    return errorResponse(res, 'Failed to fetch countries', 500);
  }
};

// Get states by country
const getStates = async (req, res) => {
  try {
    const countryCode = normalizeCode(req.params.countryCode);

    // Validate country code (should be 2-3 letters)
    if (!countryCode || countryCode.length < 2 || countryCode.length > 3) {
      return errorResponse(res, 'Invalid country code. Please use a 2-3 letter ISO code.', 400);
    }

    if (locationCache.states[countryCode]) {
      return successResponse(res, locationCache.states[countryCode], 'States retrieved successfully (from cache)');
    }

    let states;
    try {
      states = (await fetchFromCscApi(`/countries/${countryCode}/states`)).map(normalizeState);
    } catch (externalError) {
      console.warn(`External states API failed for ${countryCode}, using local dataset:`, externalError.message);
      states = getStatesFromLocal(countryCode);
    }

    if (!states) {
      return errorResponse(res, 'Invalid location identifier', 400);
    }

    locationCache.states[countryCode] = states;
    return successResponse(res, states, 'States retrieved successfully');
  } catch (error) {
    if (error.response?.status === 400) {
      return errorResponse(res, 'Invalid location identifier', 400);
    }
    console.error('Error fetching states:', error);
    return errorResponse(res, 'Failed to fetch states', 500);
  }
};

// Get cities by country and state
const getCities = async (req, res) => {
  try {
    const countryCode = normalizeCode(req.params.countryCode);
    const stateCode = normalizeCode(req.params.stateCode);

    // Validate codes
    if (!countryCode || countryCode.length < 2 || countryCode.length > 3 || !stateCode || stateCode.length > 10) {
      return errorResponse(res, 'Invalid location codes. Please use ISO codes.', 400);
    }

    const cacheKey = `${countryCode}-${stateCode}`;

    if (locationCache.cities[cacheKey]) {
      return successResponse(res, locationCache.cities[cacheKey], 'Cities retrieved successfully (from cache)');
    }

    let cities;
    try {
      cities = (await fetchFromCscApi(`/countries/${countryCode}/states/${stateCode}/cities`))
        .map((city) => normalizeCity(city, countryCode, stateCode));
    } catch (externalError) {
      console.warn(`External cities API failed for ${cacheKey}, using local dataset:`, externalError.message);
      cities = getCitiesFromLocal(countryCode, stateCode);
    }

    if (!cities) {
      return errorResponse(res, 'Invalid location identifier', 400);
    }

    locationCache.cities[cacheKey] = cities;
    return successResponse(res, cities, 'Cities retrieved successfully');
  } catch (error) {
    console.error('Error fetching cities:', error);
    return errorResponse(res, 'Failed to fetch cities', 500);
  }
};

module.exports = {
  getCountries,
  getStates,
  getCities
};
