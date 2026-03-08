import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMyProposals, withdrawProposal } from '../services/proposals';
import { useAuth } from '../hooks/useAuth';
import { useUIStore } from '../store/useStore';

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

const MyProposals = ({ navigation, route }) => {
  const { user } = useAuth();
  const ui = (useUIStore && typeof useUIStore === 'function') ? useUIStore() : { showToast: () => {} };
  const showToast = ui.showToast || (() => {});
  const userRole = user?.role?.toLowerCase() || route?.params?.role?.toLowerCase();
  const isCreator = userRole === 'creator' || userRole === 'influencer';

  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [withdrawingId, setWithdrawingId] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState('All');
  const isInsideAppNav = route?.params?.insideAppNavigator || route?.params?.initialTab === 'MyProposals';

  useEffect(() => {
    if (!isCreator) {
      showToast('This page is only available for creators.', 'warning');
      navigation?.goBack();
    }
  }, [isCreator]);

  useEffect(() => {
    loadProposals();
  }, [selectedStatus]);

  React.useEffect(() => {
    const unsubscribe = navigation?.addListener?.('focus', () => {
      loadProposals();
    });
    return unsubscribe;
  }, [navigation]);

  const loadProposals = async () => {
    try {
      setLoading(true);
      const params = {};
      if (selectedStatus !== 'All') {
        params.status = selectedStatus.toLowerCase();
      }
      const response = await getMyProposals(params);

      if (response && response.data) {
        const proposalsData = Array.isArray(response.data)
          ? response.data
          : (response.data.proposals || response.data.items || []);
        setProposals(proposalsData);
      } else {
        setProposals([]);
      }
    } catch (error) {
      console.error('Error fetching proposals:', error);
      showToast('Failed to load proposals. Please try again.', 'error');
      setProposals([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadProposals();
  };

  const handleWithdraw = async (proposalId) => {
    try {
      setWithdrawingId(proposalId);
      await withdrawProposal(proposalId);
      showToast('Proposal withdrawn successfully.', 'success');
      loadProposals();
    } catch (error) {
      console.error('Error withdrawing proposal:', error);
      showToast('Failed to withdraw proposal. Please try again.', 'error');
    } finally {
      setWithdrawingId(null);
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'accepted':
        return '#10b981';
      case 'rejected':
        return '#ef4444';
      case 'pending':
        return '#f59e0b';
      case 'withdrawn':
        return '#6b7280';
      default:
        return '#6b7280';
    }
  };

  const getCampaignStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'open':
      case 'accepting_bids':
        return '#10b981';
      case 'in_progress':
      case 'hired':
        return '#337DEB';
      case 'completed':
        return '#6b7280';
      case 'cancelled':
        return '#ef4444';
      default:
        return '#f59e0b';
    }
  };

  const formatStatus = (status) => {
    if (!status) return 'Unknown';
    const s = status.toLowerCase();
    if (s === 'accepted' || s === 'hired') return 'Hired';
    return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const statusOptions = ['All', 'Pending', 'Accepted', 'Rejected', 'Withdrawn'];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => isInsideAppNav ? navigation?.openDrawer?.() : navigation?.goBack()}
        >
          <MaterialIcons
            name={isInsideAppNav ? "menu" : "arrow-back"}
            size={24}
            color="#374151"
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Proposals</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          {statusOptions.map((status) => (
            <TouchableOpacity
              key={status}
              style={[
                styles.filterButton,
                selectedStatus === status && styles.filterButtonSelected
              ]}
              onPress={() => setSelectedStatus(status)}
            >
              <Text style={[
                styles.filterButtonText,
                selectedStatus === status && styles.filterButtonTextSelected
              ]}>
                {status}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <View style={styles.refreshControl}>
            {refreshing && <ActivityIndicator size="small" color="#337DEB" />}
          </View>
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#337DEB" />
            <Text style={styles.loadingText}>Loading proposals...</Text>
          </View>
        ) : proposals.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="description" size={64} color="#d1d5db" />
            <Text style={styles.emptyText}>No proposals found</Text>
            <Text style={styles.emptySubtext}>
              {selectedStatus === 'All'
                ? 'You haven\'t submitted any proposals yet.'
                : `No ${selectedStatus.toLowerCase()} proposals found.`}
            </Text>
          </View>
        ) : (
          <View style={styles.proposalsList}>
            {proposals.map((proposal) => {
              const campaign = proposal.campaignId && typeof proposal.campaignId === 'object'
                ? proposal.campaignId
                : (proposal.campaign || {});
              const campaignId = campaign._id || campaign.id || proposal.campaignId;
              const campaignTitle = campaign.title || campaign.name || 'Campaign';
              const status = proposal.status || 'pending';
              const canWithdraw = status?.toLowerCase() === 'pending';

              return (
                <View key={proposal._id || proposal.id} style={styles.proposalCard}>
                  <TouchableOpacity
                    onPress={() => navigation?.navigate('ProposalDetails', {
                      proposal,
                      campaign,
                      isMyProposal: true
                    })}
                    activeOpacity={0.7}
                  >
                    <View style={styles.proposalHeader}>
                      <View style={styles.proposalInfo}>
                        <Text style={styles.campaignTitle} numberOfLines={2}>
                          {campaignTitle}
                        </Text>
                        <View style={styles.statusRow}>
                          <View style={[
                            styles.campaignStatusBadge,
                            { backgroundColor: getCampaignStatusColor(campaign.status) + '15' }
                          ]}>
                            <View style={[styles.statusDot, { backgroundColor: getCampaignStatusColor(campaign.status) }]} />
                            <Text style={[styles.campaignStatusText, { color: getCampaignStatusColor(campaign.status) }]}>
                              Campaign: {formatStatus(campaign.status)}
                            </Text>
                          </View>
                          <Text style={styles.proposalDate}>
                            {proposal.createdAt
                              ? new Date(proposal.createdAt).toLocaleDateString()
                              : 'Date not available'}
                          </Text>
                        </View>
                      </View>
                      <View style={[
                        styles.statusBadge,
                        { backgroundColor: getStatusColor(status) + '15' }
                      ]}>
                        <Text style={[styles.statusText, { color: getStatusColor(status) }]}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.proposalMessage} numberOfLines={3}>
                      {proposal.message || 'No proposal message'}
                    </Text>

                    <View style={styles.compensationRow}>
                      {proposal.compensation?.type === 'product' ? (
                        <View style={styles.compensationBadge}>
                          <MaterialIcons name="card-giftcard" size={16} color="#10b981" />
                          <Text style={styles.compensationText}>In-kind</Text>
                        </View>
                      ) : (
                        <Text style={styles.compensationAmount}>
                          {(() => {
                            const currency = campaign?.currency || 'NGN';
                            const symbol = currency && currency.toUpperCase() === 'USD' ? '$' : '₦';
                            return `${symbol}${proposal.compensation?.amount || 0}`;
                          })()}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>

                  {canWithdraw && (
                    <TouchableOpacity
                      style={styles.withdrawButton}
                      onPress={() => handleWithdraw(proposal._id || proposal.id)}
                      disabled={withdrawingId === (proposal._id || proposal.id)}
                    >
                      {withdrawingId === (proposal._id || proposal.id) ? (
                        <ActivityIndicator size="small" color="#ef4444" />
                      ) : (
                        <>
                          <MaterialIcons name="cancel" size={16} color="#ef4444" />
                          <Text style={styles.withdrawButtonText}>Withdraw</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  placeholder: {
    width: 40,
  },
  filterContainer: {
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  filterScroll: {
    paddingHorizontal: 16,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterButtonSelected: {
    backgroundColor: '#337DEB15',
    borderColor: '#337DEB',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  filterButtonTextSelected: {
    color: '#337DEB',
  },
  scrollView: {
    flex: 1,
  },
  refreshControl: {
    padding: 10,
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    marginTop: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2d3748',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 8,
    textAlign: 'center',
  },
  proposalsList: {
    padding: 16,
  },
  proposalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  proposalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  proposalInfo: {
    flex: 1,
    marginRight: 12,
  },
  campaignTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  proposalDate: {
    fontSize: 13,
    color: '#94a3b8',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  campaignStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  campaignStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  proposalMessage: {
    fontSize: 15,
    color: '#475569',
    lineHeight: 22,
    marginBottom: 16,
  },
  compensationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  compensationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  compensationText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10b981',
  },
  compensationAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2d3748',
  },
  withdrawButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ef4444',
    backgroundColor: '#ffffff',
    gap: 6,
  },
  withdrawButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ef4444',
  },
});

export default MyProposals;

