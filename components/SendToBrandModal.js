import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, ScrollView, ActivityIndicator, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { useUIStore } from '../store/useStore';

// Import MaterialIcons
let MaterialIcons;
try {
    const MaterialIconModule = require('react-native-vector-icons/MaterialIcons');
    MaterialIcons = MaterialIconModule.default || MaterialIconModule;
    if (typeof MaterialIcons !== 'function') {
        console.warn('MaterialIcons is not a function, creating fallback');
        MaterialIcons = ({ name, size, color, style }) => (
            <View style={[{ width: size, height: size }, style]} />
        );
    }
} catch (error) {
    console.error('Error importing MaterialIcons:', error);
    MaterialIcons = ({ name, size, color, style }) => (
        <View style={[{ width: size, height: size }, style]} />
    );
}

/**
 * SendToBrandModal - Modal for creators to send their offers to brands
 * @param {boolean} visible - Whether the modal is visible
 * @param {function} onClose - Callback when modal is closed
 * @param {object} offer - The offer object to send
 * @param {function} onSuccess - Callback when offer is successfully sent
 * @param {object} navigation - Navigation object for navigating to brand profile
 */
const SendToBrandModal = ({ visible, onClose, offer, onSuccess, navigation, user, isProposal = false }) => {
    const ui = (useUIStore && typeof useUIStore === 'function') ? useUIStore() : { showToast: () => {} };
    const showToast = ui.showToast || (() => {});
    const [brands, setBrands] = useState([]);
    const [filteredBrands, setFilteredBrands] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedBrands, setSelectedBrands] = useState([]); // Array of brand IDs or objects
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);

    // Fetch brands list
    useEffect(() => {
        if (visible) {
            fetchBrands();
            // Set default message
            if (isProposal) {
                setMessage(`Hi! I'm interested in working with your brand. I've attached my portfolio for your review. I think we could create some great content together!`);
            } else {
                setMessage(`Hi! I'd like to share my offer "${offer?.title || 'this offer'}" with you. I think it would be a great fit for your brand.`);
            }
        } else {
            // Reset state when modal closes
            setSearchQuery('');
            setSelectedBrands([]);
            setMessage('');
        }
    }, [visible, offer, isProposal]);

    const fetchBrands = async () => {
        try {
            setLoading(true);
            const userService = await import('../services/user');
            const response = await userService.getBrands({ limit: 50 });
            // API returns { success, data: { brands, pagination }, message }
            const raw = response?.data;
            const brandsData = Array.isArray(raw)
                ? raw
                : Array.isArray(raw?.brands)
                    ? raw.brands
                    : raw?.users || [];
            setBrands(brandsData);
            setFilteredBrands(brandsData);
        } catch (error) {
            console.error('Failed to fetch brands:', error);
            const msg = error?.data?.message || error?.message || 'Failed to load brands list.';
            showToast(msg, 'error');
        } finally {
            setLoading(false);
        }
    };

    // Filter brands based on search query
    useEffect(() => {
        if (!searchQuery.trim()) {
            setFilteredBrands(brands);
        } else {
            const query = searchQuery.toLowerCase();
            const filtered = brands.filter(brand => {
                const name = brand.name || brand.companyName || brand.username || '';
                const email = brand.email || '';
                return name.toLowerCase().includes(query) || email.toLowerCase().includes(query);
            });
            setFilteredBrands(filtered);
        }
    }, [searchQuery, brands]);

    const toggleBrandSelection = (brand) => {
        const brandId = brand._id || brand.id;
        setSelectedBrands(prev => {
            const isSelected = prev.some(b => (b._id || b.id) === brandId);
            if (isSelected) {
                return [];
            } else {
                return [brand];
            }
        });
    };

    const handleSend = async () => {
        if (selectedBrands.length === 0) {
            showToast(`Please select at least one brand to send the ${isProposal ? 'proposal' : 'offer'} to.`, 'error');
            return;
        }

        if (!message.trim()) {
            showToast(`Please add a message to send with your ${isProposal ? 'proposal' : 'offer'}.`, 'error');
            return;
        }

        try {
            setSending(true);
            const offersService = await import('../services/offers');
            const chatService = await import('../services/chat');
            const offerId = offer?._id || offer?.id;
            const senderId = user?._id || user?.id;

            const results = await Promise.all(selectedBrands.slice(0, 1).map(async (brand) => {
                try {
                    const brandId = brand._id || brand.id;

                    // 1. Notify backend (only for specific offers)
                    if (!isProposal && offerId) {
                        try {
                            await offersService.sendOfferToBrand(offerId, brandId, message.trim());
                        } catch (notifyErr) {
                            console.warn('Backend notification failed, continuing with chat:', notifyErr);
                        }
                    }

                    // 2. Send message to Firebase chat
                    if (senderId) {
                        try {
                            const conversation = await chatService.getOrCreateConversation(brandId, senderId, {
                                brandName: brand.name || brand.companyName || 'Brand',
                                influencerName: user?.name || 'Creator',
                                brandAvatar: brand.profileImage || brand.avatar || '',
                                influencerAvatar: user?.profileImage || user?.avatar || ''
                            });

                            let finalMessage;
                            let messagePayload = { text: '' };

                            if (isProposal) {
                                // For general proposals, link to the creator profile/portfolio
                                const profileLink = `https://adpartnr.onrender.com/creators/${senderId}`;
                                finalMessage = `${message.trim()}\n\nView my Portfolio: ${profileLink}`;
                                messagePayload = {
                                    isProposal: true,
                                    proposalData: {
                                        creatorId: senderId,
                                        creatorName: user?.name || 'Creator',
                                        creatorAvatar: user?.profileImage || user?.avatar || '',
                                        link: profileLink
                                    },
                                    text: finalMessage
                                };
                            } else {
                                // For specific offers, link to the offer
                                const offerLink = `https://adpartnr.onrender.com/offers/${offerId}`;
                                finalMessage = `${message.trim()}\n\nView Offer: ${offerLink}`;
                                messagePayload = {
                                    isOffer: true,
                                    offerData: {
                                        id: offerId,
                                        offerId: offerId,
                                        title: offer?.title || 'Custom Offer',
                                        budget: offer?.rate ? (offer.rate.usd ? `$${offer.rate.usd}` : `₦${offer.rate.ngn}`) : 'N/A',
                                        description: offer?.description || '',
                                        image: offer?.media?.[0]?.url || offer?.media?.[0] || '🎁',
                                        link: offerLink
                                    },
                                    text: finalMessage
                                };
                            }

                            await chatService.sendMessage(conversation.id, messagePayload, senderId, 'influencer');
                        } catch (chatErr) {
                            console.error(`Failed to send chat message to ${brand.name}:`, chatErr);
                            // We don't fail the whole operation if only chat fails
                        }
                    }

                    return { success: true, brandName: brand.name || brand.companyName || 'Brand' };
                } catch (err) {
                    console.error(`Failed to send ${isProposal ? 'proposal' : 'offer'} to ${brand.name}:`, err);
                    return { success: false, brandName: brand.name || brand.companyName || 'Brand', error: err.message };
                }
            }));

            const failed = results.filter(r => !r.success);

            if (failed.length === 0) {
                showToast(isProposal ? 'Proposal sent successfully!' : 'Offer sent successfully!', 'success');
                if (onSuccess) onSuccess();
                onClose();
            } else if (failed.length === selectedBrands.length) {
                showToast(`Unable to send ${isProposal ? 'proposal' : 'offer'} to any of the selected brands. Please try again.`, 'error');
            } else {
                showToast(isProposal ? 'Proposal sent to selected brands!' : 'Offer sent to selected brands!', 'success');
                if (onSuccess) onSuccess();
                onClose();
            }
        } catch (error) {
            console.error('Failed to send offer:', error);
            showToast(error.message || 'Failed to send offer. Please try again.', 'error');
        } finally {
            setSending(false);
        }
    };

    const getInitials = (name) => {
        if (!name) return '?';
        const parts = name.trim().split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.keyboardView}
                >
                    <View style={styles.modalContainer}>
                        {/* Header */}
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{isProposal ? 'Send Proposal to Brands' : 'Send Offer to Brand'}</Text>
                            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                                <MaterialIcons name="close" size={24} color="#2d3748" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView
                            style={styles.modalBody}
                            contentContainerStyle={styles.scrollContent}
                            showsVerticalScrollIndicator={false}
                        >
                            {/* Offer Preview (Only for offers) */}
                            {!isProposal && (
                                <View style={styles.offerPreview}>
                                    <MaterialIcons name="local-offer" size={20} color="#337DEB" />
                                    <Text style={styles.offerTitle} numberOfLines={1}>
                                        {offer?.title || 'Untitled Offer'}
                                    </Text>
                                </View>
                            )}

                            {/* Portfolio Preview (Only for proposals) */}
                            {isProposal && (
                                <View style={styles.offerPreview}>
                                    <MaterialIcons name="person" size={20} color="#337DEB" />
                                    <Text style={styles.offerTitle} numberOfLines={1}>
                                        My Portfolio & Creator Profile
                                    </Text>
                                </View>
                            )}

                            {/* Search Brands */}
                            <View style={styles.searchContainer}>
                                <MaterialIcons name="search" size={20} color="#9ca3af" style={styles.searchIcon} />
                                <TextInput
                                    style={styles.searchInput}
                                    placeholder="Search brands..."
                                    value={searchQuery}
                                    onChangeText={setSearchQuery}
                                    placeholderTextColor="#9ca3af"
                                />
                            </View>

                            {/* Brands List */}
                            <View style={styles.brandsListContainer}>
                                <View style={styles.sectionHeader}>
                                    <Text style={styles.sectionLabel}>Select Brands</Text>
                                    <View style={styles.selectionCount}>
                                        <Text style={styles.selectionCountText}>
                                            {selectedBrands.length} selected
                                        </Text>
                                    </View>
                                </View>
                                {loading ? (
                                    <ActivityIndicator size="large" color="#337DEB" style={styles.loader} />
                                ) : filteredBrands.length > 0 ? (
                                    <View style={styles.brandsList}>
                                        {filteredBrands.map((brand) => {
                                            const brandName = brand.name || brand.companyName || brand.username || 'Unknown Brand';
                                            const brandId = brand._id || brand.id;
                                            const isSelected = selectedBrands.some(b => (b._id || b.id) === brandId);

                                            return (
                                                <View key={brandId} style={styles.brandItemWrapper}>
                                                    <TouchableOpacity
                                                        style={[styles.brandItem, isSelected && styles.brandItemSelected]}
                                                        onPress={() => toggleBrandSelection(brand)}
                                                    >
                                                        {brand.profileImage || brand.avatar ? (
                                                            <Image source={{ uri: brand.profileImage || brand.avatar }} style={styles.brandAvatar} />
                                                        ) : (
                                                            <View style={styles.brandAvatarPlaceholder}>
                                                                <Text style={styles.brandInitials}>{getInitials(brandName)}</Text>
                                                            </View>
                                                        )}
                                                        <View style={styles.brandInfo}>
                                                            <Text style={styles.brandName}>{brandName}</Text>
                                                            {brand.email && (
                                                                <Text style={styles.brandEmail} numberOfLines={1}>{brand.email}</Text>
                                                            )}
                                                        </View>
                                                        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                                                            {isSelected && <MaterialIcons name="check" size={16} color="#ffffff" />}
                                                        </View>
                                                    </TouchableOpacity>
                                                </View>
                                            );
                                        })}
                                    </View>
                                ) : (
                                    <View style={styles.emptyState}>
                                        <MaterialIcons name="business" size={48} color="#d1d5db" />
                                        <Text style={styles.emptyStateText}>
                                            {searchQuery ? 'No brands found' : 'No brands available'}
                                        </Text>
                                    </View>
                                )}
                            </View>

                            {/* Message Input */}
                            <View style={styles.messageContainer}>
                                <Text style={styles.sectionLabel}>Add a Message</Text>
                                <TextInput
                                    style={styles.messageInput}
                                    placeholder="Write a personalized message..."
                                    value={message}
                                    onChangeText={setMessage}
                                    multiline
                                    numberOfLines={4}
                                    textAlignVertical="top"
                                    placeholderTextColor="#9ca3af"
                                />
                                <Text style={styles.charCount}>{message.length}/500</Text>
                            </View>
                        </ScrollView>

                        {/* Action Buttons */}
                        <View style={styles.actionButtons}>
                            <TouchableOpacity
                                style={styles.cancelButton}
                                onPress={onClose}
                                disabled={sending}
                            >
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.sendButton, (selectedBrands.length === 0 || !message.trim() || sending) && styles.sendButtonDisabled]}
                                onPress={handleSend}
                                disabled={selectedBrands.length === 0 || !message.trim() || sending}
                            >
                                {sending ? (
                                    <ActivityIndicator size="small" color="#ffffff" />
                                ) : (
                                    <>
                                        <MaterialIcons name="send" size={18} color="#ffffff" />
                                        <Text style={styles.sendButtonText}>
                                            {selectedBrands.length > 1 ? `Send to ${selectedBrands.length} Brands` : (isProposal ? 'Send Proposal' : 'Send Offer')}
                                        </Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    keyboardView: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalContainer: {
        backgroundColor: '#ffffff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 20,
        paddingBottom: Platform.OS === 'ios' ? 40 : 32,
        paddingHorizontal: 20,
        maxHeight: '90%',
        minHeight: '60%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    modalBody: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 20,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#2d3748',
    },
    closeButton: {
        padding: 4,
    },
    offerPreview: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f3f4f6',
        padding: 12,
        borderRadius: 8,
        marginBottom: 16,
        gap: 8,
    },
    offerTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#2d3748',
        flex: 1,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f3f4f6',
        borderRadius: 12,
        paddingHorizontal: 12,
        marginBottom: 16,
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        paddingVertical: 12,
        fontSize: 14,
        color: '#2d3748',
    },
    brandsListContainer: {
        marginBottom: 16,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    sectionLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#4a5568',
    },
    selectionCount: {
        backgroundColor: '#eff6ff',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 12,
    },
    selectionCountText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#337DEB',
    },
    loader: {
        marginVertical: 40,
    },
    brandsList: {
        // No fixed height here, let it expand in the main scroll view
    },
    brandItemWrapper: {
        marginBottom: 8,
    },
    brandItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        backgroundColor: '#f9fafb',
        borderWidth: 2,
        borderColor: 'transparent',
    },
    brandItemSelected: {
        backgroundColor: '#eff6ff',
        borderColor: '#337DEB',
    },
    brandAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        marginRight: 12,
    },
    brandAvatarPlaceholder: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#337DEB',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    brandInitials: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: 'bold',
    },
    brandInfo: {
        flex: 1,
    },
    brandName: {
        fontSize: 14,
        fontWeight: '600',
        color: '#2d3748',
        marginBottom: 2,
    },
    brandEmail: {
        fontSize: 12,
        color: '#6b7280',
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#d1d5db',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8,
    },
    checkboxSelected: {
        backgroundColor: '#337DEB',
        borderColor: '#337DEB',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 40,
    },
    emptyStateText: {
        fontSize: 14,
        color: '#6b7280',
        marginTop: 12,
    },
    messageContainer: {
        marginBottom: 20,
    },
    messageInput: {
        backgroundColor: '#f3f4f6',
        borderRadius: 12,
        padding: 12,
        fontSize: 14,
        color: '#2d3748',
        minHeight: 100,
        maxHeight: 120,
    },
    charCount: {
        fontSize: 12,
        color: '#9ca3af',
        textAlign: 'right',
        marginTop: 4,
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 12,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#f3f4f6',
    },
    cancelButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#e5e7eb',
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#6b7280',
    },
    sendButton: {
        flex: 1,
        flexDirection: 'row',
        backgroundColor: '#337DEB',
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    sendButtonDisabled: {
        backgroundColor: '#cbd5e1',
    },
    sendButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#ffffff',
    },
});

export default SendToBrandModal;
