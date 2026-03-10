import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, ActivityIndicator, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../hooks/useAuth';
import DirectPayModal from './DirectPayModal';
import { PlatformIcon } from '../utils/platformIcons';
import { getCurrencySymbol } from '../utils/currency';
import { useUIStore } from '../store/useStore';

// Import MaterialIcons
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

const ProposalDetails = ({ navigation, route }) => {
    const { user } = useAuth();
    const ui = (useUIStore && typeof useUIStore === 'function') ? useUIStore() : { showToast: () => {} };
    const showToast = ui.showToast || (() => {});
    const userRole = (user?.role || user?.userRole)?.toLowerCase();
    const isBrand = userRole === 'brand';
    const isCreator = userRole === 'creator' || userRole === 'influencer';

    const [hiring, setHiring] = useState(false);
    const [loading, setLoading] = useState(true);
    const [creatorData, setCreatorData] = useState(null);
    const [rejecting, setRejecting] = useState(false);
    const [withdrawing, setWithdrawing] = useState(false);
    const [showDirectPay, setShowDirectPay] = useState(false);
    // Full proposal that may be fetched from API when only an ID is available
    const [fullProposal, setFullProposal] = useState(null);
    const [fullCampaign, setFullCampaign] = useState(null);
    const [fetchError, setFetchError] = useState(null);
    const [retryTrigger, setRetryTrigger] = useState(0);

    const { proposal: routeProposal, campaign: routeCampaign, isMyProposal, proposalId: paramProposalId } = route?.params || {};

    // Use fullProposal (fetched from API) or fall back to what was passed via route params
    const proposal = fullProposal || routeProposal;
    const campaign = fullCampaign || routeCampaign;

    // Detect when only a stub { _id, id } was passed — i.e. no meaningful proposal fields
    const isIdOnlyStub = (p) => {
        if (!p) return false;
        const keys = Object.keys(p).filter(k => !['_id', 'id'].includes(k));
        return keys.length === 0;
    };

    // When coming from notifications we may get proposalId in params or proposal: { _id, id }
    const stubProposalId = routeProposal?._id || routeProposal?.id || paramProposalId;

    useEffect(() => {
        // When navigated from a notification with only IDs, fetch the full proposal
        if (!stubProposalId) return;
        if (routeProposal && !isIdOnlyStub(routeProposal)) return;
        const proposalId = stubProposalId;

        const fetchFullProposal = async () => {
            try {
                setLoading(true);
                setFetchError(null);
                const proposalsService = await import('../services/proposals');
                const response = await proposalsService.getProposalById(proposalId);
                if (response?.data) {
                    setFullProposal(response.data);
                    if (!routeCampaign && response.data.campaignId && typeof response.data.campaignId === 'object') {
                        setFullCampaign(response.data.campaignId);
                    }
                } else {
                    setFetchError('Proposal not found or no longer available.');
                }
            } catch (error) {
                console.error('[ProposalDetails] Error fetching full proposal by ID:', error);
                setFetchError(error?.message || 'Failed to load proposal. It may have been removed or you may not have access.');
            } finally {
                setLoading(false);
            }
        };

        fetchFullProposal();
    }, [stubProposalId, retryTrigger]);


    // Extract creator from proposal - handle both populated object and ID
    const creatorFromProposal = (proposal?.creatorId && typeof proposal.creatorId === 'object')
        ? proposal.creatorId
        : (proposal?.creator || {});
    const creatorId = typeof proposal?.creatorId === 'string'
        ? proposal.creatorId
        : (creatorFromProposal?._id || creatorFromProposal?.id || proposal?.creatorId?._id || proposal?.creatorId?.id);

    useEffect(() => {
        const fetchCreatorData = async () => {
            if (!proposal) {
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                let finalCreator = creatorFromProposal;

                // If creatorId is a string, fetch creator profile
                if (creatorId && typeof creatorId === 'string') {
                    try {
                        const userService = await import('../services/user');
                        const creatorResponse = await userService.getProfileByUserId(creatorId);
                        if (creatorResponse && creatorResponse.data) {
                            finalCreator = creatorResponse.data;
                        }
                    } catch (getProfileError) {
                        console.error('[ProposalDetails] Error fetching creator profile:', getProfileError);
                        // Fallback: try getCreators API
                        try {
                            const userService = await import('../services/user');
                            const creatorsResponse = await userService.getCreators({ page: 1, limit: 100 });
                            if (creatorsResponse && creatorsResponse.data) {
                                const creators = creatorsResponse.data.creators || [];
                                const foundCreator = creators.find(c => {
                                    const cId = c.id || c._id;
                                    return cId === creatorId || cId?.toString() === creatorId?.toString();
                                });
                                if (foundCreator) {
                                    finalCreator = foundCreator;
                                }
                            }
                        } catch (fallbackError) {
                            console.error('[ProposalDetails] Fallback fetch failed:', fallbackError);
                        }
                    }
                }

                setCreatorData(finalCreator);
            } catch (error) {
                console.error('[ProposalDetails] Error in fetchCreatorData:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchCreatorData();
    }, [proposal, creatorId]);

    // Prepare display data
    const creator = creatorData || creatorFromProposal;
    const creatorMetrics = proposal?.creatorMetrics || {};
    const platformMetrics = creator?.platformMetrics || [];
    const primaryPlatform = proposal?.proposedDeliverables?.[0]?.platform || platformMetrics[0]?.platform || 'instagram';

    // Calculate engagement rate - Align with CreatorProfile logic
    const calculateEngagementRate = (p) => {
        if (!p) return '0%';
        // 1. Prefer explicit aggregate
        if (p.totalEngagementRate != null && Number(p.totalEngagementRate) > 0) {
            return Number(p.totalEngagementRate).toFixed(1) + '%';
        }
        // 2. Fallbacks
        if (p.engagementRate) return Number(p.engagementRate).toFixed(1) + '%';
        if (p.avgEngagementRate) return Number(p.avgEngagementRate).toFixed(1) + '%';
        if (p.engagement) return Number(p.engagement).toFixed(1) + '%';

        // 3. Average from platform metrics
        const metrics = p.platformReach || p.platformEngagementRates || p.platformMetrics || [];
        if (Array.isArray(metrics) && metrics.length > 0) {
            const rates = metrics.map(m => Number(m.engagementRate || m.rate || 0)).filter(r => r > 0);
            if (rates.length > 0) {
                const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
                return avg.toFixed(1) + '%';
            }
        }
        return '0%';
    };

    // Format follower count - Align with CreatorProfile
    const formatFollowerCount = (total) => {
        if (!total || total === 0) return '0';
        if (total >= 1000000) return (total / 1000000).toFixed(1) + 'M';
        if (total >= 1000) return (total / 1000).toFixed(1) + 'K';
        return total.toString();
    };

    const calculateTotalFollowers = (p) => {
        if (!p) return '0';
        let total = 0;

        // 1. Prefer aggregate if available
        if (p.totalFollowers != null && Number(p.totalFollowers) > 0) {
            return formatFollowerCount(Number(p.totalFollowers));
        }

        // 2. Sum from metrics
        const metrics = p.platformReach || p.platformFollowers || p.platformMetrics || [];
        if (Array.isArray(metrics)) {
            metrics.forEach(m => {
                total += Number(m.followers || m.followerCount || m.count || 0);
            });
        }

        if (total === 0) {
            total = Number(p.followersCount || p.followerCount || p.totalReach || 0);
        }

        return formatFollowerCount(total);
    };

    // Calculate display values using both proposal snapshot and fetched creator data
    const engagementRate = calculateEngagementRate(creatorData || creatorFromProposal || creatorMetrics);
    const followers = calculateTotalFollowers(creatorData || creatorFromProposal || creatorMetrics);

    // Get rating - Align with CreatorProfile (Math.min/max 0-5)
    let rating = 'N/A';
    const rawRating = creatorMetrics.rating || creator?.rating || creator?.averageRating || creatorData?.rating || creatorData?.averageRating;
    if (rawRating != null) {
        let ratingNum = parseFloat(rawRating);
        if (ratingNum > 5) ratingNum = ratingNum / 2;
        rating = Math.min(5, Math.max(0, ratingNum)).toFixed(1);
    }

    // Determine display currency: prefer proposal.currency, then campaign.currency, default NGN
    const campaignCurrency = proposal?.currency || campaign?.currency || 'NGN';
    const currencySymbol = getCurrencySymbol(campaignCurrency);

    const displayData = {
        id: proposal?._id || proposal?.id || 1,
        name: creator?.name || 'Unknown Creator',
        email: creator?.email || '',
        username: creator?.username || creator?.email || '@username',
        avatar: creator?.profileImage || creator?.avatar,
        proposal: proposal?.message || 'No proposal text requested.',
        compensation: proposal?.compensation?.type === 'product'
            ? 'In-kind'
            : (proposal?.compensation?.amount ? `${currencySymbol}${proposal.compensation.amount}` : 'N/A'),
        compensationType: proposal?.compensation?.type === 'fixed_price' ? 'Fixed Price' : proposal?.compensation?.type === 'product' ? 'Product' : 'Other',
        platform: primaryPlatform?.charAt(0).toUpperCase() + primaryPlatform?.slice(1) || 'Instagram',
        followers: followers,
        engagement: engagementRate,
        rating: rating,
        primaryPlatform: primaryPlatform,
    };

    const handleStartChat = async () => {
        try {
            const creatorIdForChat = creatorId || creator?._id || creator?.id;
            const brandIdForChat = user?._id || user?.id; // Current user is brand

            if (!brandIdForChat || !creatorIdForChat) {
                showToast('Unable to start chat. Missing user information.', 'error');
                console.error('[ProposalDetails] Missing IDs:', { brandIdForChat, creatorIdForChat });
                return;
            }

            // Import chat service
            const chatService = await import('../services/chat');

            // Prepare conversation metadata
            const brandName = user?.name || user?.companyName || 'Brand';
            const brandAvatar = user?.profileImage || user?.logo || '';

            // Create or get existing conversation
            const conversation = await chatService.getOrCreateConversation(
                brandIdForChat,
                creatorIdForChat,
                {
                    brandName,
                    influencerName: displayData.name,
                    brandAvatar,
                    influencerAvatar: displayData.avatar || '',
                }
            );

            // Navigate to Chat screen with conversation data
            navigation?.navigate('Chat', {
                conversation: {
                    id: conversation.id,
                    name: displayData.name,
                    avatar: displayData.avatar,
                    subtitle: 'Creator',
                }
            });
        } catch (error) {
            console.error('[ProposalDetails] Error starting chat:', error);
            showToast('Failed to start chat. Please try again.', 'error');
        }
    };

    const handleDirectPaySuccess = () => {
        setShowDirectPay(false);
        showToast('Your payment has been processed successfully and the creator has been hired!', 'success');
        navigation?.navigate('ActiveOrders');
    };

    const handleHireCreator = () => {
        // ALWAYS navigate to checkout screen for proposal acceptance
        // Backend requires paymentMethodId for all proposals (even in-kind)
        const proposalId = proposal?.id || proposal?._id || displayData.id;

        if (!proposalId) {
            showToast('Proposal ID not available', 'error');
            return;
        }

        // Currency for checkout: prefer proposal.currency, then campaign.currency, default NGN
        const currency = proposal?.currency || campaign?.currency || 'NGN';

        // Navigate to checkout screen - proposals use single currency from campaign
        navigation?.navigate('Checkout', {
            proposalId,
            proposal: proposal || displayData,
            campaign,
            currency,
        });
    };

    const handleRejectProposal = async () => {
        const proposalId = proposal?.id || proposal?._id;

        if (!proposalId) {
            showToast('Proposal ID not available', 'error');
            return;
        }

        try {
            setRejecting(true);
            const proposalsService = await import('../services/proposals');
            const response = await proposalsService.rejectProposal(proposalId);
            if (response && response.success) {
                showToast('Proposal rejected successfully.', 'success');
                navigation?.goBack();
            } else {
                throw new Error(response?.message || 'Failed to reject proposal.');
            }
        } catch (error) {
            console.error('[ProposalDetails] Error rejecting proposal:', error);
            showToast(error.message || 'Failed to reject proposal. Please try again.', 'error');
        } finally {
            setRejecting(false);
        }
    };

    const handleWithdrawProposal = async () => {
        const proposalId = proposal?.id || proposal?._id;

        if (!proposalId) {
            showToast('Proposal ID not available', 'error');
            return;
        }

        try {
            setWithdrawing(true);
            const proposalsService = await import('../services/proposals');
            const response = await proposalsService.withdrawProposal(proposalId);
            if (response && response.success) {
                showToast('Proposal withdrawn successfully.', 'success');
                navigation?.goBack();
            } else {
                throw new Error(response?.message || 'Failed to withdraw proposal.');
            }
        } catch (error) {
            console.error('[ProposalDetails] Error withdrawing proposal:', error);
            showToast(error.message || 'Failed to withdraw proposal. Please try again.', 'error');
        } finally {
            setWithdrawing(false);
        }
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#337DEB" />
                    <Text style={styles.loadingText}>Loading proposal details...</Text>
                </View>
            </SafeAreaView>
        );
    }

    // When navigated from notification with only ID and fetch failed or returned nothing (avoid throwing so ErrorBoundary doesn't show "Oops")
    if (routeProposal && isIdOnlyStub(routeProposal) && !fullProposal && !loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <MaterialIcons name="error-outline" size={64} color="#9CA3AF" style={{ marginBottom: 16 }} />
                    <Text style={styles.loadingText}>Proposal not found</Text>
                    <Text style={[styles.loadingText, { fontSize: 14, color: '#6b7280', marginTop: 8 }]}>
                        {fetchError || 'This proposal may have been withdrawn or you don\'t have access to view it.'}
                    </Text>
                    <View style={{ flexDirection: 'row', marginTop: 24, gap: 12 }}>
                        <TouchableOpacity
                            style={{ paddingVertical: 12, paddingHorizontal: 24, backgroundColor: '#337DEB', borderRadius: 8 }}
                            onPress={() => setRetryTrigger(t => t + 1)}
                        >
                            <Text style={{ color: '#fff', fontWeight: '600' }}>Try again</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={{ paddingVertical: 12, paddingHorizontal: 24, backgroundColor: '#e5e7eb', borderRadius: 8 }}
                            onPress={() => navigation?.goBack?.()}
                        >
                            <Text style={{ color: '#374151', fontWeight: '600' }}>Go back</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </SafeAreaView>
        );
    }

    if (!proposal || isIdOnlyStub(proposal)) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backButton} onPress={() => navigation?.goBack()}>
                        <MaterialIcons name="arrow-back" size={24} color="#2d3748" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Proposal Details</Text>
                    <View style={styles.placeholder} />
                </View>
                <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>Proposal not found</Text>
                    <TouchableOpacity style={{ marginTop: 16, paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#337DEB', borderRadius: 8, alignSelf: 'center' }} onPress={() => navigation?.goBack?.()}>
                        <Text style={{ color: '#fff', fontWeight: '600' }}>Go back</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backButton} onPress={() => navigation?.goBack()}>
                        <MaterialIcons name="arrow-back" size={24} color="#2d3748" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Proposal Details</Text>
                    <View style={styles.placeholder} />
                </View>

                {/* Creator Profile & Status Badge */}
                <View style={styles.creatorSection}>
                    <View style={styles.creatorAvatar}>
                        {displayData.avatar ? (
                            <Image source={{ uri: displayData.avatar }} style={{ width: 80, height: 80, borderRadius: 40 }} />
                        ) : (
                            <View style={styles.avatarPlaceholder}>
                                <Text style={styles.avatarText}>{getInitials(displayData.name)}</Text>
                            </View>
                        )}
                    </View>
                    <Text style={styles.creatorName}>{displayData.name}</Text>
                    {displayData.email ? (
                        <Text style={styles.creatorEmail}>{displayData.email}</Text>
                    ) : displayData.username && displayData.username !== '@username' ? (
                        <Text style={styles.creatorUsername}>{displayData.username}</Text>
                    ) : null}

                    {proposal?.status && (
                        <View style={[
                            styles.statusBadge,
                            proposal.status === 'accepted' ? styles.statusBadgeHired :
                                proposal.status === 'rejected' ? styles.statusBadgeRejected :
                                    styles.statusBadgePending
                        ]}>
                            <Text style={[
                                styles.statusBadgeText,
                                proposal.status === 'accepted' ? styles.statusBadgeTextHired :
                                    proposal.status === 'rejected' ? styles.statusBadgeTextRejected :
                                        styles.statusBadgeTextPending
                            ]}>
                                {proposal.status === 'accepted' ? 'HIRED' : proposal.status.toUpperCase()}
                            </Text>
                        </View>
                    )}
                </View>

                {/* Compensation */}
                <View style={styles.compensationSection}>
                    <Text style={styles.compensationLabel}>Proposed Budget</Text>
                    {proposal?.compensation?.type === 'product' ? (
                        <View style={styles.inKindContainer}>
                            <MaterialIcons name="card-giftcard" size={24} color="#10b981" />
                            <Text style={styles.inKindText}>In-kind</Text>
                        </View>
                    ) : (
                        <Text style={styles.compensationAmount}>{displayData.compensation}</Text>
                    )}
                    <Text style={styles.compensationType}>{displayData.compensationType}</Text>
                </View>

                {/* Proposal Text */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Proposal</Text>
                    <Text style={styles.proposalText}>{displayData.proposal}</Text>
                </View>

                {/* Creator Stats */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Creator Stats</Text>
                    <View style={styles.statsGrid}>
                        <View style={styles.statCard}>
                            <PlatformIcon platform={displayData.primaryPlatform} size={24} color="#337DEB" />
                            <Text style={styles.statLabel}>Platform</Text>
                            <Text style={styles.statValue}>{displayData.platform}</Text>
                        </View>
                        <View style={styles.statCard}>
                            <MaterialIcons name="group" size={24} color="#337DEB" />
                            <Text style={styles.statLabel}>Followers</Text>
                            <Text style={styles.statValue}>{displayData.followers}</Text>
                        </View>
                        {parseFloat(displayData.engagement) > 0 && (
                            <View style={styles.statCard}>
                                <MaterialIcons name="favorite" size={24} color="#337DEB" />
                                <Text style={styles.statLabel}>Engagement</Text>
                                <Text style={styles.statValue}>{displayData.engagement}</Text>
                            </View>
                        )}
                        <View style={styles.statCard}>
                            <MaterialIcons name="star" size={24} color="#337DEB" />
                            <Text style={styles.statLabel}>Rating</Text>
                            <Text style={styles.statValue}>{displayData.rating}</Text>
                        </View>
                    </View>
                </View>

                {/* Action Buttons */}
                <View style={styles.actionButtonsContainer}>
                    {isMyProposal && isCreator ? (
                        <TouchableOpacity
                            style={[styles.fullWidthWithdrawButton, withdrawing && styles.withdrawButtonDisabled]}
                            onPress={handleWithdrawProposal}
                            disabled={withdrawing || proposal?.status?.toLowerCase() !== 'pending'}
                        >
                            {withdrawing ? (
                                <ActivityIndicator size="small" color="#ef4444" />
                            ) : (
                                <>
                                    <MaterialIcons name="cancel" size={20} color="#ef4444" />
                                    <Text style={styles.withdrawButtonText}>Withdraw Proposal</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    ) : isBrand ? (
                        <View style={styles.brandActionsContainer}>
                            {proposal?.status?.toLowerCase() === 'accepted' ? (
                                <View style={styles.hiredBanner}>
                                    <MaterialIcons name="check-circle" size={24} color="#15803d" />
                                    <Text style={styles.hiredBannerText}>You have hired this creator for this campaign</Text>
                                </View>
                            ) : (
                                <>
                                    <View style={styles.buttonRow}>
                                        <TouchableOpacity
                                            style={[styles.halfWidthRejectButton, rejecting && styles.rejectButtonDisabled]}
                                            onPress={handleRejectProposal}
                                            disabled={rejecting}
                                        >
                                            {rejecting ? (
                                                <ActivityIndicator size="small" color="#dc2626" />
                                            ) : (
                                                <>
                                                    <MaterialIcons name="close" size={18} color="#dc2626" />
                                                    <Text style={styles.rejectButtonText}>Reject</Text>
                                                </>
                                            )}
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[styles.halfWidthHireButton]}
                                            onPress={handleHireCreator}
                                            disabled={hiring}
                                        >
                                            {hiring ? (
                                                <ActivityIndicator size="small" color="#ffffff" />
                                            ) : (
                                                <>
                                                    <MaterialIcons name="check-circle" size={18} color="#ffffff" />
                                                    <Text style={styles.hireButtonText}>Hire Creator</Text>
                                                </>
                                            )}
                                        </TouchableOpacity>
                                    </View>

                                    {campaignCurrency === 'USD' && (
                                        <TouchableOpacity
                                            style={[styles.fullWidthDirectPayButton]}
                                            onPress={() => setShowDirectPay(true)}
                                        >
                                            <MaterialIcons name="credit-card" size={18} color="#337DEB" />
                                            <Text style={styles.directPayButtonText}>Direct Pay</Text>
                                        </TouchableOpacity>
                                    )}
                                </>
                            )}

                            <TouchableOpacity style={styles.fullWidthChatButton} onPress={handleStartChat}>
                                <MaterialIcons name="chat-bubble" size={18} color="#0284c7" />
                                <Text style={styles.chatButtonText}>Chat</Text>
                            </TouchableOpacity>
                        </View>
                    ) : null}
                </View>
            </ScrollView>

            {/* Direct Pay Modal for Fast Hiring */}
            {campaignCurrency === 'USD' && (
                <DirectPayModal
                    visible={showDirectPay}
                    onClose={() => setShowDirectPay(false)}
                    onSuccess={handleDirectPaySuccess}
                    proposalId={proposal?.id || proposal?._id || displayData.id}
                    currency={campaign?.currency || 'USD'}
                />
            )}
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
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 50,
        paddingBottom: 12,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#2d3748',
    },
    placeholder: {
        width: 32,
    },
    creatorSection: {
        alignItems: 'center',
        padding: 24,
        backgroundColor: '#fff',
        marginBottom: 12,
    },
    creatorAvatar: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#f3f4f6',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    avatarPlaceholder: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#337DEB',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#ffffff',
    },
    creatorName: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#1f2937',
        marginBottom: 4,
    },
    creatorEmail: {
        fontSize: 15,
        color: '#4b5563',
        marginTop: 6,
        fontWeight: '500',
    },
    creatorUsername: {
        fontSize: 15,
        color: '#4b5563',
        marginTop: 6,
        fontWeight: '500',
    },
    compensationSection: {
        alignItems: 'center',
        padding: 20,
        backgroundColor: '#fff',
        marginBottom: 12,
    },
    compensationLabel: {
        fontSize: 14,
        color: '#6b7280',
        marginBottom: 8,
    },
    compensationAmount: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#10b981',
        marginBottom: 4,
    },
    compensationType: {
        fontSize: 14,
        color: '#6b7280',
    },
    inKindContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 4,
    },
    inKindText: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#10b981',
    },
    section: {
        padding: 20,
        backgroundColor: '#fff',
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1f2937',
        marginBottom: 12,
    },
    proposalText: {
        fontSize: 15,
        color: '#4b5563',
        lineHeight: 24,
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    statCard: {
        flex: 1,
        minWidth: '45%',
        backgroundColor: '#f9fafb',
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    statLabel: {
        fontSize: 12,
        color: '#6b7280',
        marginTop: 8,
        marginBottom: 4,
    },
    statValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1f2937',
    },
    actionButtons: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        paddingVertical: 16,
        gap: 10,
        backgroundColor: '#fff',
        marginBottom: 20,
        borderTopWidth: 1,
        borderTopColor: '#f3f4f6',
    },
    chatButton: {
        flex: 1,
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
    rejectButtonDisabled: {
        opacity: 0.5,
        backgroundColor: '#f9fafb',
    },
    withdrawButton: {
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
    withdrawButtonText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#dc2626',
        letterSpacing: 0.3,
    },
    withdrawButtonDisabled: {
        opacity: 0.5,
        backgroundColor: '#f9fafb',
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
    hireButtonDisabled: {
        opacity: 0.6,
        backgroundColor: '#9ca3af',
    },
    // New Action Button Styles
    actionButtonsContainer: {
        paddingHorizontal: 16,
        paddingBottom: 40,
        backgroundColor: '#fff',
        gap: 12,
        borderTopWidth: 1,
        borderTopColor: '#f3f4f6',
        paddingTop: 16,
    },
    brandActionsContainer: {
        gap: 12,
    },
    statusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        marginTop: 10,
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
    hiredBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#dcfce7',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#22c55e',
        gap: 10,
        marginBottom: 8,
    },
    hiredBannerText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#15803d',
        flex: 1,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
    },
    halfWidthHireButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#337DEB',
        paddingVertical: 14,
        borderRadius: 12,
        gap: 8,
    },
    fullWidthChatButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f0f9ff',
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: '#bae6fd',
        gap: 8,
    },
    halfWidthRejectButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#ffffff',
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: '#fca5a5',
        gap: 8,
    },
    fullWidthDirectPayButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#ffffff',
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: '#337DEB',
        gap: 8,
    },
    directPayButtonText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#337DEB',
    },
    fullWidthWithdrawButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#ffffff',
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: '#fca5a5',
        gap: 8,
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
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    errorText: {
        fontSize: 16,
        color: '#6b7280',
        textAlign: 'center',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#ffffff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '80%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1f2937',
    },
    modalBody: {
        padding: 16,
        maxHeight: 400,
    },
    modalLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 8,
        marginTop: 12,
    },
    modalNote: {
        fontSize: 12,
        color: '#6b7280',
        marginTop: 16,
        lineHeight: 18,
    },
    modalFooter: {
        flexDirection: 'row',
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
        gap: 12,
    },
    modalCancelButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        backgroundColor: '#ffffff',
        alignItems: 'center',
    },
    modalCancelButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#6b7280',
    },
    modalConfirmButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        backgroundColor: '#337DEB',
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalConfirmButtonDisabled: {
        opacity: 0.6,
    },
    modalConfirmButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#ffffff',
    },
});

export default ProposalDetails;
