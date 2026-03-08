import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../hooks/useAuth';
import { getCurrencySymbol, formatPrice } from '../utils/currency';
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

const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(' ').filter(p => p.length > 0);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

const CampaignDetails = ({ navigation, route }) => {
  const { user } = useAuth();
  const { campaign: initialCampaign, role: routeRole, campaignId: initialCampaignId } = route.params || {};
  const ui = (useUIStore && typeof useUIStore === 'function') ? useUIStore() : null;
  // Initialize state directly with null to prevent showing previous campaign data
  const [campaign, setCampaign] = useState(null);
  const [currentCampaignId, setCurrentCampaignId] = useState(initialCampaignId || initialCampaign?._id || initialCampaign?.id);
  const [loading, setLoading] = useState(!!(initialCampaignId || initialCampaign?._id || initialCampaign?.id));
  const [proposalCount, setProposalCount] = useState(0);
  const [proposals, setProposals] = useState([]);
  const [myProposal, setMyProposal] = useState(null);

  // Determine role from route params or user context
  const userRole = (user?.role || user?.userRole)?.toLowerCase();
  const role = routeRole || (userRole === 'brand' ? 'Brand' : 'Creator');
  const isBrand = role === 'Brand' || role === 'brand' || userRole === 'brand';

  useEffect(() => {
    const isMountedRef = { current: true };
    const newId = route?.params?.campaignId || route?.params?.campaign?._id || route?.params?.campaign?.id;

    if (newId !== currentCampaignId) {
      setCampaign(null);
      setCurrentCampaignId(newId);
      setLoading(true);
    } else if (route?.params?.campaign) {
      setCampaign(route.params.campaign);
    }

    const fetchDetails = async () => {
      const currentId = newId;

      if (currentId) {
        try {
          console.log('[CampaignDetails] Fetching details for campaign ID:', currentId);

          const response = await import('../services/campaigns').then(m => m.getCampaignDetails(currentId));
          if (isMountedRef.current && response && response.data) {
            setCampaign(response.data);
            setProposalCount(response.data.applicantCount || response.data.proposalsCount || 0);
          }

          // Creators check if they've already applied or been hired
          if (!isBrand && isMountedRef.current) {
            try {
              const proposalsService = await import('../services/proposals');
              const myProposalsResponse = await proposalsService.getMyProposals({ page: 1, limit: 100 });

              if (isMountedRef.current && myProposalsResponse && myProposalsResponse.data) {
                const myProposals = Array.isArray(myProposalsResponse.data)
                  ? myProposalsResponse.data
                  : (myProposalsResponse.data.proposals || []);

                const foundProposal = myProposals.find(p => {
                  const pCampaignId = p.campaignId?._id || p.campaignId?.id || p.campaignId;
                  return pCampaignId === currentId || pCampaignId?.toString() === currentId?.toString();
                });

                if (foundProposal) {
                  setMyProposal(foundProposal);
                }
              }
            } catch (myProposalError) {
              console.error('[CampaignDetails] Error checking creator proposal:', myProposalError);
            }
          } else if (isBrand && isMountedRef.current) {
            // Fetch proposals for brands
            try {
              const proposalsService = await import('../services/proposals');
              const proposalsResponse = await proposalsService.getCampaignProposals(currentId, { page: 1, limit: 100 });
              if (isMountedRef.current && proposalsResponse?.data) {
                const proposalsData = Array.isArray(proposalsResponse.data) ? proposalsResponse.data : (proposalsResponse.data.proposals || []);
                setProposals(proposalsData);
              }
            } catch (err) {
              console.error('[CampaignDetails] Error fetching proposals:', err);
            }
          }
        } catch (error) {
          console.error('[CampaignDetails] Error:', error);
        } finally {
          if (isMountedRef.current) setLoading(false);
        }
      } else {
        if (isMountedRef.current) setLoading(false);
      }
    };

    fetchDetails();

    return () => {
      isMountedRef.current = false;
    };
  }, [route?.params?.campaignId, route?.params?.campaign, isBrand, currentCampaignId]);

  // Add focus listener to ensure data is fresh when returning to the screen
  useEffect(() => {
    const unsubscribe = navigation?.addListener?.('focus', () => {
      // Re-fetch data whenever the screen gains focus
      const currentId = route?.params?.campaignId || route?.params?.campaign?._id || route?.params?.campaign?.id || currentCampaignId;
      if (currentId) {
        // We can't easily call fetchDetails as it's defined inside another useEffect
        // But we can trigger a refresh by updating a key or just copying the fetch logic
        // For simplicity, let's just use the currentId to trigger the main effect
        setCurrentCampaignId(null);
        setTimeout(() => setCurrentCampaignId(currentId), 0);
      }
    });
    return unsubscribe;
  }, [navigation, currentCampaignId, route?.params]);

  const handleGoBack = () => {
    if (navigation?.canGoBack()) {
      navigation.goBack();
    } else {
      navigation?.navigate('Campaigns');
    }
  };

  const handleChat = async () => {
    try {
      const bId = typeof campaign.brandId === 'object' ? (campaign.brandId._id || campaign.brandId.id) : campaign.brandId;
      const bName = typeof campaign.brandId === 'object' ? campaign.brandId.name : (campaign.brandName || 'Brand');
      const bAvatar = typeof campaign.brandId === 'object' ? (campaign.brandId.profileImage || campaign.brandId.avatar) : (campaign.brandLogo || '');

      const influencerId = user?.id || user?._id;

      if (!bId || !influencerId) {
        ui?.showToast?.('Missing brand or user information', 'error');
        return;
      }

      // Use getOrCreateConversation to ensure we have a valid conversation document
      const { getOrCreateConversation } = await import('../services/chat');

      const conversation = await getOrCreateConversation(bId, influencerId, {
        brandName: bName,
        influencerName: user?.name || 'Creator',
        brandAvatar: bAvatar,
        influencerAvatar: user?.profileImage || user?.avatar || ''
      });

      navigation?.navigate('Chat', {
        conversation: {
          id: conversation.id,
          name: bName,
          subtitle: 'Brand',
          avatar: bAvatar || (bName ? bName.substring(0, 2).toUpperCase() : 'BR')
        }
      });
    } catch (error) {
      console.error('Failed to start chat:', error);
      ui?.showToast?.('Failed to start chat. Please try again.', 'error');
    }
  };

  const handleApply = () => {
    const campaignId = campaign.id || campaign._id;
    navigation?.navigate('SubmitProposal', {
      campaignId: campaignId,
      campaign: campaign
    });
  };

  const handleViewProposals = () => {
    const campaignId = campaign.id || campaign._id;
    navigation?.navigate('Proposals', {
      campaignId: campaignId,
      campaign: campaign
    });
  };

  const handleToggleVisibility = async () => {
    try {
      const id = campaign.id || campaign._id;
      if (!id) return;
      const nextPublic = !campaign.isPublic;
      const nextStatus = nextPublic ? 'accepting_bids' : 'in_progress';
      const svc = await import('../services/campaigns');
      const resp = await svc.updateCampaign(id, { isPublic: nextPublic, status: nextStatus });
      const updated = resp?.data || { ...campaign, isPublic: nextPublic, status: nextStatus };
      setCampaign(updated);
      ui?.showToast?.(nextPublic ? 'Campaign is now public' : 'Campaign hidden from creators', 'success');
    } catch (e) {
      ui?.showToast?.(e.message || 'Failed to update campaign visibility', 'error');
    }
  };

  console.log('[CampaignDetails] Route params:', route.params);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#337DEB" />
        <Text style={{ marginTop: 10, color: '#666' }}>Loading campaign details...</Text>
      </SafeAreaView>
    );
  }

  if (!campaign) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#333' }}>Campaign not found</Text>
        <Text style={{ marginTop: 8, color: '#666' }}>Could not load campaign data</Text>
        <TouchableOpacity onPress={handleGoBack} style={{ marginTop: 20, padding: 12, backgroundColor: '#f0f0f0', borderRadius: 8 }}>
          <Text style={{ color: '#337DEB', fontWeight: '600' }}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
            <MaterialIcons name="arrow-back" size={24} color="#2d3748" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Campaign Details</Text>
          {isBrand && campaign?.brandId && user?.id && (
            (typeof campaign.brandId === 'object' ? campaign.brandId._id === user.id : campaign.brandId === user.id)
          ) ? (
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => {
                const campaignId = campaign.id || campaign._id;
                navigation?.navigate('CreateCampaign', {
                  campaign: campaign,
                  campaignId: campaignId,
                  isEdit: true
                });
              }}
            >
              <MaterialIcons name="edit" size={22} color="#337DEB" />
            </TouchableOpacity>
          ) : (
            <View style={styles.placeholder} />
          )}
        </View>

        {/* Hero Image */}
        <View style={styles.heroImageContainer}>
          <Image
            source={{ uri: campaign.media?.[0]?.url || 'https://via.placeholder.com/800x400' }}
            style={styles.heroImage}
            resizeMode="cover"
          />
        </View>

        {/* Campaign Title & Status */}
        <View style={styles.titleContainer}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Text style={styles.campaignTitle}>{campaign.title || campaign.name}</Text>
            {myProposal && (
              <View style={[
                styles.statusBadge,
                myProposal.status === 'accepted' ? styles.statusBadgeHired :
                  myProposal.status === 'rejected' ? styles.statusBadgeRejected :
                    styles.statusBadgePending
              ]}>
                <Text style={[
                  styles.statusBadgeText,
                  myProposal.status === 'accepted' ? styles.statusBadgeTextHired :
                    myProposal.status === 'rejected' ? styles.statusBadgeTextRejected :
                      styles.statusBadgeTextPending
                ]}>
                  {myProposal.status === 'accepted' ? 'HIRED' : myProposal.status.toUpperCase()}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Brand Info & Campaign Status */}
        <View style={styles.brandContainer}>
          <Image
            source={{
              uri: campaign.brandId?.profileImage || campaign.brandId?.avatar || campaign.brandLogo || 'https://via.placeholder.com/50'
            }}
            style={styles.brandImage}
          />
          <View style={styles.brandInfo}>
            <Text style={styles.brandName}>
              {(campaign.brandId && typeof campaign.brandId === 'object')
                ? (campaign.brandId.name || 'Brand')
                : (campaign.brandName || 'Brand')}
            </Text>
            <Text style={styles.brandTagline}>{campaign.brandCategory || 'Brand Partner'}</Text>
          </View>
          <View style={[
            styles.statusBadge,
            {
              backgroundColor: (() => {
                if (isBrand && campaign?.isPublic === false) return '#ede9fe';
                const s = (campaign.status || 'Open').toLowerCase();
                if (s === 'open' || s === 'accepting_bids') return '#dcfce7';
                if (s === 'hired' || s === 'active' || s === 'in_progress') return '#e0e7ff';
                if (s === 'completed') return '#f1f5f9';
                return '#fef3c7';
              })(),
              borderColor: (() => {
                if (isBrand && campaign?.isPublic === false) return '#7c3aed';
                const s = (campaign.status || 'Open').toLowerCase();
                if (s === 'open' || s === 'accepting_bids') return '#22c55e';
                if (s === 'hired' || s === 'active' || s === 'in_progress') return '#337DEB';
                if (s === 'completed') return '#64748b';
                return '#f59e0b';
              })()
            }
          ]}>
            <Text style={[
              styles.statusBadgeText,
              {
                color: (() => {
                  if (isBrand && campaign?.isPublic === false) return '#6d28d9';
                  const s = (campaign.status || 'Open').toLowerCase();
                  if (s === 'open' || s === 'accepting_bids') return '#15803d';
                  if (s === 'hired' || s === 'active' || s === 'in_progress') return '#337DEB';
                  if (s === 'completed') return '#334155';
                  return '#a16207';
                })()
              }
            ]}>
              {(isBrand && campaign?.isPublic === false) ? 'HIDDEN' : (campaign.status || 'Open').replace('_', ' ').toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Budget, Platform, and Location Cards */}
        <View style={styles.detailsContainer}>
          <View style={styles.detailCard}>
            <Text style={styles.detailLabel}>BUDGET</Text>
            <Text style={styles.detailValue}>
              {(() => {
                const displayCurrency = (campaign?.budgetRange?.currency || campaign?.currency || 'NGN');
                if (campaign?.budgetRange) {
                  const min = Number(campaign.budgetRange.min ?? 0);
                  const max = Number(campaign.budgetRange.max ?? 0);
                  const sym = getCurrencySymbol(displayCurrency);
                  return `${sym}${min.toLocaleString()} - ${sym}${max.toLocaleString()}`;
                }
                if (campaign?.budget != null) {
                  return formatPrice(campaign.budget, displayCurrency);
                }
                return 'Negotiable';
              })()}
            </Text>
          </View>
          <View style={styles.detailCard}>
            <Text style={styles.detailLabel}>LOCATION</Text>
            <View style={styles.platformRow}>
              <MaterialIcons name="location-on" size={16} color="#337DEB" />
              <Text style={styles.detailValue}>
                {(() => {
                  if (campaign.location && !Array.isArray(campaign.location) && (campaign.location.city || campaign.location.country || campaign.location.state)) {
                    return [campaign.location.city, campaign.location.state, campaign.location.country].filter(Boolean).join(', ');
                  }
                  return Array.isArray(campaign.requirements?.location)
                    ? campaign.requirements.location.join(', ')
                    : campaign.requirements?.location || 'Global';
                })()}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.detailsContainer}>
          <View style={[styles.detailCard, { flex: 1 }]}>
            <Text style={styles.detailLabel}>PLATFORM</Text>
            <View style={styles.platformRow}>
              <MaterialIcons name="public" size={16} color="#337DEB" />
              <Text style={styles.detailValue}>
                {Array.isArray(campaign.platform) ? campaign.platform.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(', ') : campaign.platform || 'TikTok'}
              </Text>
            </View>
          </View>
          <View style={[styles.detailCard, { flex: 1 }]}>
            <Text style={styles.detailLabel}>APPLIED</Text>
            <View style={styles.platformRow}>
              <MaterialIcons name="people" size={16} color="#337DEB" />
              <Text style={styles.detailValue}>{proposalCount} Creators</Text>
            </View>
          </View>
        </View>

        {/* Follower Range Card */}
        {campaign.requirements?.followerRange && (
          <View style={styles.detailsContainer}>
            <View style={[styles.detailCard, { flex: 1 }]}>
              <Text style={styles.detailLabel}>FOLLOWER RANGE</Text>
              <View style={styles.platformRow}>
                <MaterialIcons name="people" size={16} color="#337DEB" />
                <Text style={styles.detailValue}>
                  {campaign.requirements.followerRange.range
                    ? `${campaign.requirements.followerRange.range.charAt(0).toUpperCase() + campaign.requirements.followerRange.range.slice(1)} (${campaign.requirements.followerRange.min?.toLocaleString()} - ${campaign.requirements.followerRange.max?.toLocaleString()})`
                    : `${campaign.requirements.followerRange.min?.toLocaleString()} - ${campaign.requirements.followerRange.max?.toLocaleString()}`}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.descriptionText}>{campaign.description}</Text>
        </View>

        {/* Deliverables */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Deliverables</Text>
          <View style={styles.deliverablesList}>
            {campaign.deliverables && campaign.deliverables.map((item, index) => (
              <View key={index} style={styles.deliverableItem}>
                <MaterialIcons name="check-circle" size={20} color="#337DEB" />
                <Text style={styles.deliverableText}>{item}</Text>
              </View>
            ))}
            {!campaign.deliverables && <Text style={styles.descriptionText}>Contact for deliverables</Text>}
          </View>
        </View>

        {/* Creator Requirements */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Creator Requirements</Text>
          <View style={styles.requirementsContainer}>
            {campaign.requirements?.niche && campaign.requirements.niche.map((n, index) => (
              <View key={`niche-${n}-${index}`} style={styles.requirementTag}>
                <Text style={styles.requirementText}>{n.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</Text>
              </View>
            ))}
            {campaign.requirements?.gender && campaign.requirements.gender.map((g, index) => (
              <View key={`gender-${g}-${index}`} style={styles.requirementTag}>
                <Text style={styles.requirementText}>{g.charAt(0).toUpperCase() + g.slice(1)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Compensation */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Compensation</Text>
          <View style={styles.compensationContainer}>
            {(campaign.compensationType === 'paid' || campaign.compensationType === 'both' || campaign.budget > 0) && (
              <View style={styles.compensationCard}>
                <Text style={[styles.compensationText, { marginLeft: 0 }]}>
                  Paid Collaboration
                </Text>
              </View>
            )}
            {(campaign.compensationType === 'product' || campaign.compensationType === 'both') && (
              <View style={[styles.compensationCard, { backgroundColor: '#ede9fe' }]}>
                <MaterialIcons name="card-giftcard" size={20} color="#8b5cf6" />
                <Text style={styles.compensationText}>Free Products Included</Text>
              </View>
            )}
          </View>
        </View>



        {/* Spacer for buttons */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        {isBrand ? (
          <>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleToggleVisibility}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialIcons
                  name={campaign?.isPublic ? 'visibility-off' : 'public'}
                  size={18}
                  color="#337DEB"
                />
                <Text style={styles.secondaryButtonText}>
                  {campaign?.isPublic ? 'Hide from Creators' : 'Make Public'}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={handleViewProposals}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialIcons name="list-alt" size={18} color="#ffffff" />
                <Text style={styles.primaryButtonText}>View Proposals ({proposalCount})</Text>
              </View>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleChat}>
              <Text style={styles.secondaryButtonText}>Message Brand</Text>
            </TouchableOpacity>
            {myProposal ? (
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: '#e2e8f0' }]}
                onPress={() => {
                  navigation?.navigate('ProposalDetails', {
                    proposal: myProposal,
                    campaign: campaign,
                    isMyProposal: true
                  });
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialIcons name={myProposal.status === 'accepted' ? 'verified' : 'check-circle-outline'} size={18} color="#64748b" />
                  <Text style={[styles.primaryButtonText, { color: '#64748b' }]}>
                    {myProposal.status === 'accepted' ? 'Hired' : 'Already Applied'}
                  </Text>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.primaryButton} onPress={handleApply}>
                <Text style={styles.primaryButtonText}>Apply Now</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
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
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 32,
  },
  editButton: {
    padding: 4,
  },
  heroImageContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  heroImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  titleContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  campaignTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2d3748',
    lineHeight: 32,
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusBadgeHired: {
    backgroundColor: '#dcfce7',
    borderColor: '#22c55e',
  },
  statusBadgePending: {
    backgroundColor: '#fef9c3',
    borderColor: '#eab308',
  },
  statusBadgeRejected: {
    backgroundColor: '#fee2e2',
    borderColor: '#ef4444',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  statusBadgeTextHired: {
    color: '#15803d',
  },
  statusBadgeTextPending: {
    color: '#a16207',
  },
  statusBadgeTextRejected: {
    color: '#b91c1c',
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  brandImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  brandInfo: {
    flex: 1,
  },
  brandName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2d3748',
    marginBottom: 2,
  },
  brandTagline: {
    fontSize: 14,
    color: '#718096',
  },
  detailsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 24,
    gap: 12,
  },
  detailCard: {
    flex: 1,
    backgroundColor: '#e6ecff',
    padding: 16,
    borderRadius: 12,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#337DEB',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2d3748',
  },
  platformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2d3748',
    marginBottom: 12,
  },
  descriptionText: {
    fontSize: 14,
    color: '#4a5568',
    lineHeight: 20,
  },
  deliverablesList: {
    gap: 12,
  },
  deliverableItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  deliverableText: {
    fontSize: 14,
    color: '#4a5568',
    flex: 1,
    lineHeight: 20,
  },
  requirementsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  requirementTag: {
    backgroundColor: '#e6ecff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  requirementText: {
    fontSize: 14,
    color: '#337DEB',
    fontWeight: '600',
  },
  compensationContainer: {
    gap: 8,
  },
  compensationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#d1fae5',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  compensationText: {
    fontSize: 14,
    color: '#2d3748',
    fontWeight: '600',
  },
  actionButtons: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#337DEB',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#337DEB',
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#337DEB',
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
  },
});

export default CampaignDetails;
