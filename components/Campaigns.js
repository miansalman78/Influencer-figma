import React, { useState, useEffect } from 'react';
import { getCache, setCache, DEFAULT_TTL } from '../utils/cache';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCurrencySymbol, formatPrice } from '../utils/currency';
import { PlatformIcon } from '../utils/platformIcons';
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

// Align with CreateCampaign: same category/niche and platform options for consistent filtering
const NICHES_LIST = [
  'Fashion & Beauty', 'Tech & Gadgets', 'Fitness & Health', 'Travel & Lifestyle', 'Food & Drink',
  'Entertainment & Media', 'Sports', 'Education', 'Business', 'Parenting',
  'Automotive', 'Gaming', 'Music', 'Art & Design'
];
const PLATFORMS_LIST = ['Instagram', 'Tiktok', 'Youtube', 'Facebook', 'Twitter'];
const STATUS_OPTIONS = ['All', 'Open', 'Draft', 'Completed', 'Cancelled'];
// Category filter options (All + niches) – alias for filter chips
const CATEGORY_FILTER_OPTIONS = ['All', ...NICHES_LIST];

const nicheLabelToBackend = (label) => {
  const map = {
    'Fashion & Beauty': 'fashion_beauty', 'Tech & Gadgets': 'tech_gadgets', 'Fitness & Health': 'fitness_health',
    'Travel & Lifestyle': 'travel_lifestyle', 'Food & Drink': 'food_drink', 'Entertainment & Media': 'entertainment_media',
    'Sports': 'sports', 'Education': 'education', 'Business': 'business', 'Parenting': 'parenting',
    'Automotive': 'automotive', 'Gaming': 'gaming', 'Music': 'music', 'Art & Design': 'art_design',
  };
  return map[label] || (label && String(label).toLowerCase().replace(/ & /g, '_').replace(/ /g, '_'));
};

const nicheBackendToLabel = (key) => {
  const map = {
    fashion_beauty: 'Fashion & Beauty', tech_gadgets: 'Tech & Gadgets', fitness_health: 'Fitness & Health',
    travel_lifestyle: 'Travel & Lifestyle', food_drink: 'Food & Drink', entertainment_media: 'Entertainment & Media',
    sports: 'Sports', education: 'Education', business: 'Business', parenting: 'Parenting',
    automotive: 'Automotive', gaming: 'Gaming', music: 'Music', art_design: 'Art & Design',
  };
  return map[key] || key;
};

const Campaigns = ({ navigation, route, insideAppNavigator = false, canGoBack = false }) => {
  const ui = (useUIStore && typeof useUIStore === 'function') ? useUIStore() : null;
  const [selectedCategory, setSelectedCategory] = useState('All'); // draft
  const [selectedPlatform, setSelectedPlatform] = useState('All'); // draft
  const [selectedStatus, setSelectedStatus] = useState('All'); // draft
  // Applied filters
  const [appliedCategory, setAppliedCategory] = useState('All');
  const [appliedPlatform, setAppliedPlatform] = useState('All');
  const [appliedStatus, setAppliedStatus] = useState('All');
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState('Campaigns');

  const userRole = route?.params?.role || navigation?.getParam?.('role') || 'Brand';
  const isBrand = userRole?.toLowerCase() === 'brand';
  const isInsideAppNav = route?.params?.insideAppNavigator || insideAppNavigator;
  const showBackButton = canGoBack || !isInsideAppNav;

  const categories = CATEGORY_FILTER_OPTIONS;

  const handleFiltersPress = () => setShowFilters((prev) => !prev);
  const clearAllFilters = () => {
    // Clear drafts only; user must press Apply
    setSelectedCategory('All');
    setSelectedPlatform('All');
    setSelectedStatus('All');
  };

  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summaryStats, setSummaryStats] = useState({ activeCampaigns: 0, totalEarnings: 0 });

  // Fetch campaigns based on role
  // Fetch campaigns based on role
  const fetchCampaigns = async (ignoreCache = false) => {
    try {
      const cacheKey = 'campaigns_list_' + (isBrand ? 'brand' : 'creator');
      const cached = ignoreCache ? null : await getCache(cacheKey);
      const hadCache = cached?.campaigns?.length > 0;
      if (hadCache) {
        setCampaigns(cached.campaigns);
        if (cached.summaryStats) setSummaryStats(cached.summaryStats);
        setLoading(false);
      } else {
        setLoading(true);
      }
      let response;
      // Dynamically import to avoid top-level require issues if any
      const campaignService = await import('../services/campaigns');

      if (isBrand) {
        // Brand: Get My Campaigns
        response = await campaignService.getMyCampaigns();
      } else {
        // Creator: Browse Campaigns
        response = await campaignService.browseCampaigns();
      }

      if (response && response.data) {
        const data = Array.isArray(response.data) ? response.data : (response.data.campaigns || []);

        // Calculate summary stats from real data
        const activeCampaignsCount = data.filter(c =>
          c.status === 'open' || c.status === 'active' || c.status === 'Open' || c.status === 'Active'
        ).length;

        const totals = data.reduce((acc, c) => {
          let value = 0;
          if (c.budget) {
            if (typeof c.budget === 'number') {
              value = c.budget;
            } else if (typeof c.budget === 'string') {
              // Remove non-numeric chars except dot
              const cleanVal = c.budget.replace(/[^0-9.]/g, '');
              value = parseFloat(cleanVal) || 0;
            }
          } else if (c.budgetRange) {
            // Use average of min and max for range
            const min = parseFloat(c.budgetRange.min) || 0;
            const max = parseFloat(c.budgetRange.max) || 0;
            value = max > 0 ? (min + max) / 2 : min;
          }

          const currency = (c.currency || c.budgetRange?.currency || '').toUpperCase();
          if (currency === 'USD') {
            acc.usd += value;
          } else {
            acc.ngn += value;
          }
          return acc;
        }, { usd: 0, ngn: 0 });

        setSummaryStats({
          activeCampaigns: activeCampaignsCount,
          totals: totals
        });

        // Fetch proposal counts and brand names in parallel
        const campaignsWithData = await Promise.all(data.map(async (c) => {
          // Extract brand name - API returns brandId as string in list, populated in details
          let brandName = 'Brand';
          if (isBrand) {
            // For brands viewing their own campaigns, show "Me"
            brandName = 'Me';
          } else {
            // For creators, fetch brand name from campaign details
            if (c.brandId) {
              if (typeof c.brandId === 'object' && c.brandId !== null) {
                // brandId is populated (shouldn't happen in list but handle it)
                brandName = c.brandId.name || c.brandId.username || c.brandId.email?.split('@')[0] || 'Brand';
              } else {
                // brandId is string ID - fetch campaign details to get brand name
                try {
                  const campaignDetailsResponse = await campaignService.getCampaignDetails(c._id || c.id);
                  if (campaignDetailsResponse?.data?.brandId && typeof campaignDetailsResponse.data.brandId === 'object') {
                    brandName = campaignDetailsResponse.data.brandId.name || campaignDetailsResponse.data.brandId.username || campaignDetailsResponse.data.brandId.email?.split('@')[0] || 'Brand';
                  } else {
                    brandName = c.brandName || 'Brand';
                  }
                } catch (err) {
                  console.error('[Campaigns] Error fetching brand name for campaign:', c._id || c.id, err);
                  brandName = c.brandName || 'Brand';
                }
              }
            } else if (c.brandName) {
              brandName = c.brandName;
            }
          }

          // Fetch proposal count from proposals API
          let proposalCount = 0;
          try {
            const proposalsService = await import('../services/proposals');
            const proposalsResponse = await proposalsService.getCampaignProposals(c._id || c.id, { page: 1, limit: 1 });
            if (proposalsResponse?.data) {
              if (proposalsResponse.data.pagination) {
                proposalCount = proposalsResponse.data.pagination.totalItems || proposalsResponse.data.pagination.totalResults || proposalsResponse.data.pagination.total || 0;
              } else if (Array.isArray(proposalsResponse.data.proposals)) {
                proposalCount = proposalsResponse.data.proposals.length;
              } else if (Array.isArray(proposalsResponse.data)) {
                proposalCount = proposalsResponse.data.length;
              }
            }
          } catch (err) {
            console.error('[Campaigns] Error fetching proposal count for campaign:', c._id || c.id, err);
            // Fallback to applicantCount from campaign
            proposalCount = c.applicantCount || 0;
          }

          console.log('[Campaigns] Campaign ID:', c._id || c.id, 'Proposal count from API:', proposalCount);

          // Calculate days left from dueDate or applicationDeadline
          let daysLeft = '-';
          if (c.daysLeft !== undefined) {
            daysLeft = c.daysLeft.toString();
          } else {
            const deadline = c.dueDate || c.applicationDeadline;
            if (deadline) {
              const days = Math.max(0, Math.ceil((new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24)));
              daysLeft = days.toString();
            }
          }

          const requirementsNiche = c.requirements?.niche || [];
          const platformArray = (c.platform || []).map(p => (typeof p === 'string' ? p.toLowerCase() : String(p || '').toLowerCase()));
          const firstNicheLabel = requirementsNiche[0] ? nicheBackendToLabel(requirementsNiche[0]) : null;

          return {
            id: c.id || c._id,
            brandName: brandName,
            brandCategory: firstNicheLabel || c.brandCategory || 'General',
            brandIcon: c.brandIcon || '🏢',
            brandColor: c.brandColor || '#337DEB',
            status: c.status || 'Open',
            statusDisplay: (() => {
              if (isBrand && c.isPublic === false) return 'Hidden';
              return c.status || 'Open';
            })(),
            statusColor: (() => {
              if (isBrand && c.isPublic === false) return '#8b5cf6';
              const s = (c.status || '').toLowerCase();
              if (s === 'open' || s === 'active' || s === 'accepting_bids') return '#10b981';
              if (s === 'draft') return '#6b7280';
              return '#f59e0b';
            })(),
            title: c.name || c.title,
            description: c.description,
            requirementsNiche,
            platformArray,
            location: (() => {
              if (c.location && !Array.isArray(c.location) && (c.location.city || c.location.country)) {
                return [c.location.city, c.location.country].filter(Boolean).join(', ');
              }
              return c.requirements?.location?.[0] || 'Remote';
            })(),
            // Removed followers - not needed for campaigns list
            platform: c.platform?.[0] ? (c.platform[0].charAt(0).toUpperCase() + c.platform[0].slice(1)) : 'Any',
            platformIcon: c.platform?.[0]?.includes('youtube') ? 'play-circle-outline' : c.platform?.[0]?.includes('tiktok') ? 'music-note' : 'camera-alt',
            budget: (() => {
              const currency = (c.currency || c.budgetRange?.currency || '').toUpperCase();
              const symbol = currency === 'USD' ? '$' : '₦';
              if (c.budget) return `${symbol}${c.budget}`;
              if (c.budgetRange) {
                if (c.budgetRange.min && c.budgetRange.max) {
                  return `${symbol}${c.budgetRange.min} - ${symbol}${c.budgetRange.max}`;
                } else if (c.budgetRange.min) {
                  return `${symbol}${c.budgetRange.min}+`;
                }
              }
              return 'Negotiable';
            })(),
            daysLeft: daysLeft,
            applied: `${proposalCount} applied`, // Use count from proposals API
            appliedIcon: 'group',
            // Include applicationDeadline for deadline check
            applicationDeadline: c.applicationDeadline,
            application_deadline: c.application_deadline,
            // Include media for image display
            media: c.media,
          };
        }));
        setCampaigns(campaignsWithData);
        try {
          await setCache('campaigns_list_' + (isBrand ? 'brand' : 'creator'), {
            campaigns: campaignsWithData,
            summaryStats: { activeCampaigns: activeCampaignsCount, totals },
          }, DEFAULT_TTL.SHORT);
        } catch (e) { /* ignore */ }
      }
    } catch (error) {
      console.error("Failed to fetch campaigns", error);
      // Fallback to empty
      setSummaryStats({ activeCampaigns: 0, totalEarnings: 0, currency: 'NGN' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const shouldRefresh = route?.params?.refresh;
    if (shouldRefresh) {
      fetchCampaigns(true);
      // Clear the refresh param so it doesn't keep refreshing on every mount
      if (navigation?.setParams) {
        navigation.setParams({ refresh: false });
      }
    } else {
      fetchCampaigns();
    }
  }, [isBrand, route?.params?.refresh]);

  // Add focus listener to ensure data is fresh when returning to the screen
  useEffect(() => {
    const unsubscribe = navigation?.addListener?.('focus', () => {
      // Re-fetch data whenever the screen gains focus
      // This ensures that after editing a campaign and coming back, we see updates
      fetchCampaigns(true);
    });
    return unsubscribe;
  }, [navigation, isBrand]);

  const handlePublishCampaign = async (campaignId) => {
    try {
      setLoading(true);
      const campaignService = await import('../services/campaigns');
      const response = await campaignService.publishCampaign(campaignId);
      if (response && response.success) {
        ui?.showToast?.('Campaign published successfully!', 'success');
        // Refresh campaigns bypassing cache
        fetchCampaigns(true);
      } else {
        ui?.showToast?.(response?.message || 'Failed to publish campaign', 'error');
      }
    } catch (error) {
      console.error('Publish campaign error:', error);
      ui?.showToast?.('An error occurred while publishing campaign', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    // If inside AppNavigator (from Dashboard): go back to Dashboard
    // If from DashboardNew: open drawer (menu)
    if (isInsideAppNav) {
      navigation?.goBack();
    } else {
      navigation?.openDrawer?.();
    }
  };

  const handleCategorySelect = (category) => setSelectedCategory(category);
  const handlePlatformSelect = (platform) => setSelectedPlatform(platform);
  const handleStatusSelect = (status) => setSelectedStatus(status);

  const handleBidNow = (campaign) => {
    // Check if application deadline has passed
    const applicationDeadline = campaign.applicationDeadline || campaign.application_deadline;
    const isDeadlinePassed = applicationDeadline ? new Date(applicationDeadline) < new Date() : false;

    if (isDeadlinePassed) {
      ui?.showToast?.('Application deadline has passed. Proposals are closed.', 'warning');
      return;
    }

    navigation?.navigate('CampaignDetails', { campaign });
  };



  const filteredCampaigns = campaigns.filter((campaign) => {
    if (appliedCategory !== 'All') {
      const backendNiche = nicheLabelToBackend(appliedCategory);
      const hasNiche = (campaign.requirementsNiche || []).some(n => String(n).toLowerCase() === String(backendNiche).toLowerCase());
      if (!hasNiche) return false;
    }
    if (appliedPlatform !== 'All') {
      const platformLower = appliedPlatform.toLowerCase();
      const hasPlatform = (campaign.platformArray || []).some(p => String(p).toLowerCase() === platformLower);
      if (!hasPlatform) return false;
    }
    if (isBrand && appliedStatus !== 'All') {
      const statusLower = (campaign.status || '').toLowerCase();
      const match = appliedStatus.toLowerCase() === statusLower
        || (appliedStatus === 'Open' && (statusLower === 'open' || statusLower === 'accepting_bids'))
        || (appliedStatus === 'Completed' && (statusLower === 'completed' || statusLower === 'closed'));
      if (!match) return false;
    }
    return true;
  });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => showBackButton ? navigation?.goBack() : navigation?.openDrawer?.()}
          >
            <MaterialIcons
              name={showBackButton ? "arrow-back" : "menu"}
              size={24}
              color="#374151"
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Campaigns</Text>
          {(isBrand || !isInsideAppNav) ? (
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => navigation?.navigate('CreateCampaign')}
            >
              <MaterialIcons name="add" size={24} color="#337DEB" />
            </TouchableOpacity>
          ) : (
            <View style={styles.createButton} />
          )}
        </View>

        {/* Summary Statistics - dark bar, two halves */}
        <View style={styles.summarySection}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Active Campaigns</Text>
                <Text style={styles.summaryValue}>{summaryStats.activeCampaigns}</Text>
              </View>
              <View style={[styles.summaryItem, styles.summaryItemEarnings]}>
                <Text style={styles.summaryLabel}>Total Earnings</Text>
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

        {/* Filter: same hideable pattern as Creator (ExploreOffers) screen */}
        <View style={styles.filterContainer}>
          <TouchableOpacity style={styles.allFiltersButton} onPress={handleFiltersPress}>
            <MaterialIcons name="tune" size={16} color="#6b7280" />
            <Text style={styles.allFiltersText}>All Filters</Text>
          </TouchableOpacity>
        </View>

        {showFilters && (
          <View style={styles.filterDropdown}>
            <View style={styles.filterHeader}>
              <Text style={styles.filterTitle}>Filters</Text>
              <TouchableOpacity onPress={clearAllFilters}>
                <Text style={styles.clearAllText}>Clear All</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Category</Text>
              <View style={styles.filterOptions}>
                {CATEGORY_FILTER_OPTIONS.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.filterOption, selectedCategory === cat && styles.filterOptionSelected]}
                    onPress={() => handleCategorySelect(cat)}
                  >
                    <Text style={[styles.filterOptionText, selectedCategory === cat && styles.filterOptionTextSelected]} numberOfLines={1}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Platform</Text>
              <View style={styles.filterOptions}>
                {['All', ...PLATFORMS_LIST].map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.filterOption, selectedPlatform === p && styles.filterOptionSelected]}
                    onPress={() => handlePlatformSelect(p)}
                  >
                    <Text style={[styles.filterOptionText, selectedPlatform === p && styles.filterOptionTextSelected]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {isBrand && (
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Status</Text>
                <View style={styles.filterOptions}>
                  {STATUS_OPTIONS.map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.filterOption, selectedStatus === s && styles.filterOptionSelected]}
                      onPress={() => handleStatusSelect(s)}
                    >
                      <Text style={[styles.filterOptionText, selectedStatus === s && styles.filterOptionTextSelected]}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <TouchableOpacity
              style={styles.applyFiltersButton}
              onPress={() => {
                setAppliedCategory(selectedCategory);
                setAppliedPlatform(selectedPlatform);
                setAppliedStatus(selectedStatus);
                setShowFilters(false);
              }}>
              <Text style={styles.applyFiltersText}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Campaigns List */}
        <View style={styles.campaignsSection}>
          {filteredCampaigns.map((campaign) => {
            const status = campaign.status?.toLowerCase();
            const isDraft = status === 'draft';
            const applicationDeadline = campaign.applicationDeadline || campaign.application_deadline;
            const isDeadlinePassed = applicationDeadline ? new Date(applicationDeadline) < new Date() : false;
            return (
              <TouchableOpacity
                key={campaign.id}
                style={styles.campaignCard}
                onPress={() => navigation?.navigate('CampaignDetails', { campaign })}
                activeOpacity={0.7}
              >
                {/* Brand + Status row */}
                <View style={styles.campaignHeader}>
                  <View style={styles.brandInfo}>
                    <View style={[styles.brandIconBox, { backgroundColor: campaign.brandColor || '#337DEB' }]}>
                      <MaterialIcons name="settings" size={18} color="#ffffff" />
                    </View>
                    <View style={styles.brandDetails}>
                      <Text style={styles.brandName}>{campaign.brandName}</Text>
                      <Text style={styles.brandCategory}>{campaign.brandCategory}</Text>
                    </View>
                  </View>
                  <View style={[styles.statusTag, { backgroundColor: campaign.statusColor }]}>
                    <Text style={styles.statusText}>{campaign.statusDisplay || campaign.status}</Text>
                  </View>
                </View>

                <Text style={styles.campaignTitle}>{campaign.title}</Text>
                <Text style={styles.campaignDescription} numberOfLines={3}>{campaign.description || 'No description.'}</Text>

                {/* Location, platform (followers from API when available) */}
                <View style={styles.campaignDetails}>
                  <View style={styles.detailItem}>
                    <MaterialIcons name="location-on" size={14} color="#9ca3af" />
                    <Text style={styles.detailText}>{campaign.location}</Text>
                  </View>
                  {(() => {
                    const req = campaign.requirements || campaign._original?.requirements;
                    const minF = req?.followers?.min ?? req?.followerRange?.min;
                    const maxF = req?.followers?.max ?? req?.followerRange?.max;
                    const hasFollowers = (minF != null && minF > 0) || (maxF != null && maxF > 0);
                    if (!hasFollowers) return null;
                    const formatF = (n) => n >= 1000000 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);
                    const text = maxF != null && minF != null ? `${formatF(minF)}+ - ${formatF(maxF)}` : minF != null ? `${formatF(minF)}+` : `${formatF(maxF)}`;
                    return (
                      <View style={styles.detailItem}>
                        <MaterialIcons name="people" size={14} color="#9ca3af" />
                        <Text style={styles.detailText}>{text} Followers</Text>
                      </View>
                    );
                  })()}
                  <View style={styles.detailItem}>
                    <PlatformIcon platform={campaign.platform} size={14} color="#9ca3af" />
                    <Text style={styles.detailText}>{campaign.platform}</Text>
                  </View>
                </View>

                {/* Budget, Days left, Applicants */}
                <View style={styles.campaignMetrics}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{campaign.budget}</Text>
                    <Text style={styles.metricLabel}>Budget</Text>
                  </View>
                  <View style={[styles.metricItem, styles.metricItemCenter]}>
                    <Text style={styles.metricValue}>{typeof campaign.daysLeft === 'string' && campaign.daysLeft.includes('days') ? campaign.daysLeft.replace(' days', '') : campaign.daysLeft}</Text>
                    <Text style={styles.metricLabel}>Days left</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <View style={styles.appliedRow}>
                      <MaterialIcons name="people" size={14} color="#1f2937" />
                      <Text style={styles.metricValue}>{campaign.applied.split(' ')[0]}</Text>
                    </View>
                    <Text style={styles.metricLabel}>Applied</Text>
                  </View>
                </View>

                {/* Actions: Publish (draft) or Bid Now / View Details */}
                <View style={styles.campaignActions}>
                  {isBrand && isDraft ? (
                    <TouchableOpacity
                      style={[styles.bidButton, { backgroundColor: '#337DEB' }]}
                      onPress={(e) => {
                        e.stopPropagation();
                        handlePublishCampaign(campaign.id);
                      }}
                    >
                      <MaterialIcons name="publish" size={18} color="#ffffff" />
                      <Text style={styles.bidButtonText}>Publish</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.bidButton, (isDeadlinePassed && !isBrand) && styles.bidButtonDisabled]}
                      onPress={(e) => {
                        e.stopPropagation();
                        if (isBrand) navigation?.navigate('CampaignDetails', { campaign });
                        else handleBidNow(campaign);
                      }}
                      disabled={isDeadlinePassed && !isBrand}
                    >
                      <MaterialIcons name={isBrand ? 'visibility' : 'send'} size={18} color="#ffffff" />
                      <Text style={styles.bidButtonText}>
                        {isBrand ? 'View Details' : (isDeadlinePassed ? 'Closed' : 'Bid Now')}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollView: {
    flex: 1,
    paddingBottom: 80, // Add padding to prevent content from being hidden behind tabs
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
  placeholder: {
    width: 40,
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
  filterContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
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
    marginBottom: 16,
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
});

export default Campaigns;
