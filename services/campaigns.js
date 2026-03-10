import { apiRequest } from './api';

/**
 * Brand Campaigns Services
 */

// 2.1 Browse Campaigns - Creators
export const browseCampaigns = async (params = {}) => {
    const queryParams = new URLSearchParams(params).toString();
    return apiRequest(`/campaigns?${queryParams}`, {
        method: 'GET',
    });
};

// 2.2 Get Campaign Details
export const getCampaignDetails = async (id) => {
    return apiRequest(`/campaigns/${id}`, {
        method: 'GET',
    });
};

// 2.3 Create Campaign
export const createCampaign = async (campaignData) => {
    return apiRequest('/campaigns', {
        method: 'POST',
        body: campaignData,
    });
};

// 2.4 Get My Campaigns (Brand)
export const getMyCampaigns = async (params = {}) => {
    const queryParams = new URLSearchParams(params).toString();
    return apiRequest(`/campaigns/me/campaigns?${queryParams}`, {
        method: 'GET',
    });
};

// 2.5 Update Campaign (Brand)
export const updateCampaign = async (id, updateData) => {
    return apiRequest(`/campaigns/${id}`, {
        method: 'PUT',
        body: updateData,
    });
};

// 2.6 Publish Campaign (Brand)
export const publishCampaign = async (id) => {
    return apiRequest(`/campaigns/${id}/publish`, {
        method: 'PUT',
    });
};
