import { publicApiClient } from './apiClient';
import logger from '../utils/logger';

// Client-side cache
const cache = {
    countries: null,
    states: {},
    cities: {}
};

/**
 * Get all countries (public API – no auth required, works everywhere)
 */
export const getCountries = async () => {
    try {
        if (cache.countries) return cache.countries;
        const response = await publicApiClient.get('/location/countries');
        const data = response.data?.data ?? response.data;
        cache.countries = data;
        return data;
    } catch (error) {
        logger.error('[LocationService] getCountries error:', error);
        throw error;
    }
};

/**
 * Get states for a country
 * @param {string} countryCode 
 */
export const getStates = async (countryCode) => {
    try {
        if (cache.states[countryCode]) return cache.states[countryCode];
        const response = await publicApiClient.get(`/location/countries/${countryCode}/states`);
        const data = response.data?.data ?? response.data;
        cache.states[countryCode] = data;
        return data;
    } catch (error) {
        logger.error('[LocationService] getStates error:', error);
        throw error;
    }
};

/**
 * Get cities for a state
 * @param {string} countryCode 
 * @param {string} stateCode 
 */
export const getCities = async (countryCode, stateCode) => {
    try {
        const key = `${countryCode}-${stateCode}`;
        if (cache.cities[key]) return cache.cities[key];
        const response = await publicApiClient.get(`/location/countries/${countryCode}/states/${stateCode}/cities`);
        const data = response.data?.data ?? response.data;
        cache.cities[key] = data;
        return data;
    } catch (error) {
        logger.error('[LocationService] getCities error:', error);
        throw error;
    }
};
