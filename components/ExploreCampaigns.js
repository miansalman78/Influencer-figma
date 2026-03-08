import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Image, Modal, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCurrencySymbol } from '../utils/currency';
import * as locationService from '../services/location';
import { PlatformIcon } from '../utils/platformIcons';
import { getCache, setCache, DEFAULT_TTL } from '../utils/cache';
import LocationPicker from './LocationPicker';

// Import MaterialIcons - handle both ES6 and CommonJS
let MaterialIcons;
try {
    const MaterialIconModule = require('react-native-vector-icons/MaterialIcons');
    MaterialIcons = MaterialIconModule.default || MaterialIconModule;
    if (typeof MaterialIcons !== 'function') {
        MaterialIcons = ({ name, size, color, style }) => (
            <Text style={[{ fontSize: size || 20, color: color || '#000' }, style]}>?</Text>
        );
    }
} catch (error) {
    console.error('Error importing MaterialIcons:', error);
    MaterialIcons = ({ name, size, color, style }) => (
        <Text style={[{ fontSize: size || 20, color: color || '#000' }, style]}>?</Text>
    );
}

const normalizeLocationList = (res) => {
    if (res && res.data && Array.isArray(res.data)) return res.data;
    if (Array.isArray(res)) return res;
    return [];
};

const ExploreCampaigns = ({ navigation, route, insideAppNavigator = false, canGoBack = false }) => {
    const isInsideAppNav = route?.params?.insideAppNavigator ?? insideAppNavigator;
    const showBackButton = canGoBack || !isInsideAppNav;

    // Basic Filters
    const [selectedCategory, setSelectedCategory] = useState('All'); // draft
    const [selectedPlatform, setSelectedPlatform] = useState('All'); // draft
    const [selectedCompensation, setSelectedCompensation] = useState('All'); // draft
    const [selectedServiceType, setSelectedServiceType] = useState('All'); // draft
    const [minPrice, setMinPrice] = useState(''); // draft
    const [maxPrice, setMaxPrice] = useState(''); // draft
    const [selectedFollowerRequirement, setSelectedFollowerRequirement] = useState('All'); // draft
    // Applied filters
    const [appliedCategory, setAppliedCategory] = useState('All');
    const [appliedPlatform, setAppliedPlatform] = useState('All');
    const [appliedCompensation, setAppliedCompensation] = useState('All');
    const [appliedServiceType, setAppliedServiceType] = useState('All');
    const [appliedMinPrice, setAppliedMinPrice] = useState('');
    const [appliedMaxPrice, setAppliedMaxPrice] = useState('');
    const [appliedFollowerRequirement, setAppliedFollowerRequirement] = useState('All');

    // Modal & Loading States
    const [showFilterModal, setShowFilterModal] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [campaigns, setCampaigns] = useState([]);
    const [summaryStats, setSummaryStats] = useState({ totals: { usd: 0, ngn: 0 } });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Location Filters (Country → State → City from API, with Anywhere option)
    const [isAnywhere, setIsAnywhere] = useState(true); // draft
    const [selectedCountry, setSelectedCountry] = useState(null); // draft
    const [selectedState, setSelectedState] = useState(null); // draft
    const [selectedCity, setSelectedCity] = useState(null); // draft
    const [appliedIsAnywhere, setAppliedIsAnywhere] = useState(true);
    const [appliedCountry, setAppliedCountry] = useState(null);
    const [appliedState, setAppliedState] = useState(null);
    const [appliedCity, setAppliedCity] = useState(null);
    const [countries, setCountries] = useState([]);
    const [states, setStates] = useState([]);
    const [cities, setCities] = useState([]);
    const [loadingLocations, setLoadingLocations] = useState(false);

    const PLATFORMS = ['All', 'Instagram', 'TikTok', 'YouTube', 'Facebook', 'Twitter'];
    const COMPENSATIONS = ['All', 'Paid', 'Product', 'Both'];
    const SERVICE_TYPES = ['All', 'Reel', 'Post', 'Story', 'Video'];
    const SERVICE_TYPE_TO_API = { All: '', Reel: 'reel', Post: 'feed_post', Story: 'story', Video: 'short_video' };

    const CATEGORY_FALLBACK = [
        { value: 'All', label: 'All' },
        { value: 'food_drink', label: 'Food & Drink' },
        { value: 'tech_gadgets', label: 'Tech & Gadgets' },
        { value: 'fitness_health', label: 'Fitness & Health' },
        { value: 'travel_lifestyle', label: 'Travel & Lifestyle' },
        { value: 'fashion_beauty', label: 'Fashion & Beauty' },
        { value: 'entertainment_media', label: 'Entertainment & Media' },
        { value: 'sports', label: 'Sports' },
        { value: 'education', label: 'Education' },
        { value: 'gaming', label: 'Gaming' },
        { value: 'business', label: 'Business' },
        { value: 'art_design', label: 'Art & Design' },
    ];
    const [categoryOptions, setCategoryOptions] = useState(CATEGORY_FALLBACK);

    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const [categoriesModule, countriesRes] = await Promise.all([
                    import('../services/categories'),
                    locationService.getCountries()
                ]);
                const cats = await categoriesModule.getCategories();
                if (Array.isArray(cats) && cats.length > 0) {
                    setCategoryOptions([{ value: 'All', label: 'All' }, ...cats]);
                }
                const list = normalizeLocationList(countriesRes);
                setCountries(list);
            } catch (e) {
                console.warn('[ExploreCampaigns] Initial data load failed', e);
                // Minimal fallback so user can still select a country when API key is missing
                setCountries([
                    { name: 'United States', iso2: 'US' },
                    { name: 'United Kingdom', iso2: 'GB' },
                    { name: 'Canada', iso2: 'CA' },
                    { name: 'Nigeria', iso2: 'NG' },
                    { name: 'India', iso2: 'IN' },
                ]);
            }
        };
        loadInitialData();
    }, []);

    useEffect(() => {
        if (selectedCountry) {
            const code = selectedCountry.iso2 || selectedCountry.isoCode;
            if (!code) {
                setStates([]);
                return;
            }
            setLoadingLocations(true);
            locationService.getStates(code)
                .then((res) => setStates(normalizeLocationList(res)))
                .catch(() => setStates([]))
                .finally(() => setLoadingLocations(false));
            setSelectedState(null);
            setSelectedCity(null);
        } else {
            setStates([]);
        }
    }, [selectedCountry]);

    useEffect(() => {
        if (selectedState && selectedCountry) {
            const countryCode = selectedCountry.iso2 || selectedCountry.isoCode;
            const stateCode = selectedState.iso2 || selectedState.isoCode;
            if (!countryCode || !stateCode) {
                setCities([]);
                return;
            }
            setLoadingLocations(true);
            locationService.getCities(countryCode, stateCode)
                .then((res) => setCities(normalizeLocationList(res)))
                .catch(() => setCities([]))
                .finally(() => setLoadingLocations(false));
            setSelectedCity(null);
        } else {
            setCities([]);
        }
    }, [selectedState, selectedCountry]);

    const fetchCampaigns = async () => {
        try {
            const cacheKey = 'explore_campaigns';
            const cached = await getCache(cacheKey);
            if (cached?.campaigns?.length > 0) {
                setCampaigns(cached.campaigns);
                if (cached.summaryStats?.totals) setSummaryStats(cached.summaryStats);
                setLoading(false);
            } else {
                setLoading(true);
            }
            setError(null);
            const params = { page: 1, limit: 50 };

            if (appliedCategory !== 'All') params.niche = appliedCategory;
            if (appliedPlatform !== 'All') params.platform = appliedPlatform.toLowerCase();
            if (appliedCompensation !== 'All') params.compensationType = appliedCompensation.toLowerCase();
            if (appliedServiceType !== 'All') {
                const apiServiceType = SERVICE_TYPE_TO_API[appliedServiceType];
                if (apiServiceType) params.serviceType = apiServiceType;
            }

            if (!appliedIsAnywhere) {
                if (appliedCountry) params.country = appliedCountry.name || appliedCountry;
                if (appliedState) params.state = appliedState.name || appliedState;
                if (appliedCity) params.city = (appliedCity && (appliedCity.name || appliedCity)) || '';
            }

            if (appliedMinPrice !== '' || appliedMaxPrice !== '') {
                params.budget = `${appliedMinPrice || 0}-${appliedMaxPrice || 999999999}`;
            }

            const response = await import('../services/campaigns').then(m => m.browseCampaigns(params));
            if (response && response.data) {
                const remoteCampaigns = Array.isArray(response.data) ? response.data : (response.data.campaigns || []);
                const totals = remoteCampaigns.reduce((acc, c) => {
                    let value = 0;
                    if (c.budget) {
                        if (typeof c.budget === 'number') value = c.budget;
                        else if (typeof c.budget === 'string') {
                            const cleanVal = c.budget.replace(/[^0-9.]/g, '');
                            value = parseFloat(cleanVal) || 0;
                        }
                    } else if (c.budgetRange) {
                        const min = parseFloat(c.budgetRange.min) || 0;
                        const max = parseFloat(c.budgetRange.max) || 0;
                        value = max > 0 ? (min + max) / 2 : min;
                    }
                    const currency = (c.currency || c.budgetRange?.currency || '').toUpperCase();
                    if (currency === 'USD') acc.usd += value;
                    else acc.ngn += value;
                    return acc;
                }, { usd: 0, ngn: 0 });
                setSummaryStats({ totals });
                const processed = remoteCampaigns.map(c => {
                    let brandName = 'Brand';
                    let brandImage = null;
                    if (c.brandId && typeof c.brandId === 'object') {
                        brandName = c.brandId.companyName || c.brandId.name || 'Brand';
                        brandImage = c.brandId.profileImage || c.brandId.companyLogo || null;
                    }

                    const platform = Array.isArray(c.platform) ? c.platform[0] : c.platform || 'instagram';
                    const platformLower = platform.toLowerCase();
                    let platformIcon = 'campaign';
                    if (platformLower.includes('youtube')) platformIcon = 'play-circle-filled';
                    else if (platformLower.includes('tiktok')) platformIcon = 'music-note';
                    else if (platformLower.includes('twitter') || platformLower.includes('x')) platformIcon = 'tag';
                    else if (platformLower.includes('facebook')) platformIcon = 'thumb-up';

                    let budgetDisplay = 'Negotiable';
                    const currency = (c.currency || c.budgetRange?.currency || 'NGN').toUpperCase();
                    const symbol = getCurrencySymbol(currency);
                    if (c.budget) budgetDisplay = `${symbol}${Number(c.budget).toLocaleString()}`;
                    else if (c.budgetRange?.min) budgetDisplay = `${symbol}${Number(c.budgetRange.min).toLocaleString()}+`;

                    // Handle location display to prevent "N/A"
                    const loc = c.location || {};
                    const city = loc.city && loc.city !== 'N/A' && loc.city !== 'n/a' ? loc.city : '';
                    const country = loc.country && loc.country !== 'N/A' && loc.country !== 'n/a' ? loc.country : '';

                    let locationDisplay = 'Remote';
                    if (city && country) {
                        locationDisplay = `${city}, ${country}`;
                    } else if (city || country) {
                        locationDisplay = city || country;
                    } else if (c.requirements?.location?.[0]) {
                        locationDisplay = c.requirements.location[0];
                    }

                    const status = c.status || 'open';
                    const statusColor = (status === 'open' || status === 'active' || status === 'Open' || status === 'Active') ? '#10b981' : (status?.toLowerCase() === 'draft' ? '#6b7280' : '#f59e0b');
                    const deadline = c.dueDate || c.applicationDeadline || c.application_deadline;
                    const daysLeft = deadline ? Math.max(0, Math.ceil((new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24))) : '-';

                    return {
                        ...c,
                        id: c._id || c.id,
                        title: c.name || c.title,
                        description: c.description || '',
                        brandName,
                        brandImage,
                        brandCategory: c.niche || c.brandCategory || 'General',
                        brandColor: '#337DEB',
                        platform: platform.charAt(0).toUpperCase() + platform.slice(1),
                        platformIcon,
                        budget: budgetDisplay,
                        budgetDisplay,
                        location: locationDisplay,
                        applied: `${c.applicantCount || 0} applied`,
                        appliedIcon: 'group',
                        statusDisplay: (c.status || 'Open').charAt(0).toUpperCase() + (c.status || 'Open').slice(1),
                        status,
                        statusColor,
                        daysLeft: typeof daysLeft === 'number' ? String(daysLeft) : daysLeft,
                        applicationDeadline: deadline,
                        application_deadline: c.application_deadline,
                    };
                });
                setCampaigns(processed);
                try {
                    await setCache(cacheKey, { campaigns: processed, summaryStats: { totals } }, DEFAULT_TTL.SHORT);
                } catch (e) { /* ignore */ }
            }
        } catch (err) {
            console.error("Fetch campaigns error:", err);
            setError("Failed to load campaigns.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCampaigns();
    }, [appliedCategory, appliedPlatform, appliedCompensation, appliedServiceType, appliedIsAnywhere, appliedCountry, appliedState, appliedCity, appliedMinPrice, appliedMaxPrice]);

    // Add focus listener to ensure data is fresh when returning to the screen
    useEffect(() => {
        const unsubscribe = navigation?.addListener?.('focus', () => {
            // Re-fetch data whenever the screen gains focus
            fetchCampaigns();
        });
        return unsubscribe;
    }, [navigation]);

    const clearFilters = () => {
        setSelectedCategory('All');
        setMinPrice('');
        setMaxPrice('');
        setSelectedPlatform('All');
        setSelectedCompensation('All');
        setSelectedServiceType('All');
        setSelectedFollowerRequirement('All');
        setIsAnywhere(true);
        setSelectedCountry(null);
        setSelectedState(null);
        setSelectedCity(null);
        setShowFilterModal(false);
    };

    const handleBidNow = (campaign) => {
        const applicationDeadline = campaign.applicationDeadline || campaign.application_deadline;
        const isDeadlinePassed = applicationDeadline ? new Date(applicationDeadline) < new Date() : false;
        if (isDeadlinePassed) {
            Alert.alert('Application Closed', 'The application deadline for this campaign has passed.');
            return;
        }
        navigation?.navigate('CampaignDetails', { campaign });
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => showBackButton ? navigation?.goBack() : navigation?.openDrawer?.()}
                    >
                        <MaterialIcons name={showBackButton ? 'arrow-back' : 'menu'} size={24} color="#374151" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Explore Campaigns</Text>
                    <TouchableOpacity style={styles.allFiltersButton} onPress={() => setShowFilters(!showFilters)}>
                        <MaterialIcons name="tune" size={18} color="#337DEB" />
                      
                    </TouchableOpacity>
                </View>

                {/* All Filters Panel (Offer-style) */}
                {showFilters && (
                    <View style={styles.filterDropdown}>
                        <View style={styles.filterHeader}>
                            <Text style={styles.filterTitle}>Filters</Text>
                            <TouchableOpacity onPress={clearFilters}>
                                <Text style={styles.clearAllText}>Clear All</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Price Range */}
                        <View style={styles.filterSection}>
                            <Text style={styles.filterSectionTitle}>Price Range</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <TextInput
                                    style={styles.priceInput}
                                    placeholder="Min"
                                    placeholderTextColor="#9ca3af"
                                    keyboardType="numeric"
                                    value={minPrice}
                                    onChangeText={setMinPrice}
                                />
                                <Text style={{ marginHorizontal: 10 }}>to</Text>
                                <TextInput
                                    style={styles.priceInput}
                                    placeholder="Max"
                                    placeholderTextColor="#9ca3af"
                                    keyboardType="numeric"
                                    value={maxPrice}
                                    onChangeText={setMaxPrice}
                                />
                            </View>
                        </View>

                        {/* Platform */}
                        <View style={styles.filterSection}>
                            <Text style={styles.filterSectionTitle}>Platform</Text>
                            <View style={styles.filterOptions}>
                                {PLATFORMS.map((p) => (
                                    <TouchableOpacity
                                        key={p}
                                        style={[styles.filterOption, selectedPlatform === p && styles.filterOptionSelected]}
                                        onPress={() => setSelectedPlatform(p)}
                                    >
                                        <Text style={[styles.filterOptionText, selectedPlatform === p && styles.filterOptionTextSelected]}>{p}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Compensation */}
                        <View style={styles.filterSection}>
                            <Text style={styles.filterSectionTitle}>Compensation</Text>
                            <View style={styles.filterOptions}>
                                {COMPENSATIONS.map((c) => (
                                    <TouchableOpacity
                                        key={c}
                                        style={[styles.filterOption, selectedCompensation === c && styles.filterOptionSelected]}
                                        onPress={() => setSelectedCompensation(c)}
                                    >
                                        <Text style={[styles.filterOptionText, selectedCompensation === c && styles.filterOptionTextSelected]}>{c}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Service Type */}
                        <View style={styles.filterSection}>
                            <Text style={styles.filterSectionTitle}>Service Type</Text>
                            <View style={styles.filterOptions}>
                                {SERVICE_TYPES.map((s) => (
                                    <TouchableOpacity
                                        key={s}
                                        style={[styles.filterOption, selectedServiceType === s && styles.filterOptionSelected]}
                                        onPress={() => setSelectedServiceType(s)}
                                    >
                                        <Text style={[styles.filterOptionText, selectedServiceType === s && styles.filterOptionTextSelected]}>{s}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Follower Requirement */}
                        <View style={styles.filterSection}>
                            <Text style={styles.filterSectionTitle}>Follower Requirement</Text>
                            <View style={styles.filterOptions}>
                                {['All', 'Less than 100k', 'More than 100k'].map((opt) => (
                                    <TouchableOpacity
                                        key={opt}
                                        style={[styles.filterOption, selectedFollowerRequirement === opt && styles.filterOptionSelected]}
                                        onPress={() => setSelectedFollowerRequirement(opt)}
                                    >
                                        <Text style={[styles.filterOptionText, selectedFollowerRequirement === opt && styles.filterOptionTextSelected]}>{opt}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Location */}
                        <View style={styles.filterSection}>
                            <View style={styles.locationCard}>
                                <View style={styles.locationHeaderRow}>
                                    <MaterialIcons name="location-on" size={18} color="#374151" />
                                    <Text style={styles.locationHeaderText}>Location</Text>
                                    <TouchableOpacity style={styles.anywhereToggleChip} onPress={() => {
                                        const next = !isAnywhere;
                                        setIsAnywhere(next);
                                        if (next) {
                                            setSelectedCountry(null); setSelectedState(null); setSelectedCity(null);
                                        }
                                    }}>
                                        <MaterialIcons name={isAnywhere ? 'check-box' : 'check-box-outline-blank'} size={18} color="#337DEB" />
                                        <Text style={styles.anywhereText}>Anywhere</Text>
                                    </TouchableOpacity>
                                </View>
                                {!isAnywhere && (
                                    <View style={styles.locationPickerWrap}>
                                        <LocationPicker
                                            label={null}
                                            value={{}}
                                            onChange={(loc) => {
                                                setSelectedCountry(loc.country ? { name: loc.country } : null);
                                                setSelectedState(loc.state ? { name: loc.state } : null);
                                                setSelectedCity(loc.city ? { name: loc.city } : null);
                                            }}
                                        />
                                    </View>
                                )}
                                {!isAnywhere && (selectedCountry || selectedState || selectedCity) && (
                                    <View style={{ marginTop: 8 }}>
                                        <View style={styles.locationSelectedPill}>
                                            <Text style={styles.locationSelectedPillText}>
                                                {[selectedCity?.name, selectedState?.name, selectedCountry?.name].filter(Boolean).slice(0,2).join(', ') || selectedCountry?.name}
                                            </Text>
                                        </View>
                                    </View>
                                )}
                            </View>
                        </View>

                        {/* Apply */}
                        <TouchableOpacity
                            style={styles.applyFiltersButton}
                            onPress={() => {
                                setAppliedCategory(selectedCategory);
                                setAppliedPlatform(selectedPlatform);
                                setAppliedCompensation(selectedCompensation);
                                setAppliedServiceType(selectedServiceType);
                                setAppliedMinPrice(minPrice);
                                setAppliedMaxPrice(maxPrice);
                                setAppliedFollowerRequirement(selectedFollowerRequirement);
                                setAppliedIsAnywhere(isAnywhere);
                                setAppliedCountry(selectedCountry);
                                setAppliedState(selectedState);
                                setAppliedCity(selectedCity);
                                setShowFilters(false);
                            }}
                        >
                            <Text style={styles.applyFiltersText}>Apply Filters</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Summary Statistics - same dark bar as Campaigns */}
                <View style={styles.summarySection}>
                    <View style={styles.summaryCard}>
                        <View style={styles.summaryRow}>
                            <View style={styles.summaryItem}>
                                <Text style={styles.summaryLabel}>Found</Text>
                                <Text style={styles.summaryValue}>{campaigns.length}</Text>
                            </View>
                            <View style={[styles.summaryItem, styles.summaryItemEarnings]}>
                                <Text style={styles.summaryLabel}>Total Rewards</Text>
                                {(() => {
                                    if (summaryStats.totals) {
                                        const { usd, ngn } = summaryStats.totals;
                                        const parts = [];
                                        if (usd > 0) parts.push(`$${usd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`);
                                        if (ngn > 0) parts.push(`₦${ngn.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`);
                                        if (parts.length > 0) return <Text style={styles.summaryValue} numberOfLines={1}>{parts.join(' · ')}</Text>;
                                    }
                                    return <Text style={styles.summaryValue} numberOfLines={1}>$0 · ₦0</Text>;
                                })()}
                            </View>
                        </View>
                    </View>
                </View>

                {/* Category filter chips - same as Campaigns */}
                <View style={styles.filtersSection}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersScroll}>
                        {categoryOptions.map((opt) => (
                            <TouchableOpacity
                                key={opt.value}
                                style={[styles.filterChip, selectedCategory === opt.value && styles.filterChipSelected]}
                                onPress={() => setSelectedCategory(opt.value)}
                            >
                                <Text style={[styles.filterChipText, selectedCategory === opt.value && styles.filterChipTextSelected]}>{opt.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                {loading && (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#337DEB" />
                        <Text style={styles.loadingText}>Fetching campaigns...</Text>
                    </View>
                )}

                {/* Campaigns List - same card layout as Campaigns */}
                {!loading && (
                    <View style={styles.campaignsSection}>
                        {(() => {
                            const readMinFollowers = (c) => {
                                const req = c.requirements || {};
                                const val1 = req.followers && req.followers.min;
                                const val2 = req.followerRange && req.followerRange.min;
                                const v = val1 != null ? val1 : val2;
                                const n = v != null ? Number(v) : null;
                                return isNaN(n) ? null : n;
                            };
                            const filtered = campaigns.filter((c) => {
                                if (appliedFollowerRequirement === 'All') return true;
                                const minReq = readMinFollowers(c);
                                if (minReq == null) return appliedFollowerRequirement === 'Less than 100k';
                                if (appliedFollowerRequirement === 'Less than 100k') return minReq < 100000;
                                if (appliedFollowerRequirement === 'More than 100k') return minReq > 100000;
                                return true;
                            });
                            return filtered.length > 0 ? filtered.map((c) => {
                            const isDeadlinePassed = c.applicationDeadline ? new Date(c.applicationDeadline) < new Date() : false;
                            return (
                                <TouchableOpacity
                                    key={c.id}
                                    style={styles.campaignCard}
                                    onPress={() => handleBidNow(c)}
                                    activeOpacity={0.7}
                                >
                                    <View style={styles.campaignHeader}>
                                        <View style={styles.brandInfo}>
                                            <View style={[styles.brandIconBox, { backgroundColor: c.brandColor || '#337DEB' }]}>
                                                {c.brandImage ? (
                                                    <Image source={{ uri: c.brandImage }} style={styles.brandImage} />
                                                ) : (
                                                    <MaterialIcons name="business" size={18} color="#ffffff" />
                                                )}
                                            </View>
                                            <View style={styles.brandDetails}>
                                                <Text style={styles.brandName}>{c.brandName}</Text>
                                                <Text style={styles.brandCategory}>{c.brandCategory}</Text>
                                            </View>
                                        </View>
                                        <View style={[styles.statusTag, { backgroundColor: c.statusColor }]}>
                                            <Text style={styles.statusText}>{c.statusDisplay}</Text>
                                        </View>
                                    </View>
                                    <Text style={styles.campaignTitle}>{c.title}</Text>
                                    <Text style={styles.campaignDescription} numberOfLines={3}>{c.description || 'No description.'}</Text>
                                    <View style={styles.campaignDetails}>
                                        <View style={styles.detailItem}>
                                            <MaterialIcons name="location-on" size={14} color="#9ca3af" />
                                            <Text style={styles.detailText}>{c.location}</Text>
                                        </View>
                                        <View style={styles.detailItem}>
                                            <PlatformIcon platform={c.platform} size={14} color="#9ca3af" />
                                            <Text style={styles.detailText}>{c.platform}</Text>
                                        </View>
                                    </View>
                                    <View style={styles.campaignMetrics}>
                                        <View style={styles.metricItem}>
                                            <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{c.budgetDisplay}</Text>
                                            <Text style={styles.metricLabel}>Budget</Text>
                                        </View>
                                        <View style={[styles.metricItem, styles.metricItemCenter]}>
                                            <Text style={styles.metricValue}>{typeof c.daysLeft === 'string' && c.daysLeft.includes('days') ? c.daysLeft.replace(' days', '') : c.daysLeft}</Text>
                                            <Text style={styles.metricLabel}>Days left</Text>
                                        </View>
                                        <View style={styles.metricItem}>
                                            <View style={styles.appliedRow}>
                                                <MaterialIcons name="people" size={14} color="#1f2937" />
                                                <Text style={styles.metricValue}>{c.applied.split(' ')[0]}</Text>
                                            </View>
                                            <Text style={styles.metricLabel}>Applied</Text>
                                        </View>
                                    </View>
                                    <View style={styles.campaignActions}>
                                        <TouchableOpacity
                                            style={[styles.bidButton, isDeadlinePassed && styles.bidButtonDisabled]}
                                            onPress={(e) => { e.stopPropagation(); handleBidNow(c); }}
                                            disabled={isDeadlinePassed}
                                        >
                                            <MaterialIcons name="send" size={18} color="#ffffff" />
                                            <Text style={styles.bidButtonText}>{isDeadlinePassed ? 'Closed' : 'Bid Now'}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </TouchableOpacity>
                            );
                            }) : (
                            <View style={styles.emptyContainer}>
                                <MaterialIcons name="campaign" size={64} color="#cbd5e1" />
                                <Text style={styles.emptyText}>No campaigns found</Text>
                            </View>
                        );
                        })()}
                    </View>
                )}
            </ScrollView>

            {/* Filter Modal */}
            <Modal visible={showFilterModal} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Advanced Search</Text>
                            <TouchableOpacity onPress={() => setShowFilterModal(false)}><MaterialIcons name="close" size={24} color="#374151" /></TouchableOpacity>
                        </View>
                        <ScrollView style={styles.modalBody}>
                            {/* Budget Section */}
                            <Text style={styles.filterTitle}>Price Range</Text>
                            <View style={styles.priceRow}>
                                <TextInput
                                    style={styles.priceInput}
                                    placeholder="Min"
                                    placeholderTextColor="#9ca3af"
                                    keyboardType="numeric"
                                    value={minPrice}
                                    onChangeText={setMinPrice}
                                />
                                <Text style={{ marginHorizontal: 10 }}>to</Text>
                                <TextInput
                                    style={styles.priceInput}
                                    placeholder="Max"
                                    placeholderTextColor="#9ca3af"
                                    keyboardType="numeric"
                                    value={maxPrice}
                                    onChangeText={setMaxPrice}
                                />
                            </View>

                            {/* Platform Section */}
                            <Text style={styles.filterTitle}>Platform</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                                {PLATFORMS.map(p => (
                                    <TouchableOpacity key={p} style={[styles.modalChip, selectedPlatform === p && styles.modalChipActive]} onPress={() => setSelectedPlatform(p)}>
                                        <Text style={[styles.modalChipText, selectedPlatform === p && styles.modalChipTextActive]}>{p}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>

                            {/* Compensation Section - Paid campaign or free product */}
                            <Text style={styles.filterTitle}>Compensation</Text>
                            <Text style={styles.filterSubtitle}>Paid campaign or free product</Text>
                            <View style={styles.chipRow}>
                                {COMPENSATIONS.map(c => (
                                    <TouchableOpacity key={c} style={[styles.modalChip, selectedCompensation === c && styles.modalChipActive]} onPress={() => setSelectedCompensation(c)}>
                                        <Text style={[styles.modalChipText, selectedCompensation === c && styles.modalChipTextActive]}>{c}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Service Type Section */}
                            <Text style={styles.filterTitle}>Service Type</Text>
                            <View style={styles.chipRow}>
                                {SERVICE_TYPES.map(s => (
                                    <TouchableOpacity key={s} style={[styles.modalChip, selectedServiceType === s && styles.modalChipActive]} onPress={() => setSelectedServiceType(s)}>
                                        <Text style={[styles.modalChipText, selectedServiceType === s && styles.modalChipTextActive]}>{s}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Follower Requirement */}
                            <Text style={styles.filterTitle}>Follower Requirement</Text>
                            <View style={styles.chipRow}>
                                {['All', 'Less than 100k', 'More than 100k'].map(opt => (
                                    <TouchableOpacity
                                        key={opt}
                                        style={[styles.modalChip, selectedFollowerRequirement === opt && styles.modalChipActive]}
                                        onPress={() => setSelectedFollowerRequirement(opt)}
                                    >
                                        <Text style={[styles.modalChipText, selectedFollowerRequirement === opt && styles.modalChipTextActive]}>{opt}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Location Section (collapsible lists; default open when not Anywhere) */}
                            {(() => {
                                const [openCountry, setOpenCountry] = React.useState(!isAnywhere && !selectedCountry);
                                const [openState, setOpenState] = React.useState(!isAnywhere && !!selectedCountry && !selectedState);
                                const [openCity, setOpenCity] = React.useState(!isAnywhere && !!selectedState && !selectedCity);
                                const getName = (val) => (val && (val.name || val)) || '';
                                return (
                                    <>
                                        <View style={styles.locationHeader}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.filterTitle}>Location</Text>
                                                <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                                                    {isAnywhere ? 'Anywhere'
                                                      : [getName(selectedCountry), getName(selectedState), getName(selectedCity)].filter(Boolean).join(' > ') || 'Select location'}
                                                </Text>
                                            </View>
                                            <TouchableOpacity style={styles.anywhereToggle} onPress={() => {
                                                const next = !isAnywhere;
                                                setIsAnywhere(next);
                                                if (next) {
                                                    // Turning Anywhere ON – reset and close all
                                                    setOpenCountry(false);
                                                    setOpenState(false);
                                                    setOpenCity(false);
                                                    setSelectedCountry(null);
                                                    setSelectedState(null);
                                                    setSelectedCity(null);
                                                } else {
                                                    // Turning Anywhere OFF – open Country selector by default
                                                    setOpenCountry(true);
                                                    setOpenState(false);
                                                    setOpenCity(false);
                                                }
                                            }}>
                                                <MaterialIcons name={isAnywhere ? "check-box" : "check-box-outline-blank"} size={22} color="#337DEB" />
                                                <Text style={styles.anywhereText}>Anywhere</Text>
                                            </TouchableOpacity>
                                        </View>

                                        {!isAnywhere && (
                                            <View style={styles.locationDropdowns}>
                                                <TouchableOpacity onPress={() => { setOpenCountry(!openCountry); setOpenState(false); setOpenCity(false); }}>
                                                    <Text style={styles.inputLabel}>Country{selectedCountry ? `: ${getName(selectedCountry)}` : ''}</Text>
                                                </TouchableOpacity>
                                                {openCountry && (
                                                    <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
                                                        {countries.length === 0 && loadingLocations && <Text style={styles.dropdownLoading}>Loading countries…</Text>}
                                                        {countries.map((c, i) => {
                                                            const key = c.iso2 || c.id || c.name || i;
                                                            const name = c.name || c;
                                                            const isSelected = selectedCountry && (selectedCountry.iso2 === c.iso2 || selectedCountry.id === c.id || selectedCountry.name === name);
                                                            return (
                                                                <TouchableOpacity key={key} style={[styles.dropdownItem, isSelected && styles.dropdownItemSelected]} onPress={() => {
                                                                    setSelectedCountry(c);
                                                                    setOpenCountry(false);
                                                                    setOpenState(true);
                                                                    setSelectedState(null);
                                                                    setSelectedCity(null);
                                                                }}>
                                                                    <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextSelected]}>{name}</Text>
                                                                </TouchableOpacity>
                                                            );
                                                        })}
                                                    </ScrollView>
                                                )}

                                                {selectedCountry && (
                                                    <>
                                                        <TouchableOpacity onPress={() => { setOpenState(!openState); setOpenCity(false); }}>
                                                            <Text style={styles.inputLabel}>State{selectedState ? `: ${getName(selectedState)}` : ''}</Text>
                                                        </TouchableOpacity>
                                                        {openState && (
                                                            <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
                                                                {states.length === 0 && loadingLocations && <Text style={styles.dropdownLoading}>Loading states…</Text>}
                                                                {states.map((s, i) => {
                                                                    const key = s.iso2 || s.id || s.name || i;
                                                                    const name = s.name || s;
                                                                    const isSelected = selectedState && (selectedState.iso2 === s.iso2 || selectedState.id === s.id || selectedState.name === name);
                                                                    return (
                                                                        <TouchableOpacity key={key} style={[styles.dropdownItem, isSelected && styles.dropdownItemSelected]} onPress={() => {
                                                                            setSelectedState(s);
                                                                            setOpenState(false);
                                                                            setOpenCity(true);
                                                                            setSelectedCity(null);
                                                                        }}>
                                                                            <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextSelected]}>{name}</Text>
                                                                        </TouchableOpacity>
                                                                    );
                                                                })}
                                                            </ScrollView>
                                                        )}
                                                    </>
                                                )}

                                                {selectedState && (
                                                    <>
                                                        <TouchableOpacity onPress={() => setOpenCity(!openCity)}>
                                                            <Text style={styles.inputLabel}>City{selectedCity ? `: ${getName(selectedCity)}` : ''}</Text>
                                                        </TouchableOpacity>
                                                        {openCity && (
                                                            <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
                                                                {cities.length === 0 && loadingLocations && <Text style={styles.dropdownLoading}>Loading cities…</Text>}
                                                                {cities.map((ct, i) => {
                                                                    const key = ct.id || ct.name || i;
                                                                    const name = ct.name || ct;
                                                                    const isSelected = selectedCity && ((typeof selectedCity === 'object' && (selectedCity.id === ct.id || selectedCity.name === name)) || selectedCity === name);
                                                                    return (
                                                                        <TouchableOpacity key={key} style={[styles.dropdownItem, isSelected && styles.dropdownItemSelected]} onPress={() => {
                                                                            setSelectedCity(ct);
                                                                            setOpenCity(false);
                                                                        }}>
                                                                            <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextSelected]}>{name}</Text>
                                                                        </TouchableOpacity>
                                                                    );
                                                                })}
                                                            </ScrollView>
                                                        )}
                                                    </>
                                                )}
                                            </View>
                                        )}
                                    </>
                                );
                            })()}
                        </ScrollView>
                        <View style={styles.modalFooter}>
                            <TouchableOpacity style={styles.clearBtn} onPress={clearFilters}><Text style={styles.clearBtnText}>Clear All</Text></TouchableOpacity>
                            <TouchableOpacity
                                style={styles.applyBtn}
                                onPress={() => {
                                    // Commit drafts into applied
                                    setAppliedCategory(selectedCategory);
                                    setAppliedPlatform(selectedPlatform);
                                    setAppliedCompensation(selectedCompensation);
                                    setAppliedServiceType(selectedServiceType);
                                    setAppliedMinPrice(minPrice);
                                    setAppliedMaxPrice(maxPrice);
                                    setAppliedFollowerRequirement(selectedFollowerRequirement);
                                    setAppliedIsAnywhere(isAnywhere);
                                    setAppliedCountry(selectedCountry);
                                    setAppliedState(selectedState);
                                    setAppliedCity(selectedCity);
                                    setShowFilterModal(false);
                                }}
                            >
                                <Text style={styles.applyBtnText}>Apply Filters</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    allFiltersButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        backgroundColor: '#f9fafb',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        minWidth: 0,
    },
    allFiltersText: {
        fontSize: 13,
        color: '#374151',
        marginLeft: 6,
        fontWeight: '600',
    },
    filterDropdown: {
        backgroundColor: '#ffffff',
        marginHorizontal: 16,
        marginTop: 8,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        padding: 20,
    },
    filterHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    filterTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#2d3748',
    },
    clearAllText: {
        fontSize: 14,
        color: '#337DEB',
        fontWeight: '600',
    },
    filterSection: {
        marginBottom: 20,
    },
    filterSectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#2d3748',
        marginBottom: 12,
    },
    filterOptions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    filterOption: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        backgroundColor: '#f9fafb',
    },
    filterOptionSelected: {
        backgroundColor: '#337DEB',
        borderColor: '#337DEB',
    },
    filterOptionText: {
        fontSize: 12,
        color: '#6b7280',
        fontWeight: '500',
    },
    filterOptionTextSelected: {
        color: '#ffffff',
    },
    applyFiltersButton: {
        backgroundColor: '#337DEB',
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 4,
    },
    applyFiltersText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#ffffff',
    },
    locationCard: {
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 12,
        padding: 12,
        backgroundColor: '#ffffff',
    },
    locationHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    locationHeaderText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
        marginLeft: 6,
        flex: 1,
    },
    anywhereToggleChip: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#c7d2fe',
        backgroundColor: '#eef2ff',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 16,
    },
    anywhereText: {
        color: '#4f46e5',
        fontSize: 12,
        fontWeight: '600',
        marginLeft: 6,
    },
    locationPickerWrap: {
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 8,
        overflow: 'hidden',
    },
    locationSelectedPill: {
        alignSelf: 'flex-start',
        backgroundColor: '#eef2ff',
        borderColor: '#c7d2fe',
        borderWidth: 1,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    locationSelectedPillText: {
        fontSize: 12,
        color: '#4f46e5',
        fontWeight: '600',
    },
    scrollView: {
        flex: 1,
        paddingBottom: 80,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 50,
        paddingBottom: 12,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    backButton: {
        padding: 8,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#374151',
        flex: 1,
        textAlign: 'center',
    },
    createButton: {
        padding: 4,
        width: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    summarySection: {
        paddingHorizontal: 16,
        paddingVertical: 20,
    },
    summaryCard: {
        backgroundColor: '#337DEB',
        borderRadius: 22,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 4,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    summaryItem: {
        flex: 1,
        alignItems: 'center',
    },
    summaryItemEarnings: {
        minWidth: 0,
        flexShrink: 1,
    },
    summaryLabel: {
        fontSize: 14,
        color: '#ffffff',
        opacity: 0.9,
        marginBottom: 4,
    },
    summaryValue: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#ffffff',
    },
    filtersSection: {
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    filtersScroll: {
        flexDirection: 'row',
        gap: 10,
        paddingVertical: 4,
    },
    filterChip: {
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.06)',
    },
    filterChipSelected: {
        backgroundColor: '#337DEB',
    },
    filterChipText: {
        fontSize: 14,
        color: '#374151',
        fontWeight: '500',
    },
    filterChipTextSelected: {
        color: '#ffffff',
    },
    loadingContainer: {
        padding: 100,
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 15,
        color: '#64748b',
    },
    campaignsSection: {
        paddingHorizontal: 16,
        paddingBottom: 100,
    },
    campaignCard: {
        backgroundColor: '#ffffff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    campaignHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    brandInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    brandIconBox: {
        width: 40,
        height: 40,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        overflow: 'hidden',
    },
    brandImage: {
        width: '100%',
        height: '100%',
    },
    brandDetails: {
        flex: 1,
    },
    brandName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1f2937',
        marginBottom: 2,
    },
    brandCategory: {
        fontSize: 14,
        color: '#6b7280',
    },
    statusTag: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 12,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#ffffff',
    },
    campaignTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1f2937',
        marginBottom: 8,
    },
    campaignDescription: {
        fontSize: 14,
        color: '#6b7280',
        lineHeight: 20,
        marginBottom: 16,
    },
    campaignDetails: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 14,
        gap: 12,
    },
    detailItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    detailText: {
        fontSize: 13,
        color: '#9ca3af',
    },
    campaignMetrics: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#f8fafc',
        borderRadius: 12,
        paddingVertical: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#f1f5f9',
    },
    metricItem: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    metricItemCenter: {
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: '#e2e8f0',
    },
    metricLabel: {
        fontSize: 11,
        color: '#64748b',
        fontWeight: '500',
        marginTop: 2,
    },
    metricValue: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#1e293b',
    },
    appliedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    campaignActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    bidButton: {
        flex: 1,
        backgroundColor: '#337DEB',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 10,
        gap: 8,
    },
    bidButtonDisabled: {
        backgroundColor: '#9ca3af',
        opacity: 0.6,
    },
    bidButtonText: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '600',
    },
    emptyContainer: {
        padding: 50,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 18,
        color: '#94a3b8',
        marginTop: 10,
    },
    // Filter modal (Explore-specific)
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, height: '85%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
    modalTitle: { fontSize: 22, fontWeight: '800', color: '#1e293b' },
    modalBody: { flex: 1 },
    filterTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginTop: 20, marginBottom: 15 },
    filterSubtitle: { fontSize: 12, color: '#64748b', marginBottom: 8 },
    priceRow: { flexDirection: 'row', alignItems: 'center' },
    priceInput: { flex: 1, backgroundColor: '#f1f5f9', padding: 12, borderRadius: 10, textAlign: 'center', fontWeight: 'bold' },
    chipRow: { flexDirection: 'row', gap: 10, marginVertical: 5 },
    modalChip: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: '#f1f5f9', marginBottom: 10 },
    modalChipActive: { backgroundColor: '#337DEB' },
    modalChipText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
    modalChipTextActive: { color: '#fff' },
    locationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    anywhereToggle: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    anywhereText: { fontSize: 14, fontWeight: '700', color: '#337DEB' },
    locationDropdowns: { marginTop: 10 },
    inputLabel: { fontSize: 12, color: '#64748b', marginBottom: 5, marginTop: 10, fontWeight: 'bold' },
    dropdownScroll: { maxHeight: 150, backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0' },
    dropdownLoading: { padding: 12, color: '#64748b', fontSize: 14 },
    dropdownItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
    dropdownItemSelected: { backgroundColor: 'rgba(51, 125, 235, 0.1)' },
    dropdownItemText: { fontSize: 14, color: '#1e293b' },
    dropdownItemTextSelected: { color: '#337DEB', fontWeight: 'bold' },
    modalFooter: { flexDirection: 'row', gap: 15, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
    clearBtn: { flex: 1, paddingVertical: 15, alignItems: 'center', borderRadius: 12, backgroundColor: '#f1f5f9' },
    clearBtnText: { color: '#64748b', fontWeight: '700' },
    applyBtn: { flex: 2, paddingVertical: 15, alignItems: 'center', borderRadius: 12, backgroundColor: '#337DEB' },
    applyBtnText: { color: '#fff', fontWeight: '700' },
});

export default ExploreCampaigns;
