import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getAllServices } from '../services/services';

const MetadataContext = createContext();

export const MetadataProvider = ({ children }) => {
    const [services, setServices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchMetadata = useCallback(async () => {
        try {
            setLoading(true);
            const response = await getAllServices();
            if (response && response.data) {
                // Ensure services is always an array
                const servicesData = response.data.services || (Array.isArray(response.data) ? response.data : []);
                setServices(servicesData);
            }
        } catch (err) {
            console.error('[MetadataContext] Error fetching metadata:', err);
            setError(err.message || 'Failed to fetch metadata');
            setServices([]); // Ensure services is an array on error
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMetadata();
    }, [fetchMetadata]);

    // Helper to get unique categories from services
    // Added safety check to ensure services is an array
    const categories = Array.isArray(services)
        ? Array.from(new Set(services.map(s => s?.category).filter(Boolean)))
        : [];

    // Helper to get services by role
    const getServicesByRole = (role) => {
        if (!Array.isArray(services)) return [];
        return services.filter(s => s.role === role);
    };

    const value = {
        services,
        categories,
        loading,
        error,
        refreshMetadata: fetchMetadata,
        getServicesByRole,
    };

    return (
        <MetadataContext.Provider value={value}>
            {children}
        </MetadataContext.Provider>
    );
};

export const useMetadata = () => {
    const context = useContext(MetadataContext);
    if (context === undefined) {
        throw new Error('useMetadata must be used within a MetadataProvider');
    }
    return context;
};
