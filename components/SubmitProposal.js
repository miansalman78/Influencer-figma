import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Platform,
    KeyboardAvoidingView,
    ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

const SubmitProposal = ({ navigation, route }) => {
    const { campaign } = route.params || {};
    const ui = (useUIStore && typeof useUIStore === 'function') ? useUIStore() : { showToast: () => {} };
    const showToast = ui.showToast || (() => {});

    const [message, setMessage] = useState('');
    const [compensationAmount, setCompensationAmount] = useState('');
    const [deliveryDays, setDeliveryDays] = useState('');
    const [loading, setLoading] = useState(false);

    // Check if campaign is expired on mount
    useEffect(() => {
        if (campaign) {
            const applicationDeadline = campaign.applicationDeadline || campaign.application_deadline;
            const isExpired = applicationDeadline ? new Date(applicationDeadline) < new Date() : false;

            if (isExpired) {
                showToast('The application deadline has passed. You cannot submit proposals for expired campaigns.', 'warning');
                navigation?.goBack();
            }
        }
    }, [campaign, navigation]);

    // Simplified deliverables state (could be more complex in future)
    // For now, we will default to the campaign's deliverables or generic ones
    // In a real app, we might want a dynamic list builder here.

    const handleSubmit = async () => {
        // Check if campaign is expired before submission
        const applicationDeadline = campaign?.applicationDeadline || campaign?.application_deadline;
        const isExpired = applicationDeadline ? new Date(applicationDeadline) < new Date() : false;

        if (isExpired) {
            showToast('The application deadline has passed. You cannot submit proposals for expired campaigns.', 'warning');
            return;
        }

        if (!message.trim()) {
            showToast('Please enter a cover message', 'error');
            return;
        }
        if (!compensationAmount.trim() || isNaN(compensationAmount)) {
            showToast('Please enter a valid amount', 'error');
            return;
        }
        if (!deliveryDays.trim() || isNaN(deliveryDays)) {
            showToast('Please enter estimated delivery days', 'error');
            return;
        }

        setLoading(true);

        try {
            // Map deliverable type to valid proposal enum values
            // Valid types per Postman: short_video, story (NOT video, post, reel, etc.)
            const mapDeliverableType = (deliverable) => {
                const d = deliverable.toLowerCase();
                // Map campaign deliverable types to proposal deliverable types
                if (d.includes('short_video') || d.includes('short video')) {
                    return 'short_video';
                }
                if (d.includes('story')) {
                    return 'story';
                }
                if (d.includes('video') || d.includes('reel') || d.includes('igtv')) {
                    // Map video-related types to short_video
                    return 'short_video';
                }
                // Default to story for posts and other types
                return 'story';
            };

            // Validate and normalize platform value
            // Valid platform enum values: instagram, tiktok, youtube, facebook, twitter
            const getValidPlatform = (platformValue, index) => {
                // Valid platform enum values
                const validPlatforms = ['instagram', 'tiktok', 'youtube', 'facebook', 'twitter'];

                // Try to get platform from campaign
                let platform = null;

                // Handle different campaign.platform structures
                if (Array.isArray(campaign.platform)) {
                    platform = campaign.platform[index] || campaign.platform[0];
                } else if (typeof campaign.platform === 'string') {
                    platform = campaign.platform;
                } else if (campaign.platforms && Array.isArray(campaign.platforms)) {
                    platform = campaign.platforms[index] || campaign.platforms[0];
                }

                // Normalize platform value
                if (platform) {
                    const normalized = platform.toLowerCase().trim();
                    // Remove any special characters or backticks
                    const cleaned = normalized.replace(/[`'"]/g, '');

                    // Check if it's a valid platform
                    if (validPlatforms.includes(cleaned)) {
                        return cleaned;
                    }

                    // Try to map common variations
                    const platformMap = {
                        'ig': 'instagram',
                        'insta': 'instagram',
                        'fb': 'facebook',
                        'yt': 'youtube',
                        'tt': 'tiktok',
                    };

                    if (platformMap[cleaned]) {
                        return platformMap[cleaned];
                    }
                }

                // Default to instagram if no valid platform found
                return 'instagram';
            };

            // Ensure we have at least one deliverable
            const deliverables = campaign?.deliverables && campaign.deliverables.length > 0
                ? campaign.deliverables
                : ['short_video']; // Default deliverable if none specified

            // Construct Payload - matching Postman collection structure
            const payload = {
                message: message,
                proposedDeliverables: deliverables.map((d, index) => ({
                    type: mapDeliverableType(d),
                    quantity: 1,
                    platform: getValidPlatform(campaign.platform, index)
                })),
                compensation: {
                    type: 'fixed_price',
                    amount: parseFloat(compensationAmount),
                    currency: campaign.currency, // Include currency in payload
                    description: 'Proposed fee'
                },
                estimatedDeliveryDays: parseInt(deliveryDays),
                duration: 30 // Default duration or need input
            };

            const campaignId = campaign._id || campaign.id;
            if (!campaignId) {
                throw new Error('Campaign ID is required');
            }

            const response = await import('../services/proposals').then(m => m.submitProposal(campaignId, payload));

            if (response) {
                showToast('Your proposal has been submitted!', 'success');
                setTimeout(() => {
                    navigation?.navigate?.('Campaigns');
                }, 600);
            }
        } catch (error) {
            console.error('Submit proposal error:', error);
            showToast(error.message || 'Failed to submit proposal', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity
                            style={styles.backButton}
                            onPress={() => navigation.goBack()}
                        >
                            <MaterialIcons name="arrow-back" size={24} color="#2d3748" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Submit Proposal</Text>
                        <View style={styles.notificationButton} />
                    </View>

                    <View style={styles.section}>
                        <View style={styles.campaignSummary}>
                            <Text style={styles.campaignTitle}>{campaign?.name || campaign?.title || 'Unknown Campaign'}</Text>
                            <Text style={styles.campaignBrand}>{campaign?.brandName || (typeof campaign?.brandId === 'object' ? (campaign.brandId.name || campaign.brandId.companyName || 'Brand') : 'Brand')}</Text>
                            <Text style={styles.campaignBudget}>
                                Budget: {campaign?.budgetRange
                                    ? (() => {
                                        const cur = campaign?.budgetRange?.currency || campaign?.currency || 'NGN';
                                        const sym = getCurrencySymbol(cur);
                                        const min = Number(campaign.budgetRange.min ?? 0).toLocaleString();
                                        const max = Number(campaign.budgetRange.max ?? 0).toLocaleString();
                                        return `${sym}${min} - ${sym}${max}`;
                                      })()
                                    : (campaign?.budget != null ? (getCurrencySymbol(campaign?.currency || 'NGN') + Number(campaign.budget).toLocaleString()) : 'Negotiable')}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.inputLabel}>Cover Letter</Text>
                        <TextInput
                            style={[styles.textInput, styles.textArea]}
                            placeholder="Introduce yourself and explain why you're a good fit..."
                            placeholderTextColor="#9ca3af"
                            multiline
                            numberOfLines={6}
                            value={message}
                            onChangeText={setMessage}
                            textAlignVertical="top"
                        />
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.inputLabel}>Proposed Price ({campaign?.currency === 'USD' ? 'USD ($)' : `NGN (${getCurrencySymbol('NGN')})`})</Text>
                        <TextInput
                            style={styles.textInput}
                            placeholder={`e.g. ${campaign?.currency === 'USD' ? '350' : '50000'}`}
                            placeholderTextColor="#9ca3af"
                            keyboardType="numeric"
                            value={compensationAmount}
                            onChangeText={setCompensationAmount}
                        />
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.inputLabel}>Estimated Delivery (Days)</Text>
                        <TextInput
                            style={styles.textInput}
                            placeholder="e.g. 7"
                            placeholderTextColor="#9ca3af"
                            keyboardType="numeric"
                            value={deliveryDays}
                            onChangeText={setDeliveryDays}
                        />
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.noteText}>Note: By submitting this proposal, you agree to deliver the content as described in the campaign if accepted.</Text>
                    </View>

                </ScrollView>

                <View style={styles.footer}>
                    <TouchableOpacity
                        style={[styles.submitButton, loading && styles.disabledButton]}
                        onPress={handleSubmit}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.submitButtonText}>Submit Proposal</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f9fafb',
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
    notificationButton: {
        padding: 4,
        width: 24,
    },
    section: {
        backgroundColor: '#ffffff',
        marginHorizontal: 16,
        marginTop: 16,
        padding: 20,
        borderRadius: 12,
    },
    campaignSummary: {
        // Removed specific background/border as it's now in a section
    },
    campaignTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#111827',
        marginBottom: 4,
    },
    campaignBrand: {
        fontSize: 14,
        color: '#6b7280',
        marginBottom: 4,
    },
    campaignBudget: {
        fontSize: 14,
        color: '#337DEB',
        fontWeight: '500',
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#2d3748',
        marginBottom: 8,
    },
    textInput: {
        backgroundColor: '#f9fafb',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 12,
        fontSize: 16,
        color: '#374151',
    },
    textArea: {
        height: 120,
    },
    noteText: {
        fontSize: 12,
        color: '#9ca3af',
        fontStyle: 'italic',
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#fff',
        padding: 20,
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
    },
    submitButton: {
        backgroundColor: '#337DEB',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    disabledButton: {
        backgroundColor: '#a5a6f6',
    },
    submitButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
});

export default SubmitProposal;
