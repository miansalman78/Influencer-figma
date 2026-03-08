import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LocationPicker from './LocationPicker';
import { useAuth } from '../hooks/useAuth';
import { useMetadata } from '../context/MetadataContext';
import { VALID_PLATFORMS } from '../utils/apiConstants';
import { getCompactDualPrice, isFreeProduct } from '../utils/currency';
import { useUIStore } from '../store/useStore';

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

const ExploreOffers = ({ navigation, route, insideAppNavigator = false, canGoBack = false }) => {
  const { user } = useAuth();
  const ui = (useUIStore && typeof useUIStore === 'function') ? useUIStore() : { showToast: () => {} };
  const showToast = ui.showToast || (() => {});
  const userRole = user?.role?.toLowerCase();

  // Logic for Back vs Menu button
  const showBackButton = canGoBack || !insideAppNavigator;

  const isBrand = userRole === 'brand';
  const isCreator = userRole === 'creator' || userRole === 'influencer';

  const { loading: metadataLoading } = useMetadata();

  // Category options from API (value = slug for API, label = display)
  const CATEGORY_FALLBACK = [
    { value: 'All', label: 'All' },
    { value: 'fashion_beauty', label: 'Fashion & Beauty' },
    { value: 'tech_gadgets', label: 'Tech & Gadgets' },
    { value: 'food_drink', label: 'Food & Drink' },
    { value: 'fitness_health', label: 'Fitness & Health' },
    { value: 'travel_lifestyle', label: 'Travel & Lifestyle' },
    { value: 'gaming', label: 'Gaming' },
    { value: 'education', label: 'Education' },
  ];
  const [categoryOptions, setCategoryOptions] = useState(CATEGORY_FALLBACK);

  const [selectedServiceType, setSelectedServiceType] = useState('Creator');
  const [freeProductsOnly, setFreeProductsOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedFilters, setSelectedFilters] = useState({
    platform: 'All',
    category: 'All',
    priceRange: 'All',
    location: 'All',
    followers: 'All',
    serviceDeliverable: 'All',
    status: 'All',
  });
  const [appliedFilters, setAppliedFilters] = useState({
    platform: 'All',
    category: 'All',
    priceRange: 'All',
    location: 'All',
    followers: 'All',
    serviceDeliverable: 'All',
    status: 'All',
  });
  const [locationDropdownOpen, setLocationDropdownOpen] = useState(false);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creatorsCache, setCreatorsCache] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch categories from API for filter (offer category = backend slug)
  React.useEffect(() => {
    const loadCategories = async () => {
      try {
        const categoriesService = await import('../services/categories');
        const list = await categoriesService.getCategories();
        if (Array.isArray(list) && list.length > 0) {
          setCategoryOptions([{ value: 'All', label: 'All' }, ...list]);
        }
      } catch (e) {
        console.warn('[ExploreOffers] Categories from API failed, using fallback', e);
      }
    };
    loadCategories();
  }, []);

  // Fetch creators cache first (for creator name lookup)
  React.useEffect(() => {
    const fetchCreatorsCache = async () => {
      try {
        const userService = await import('../services/user');
        const creatorsResponse = await userService.getCreators({
          page: 1,
          limit: 100
        });

        if (creatorsResponse && creatorsResponse.success && creatorsResponse.data) {
          const creatorsData = creatorsResponse.data.creators || [];
          setCreatorsCache(creatorsData);
          console.log('[ExploreOffers] Creators cache populated with', creatorsData.length, 'creators');
        }
      } catch (err) {
        console.error('[ExploreOffers] Failed to fetch creators cache:', err);
      }
    };

    fetchCreatorsCache();
  }, []);

  // Fetch offers from API
  React.useEffect(() => {
    const fetchOffers = async () => {
      try {
        setLoading(true);
        const offersService = await import('../services/offers');

        let response;

        // If creator, use getUserOffers to get their own offers
        if (isCreator) {
          if (searchText.trim()) {
            // For creators, still use search if they have search text
            response = await offersService.searchOffers(searchText, { page: 1, limit: 50 });
          } else {
            // Get creator's own offers
            const userFilters = { page: 1, limit: 50 };
            if (appliedFilters.status && appliedFilters.status !== 'All') {
              userFilters.status = appliedFilters.status.toLowerCase();
            }
            response = await offersService.getUserOffers(userFilters);
          }
        } else {
          // For brands, use regular offers API
          if (searchText.trim()) {
            response = await offersService.searchOffers(searchText, { page: 1, limit: 50 });
          } else {
            // Build filters for API (category = slug, platform, minRate/maxRate, city/state)
            const filters = { page: 1, limit: 50 };
            if (appliedFilters.platform !== 'All') {
              filters.platform = appliedFilters.platform.toLowerCase();
            }
            if (appliedFilters.category !== 'All') {
              filters.category = appliedFilters.category;
            }
            if (appliedFilters.priceRange !== 'All') {
              if (appliedFilters.priceRange.includes('Under')) {
                filters.maxRate = 100;
              } else if (appliedFilters.priceRange.includes('$100 - $300')) {
                filters.minRate = 100;
                filters.maxRate = 300;
              } else if (appliedFilters.priceRange.includes('$300 - $500')) {
                filters.minRate = 300;
                filters.maxRate = 500;
              } else if (appliedFilters.priceRange.includes('Over')) {
                filters.minRate = 500;
              }
            }
            if (appliedFilters.location !== 'All') {
              const locationParts = appliedFilters.location.split(', ');
              if (locationParts.length > 0) filters.city = locationParts[0];
              if (locationParts.length > 1) filters.state = locationParts[1];
            }
            if (appliedFilters.serviceDeliverable !== 'All') {
              const map = { Reel: 'reel', Post: 'feed_post', Story: 'story', Video: 'short_video' };
              const val = map[appliedFilters.serviceDeliverable];
              if (val) filters.serviceType = val;
            }

            response = await offersService.getOffersWithFilters(filters);
          }
        }

        if (response && response.data) {
          // Handle GET /offers response format: { success: true, data: { offers: [...], pagination: {...} } }
          const offersData = Array.isArray(response.data)
            ? response.data
            : response.data.offers || response.data.items || [];
          setOffers(offersData);
        }
      } catch (err) {
        console.error('Failed to fetch offers:', err);
        setError(err.message || 'Failed to load offers');
        setOffers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchOffers();
  }, [searchText, appliedFilters, isCreator, refreshKey, route?.params?.refresh]);

  // Handle refresh param from navigation
  React.useEffect(() => {
    if (route?.params?.refresh) {
      setRefreshKey(prev => prev + 1);
      // Clear refresh param
      if (navigation?.setParams) {
        navigation.setParams({ refresh: false });
      }
    }
  }, [route?.params?.refresh]);

  // Add focus listener to ensure data is fresh when returning to the screen
  React.useEffect(() => {
    const unsubscribe = navigation?.addListener?.('focus', () => {
      // Re-fetch data whenever the screen gains focus
      setRefreshKey(prev => prev + 1);
    });
    return unsubscribe;
  }, [navigation]);

  // Helper function to map API offer data to UI format
  // Handles GET /offers response format: { _id, creatorId, title, serviceType, platform, rate, etc. }
  const mapOfferToUI = (offer) => {
    // Handle creatorId - can be string ID or populated object
    let creator = offer.creator || offer.user || {};
    let creatorName = 'Unknown Creator';
    let creatorImage = null;

    if (offer.creatorId) {
      if (typeof offer.creatorId === 'object' && offer.creatorId !== null && offer.creatorId.name) {
        // creatorId is populated (from Get Offer by ID) - has creator info
        creator = offer.creatorId;
        creatorName = creator.name || creator.username || 'Unknown Creator';
        creatorImage = creator.profileImage || creator.avatar || null;
      } else if (typeof offer.creatorId === 'string') {
        // creatorId is just an ID string - try to find in creators cache
        if (creatorsCache && Array.isArray(creatorsCache)) {
          const cachedCreator = creatorsCache.find(c => (c.id || c._id) === offer.creatorId);
          if (cachedCreator) {
            creator = cachedCreator;
            creatorName = cachedCreator.name || cachedCreator.username || 'Unknown Creator';
            creatorImage = cachedCreator.profileImage || cachedCreator.avatar || null;
          }
        }
      }
    }

    // Fallback to creator object if available
    if (creatorName === 'Unknown Creator' && creator && (creator.name || creator.username)) {
      creatorName = creator.username ? `@${creator.username}` : creator.name;
      creatorImage = creator.profileImage || creator.avatar || null;
    }

    const location = offer.location || {};
    const norm = (v) => {
      if (!v) return '';
      const s = String(v).trim();
      if (s.toLowerCase() === 'n/a') return '';
      return s;
    };
    const platformMetrics = creator.platformMetrics || [];

    // Handle platform - can be array or string
    let primaryPlatform = 'instagram';
    if (offer.platform) {
      if (Array.isArray(offer.platform) && offer.platform.length > 0) {
        primaryPlatform = offer.platform[0];
      } else if (typeof offer.platform === 'string') {
        primaryPlatform = offer.platform;
      }
    } else if (platformMetrics.length > 0) {
      primaryPlatform = platformMetrics[0].platform || 'instagram';
    }

    // Map serviceType from API to display format (Creator or Influencer)
    // 1. Use explicit serviceCategory if available (best)
    // 2. Fallback to serviceType mapping (legacy)
    // 3. Fallback to 'Creator' (default)
    let serviceTypeDisplay = offer.serviceCategory || 'Creator';

    if (!offer.serviceCategory) {
      if (offer.serviceType === 'short_video') {
        serviceTypeDisplay = 'Influencer';
      } else if (offer.serviceType === 'reel') {
        serviceTypeDisplay = 'Creator';
      } else if (offer.serviceType && typeof offer.serviceType === 'string') {
        serviceTypeDisplay = offer.serviceType;
      }
    }


    // Handle rate - use dual currency utility
    const priceDisplay = getCompactDualPrice(offer.rate);

    // Determine primary platform for follower scoping
    const primaryPlatformKey = (primaryPlatform || 'instagram').toLowerCase();

    // Followers aggregation
    let totalFollowers = 0;
    let primaryFollowers = 0;

    // 1. Try direct aggregate fields on creator or offer
    if (creator.totalFollowers != null && Number(creator.totalFollowers) > 0) {
      totalFollowers = Number(creator.totalFollowers);
    } else if (creator.followersCount != null && Number(creator.followersCount) > 0) {
      totalFollowers = Number(creator.followersCount);
    } else if (offer.totalFollowers != null && Number(offer.totalFollowers) > 0) {
      totalFollowers = Number(offer.totalFollowers);
    } else if (offer.followersCount != null && Number(offer.followersCount) > 0) {
      totalFollowers = Number(offer.followersCount);
    }

    // 2. Fallback: Sum from platformMetrics or platformReach or platformFollowers
    if (totalFollowers === 0) {
      const metrics = creator.platformMetrics || creator.platformReach || creator.platformFollowers || [];
      if (Array.isArray(metrics)) {
        metrics.forEach(m => {
          totalFollowers += Number(m.followers || m.followerCount || m.count || 0);
        });
      }
    }

    // 3. Last fallback: Check socialAccounts (legacy)
    if (totalFollowers === 0 && creator.socialAccounts) {
      Object.values(creator.socialAccounts).forEach(acc => {
        const count = acc?.followers ?? acc?.followerCount ?? acc?.count;
        if (count != null) totalFollowers += Number(count);
      });
    }

    // Primary platform specific followers (prefer precise over sum when available)
    if (creator?.socialAccounts && creator.socialAccounts[primaryPlatformKey]) {
      const acc = creator.socialAccounts[primaryPlatformKey];
      primaryFollowers = Number(acc?.followers ?? acc?.followerCount ?? acc?.count ?? 0) || 0;
    } else {
      // Fallback to any metric entry matching platform
      const metrics = creator.platformMetrics || creator.platformReach || creator.platformFollowers || [];
      if (Array.isArray(metrics)) {
        const m = metrics.find(x => (x.platform || '').toLowerCase() === primaryPlatformKey);
        primaryFollowers = Number(m?.followers || m?.followerCount || m?.count || 0) || 0;
      }
    }
    // If still zero, fallback to totalFollowers
    if (!primaryFollowers) primaryFollowers = totalFollowers || 0;

    return {
      id: offer._id || offer.id,
      title: offer.title || 'Untitled Offer',
      creator: creatorName,
      avatar: creatorImage,
      totalFollowers: totalFollowers,
      primaryFollowers: primaryFollowers,
      location: norm(location.city) || norm(location.country)
        ? [norm(location.city), norm(location.state), norm(location.country)].filter(Boolean).join(', ')
        : 'Remote',
      // Removed audience - not in offer API payload
      platform: primaryPlatform.charAt(0).toUpperCase() + primaryPlatform.slice(1),
      platformIcon: primaryPlatform === 'instagram' ? 'camera-alt'
        : primaryPlatform === 'tiktok' ? 'music-note'
          : primaryPlatform === 'youtube' ? 'play-circle-filled'
            : primaryPlatform === 'facebook' ? 'facebook'
              : 'link',
      price: priceDisplay,
      status: offer.status || 'active',
      isFreeProduct: isFreeProduct(offer.rate),
      image: (() => {
        // Try to get image from media array
        if (offer.media && Array.isArray(offer.media) && offer.media.length > 0) {
          const firstMedia = offer.media[0];
          if (firstMedia) {
            const mediaUrl = typeof firstMedia === 'string' ? firstMedia : firstMedia.url;
            if (mediaUrl && (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://'))) {
              return mediaUrl;
            }
          }
        }
        // Return null if no media found - do NOT fallback to creator avatar
        // This ensures the UI displays the placeholder image instead of the profile picture
        return null;
      })(),
      serviceType: serviceTypeDisplay,
      quantity: offer.quantity || 1,
      deliveryDays: offer.deliveryDays || 0,
      duration: offer.duration || 30,
      category: offer.category || 'General',
      tags: offer.tags || [],
      isCustom: !!offer.isCustom,
      // Keep original API data for navigation
      _original: offer,
    };
  };

  const handlePublishOffer = async (offerId) => {
    try {
      setLoading(true);
      const offersService = await import('../services/offers');
      const response = await offersService.publishOffer(offerId);
      if (response && response.success) {
        showToast('Your offer is now live and visible to brands.', 'success');
        setRefreshKey(prev => prev + 1);
      } else {
        const msg = response?.message || response?.data?.message || 'Failed to publish offer';
        showPublishError(msg);
      }
    } catch (error) {
      console.error('Publish offer error:', error);
      const msg = error?.data?.message || error?.message || 'An error occurred while publishing';
      showPublishError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Parse backend missing-field errors and guide the user
  const showPublishError = (message) => {
    const FIELD_LABELS = {
      serviceType: 'Service Type  →  choose what kind of content you create',
      duration: 'Offer Duration  →  how long (in days) your content stays live',
      platform: 'Platform  →  which social network (Instagram, TikTok, etc.)',
      rate: 'Rate  →  set at least a USD or NGN price',
      deliveryDays: 'Delivery Days  →  how many days to deliver',
      quantity: 'Quantity  →  number of items to deliver',
      description: 'Description  →  describe what brands get',
    };

    // Try to extract the list of missing fields from the server message
    const match = message.match(/missing required fields?:?\s*([\w,\s]+)/i);
    let guide = '';
    if (match) {
      const fields = match[1].split(',').map(f => f.trim()).filter(Boolean);
      const lines = fields.map(f => `  • ${FIELD_LABELS[f] || f}`).join('\n');
      guide = `\n\nPlease complete these fields in Edit Offer:\n${lines}`;
    }

    showToast(`Your offer has some empty required fields.${guide}\n\nOpen the offer, fill in the missing fields, save, then publish again.`, 'warning');
  };

  const handleServiceTypePress = (type) => {
    setSelectedServiceType(type);
  };

  const handleFreeProductsToggle = () => {
    setFreeProductsOnly(!freeProductsOnly);
  };

  const handleFiltersPress = () => {
    setShowFilters(!showFilters);
  };

  const filterOptions = {
    platform: ['All', ...VALID_PLATFORMS.map(p => p.charAt(0).toUpperCase() + p.slice(1))],
    category: categoryOptions,
    priceRange: ['All', 'Under $100', '$100 - $300', '$300 - $500', 'Over $500', 'Free Products'],
    followers: ['All', '10k+', '50k+', '100k+'],
    serviceDeliverable: ['All', 'Reel', 'Post', 'Story', 'Video'],
    status: ['All', 'Draft', 'Active', 'Accepted', 'Completed', 'Cancelled'],
  };

  const selectFilterOption = (category, option) => {
    setSelectedFilters(prev => ({
      ...prev,
      [category]: option
    }));
  };

  const clearAllFilters = () => {
    setSelectedFilters({
      platform: 'All',
      category: 'All',
      priceRange: 'All',
      location: 'All',
      followers: 'All',
      serviceDeliverable: 'All',
      status: 'All',
    });
    setFreeProductsOnly(false);
  };

  // Map API offers to UI format
  const mappedOffers = offers.map(mapOfferToUI);

  // Client-side filtering (additional to API filters)
  const filteredOffers = mappedOffers.filter(offer => {
    // Service type filter (Creator or Influencer)
    if (offer.serviceType !== selectedServiceType) return false;

    // Free products filter
    if (freeProductsOnly && !offer.isFreeProduct) return false;

    // Platform filter (if not already filtered by API)
    if (appliedFilters.platform !== 'All' && offer.platform !== appliedFilters.platform) return false;

    // Category filter
    if (appliedFilters.category !== 'All' && offer.category !== appliedFilters.category) return false;

    // Status filter (creators only relevant)
    if (appliedFilters.status !== 'All') {
      const s = (offer.status || '').toLowerCase();
      if (s !== appliedFilters.status.toLowerCase()) return false;
    }

    // Price range filter (if not already filtered by API)
    if (appliedFilters.priceRange !== 'All') {
      // Numeric price: choose USD if present, else NGN
      let priceNum = 0;
      const rate = offer._original?.rate;
      if (rate && typeof rate === 'object') {
        priceNum = Number(rate.usd ?? rate.ngn ?? 0);
      } else if (typeof rate === 'number') {
        priceNum = rate;
      }
      if (appliedFilters.priceRange === 'Free Products' && !offer.isFreeProduct) return false;
      if (appliedFilters.priceRange === 'Under $100' && priceNum >= 100) return false;
      if (appliedFilters.priceRange === '$100 - $300' && (priceNum < 100 || priceNum > 300)) return false;
      if (appliedFilters.priceRange === '$300 - $500' && (priceNum < 300 || priceNum > 500)) return false;
      if (appliedFilters.priceRange === 'Over $500' && priceNum <= 500) return false;
    }

    // Followers filter (platform-specific when available)
    if (appliedFilters.followers !== 'All') {
      const threshold = appliedFilters.followers === '10k+' ? 10000
        : appliedFilters.followers === '50k+' ? 50000
          : appliedFilters.followers === '100k+' ? 100000
            : 0;
      const followerCount = offer.primaryFollowers != null ? offer.primaryFollowers : (offer.totalFollowers || 0);
      if ((followerCount || 0) < threshold) return false;
    }

    // Service deliverable type filter (offer serviceType value)
    if (appliedFilters.serviceDeliverable !== 'All') {
      const map = {
        Reel: 'reel',
        Post: 'feed_post',
        Story: 'story',
        Video: 'short_video'
      };
      const expected = map[appliedFilters.serviceDeliverable];
      const actual = (offer._original?.serviceType || '').toLowerCase();
      if (!expected || actual !== expected) return false;
    }

    return true;
  });

  return (
    <SafeAreaView style={styles.container} >
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              if (showBackButton) {
                // If pushed on stack, go back
                navigation?.goBack();
              } else {
                // If root tab, open drawer
                navigation?.openDrawer?.();
              }
            }}
          >
            <MaterialIcons
              name={showBackButton ? "arrow-back" : "menu"}
              size={24}
              color="#2d3748"
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isCreator ? 'My Offers' : 'Explore Offers'}</Text>
          {!isBrand && (
            <TouchableOpacity
              style={styles.createOfferButton}
              onPress={() => navigation?.navigate('CreateOffer')}
            >
              <MaterialIcons name="add" size={24} color="#337DEB" />
            </TouchableOpacity>
          )}
          {isBrand && <View style={styles.createOfferButton} />}
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <MaterialIcons name="search" size={20} color="#6b7280" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search for services..."
              placeholderTextColor="#9ca3af"
              value={searchText}
              onChangeText={setSearchText}
            />
          </View>
        </View>

        {/* Service Type Selection */}
        <View style={styles.serviceTypeContainer}>
          <TouchableOpacity
            style={[
              styles.serviceTypeButton,
              selectedServiceType === 'Creator' && styles.serviceTypeButtonSelected
            ]}
            onPress={() => handleServiceTypePress('Creator')}
          >
            <Text style={[
              styles.serviceTypeText,
              selectedServiceType === 'Creator' && styles.serviceTypeTextSelected
            ]}>
              Creator Services
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.serviceTypeButton,
              selectedServiceType === 'Influencer' && styles.serviceTypeButtonSelected
            ]}
            onPress={() => handleServiceTypePress('Influencer')}
          >
            <Text style={[
              styles.serviceTypeText,
              selectedServiceType === 'Influencer' && styles.serviceTypeTextSelected
            ]}>
              Influencer Services
            </Text>
          </TouchableOpacity>
        </View>

        {/* Filter Options */}
        <View style={styles.filterContainer}>
          <TouchableOpacity style={styles.checkboxContainer} onPress={handleFreeProductsToggle}>
            <View style={[styles.checkbox, freeProductsOnly && styles.checkboxSelected]}>
              {freeProductsOnly && <MaterialIcons name="check" size={16} color="#ffffff" />}
            </View>
            <Text style={styles.checkboxText}>Free Products Only</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.allFiltersButton} onPress={handleFiltersPress}>
            <MaterialIcons name="tune" size={16} color="#6b7280" />
            <Text style={styles.allFiltersText}>All Filters</Text>
          </TouchableOpacity>
        </View>

        {/* Filter Dropdown */}
        {showFilters && (
          <View style={styles.filterDropdown}>
            <View style={styles.filterHeader}>
              <Text style={styles.filterTitle}>Filters</Text>
              <TouchableOpacity onPress={clearAllFilters}>
                <Text style={styles.clearAllText}>Clear All</Text>
              </TouchableOpacity>
            </View>

            {/* Platform Filter */}
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Platform</Text>
              <View style={styles.filterOptions}>
                {filterOptions.platform.map((option, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.filterOption,
                      selectedFilters.platform === option && styles.filterOptionSelected
                    ]}
                    onPress={() => selectFilterOption('platform', option)}
                  >
                    <Text style={[
                      styles.filterOptionText,
                      selectedFilters.platform === option && styles.filterOptionTextSelected
                    ]}>
                      {option}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Price Range Filter */}
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Price Range</Text>
              <View style={styles.filterOptions}>
                {filterOptions.priceRange.map((option, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.filterOption,
                      selectedFilters.priceRange === option && styles.filterOptionSelected
                    ]}
                    onPress={() => selectFilterOption('priceRange', option)}
                  >
                    <Text style={[
                      styles.filterOptionText,
                      selectedFilters.priceRange === option && styles.filterOptionTextSelected
                    ]}>
                      {option}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Category Filter (API slug as value) */}
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Category</Text>
              <View style={styles.filterOptions}>
                {filterOptions.category.map((option, index) => {
                  const value = typeof option === 'object' ? option.value : option;
                  const label = typeof option === 'object' ? option.label : option;
                  return (
                    <TouchableOpacity
                      key={value}
                      style={[
                        styles.filterOption,
                        selectedFilters.category === value && styles.filterOptionSelected
                      ]}
                      onPress={() => selectFilterOption('category', value)}
                    >
                      <Text style={[
                        styles.filterOptionText,
                        selectedFilters.category === value && styles.filterOptionTextSelected
                      ]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Status Filter (only meaningful for My Offers) */}
            {isCreator && (
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Status</Text>
                <View style={styles.filterOptions}>
                  {filterOptions.status.map((option, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.filterOption,
                        selectedFilters.status === option && styles.filterOptionSelected
                      ]}
                      onPress={() => selectFilterOption('status', option)}
                    >
                      <Text style={[
                        styles.filterOptionText,
                        selectedFilters.status === option && styles.filterOptionTextSelected
                      ]}>
                        {option}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}


            {/* Followers Filter */}
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Followers</Text>
              <View style={styles.filterOptions}>
                {filterOptions.followers.map((option, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.filterOption,
                      selectedFilters.followers === option && styles.filterOptionSelected
                    ]}
                    onPress={() => selectFilterOption('followers', option)}
                  >
                    <Text style={[
                      styles.filterOptionText,
                      selectedFilters.followers === option && styles.filterOptionTextSelected
                    ]}>
                      {option}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Service Type (Deliverable) Filter */}
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Service Type</Text>
              <View style={styles.filterOptions}>
                {filterOptions.serviceDeliverable.map((option, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.filterOption,
                      selectedFilters.serviceDeliverable === option && styles.filterOptionSelected
                    ]}
                    onPress={() => selectFilterOption('serviceDeliverable', option)}
                  >
                    <Text style={[
                      styles.filterOptionText,
                      selectedFilters.serviceDeliverable === option && styles.filterOptionTextSelected
                    ]}>
                      {option}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Location Filter */}
            <View style={styles.filterSection}>
              <View style={styles.locationCard}>
                <View style={styles.locationHeaderRow}>
                  <MaterialIcons name="location-on" size={18} color="#374151" />
                  <Text style={styles.locationHeaderText}>Location</Text>
                  {selectedFilters.location && selectedFilters.location !== 'All' && (
                    <View style={styles.locationSelectedPill}>
                      <Text style={styles.locationSelectedPillText}>{selectedFilters.location}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.locationPickerWrap}>
                  <LocationPicker
                    label={null}
                    value={{}}
                    onChange={(loc) => {
                      const parts = [loc.city, loc.state, loc.country].filter(Boolean);
                      const display = parts.slice(0, 2).join(', ') || (loc.country || 'All') || 'All';
                      selectFilterOption('location', display || 'All');
                    }}
                  />
                </View>
              </View>
            </View>

            {/* Audience Filter Removed - Not in Offer API */}

            {/* Apply Filters Button */}
            <TouchableOpacity
              style={styles.applyFiltersButton}
              onPress={() => {
                setAppliedFilters(selectedFilters);
                setShowFilters(false);
              }}
            >
              <Text style={styles.applyFiltersText}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Loading State */}
        {loading && (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading offers...</Text>
          </View>
        )}

        {/* Error State */}
        {error && !loading && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => {
                setError(null);
                // Trigger refetch by updating searchText
                setSearchText(prev => prev + ' ');
                setTimeout(() => setSearchText(prev => prev.trim()), 100);
              }}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Offers List - Two columns with image on top */}
        {!loading && !error && (
          <View style={styles.offersSection}>
            {filteredOffers.length > 0 ? (
              filteredOffers.map((offer) => {
                const imageUri = offer.image || offer._original?.media?.[0]?.url || (typeof offer._original?.media?.[0] === 'string' ? offer._original.media[0] : null);
                const platformShort = (offer.platform || 'instagram').toLowerCase() === 'instagram' ? 'Insta' : (offer.platform || '').toLowerCase() === 'youtube' ? 'YT' : (offer.platform || '').toLowerCase() === 'tiktok' ? 'TikTok' : (offer.platform || '').toLowerCase() === 'twitter' ? 'Twitter' : (offer.platform || '').toLowerCase() === 'facebook' ? 'FB' : (offer.platform || 'Insta');
                const creatorHandle = (offer.creator && !offer.creator.startsWith('@')) ? `@${offer.creator.replace(/\s+/g, '_')}` : (offer.creator || '@creator');
                const audienceStr = offer.totalFollowers > 0
                  ? offer.totalFollowers >= 1000000
                    ? `${(offer.totalFollowers / 1000000).toFixed(1)}M`
                    : offer.totalFollowers >= 1000
                      ? `${(offer.totalFollowers / 1000).toFixed(1)}K`
                      : String(offer.totalFollowers)
                  : null;
                return (
                  <TouchableOpacity
                    key={offer.id}
                    style={styles.offerCard}
                    onPress={() => navigation?.navigate('OfferDetails', { offer: offer._original || offer, offerId: (offer._original || offer)?._id || (offer._original || offer)?.id || offer?.id })}
                    activeOpacity={0.7}
                  >
                    {/* Image - rounded top corners */}
                    <View style={styles.offerCardImageContainer}>
                      <Image
                        source={{ uri: imageUri || 'https://via.placeholder.com/400x220?text=Offer' }}
                        style={styles.offerCardImage}
                        resizeMode="cover"
                      />
                    </View>
                    {offer.status?.toLowerCase() === 'draft' && (
                      <View style={styles.draftBadgeContainer}>
                        <View style={styles.draftBadge}>
                          <Text style={styles.draftBadgeText}>Draft</Text>
                        </View>
                        {isCreator && (
                          <TouchableOpacity
                            style={styles.publishOfferButton}
                            onPress={(e) => {
                              e.stopPropagation();
                              handlePublishOffer(offer.id);
                            }}
                          >
                            <MaterialIcons name="publish" size={16} color="#ffffff" />
                          </TouchableOpacity>
                        )}
                      </View>
                    )}

                    {offer.isCustom && (
                      <View style={styles.customBadgeContainer}>
                        <View style={styles.customBadge}>
                          <Text style={styles.customBadgeText}>Custom</Text>
                        </View>
                      </View>
                    )}

                    {/* Content padding */}
                    <View style={styles.offerCardContent}>
                      {/* Title - large bold dark gray */}
                      <Text style={styles.offerTitle} numberOfLines={2}>{offer.title}</Text>
                      {/* Creator - small avatar + @handle */}
                      <View style={styles.creatorRow}>
                        <View style={styles.creatorAvatar}>
                          {offer.avatar && typeof offer.avatar === 'string' && offer.avatar.startsWith('http') ? (
                            <Image source={{ uri: offer.avatar }} style={styles.creatorAvatarImage} resizeMode="cover" />
                          ) : (
                            <MaterialIcons name="person" size={14} color="#9ca3af" />
                          )}
                        </View>
                        <Text style={styles.creatorHandle} numberOfLines={1}>{creatorHandle}</Text>
                      </View>
                      {/* Location & Audience - light gray with icons */}
                      <View style={styles.locationAudienceRow}>
                        <MaterialIcons name="location-on" size={12} color="#9ca3af" />
                        <Text style={styles.locationAudienceText}>{offer.location || 'Remote'}</Text>
                        {audienceStr != null && (
                          <>
                            <MaterialIcons name="people" size={12} color="#9ca3af" style={{ marginLeft: 8 }} />
                            <Text style={styles.locationAudienceText}>{audienceStr}</Text>
                          </>
                        )}
                      </View>
                      {/* Platform & Price - platform left, price bold blue right */}
                      <View style={styles.platformPriceRow}>
                        <View style={styles.platformChip}>
                          <MaterialIcons name={offer.platformIcon || 'camera-alt'} size={14} color="#374151" />
                          <Text style={styles.platformLabel}>{platformShort}</Text>
                        </View>
                        <Text style={styles.priceText}>
                          {offer.isFreeProduct ? 'Free' : (offer.price || 'Remote')}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No offers found</Text>
                <Text style={styles.emptySubtext}>Try adjusting your filters or search terms</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>


    </SafeAreaView >
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollView: {
    flex: 1,
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: '#fff',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2d3748',
  },
  createOfferButton: {
    padding: 4,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#2d3748',
    marginLeft: 12,
  },
  serviceTypeContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 12,
  },
  serviceTypeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  serviceTypeButtonSelected: {
    backgroundColor: '#337DEB',
  },
  serviceTypeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  serviceTypeTextSelected: {
    color: '#ffffff',
  },
  filterContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  checkboxSelected: {
    backgroundColor: '#337DEB',
    borderColor: '#337DEB',
  },
  checkboxText: {
    fontSize: 14,
    color: '#2d3748',
    fontWeight: '500',
  },
  allFiltersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  allFiltersText: {
    fontSize: 14,
    color: '#6b7280',
    marginLeft: 6,
    fontWeight: '500',
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
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
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
  locationSelectedPill: {
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
  locationPickerWrap: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    overflow: 'hidden',
  },
  offersSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingBottom: 100,
    gap: 12,
    justifyContent: 'space-between',
  },
  offerCard: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 0,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  offerCardImageContainer: {
    width: '100%',
    height: 120,
    backgroundColor: '#f3f4f6',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    overflow: 'hidden',
  },
  offerCardImage: {
    width: '100%',
    height: '100%',
  },
  offerCardContent: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  offerTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 8,
    lineHeight: 20,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  creatorAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    overflow: 'hidden',
  },
  creatorAvatarImage: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  creatorHandle: {
    fontSize: 13,
    color: '#374151',
    flex: 1,
  },
  locationAudienceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  locationAudienceText: {
    fontSize: 12,
    color: '#9ca3af',
    marginLeft: 4,
  },
  platformPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  platformChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  platformLabel: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  priceText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  freeProductText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#10b981',
  },
  draftBadgeContainer: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    zIndex: 10,
  },
  draftBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  draftBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  customBadgeContainer: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  customBadge: {
    backgroundColor: '#805ad5', // Purple for custom
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  customBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  publishOfferButton: {
    backgroundColor: '#337DEB',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
  },
  errorContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#337DEB',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 18,
    color: '#1f2937',
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
});

export default ExploreOffers;
