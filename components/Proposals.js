import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ConfirmModal from './common/ConfirmModal';
import { useUIStore } from '../store/useStore';
import { useAuth } from '../hooks/useAuth';
import { getCurrencySymbol, formatPrice } from '../utils/currency';

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

const Proposals = ({ navigation, route, userRole: routeUserRole, canGoBack = false }) => {
  const { user } = useAuth();
  const userRole = user?.role || routeUserRole || route?.params?.role;
  const isBrandRole = userRole?.toLowerCase() === 'brand';
  const isInsideAppNav = route?.params?.insideAppNavigator || route?.params?.initialTab === 'Proposals';

  // Logic for Back vs Menu button
  const showBackButton = canGoBack || !isInsideAppNav;

  const { campaignId: routeCampaignId, campaign: initialCampaign } = route.params || {};
  const [proposals, setProposals] = useState([]);
  const [campaign, setCampaign] = useState(initialCampaign || null);
  const [loading, setLoading] = useState(true);
  const [campaignLoading, setCampaignLoading] = useState(!initialCampaign);
  const [refreshing, setRefreshing] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [selectedSort, setSelectedSort] = useState('Best Match');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [activeTab, setActiveTab] = useState('Proposals');

  React.useEffect(() => {
    if (!isBrandRole) {
      Alert.alert('Access Denied', 'This page is only available for brands.', [
        { text: 'OK', onPress: () => navigation?.goBack() }
      ]);
    }
  }, [isBrandRole]);
  const [selectedFilters, setSelectedFilters] = useState({
    platform: 'All',
    priceRange: 'All',
    followers: 'All',
    rating: 'All'
  });

  const sortOptions = [
    'Best Match',
    'Price: Low to High',
    'Price: High to Low',
    'Followers: High to Low',
    'Rating: High to Low',
    'Newest First'
  ];

  const handleSortPress = () => {
    setShowSortDropdown(!showSortDropdown);
  };

  const selectSortOption = (option) => {
    setSelectedSort(option);
    setShowSortDropdown(false);
  };

  const filterOptions = {
    platform: ['All', 'Instagram', 'TikTok', 'YouTube', 'Twitter'],
    priceRange: ['All', 'Under $100', '$100 - $300', '$300 - $500', 'Over $500'],
    followers: ['All', 'Under 10k', '10k - 100k', '100k - 1M', 'Over 1M'],
    rating: ['All', '4.5+ Stars', '4.0+ Stars', '3.5+ Stars', 'New Creators']
  };

  const handleFilterPress = () => {
    setShowFilterDropdown(!showFilterDropdown);
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
      priceRange: 'All',
      followers: 'All',
      rating: 'All'
    });
  };


  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'open':
      case 'active':
        return '#dcfce7'; // Light green
      case 'draft':
        return '#f1f5f9'; // Light grey/slate
      default:
        return '#fef3c7'; // Light orange/yellow
    }
  };

  const getStatusTextColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'open':
      case 'active':
        return '#10b981'; // Green
      case 'draft':
        return '#64748b'; // Slate/Grey
      default:
        return '#d97706'; // Orange
    }
  };

  // Derived campaign display status: show "Hired" if any proposal is accepted
  const hasHired = Array.isArray(proposals) && proposals.some(p => (p.status || '').toLowerCase() === 'accepted');
  const derivedCampaignStatusText = hasHired
    ? 'Hired'
    : (campaign?.status
      ? (campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1))
      : 'Open');
  const derivedCampaignStatusBg = hasHired ? '#dcfce7' : getStatusColor(campaign?.status);
  const derivedCampaignStatusFg = hasHired ? '#15803d' : getStatusTextColor(campaign?.status);
  // Fetch campaign details if not passed via route params
  const fetchCampaignDetails = async () => {
    if (!campaignId) {
      setCampaignLoading(false);
      return;
    }
    try {
      const response = await import('../services/campaigns').then(m => m.getCampaignDetails(campaignId));
      if (response && response.data) {
        setCampaign(response.data);
      }
    } catch (error) {
      console.error('Error fetching campaign details:', error);
    } finally {
      setCampaignLoading(false);
    }
  };

  const fetchProposals = async () => {
    const effectiveCampaignId = routeCampaignId || initialCampaign?._id || initialCampaign?.id || campaign?._id || campaign?.id;
    if (!effectiveCampaignId) {
      setLoading(false);
      setProposals([]); // Ensure proposals is always an array
      return;
    }
    try {
      setLoading(prev => (proposals && proposals.length > 0 ? prev : true));
      const response = await import('../services/proposals').then(m => m.getCampaignProposals(effectiveCampaignId));
      if (response && response.data) {
        // Handle different response structures - similar to campaigns pattern
        // API might return: { data: [...] } or { data: { proposals: [...] } }
        const proposalsData = Array.isArray(response.data)
          ? response.data
          : (response.data.proposals || response.data.items || []);
        setProposals(proposalsData);
      } else {
        setProposals([]); // Ensure proposals is always an array
      }
    } catch (error) {
      console.error('Error fetching proposals:', error);
      setProposals([]); // On error, set to empty array
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  React.useEffect(() => {
    if (!initialCampaign && (routeCampaignId || campaign?._id || campaign?.id)) {
      fetchCampaignDetails();
    }
    if (routeCampaignId || campaign?._id || campaign?.id) {
      fetchProposals();
    }
  }, [routeCampaignId, campaign?._id, campaign?.id]);

  // Refresh proposals when screen gains focus (following campaign pattern)
  React.useEffect(() => {
    const unsubscribe = navigation?.addListener?.('focus', () => {
      setLoading(prev => (proposals && proposals.length > 0 ? false : prev));
      fetchProposals();
      fetchCampaignDetails();
    });
    return unsubscribe;
  }, [navigation, routeCampaignId, campaign?._id, campaign?.id, proposals?.length]);

  const handleHire = (proposal) => {
    // ALWAYS navigate to checkout screen for proposal acceptance
    // Backend requires paymentMethodId for all proposals (even in-kind)
    const proposalId = proposal?._id || proposal?.id;

    if (!proposalId) {
      Alert.alert('Error', 'Proposal ID not available');
      return;
    }

    // Currency: prefer proposal currency, then campaign currency, default NGN
    const currency = proposal?.currency || campaign?.currency || 'NGN';

    // Navigate to checkout screen - proposals use single currency from campaign
    navigation?.navigate('Checkout', {
      proposalId,
      proposal: proposal,
      campaign,
      currency,
    });
  };

  const ui = (useUIStore && typeof useUIStore === 'function') ? useUIStore() : null;
  const [rejectId, setRejectId] = React.useState(null);
  const handleReject = (proposalId) => setRejectId(proposalId);
  const confirmReject = async () => {
    const proposalId = rejectId;
    setRejectId(null);
    try {
      const proposalsService = await import('../services/proposals');
      await proposalsService.rejectProposal(proposalId);
      ui?.showToast?.('Proposal rejected successfully.', 'success');
      fetchProposals();
    } catch (error) {
      console.error('Error rejecting proposal:', error);
      ui?.showToast?.('Failed to reject proposal. Please try again.', 'error');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={[styles.scrollView, isBrandRole && { paddingBottom: 80 }]} showsVerticalScrollIndicator={false}>
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
          <Text style={styles.headerTitle}>Proposals</Text>
          <TouchableOpacity style={styles.filterButton} onPress={handleFilterPress}>
            <MaterialIcons name="tune" size={24} color="#374151" />
          </TouchableOpacity>
        </View>

        {/* Campaign Details Card */}
        <View style={styles.campaignCard}>
          <Text style={styles.campaignLabel}>CAMPAIGN</Text>
          <Text style={styles.campaignTitle}>
            {campaignLoading ? 'Loading...' : (campaign?.title || campaign?.name || 'Campaign')}
          </Text>
          <View style={styles.campaignDetails}>
            <MaterialIcons name="local-offer" size={16} color="#6b7280" />
            <View>
              <Text style={styles.budgetLabel}>Budget</Text>
              <Text style={styles.budgetText}>
                {campaign?.budgetRange
                  ? (() => {
                      const cur = campaign?.budgetRange?.currency || campaign?.currency || 'NGN';
                      const sym = getCurrencySymbol(cur);
                      return `${sym}${(campaign.budgetRange.min ?? 0).toLocaleString()} - ${sym}${(campaign.budgetRange.max ?? 0).toLocaleString()}`;
                    })()
                  : campaign?.budget != null
                    ? formatPrice(campaign.budget, (campaign?.currency || 'NGN'))
                    : 'Negotiable'}
              </Text>
            </View>
          </View>
          <View style={styles.statusContainer}>
            <View style={[
              styles.statusBadge,
              { backgroundColor: derivedCampaignStatusBg }
            ]}>
              <Text style={[styles.statusText, { color: derivedCampaignStatusFg }]}>
                {derivedCampaignStatusText}
              </Text>
            </View>
          </View>
        </View>

        {/* Bids Received Section */}
        <View style={styles.sectionTitleContainer}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.sectionTitle}>Bids Received</Text>
            <View style={styles.badgeCountContainer}>
              <Text style={styles.badgeCount}>
                {loading ? '-' : (Array.isArray(proposals) ? proposals.length : 0)}
              </Text>
            </View>
          </View>
          <TouchableOpacity style={styles.sortContainer} onPress={handleSortPress}>
            <Text style={styles.sortText}>Sort by: {selectedSort}</Text>
            <MaterialIcons
              name={showSortDropdown ? "keyboard-arrow-up" : "keyboard-arrow-down"}
              size={20}
              color="#6b7280"
            />
          </TouchableOpacity>
        </View>

        {/* Sort Dropdown */}
        {showSortDropdown && (
          <View style={styles.sortDropdown}>
            {sortOptions.map((option, index) => (
              <TouchableOpacity
                key={index}
                style={styles.sortOption}
                onPress={() => selectSortOption(option)}
              >
                <Text style={[
                  styles.sortOptionText,
                  selectedSort === option && styles.sortOptionTextSelected
                ]}>
                  {option}
                </Text>
                {selectedSort === option && (
                  <MaterialIcons name="check" size={16} color="#337DEB" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Filter Dropdown */}
        {showFilterDropdown && (
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

            {/* Rating Filter */}
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Rating</Text>
              <View style={styles.filterOptions}>
                {filterOptions.rating.map((option, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.filterOption,
                      selectedFilters.rating === option && styles.filterOptionSelected
                    ]}
                    onPress={() => selectFilterOption('rating', option)}
                  >
                    <Text style={[
                      styles.filterOptionText,
                      selectedFilters.rating === option && styles.filterOptionTextSelected
                    ]}>
                      {option}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Apply Filters Button */}
            <TouchableOpacity
              style={styles.applyFiltersButton}
              onPress={() => setShowFilterDropdown(false)}
            >
              <Text style={styles.applyFiltersText}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Proposals List */}
        <View style={styles.proposalsContainer}>
          {loading ? (
            <Text style={{ textAlign: 'center', marginTop: 20 }}>Loading proposals...</Text>
          ) : (!proposals || !Array.isArray(proposals) || proposals.length === 0) ? (
            <Text style={{ textAlign: 'center', marginTop: 20, color: '#6b7280' }}>No proposals received yet.</Text>
          ) : (
            proposals.map((proposal) => {
              // Handle creatorId - can be object (populated) or string ID (following campaign pattern)
              const creator = proposal.creatorId && typeof proposal.creatorId === 'object'
                ? proposal.creatorId
                : (proposal.creator || {});
              const creatorId = creator._id || creator.id || proposal.creatorId;
              const creatorMetrics = proposal.creatorMetrics || {};

              return (
                <TouchableOpacity
                  key={proposal._id || proposal.id}
                  style={styles.proposalCard}
                  onPress={() => navigation?.navigate('ProposalDetails', { proposal, campaign })}
                  activeOpacity={0.7}
                >
                  {/* Creator Profile Header */}
                  <View style={styles.profileSection}>
                    <View style={styles.creatorInfo}>
                      <View style={styles.avatar}>
                        {(() => {
                          // Fix avatar display - validate URL properly before rendering
                          const avatarUrl = (creator.profileImage && typeof creator.profileImage === 'string' && (creator.profileImage.startsWith('http://') || creator.profileImage.startsWith('https://')))
                            ? creator.profileImage
                            : (creator.avatar && typeof creator.avatar === 'string' && (creator.avatar.startsWith('http://') || creator.avatar.startsWith('https://')))
                              ? creator.avatar
                              : null;

                          return avatarUrl ? (
                            <Image
                              source={{ uri: avatarUrl }}
                              style={{ width: 48, height: 48, borderRadius: 24 }}
                              onError={(error) => {
                                console.error('[Proposals] Avatar image load error:', error.nativeEvent.error);
                              }}
                            />
                          ) : (
                            <View style={styles.avatarPlaceholder}>
                              <Text style={styles.avatarText}>{(creator.name?.[0] || 'U').toUpperCase()}</Text>
                            </View>
                          );
                        })()}
                      </View>
                      <View style={styles.creatorDetails}>
                        <Text style={styles.creatorName}>{creator.name || 'Unknown Creator'}</Text>
                        <Text style={styles.creatorUsername}>
                          {creator.email || (creator.username && creator.username !== '@username' ? creator.username : '')}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.compensationContainer}>
                      {proposal.compensation?.type === 'product' ? (
                        <View style={styles.freeProductBadge}>
                          <MaterialIcons name="card-giftcard" size={18} color="#10b981" />
                          <Text style={styles.freeProductText}>In-kind</Text>
                        </View>
                      ) : (
                        <View style={styles.compensationBadge}>
                          <Text style={styles.compensationAmount}>
                            {(() => {
                              const displayCurrency = proposal?.currency || campaign?.currency || 'NGN';
                              const currencySymbol = getCurrencySymbol(displayCurrency);
                              return `${currencySymbol}${proposal.compensation?.amount || 0}`;
                            })()}
                          </Text>
                          <Text style={styles.compensationType}>{proposal.compensation?.type === 'fixed_price' ? 'Fixed Price' : proposal.compensation?.type || 'Other'}</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Proposal Text */}
                  <View style={styles.proposalTextContainer}>
                    <Text style={styles.proposalText} numberOfLines={3}>
                      {proposal.message || 'No proposal message provided'}
                    </Text>
                  </View>

                  {/* Metrics */}
                  <View style={styles.metricsContainer}>
                    <View style={styles.metricItem}>
                      <View style={styles.metricIconContainer}>
                        <MaterialIcons name="people" size={18} color="#337DEB" />
                      </View>
                      <View style={styles.metricTextContainer}>
                        <Text style={styles.metricLabel}>Followers</Text>
                        <Text style={styles.metricText}>
                          {creatorMetrics.totalFollowers ?
                            (creatorMetrics.totalFollowers > 1000
                              ? `${(creatorMetrics.totalFollowers / 1000).toFixed(1)}K`
                              : creatorMetrics.totalFollowers)
                            : '0'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.metricItem}>
                      <View style={styles.metricIconContainer}>
                        <MaterialIcons name="star" size={18} color="#fbbf24" />
                      </View>
                      <View style={styles.metricTextContainer}>
                        <Text style={styles.metricLabel}>Rating</Text>
                        <Text style={styles.metricText}>
                          {creatorMetrics.rating || creator.averageRating || creator.rating
                            ? Math.min(5, Math.max(0, creatorMetrics.rating || creator.averageRating || creator.rating)).toFixed(1)
                            : '0'}
                        </Text>
                      </View>
                    </View>
                    {proposal.createdAt && (
                      <View style={styles.metricItem}>
                        <View style={styles.metricIconContainer}>
                          <MaterialIcons name="schedule" size={18} color="#6b7280" />
                        </View>
                        <View style={styles.metricTextContainer}>
                          <Text style={styles.metricLabel}>Submitted</Text>
                          <Text style={styles.metricText}>
                            {new Date(proposal.createdAt).toLocaleDateString()}
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>

                  {/* Action Buttons */}
                  <View style={styles.actionButtonsContainer}>
                    {proposal.status?.toLowerCase() === 'accepted' ? (
                      <View style={styles.hiredStatusContainer}>
                        <MaterialIcons name="check-circle" size={20} color="#15803d" />
                        <Text style={styles.hiredStatusText}>Creator Hired</Text>
                      </View>
                    ) : (
                      <View style={styles.buttonRow}>
                        <TouchableOpacity
                          style={styles.rejectButton}
                          onPress={() => handleReject(proposal._id || proposal.id)}
                        >
                          <MaterialIcons name="close" size={18} color="#dc2626" />
                          <Text style={styles.rejectButtonText}>Reject</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.hireButton}
                          onPress={() => handleHire(proposal)}
                        >
                          <MaterialIcons name="check-circle" size={18} color="#ffffff" />
                          <Text style={styles.hireButtonText}>Hire Creator</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    <TouchableOpacity
                      style={styles.chatButtonFull}
                      onPress={async () => {
                        try {
                          const { getOrCreateConversation } = await import('../services/chat');
                          // Determine brand vs creator participants (this screen is brand-only)
                          const brandId = (user && (user._id || user.id)) || null;
                          const brandName = user?.name || user?.companyName || 'Brand';
                          const brandAvatar = user?.profileImage || user?.logo || '';
                          const influencerId = creatorId;
                          const influencerName = creator?.name || creator?.username || 'Creator';
                          const influencerAvatar = creator?.profileImage || creator?.avatar || '';
                          if (!brandId || !influencerId) {
                            Alert.alert('Error', 'Missing user information to start chat.');
                            return;
                          }
                          const conv = await getOrCreateConversation(brandId, influencerId, {
                            brandName,
                            influencerName,
                            brandAvatar,
                            influencerAvatar,
                          });
                          navigation?.navigate('Chat', {
                            conversation: {
                              id: conv.id,
                              name: influencerName,
                              avatar: influencerAvatar || (influencerName ? influencerName.substring(0, 2).toUpperCase() : '??'),
                              subtitle: 'Creator',
                            }
                          });
                        } catch (e) {
                          Alert.alert('Error', 'Failed to open chat. Please try again.');
                        }
                      }}
                    >
                      <MaterialIcons name="chat-bubble" size={18} color="#0284c7" />
                      <Text style={styles.chatButtonText}>Chat</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Internal Bottom Tab Navigation removed (now handled by AppNavigator) */}
      <ConfirmModal
        visible={!!rejectId}
        title="Reject Proposal"
        message="Are you sure you want to reject this proposal? This action cannot be undone."
        confirmLabel="Reject"
        destructive
        onConfirm={confirmReject}
        onCancel={() => setRejectId(null)}
      />
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
  },
  filterButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  campaignCard: {
    backgroundColor: '#ffffff',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  campaignLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#337DEB',
    letterSpacing: 1,
    marginBottom: 8,
  },
  campaignTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 12,
  },
  campaignDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  budgetLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  budgetText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
  },
  budgetContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  budgetValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#337DEB',
    marginLeft: 8,
  },
  statusContainer: {
    marginTop: 8,
    alignItems: 'flex-start',
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    fontWeight: '700',
    fontSize: 13,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  badgeCountContainer: {
    backgroundColor: '#337DEB',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 10,
  },
  badgeCount: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sortText: {
    fontSize: 14,
    color: '#6b7280',
    marginRight: 4,
  },
  sortDropdown: {
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  sortOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  sortOptionText: {
    fontSize: 14,
    color: '#2d3748',
  },
  sortOptionTextSelected: {
    color: '#337DEB',
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
  proposalsContainer: {
    paddingTop: 16,
    paddingBottom: 20,
  },
  proposalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#e5e7eb', // Match Campaigns page card border
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  profileSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  proposalTextContainer: {
    marginBottom: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  proposalText: {
    fontSize: 14,
    color: '#4a5568',
    lineHeight: 20,
  },
  creatorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
    overflow: 'hidden',
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#337DEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  creatorDetails: {
    flex: 1,
  },
  creatorName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2d3748',
    marginBottom: 2,
  },
  creatorUsername: {
    fontSize: 14,
    color: '#4b5563',
    fontWeight: '500',
    marginTop: 2,
  },
  compensationContainer: {
    alignItems: 'flex-end',
    minWidth: 100,
  },
  compensationBadge: {
    alignItems: 'flex-end',
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  compensationAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 2,
  },
  compensationType: {
    fontSize: 11,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  freeProductBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#86efac',
    gap: 6,
  },
  freeProductText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10b981',
  },
  metricsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    gap: 8,
  },
  metricItem: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  metricIconContainer: {
    marginBottom: 6,
  },
  metricTextContainer: {
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 9,
    color: '#64748b',
    marginBottom: 2,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricText: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '800',
  },
  actionButtonsContainer: {
    flexDirection: 'column',
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  chatButtonFull: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f9ff',
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#bae6fd',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  chatButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0284c7',
    letterSpacing: 0.3,
  },
  rejectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#fca5a5',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  rejectButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#dc2626',
    letterSpacing: 0.3,
  },
  hireButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#337DEB',
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 6,
    shadowColor: '#337DEB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  hireButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingBottom: 20, // Extra padding for safe area
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 10, // Increased elevation to ensure tabs are above other content
    zIndex: 1000, // Ensure tabs are always on top
  },
  navItem: {
    alignItems: 'center',
    flex: 1,
  },
  navText: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 4,
  },
  navTextActive: {
    color: '#337DEB',
    fontWeight: '600',
  },
  hiredStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#22c55e',
    gap: 10,
    flex: 2,
    justifyContent: 'center',
  },
  hiredStatusText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#15803d',
  },
});

export default Proposals;
