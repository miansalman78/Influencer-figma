import { apiRequest } from './api';

export const submitProposal = async (campaignId, data) => {
    return apiRequest(`/proposals/campaign/${campaignId}`, {
        method: 'POST',
        body: data,
    });
};

export const getCampaignProposals = async (campaignId, params = {}) => {
    const queryParams = new URLSearchParams(params).toString();
    return apiRequest(`/proposals/campaign/${campaignId}?${queryParams}`, {
        method: 'GET',
    });
};

export const getMyProposals = async (params = {}) => {
    const queryParams = new URLSearchParams(params).toString();
    return apiRequest(`/proposals/me?${queryParams}`, {
        method: 'GET',
    });
};

export const withdrawProposal = async (id) => {
    return apiRequest(`/proposals/${id}/withdraw`, {
        method: 'POST',
    });
};

export const acceptProposal = async (id, paymentMethodId = null, currency = null) => {
    const body = {};
    if (paymentMethodId) {
        body.paymentMethodId = paymentMethodId;
    }
    if (currency) {
        body.currency = currency;
    }

    return apiRequest(`/proposals/${id}/accept`, {
        method: 'POST',
        body: Object.keys(body).length > 0 ? body : undefined,
    });
};

export const getProposalById = async (id) => {
    return apiRequest(`/proposals/${id}`, {
        method: 'GET',
    });
};

export const rejectProposal = async (id) => {
    return apiRequest(`/proposals/${id}/reject`, {
        method: 'POST',
    });
};

