import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlatformIcon } from '../utils/platformIcons';
import { createOffer } from '../services/offers';
import LocationPicker from './LocationPicker';
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

const CreateFirstOffer = ({ navigation, route }) => {
    const creatorData = route?.params?.creatorData || {};
    const { primaryRole, category } = creatorData;
    const ui = (useUIStore && typeof useUIStore === 'function') ? useUIStore() : { showToast: () => {} };
    const showToast = ui.showToast || (() => {});

    const [offerTitle, setOfferTitle] = useState('');
    const [selectedPlatform, setSelectedPlatform] = useState('Instagram');
    const [rate, setRate] = useState('');
    const [rateNgn, setRateNgn] = useState('');
    const [delivery, setDelivery] = useState('7');
    const [quantity, setQuantity] = useState('1');
    const [description, setDescription] = useState('');
    const [revisions, setRevisions] = useState('0');
    const [isNegotiable, setIsNegotiable] = useState(false);
    const [tagsText, setTagsText] = useState('');
    const [locationObject, setLocationObject] = useState({ city: '', state: '', country: '' });

    const platforms = [
        { id: 'Instagram' },
        { id: 'TikTok' },
        { id: 'YouTube' },
        { id: 'Facebook' },
        { id: 'Twitter' },
    ];

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submittingAction, setSubmittingAction] = useState(null); // 'active' | 'draft'

    // Prefill from profile if available
    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const userService = await import('../services/user');
                const resp = await userService.getMyProfile();
                const p = resp?.data || {};
                if (!mounted) return;
                if (p?.location && typeof p.location === 'object') {
                    setLocationObject({
                        city: p.location.city || '',
                        state: p.location.state || '',
                        country: p.location.country || '',
                    });
                }
                if (Array.isArray(p?.tags) && p.tags.length > 0) {
                    setTagsText(p.tags.join(', '));
                }
            } catch (_) { /* ignore prefill errors */ }
        })();
        return () => { mounted = false; };
    }, []);

    const buildOfferPayload = (status) => {
        const platformKey = (selectedPlatform || 'Instagram').toLowerCase();
        const platformServiceMap = {
            instagram: 'reel',
            tiktok: 'short_video',
            youtube: 'full_video_review',
            twitter: 'tweet',
            facebook: 'page_post'
        };
        const serviceType = platformServiceMap[platformKey] || 'reel';
        const ratePayload = {
            usd: parseFloat(rate) || 0,
            ngn: rateNgn ? parseFloat(rateNgn) : 0,
        };
        return {
            title: `I will ${offerTitle}`.trim(),
            serviceType,
            platform: [platformKey],
            rate: ratePayload,
            deliveryDays: parseInt(delivery || '7', 10),
            duration: 30,
            quantity: parseInt(quantity || '1', 10),
            description: (description || 'Professional content delivery as described.').trim(),
            category: (category && (category.value || category)) || undefined,
            location: {
                city: (locationObject?.city || '').trim(),
                state: (locationObject?.state || '').trim(),
                country: (locationObject?.country || '').trim(),
            },
            tags: tagsText
                ? tagsText.split(',').map(t => t.trim()).filter(Boolean)
                : [],
            isNegotiable: Boolean(isNegotiable),
            revisions: parseInt(revisions || '0', 10) || 0,
            status,
        };
    };

    const submitOffer = async (status) => {
        if (!offerTitle || !rate) return;
        try {
            setIsSubmitting(true);
            setSubmittingAction(status);
            const response = await createOffer(buildOfferPayload(status));

            const created = response?.data || response;
            if (!created || (!created._id && !created.id)) {
                throw new Error(response?.message || 'Failed to create offer');
            }

            if (status === 'active') {
                showToast('Offer created successfully!', 'success');
            } else {
                showToast('Offer saved as draft!', 'success');
            }

            navigation?.navigate('AppNavigator', {
                initialTab: 'Home',
                role: 'Creator',
                creatorData,
            });
        } catch (err) {
            showToast(err.message || 'Failed to save your offer. Please try again.', 'error');
        } finally {
            setIsSubmitting(false);
            setSubmittingAction(null);
        }
    };

    const handleCreateOffer = () => submitOffer('active');
    const handleSaveDraft = () => submitOffer('draft');

    const handleSkip = () => {
        // Skip offer creation and go to Dashboard
        navigation?.navigate('AppNavigator', {
            initialTab: 'Home',
            role: 'Creator',
            creatorData
        });
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerContent}>
                        <MaterialIcons name="celebration" size={32} color="#337DEB" />
                        <Text style={styles.headerTitle}>Create Your First Offer</Text>
                        <Text style={styles.headerSubtitle}>
                            Start earning by creating an offer for brands
                        </Text>
                    </View>
                </View>

                {/* Progress Indicator */}
                <View style={styles.progressContainer}>
                    <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: '100%' }]} />
                    </View>
                    <Text style={styles.progressText}>Final Step - Step 6 of 6</Text>
                </View>

                {/* Form Content */}
                <View style={styles.formContainer}>
                    {/* Offer Title */}
                    <View style={styles.section}>
                        <Text style={styles.inputLabel}>Offer Title *</Text>
                        <View style={styles.prefixInputContainer}>
                            <View style={styles.prefixButton}>
                                <Text style={styles.prefixText}>I will</Text>
                            </View>
                            <TextInput
                                style={styles.prefixTextInput}
                                placeholder={`e.g., Create ${(() => {
                                    const c = category;
                                    if (typeof c === 'string') return c || 'content';
                                    if (c && typeof c === 'object') return c.label || c.name || 'content';
                                    return 'content';
                                })()} for your brand`}
                                placeholderTextColor="#9ca3af"
                                value={offerTitle}
                                onChangeText={setOfferTitle}
                            />
                        </View>
                    </View>

                    {/* Platform Selection */}
                    <View style={styles.section}>
                        <Text style={styles.inputLabel}>Platform *</Text>
                        <View style={styles.platformContainer}>
                            {platforms.map((platform) => (
                                <TouchableOpacity
                                    key={platform.id}
                                    style={[
                                        styles.platformButton,
                                        selectedPlatform === platform.id && styles.platformButtonSelected
                                    ]}
                                    onPress={() => setSelectedPlatform(platform.id)}
                                >
                                    <PlatformIcon
                                        platform={platform.id}
                                        size={24}
                                        color={selectedPlatform === platform.id ? '#337DEB' : '#6b7280'}
                                    />
                                    <Text style={[
                                        styles.platformButtonText,
                                        selectedPlatform === platform.id && styles.platformButtonTextSelected
                                    ]}>
                                        {platform.id}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* Rate and Delivery */}
                    <View style={styles.section}>
                        <View style={styles.rowContainer}>
                            <View style={styles.halfInputGroup}>
                                <Text style={styles.inputLabel}>Rate (USD $) *</Text>
                                <TextInput
                                    style={styles.textInput}
                                    placeholder="250"
                                    placeholderTextColor="#9ca3af"
                                    value={rate}
                                    onChangeText={setRate}
                                    keyboardType="numeric"
                                />
                            </View>
                            <View style={styles.halfInputGroup}>
                                <Text style={styles.inputLabel}>Rate (NGN ₦)</Text>
                                <TextInput
                                    style={styles.textInput}
                                    placeholder="e.g. 150000"
                                    placeholderTextColor="#9ca3af"
                                    value={rateNgn}
                                    onChangeText={setRateNgn}
                                    keyboardType="numeric"
                                />
                            </View>
                        </View>
                        <View style={[styles.halfInputGroup, { marginTop: 12 }]}>
                            <Text style={styles.inputLabel}>Delivery (Days) *</Text>
                            <TextInput
                                style={styles.textInput}
                                placeholder="7"
                                placeholderTextColor="#9ca3af"
                                value={delivery}
                                onChangeText={setDelivery}
                                keyboardType="numeric"
                            />
                        </View>
                    </View>

                    {/* Quantity */}
                    <View style={styles.section}>
                        <Text style={styles.inputLabel}>Quantity *</Text>
                        <TextInput
                            style={styles.textInput}
                            placeholder="1"
                            placeholderTextColor="#9ca3af"
                            value={quantity}
                            onChangeText={setQuantity}
                            keyboardType="numeric"
                        />
                        <Text style={styles.helperText}>Number of videos/items to create</Text>
                    </View>

                    {/* Description */}
                    <View style={styles.section}>
                        <Text style={styles.inputLabel}>Description</Text>
                        <TextInput
                            style={[styles.textInput, styles.textArea]}
                            placeholder="Describe what your offer includes..."
                            placeholderTextColor="#9ca3af"
                            multiline
                            numberOfLines={4}
                            value={description}
                            onChangeText={setDescription}
                        />
                    </View>

                    {/* Location */}
                    <View className="section" style={styles.section}>
                        <LocationPicker
                            label="Location (optional)"
                            value={locationObject}
                            onChange={setLocationObject}
                            required={false}
                        />
                    </View>

                    {/* Revisions */}
                    <View style={styles.section}>
                        <Text style={styles.inputLabel}>Revisions</Text>
                        <TextInput
                            style={styles.textInput}
                            placeholder="0"
                            placeholderTextColor="#9ca3af"
                            value={revisions}
                            onChangeText={setRevisions}
                            keyboardType="numeric"
                        />
                    </View>

                    {/* Negotiable (standalone toggle, not inside an input-style field) */}
                    <View style={styles.section}>
                        <View style={styles.negotiableRow}>
                            <Text style={styles.inputLabel}>Negotiable</Text>
                            <Switch value={isNegotiable} onValueChange={setIsNegotiable} />
                        </View>
                    </View>

                    {/* Tags */}
                    <View style={styles.section}>
                        <Text style={styles.inputLabel}>Tags (comma-separated)</Text>
                        <TextInput
                            style={styles.textInput}
                            placeholder="tag1, tag2, tag3"
                            placeholderTextColor="#9ca3af"
                            value={tagsText}
                            onChangeText={setTagsText}
                            autoCapitalize="none"
                        />
                    </View>

                    {/* Info Box */}
                    <View style={styles.infoBox}>
                        <MaterialIcons name="info-outline" size={20} color="#337DEB" />
                        <Text style={styles.infoText}>
                            You can add more offers and edit this one later from your dashboard
                        </Text>
                    </View>
                </View>

                {/* Action Buttons */}
                <View style={styles.buttonContainer}>
                    <TouchableOpacity
                        style={[
                            styles.createButton,
                            (!offerTitle || !rate || isSubmitting) && styles.createButtonDisabled
                        ]}
                        onPress={handleCreateOffer}
                        disabled={!offerTitle || !rate || isSubmitting}
                    >
                        {isSubmitting ? (
                            <>
                                <ActivityIndicator size="small" color="#ffffff" />
                                <Text style={styles.createButtonText}>
                                    {submittingAction === 'draft' ? 'Saving...' : 'Creating...'}
                                </Text>
                            </>
                        ) : (
                            <>
                                <Text style={styles.createButtonText}>Create Offer</Text>
                                <MaterialIcons name="add-circle-outline" size={20} color="#ffffff" />
                            </>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.saveDraftButton,
                            (!offerTitle || !rate || isSubmitting) && styles.createButtonDisabled
                        ]}
                        onPress={handleSaveDraft}
                        disabled={!offerTitle || !rate || isSubmitting}
                    >
                        <Text style={styles.saveDraftButtonText}>Save as Draft</Text>
                        <MaterialIcons name="save" size={20} color="#337DEB" />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.skipButton} onPress={handleSkip} disabled={isSubmitting}>
                        <Text style={[styles.skipButtonText, isSubmitting && { color: '#cbd5e1' }]}>Skip - I'll create offers later</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
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
    },
    header: {
        backgroundColor: '#ffffff',
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 24,
    },
    headerContent: {
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#2d3748',
        marginTop: 12,
        marginBottom: 8,
    },
    headerSubtitle: {
        fontSize: 16,
        color: '#6b7280',
        textAlign: 'center',
        lineHeight: 22,
    },
    progressContainer: {
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: '#ffffff',
        marginBottom: 16,
    },
    progressBar: {
        height: 6,
        backgroundColor: '#e5e7eb',
        borderRadius: 3,
        overflow: 'hidden',
        marginBottom: 8,
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#22c55e',
        borderRadius: 3,
    },
    progressText: {
        fontSize: 12,
        color: '#6b7280',
        textAlign: 'center',
    },
    formContainer: {
        paddingHorizontal: 20,
    },
    section: {
        marginBottom: 20,
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#2d3748',
        marginBottom: 8,
    },
    prefixInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 8,
        overflow: 'hidden',
    },
    prefixButton: {
        backgroundColor: '#f3f4f6',
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderRightWidth: 1,
        borderRightColor: '#e5e7eb',
    },
    prefixText: {
        fontSize: 14,
        color: '#6b7280',
        fontWeight: '500',
    },
    prefixTextInput: {
        flex: 1,
        paddingHorizontal: 12,
        paddingVertical: 12,
        fontSize: 16,
        color: '#374151',
    },
    platformContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    platformButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 20,
        paddingVertical: 8,
        paddingHorizontal: 12,
        gap: 6,
    },
    platformButtonSelected: {
        backgroundColor: '#f0f4ff',
        borderColor: '#337DEB',
    },
    platformButtonText: {
        fontSize: 13,
        color: '#6b7280',
        fontWeight: '500',
    },
    platformButtonTextSelected: {
        color: '#337DEB',
    },
    rowContainer: {
        flexDirection: 'row',
        gap: 12,
    },
    halfInputGroup: {
        flex: 1,
    },
    negotiableRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    textInput: {
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 12,
        fontSize: 16,
        color: '#374151',
    },
    helperText: {
        fontSize: 12,
        color: '#6b7280',
        marginTop: 4,
    },
    textArea: {
        height: 100,
        textAlignVertical: 'top',
    },
    infoBox: {
        flexDirection: 'row',
        backgroundColor: '#f0f4ff',
        borderRadius: 8,
        padding: 12,
        gap: 12,
        marginTop: 8,
    },
    infoText: {
        flex: 1,
        fontSize: 13,
        color: '#337DEB',
        lineHeight: 18,
    },
    buttonContainer: {
        paddingHorizontal: 20,
        paddingVertical: 24,
        marginBottom: 40,
    },
    createButton: {
        backgroundColor: '#337DEB',
        borderRadius: 12,
        paddingVertical: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 12,
    },
    createButtonDisabled: {
        backgroundColor: '#cbd5e1',
    },
    createButtonText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#ffffff',
    },
    saveDraftButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#ffffff',
        borderWidth: 2,
        borderColor: '#337DEB',
        borderRadius: 12,
        paddingVertical: 14,
        marginBottom: 12,
    },
    saveDraftButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#337DEB',
    },
    skipButton: {
        paddingVertical: 12,
        alignItems: 'center',
    },
    skipButtonText: {
        fontSize: 15,
        color: '#6b7280',
        fontWeight: '500',
    },
});

export default CreateFirstOffer;
