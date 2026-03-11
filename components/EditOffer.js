import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Image } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { mapCategoryToOffer, mapBackendCategoryToUI, VALID_PLATFORMS } from '../utils/apiConstants';
import { getMyProfile } from '../services/user';
import { getServicesByRole } from '../services/services';
import logger from '../utils/logger';
import { PlatformIcon } from '../utils/platformIcons';
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
    logger.error('Error importing MaterialIcons', error);
    MaterialIcons = ({ name, size, color, style }) => (
        <Text style={[{ fontSize: size || 20, color: color || '#000' }, style]}>?</Text>
    );
}

const EditOffer = ({ navigation, route }) => {
    const offer = route?.params?.offer || {};

    const [offerTitle, setOfferTitle] = useState(offer.title || '');

    // Service state - will load from API and match with offer.serviceType
    const [selectedService, setSelectedService] = useState(null);
    const [availableServices, setAvailableServices] = useState([]);
    const [isLoadingServices, setIsLoadingServices] = useState(false);
    const [userRole, setUserRole] = useState(null);

    // Keep selectedServiceType for UI toggle (Creator/Influencer)
    const getInitialServiceType = () => {
        if (offer.serviceType === 'reel') return 'Creator';
        if (offer.serviceType === 'short_video') return 'Influencer';
        return offer.serviceType || 'Creator';
    };
    const [selectedServiceType, setSelectedServiceType] = useState(getInitialServiceType());

    // Fix platform: offer.platform is an array, get first element
    const getInitialPlatform = () => {
        let platformValue = 'instagram'; // Default
        if (Array.isArray(offer.platform) && offer.platform.length > 0) {
            platformValue = offer.platform[0];
        } else if (offer.platform) {
            platformValue = offer.platform;
        }
        return platformValue.toLowerCase();
    };
    const [selectedPlatform, setSelectedPlatform] = useState(getInitialPlatform());

    // Fix category: map from backend format (fashion_beauty/entertainment_media) to UI display
    const getInitialCategory = () => {
        if (offer.category) {
            // Map backend category to UI display name
            const backendToUI = {
                'fashion_beauty': 'Fashion', // Default to Fashion for fashion_beauty
                'entertainment_media': 'Food', // Default to Food for entertainment_media
                'food_drink': 'Food',
                'tech_gadgets': 'Tech',
                'fitness_health': 'Health & Wellness',
                'travel_lifestyle': 'Travel',
                'gaming': 'Gaming',
                'education': 'Education',
            };
            const mapped = backendToUI[offer.category];
            if (mapped) return mapped;

            // Check if it's already a UI category
            const serviceCategories = ['Food', 'Tech', 'Health & Wellness', 'Fashion', 'Beauty', 'Travel', 'Fitness', 'Lifestyle', 'Gaming', 'Education'];
            if (serviceCategories.includes(offer.category)) {
                return offer.category;
            }
        }
        return 'Food'; // Default
    };
    const [selectedCategory, setSelectedCategory] = useState(getInitialCategory());
    const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
    // Fix duration - ensure it's a string with proper default
    const getInitialDuration = () => {
        if (offer.duration) {
            return offer.duration.toString();
        }
        return '30'; // Default 30 days
    };
    const [offerDuration, setOfferDuration] = useState(getInitialDuration());

    // Handle rate - can be number, object {ngn, usd}, or from price field
    const getInitialRates = () => {
        const rates = { usd: '', ngn: '' };
        if (offer.rate) {
            if (typeof offer.rate === 'object' && offer.rate !== null) {
                if (offer.rate.usd) rates.usd = offer.rate.usd.toString();
                if (offer.rate.ngn) rates.ngn = offer.rate.ngn.toString();
            } else {
                // If simple number, assume USD for now or try to guess? Defaulting to USD is safer legacy behavior.
                rates.usd = offer.rate.toString();
            }
        } else if (offer.price) {
            rates.usd = offer.price.toString();
        }

        // Deafult fallback
        if (!rates.usd && !rates.ngn) rates.usd = '250';
        return rates;
    };
    const [rates, setRates] = useState(getInitialRates());



    // Fix deliveryDays - API uses deliveryDays, not delivery
    const getInitialDelivery = () => {
        if (offer.deliveryDays) {
            return offer.deliveryDays.toString();
        }
        if (offer.delivery) {
            return offer.delivery.toString();
        }
        return '7'; // Default 7 days
    };
    const [delivery, setDelivery] = useState(getInitialDelivery());

    // Fix quantity - ensure it's a string with proper default
    const getInitialQuantity = () => {
        if (offer.quantity) {
            return offer.quantity.toString();
        }
        return '1'; // Default 1
    };
    const [quantity, setQuantity] = useState(getInitialQuantity());

    const [description, setDescription] = useState(offer.description || '');

    // Fix location - API uses object { city, state, country, coordinates: { latitude, longitude } }
    const getInitialLocation = () => {
        if (offer.location && typeof offer.location === 'object') {
            // Format location object as string for display
            const parts = [];
            if (offer.location.city) parts.push(offer.location.city);
            if (offer.location.state) parts.push(offer.location.state);
            if (offer.location.country) parts.push(offer.location.country);
            return parts.join(', ');
        }
        return offer.location || '';
    };
    const [location, setLocation] = useState(getInitialLocation());

    // Location object state for API payload
    const [locationObject, setLocationObject] = useState(
        offer.location && typeof offer.location === 'object'
            ? {
                city: offer.location.city || '',
                state: offer.location.state || '',
                country: offer.location.country || ''
            }
            : { city: '', state: '', country: '' }
    );

    const [isNegotiable, setIsNegotiable] = useState(!!offer.isNegotiable);
    const [revisions, setRevisions] = useState(offer.revisions ? offer.revisions.toString() : '0');

    // Media state
    const [media, setMedia] = useState(offer.media || []);

    const serviceCategories = [
        'Food',
        'Tech',
        'Health & Wellness',
        'Fashion',
        'Beauty',
        'Travel',
        'Fitness',
        'Lifestyle',
        'Gaming',
        'Education',
    ];

    // Category mapping is now handled by apiConstants utility

    // Fetch user profile and available services, then match with offer.serviceType
    useEffect(() => {
        const fetchServices = async () => {
            try {
                setIsLoadingServices(true);
                const profileRes = await getMyProfile();

                if (profileRes && profileRes.success && profileRes.data) {
                    const role = profileRes.data.role;
                    setUserRole(role);

                    // Only fetch services if role is valid (creator or influencer)
                    if (role && (role.toLowerCase() === 'creator' || role.toLowerCase() === 'influencer')) {
                        try {
                            // Map 'creator' to 'service_creator' for the API
                            const apiRole = role.toLowerCase() === 'creator' ? 'service_creator' : role.toLowerCase();
                            const servicesRes = await getServicesByRole(apiRole);
                            if (servicesRes && servicesRes.success && servicesRes.data) {
                                setAvailableServices(servicesRes.data);

                                // Find the service that matches offer.serviceType
                                if (offer.serviceType && servicesRes.data.length > 0) {
                                    const matchingService = servicesRes.data.find(
                                        service => service.identifier === offer.serviceType || service._id === offer.serviceType
                                    );
                                    if (matchingService) {
                                        setSelectedService(matchingService);
                                    } else {
                                        // Fallback: use first service if no match found
                                        logger.warn('[EditOffer] No matching service found for serviceType', { serviceType: offer.serviceType });
                                        setSelectedService(servicesRes.data[0]);
                                    }
                                } else if (servicesRes.data.length > 0) {
                                    // No serviceType in offer, use first available service
                                    setSelectedService(servicesRes.data[0]);
                                }
                            }
                        } catch (serviceError) {
                            logger.warn('[EditOffer] Could not fetch services, using fallback', serviceError);
                            setAvailableServices([]);
                            // Don't clear selectedService if we have offer data
                        }
                    } else {
                        logger.info('[EditOffer] User role is not creator/influencer, using fallback');
                        setAvailableServices([]);
                    }
                }
            } catch (error) {
                logger.error('[EditOffer] Error fetching services', error);
            } finally {
                setIsLoadingServices(false);
            }
        };

        fetchServices();
    }, [offer.serviceType]);

    const handleCategoryPress = () => {
        setShowCategoryDropdown(!showCategoryDropdown);
    };

    const selectCategory = (category) => {
        setSelectedCategory(category);
        setShowCategoryDropdown(false);
    };

    const handleSaveOffer = async () => {
        // Validate required fields
        if (!offerTitle.trim()) {
            showToast('Please enter an offer title', 'error');
            return;
        }

        if (!locationObject?.city?.trim() || !locationObject?.country?.trim()) {
            showToast('Please enter at least City and Country', 'error');
            return;
        }

        try {
            const offersService = await import('../services/offers');
            const offerId = offer._id || offer.id;

            if (!offerId) {
                showToast('Unable to identify offer to update', 'error');
                return;
            }

            let serviceType;
            if (selectedService && (selectedService._id || selectedService.id)) {
                serviceType = selectedService._id || selectedService.id;
            } else {
                const platformServiceMap = {
                    instagram: 'reel',
                    tiktok: 'short_video',
                    youtube: 'full_video_review',
                    twitter: 'tweet',
                    facebook: 'page_post'
                };
                serviceType = platformServiceMap[selectedPlatform] || 'reel';
            }

            const ratePayload = {};
            if (rates.usd) ratePayload.usd = parseFloat(rates.usd);
            if (rates.ngn) ratePayload.ngn = parseFloat(rates.ngn);
            if (!ratePayload.usd) ratePayload.usd = 0;
            if (!ratePayload.ngn) ratePayload.ngn = 0;

            const locationPayload = locationObject || (location?.trim() ? {
                city: location.split(',')[0]?.trim() || '',
                state: location.split(',')[1]?.trim() || '',
                country: location.split(',')[2]?.trim() || '',
            } : null);
            const tagsPayload = selectedCategory ? [selectedCategory.toLowerCase().replace(/\s+/g, '_')] : [];

            // Existing media (from API: { url, type, caption }) vs new picks (have .uri)
            const existingMedia = media.filter(m => m.url).map(m => ({
                url: m.url,
                type: m.type || 'image',
                caption: m.caption || ''
            }));
            const newMediaFiles = media.filter(m => m.uri);

            let updatePayload;

            if (newMediaFiles.length > 0) {
                // Use FormData so backend can receive new files (field name 'media') and merge with existing
                updatePayload = new FormData();
                updatePayload.append('title', offerTitle.trim());
                updatePayload.append('serviceType', serviceType);
                updatePayload.append('platform', JSON.stringify([selectedPlatform]));
                updatePayload.append('rate', JSON.stringify(ratePayload));
                updatePayload.append('deliveryDays', parseInt(delivery || '7').toString());
                updatePayload.append('duration', parseInt(offerDuration || '30').toString());
                updatePayload.append('quantity', parseInt(quantity || '1').toString());
                updatePayload.append('description', description.trim());
                updatePayload.append('category', mapCategoryToOffer(selectedCategory));
                updatePayload.append('tags', JSON.stringify(tagsPayload));
                updatePayload.append('location', JSON.stringify(locationPayload));
                updatePayload.append('isNegotiable', isNegotiable.toString());
                updatePayload.append('revisions', parseInt(revisions || '0').toString());
                // Existing media to keep (backend reads existingMedia and merges with req.files)
                updatePayload.append('existingMedia', JSON.stringify(existingMedia));
                newMediaFiles.forEach((file) => {
                    updatePayload.append('media', {
                        uri: file.uri,
                        type: file.type || 'image/jpeg',
                        name: file.fileName || file.name || 'upload.jpg',
                    });
                });
            } else {
                updatePayload = {
                    title: offerTitle.trim(),
                    serviceType: serviceType,
                    platform: [selectedPlatform],
                    rate: ratePayload,
                    deliveryDays: parseInt(delivery || '7'),
                    duration: parseInt(offerDuration || '30'),
                    quantity: parseInt(quantity || '1'),
                    description: description.trim(),
                    category: mapCategoryToOffer(selectedCategory),
                    tags: tagsPayload,
                    location: locationPayload,
                    isNegotiable: isNegotiable,
                    revisions: parseInt(revisions || '0'),
                    media: existingMedia,
                };
            }

            const response = await offersService.updateOffer(offerId, updatePayload);

            if (response && response.data) {
                // Automatically close edit screen by navigating away immediately
                navigation.navigate('OfferDetails', {
                    offer: response.data,
                    preservedTab: route?.params?.preservedTab,
                    refresh: true
                });

                showToast('Offer updated successfully!', 'success');
            } else {
                showToast('Failed to update offer', 'error');
            }
        } catch (error) {
            console.error('Failed to update offer:', error);
            showToast(error.message || 'Failed to update offer. Please try again.', 'error');
        }
    };

    const handlePublishOffer = async () => {
        try {
            const offersService = await import('../services/offers');
            const offerId = offer._id || offer.id;

            const response = await offersService.publishOffer(offerId);
            const ok = response && (response.success === true || response.data != null);

            if (ok) {
                showToast('Your offer is now live and visible to brands.', 'success');
                // Close this screen and open My Offers (replace so back doesn't return to edit)
                navigation.navigate('ExploreOffers', { refresh: true, replace: true });
            } else {
                const msg = response?.message || response?.data?.message || 'Failed to publish offer';
                showPublishFieldError(msg);
            }
        } catch (error) {
            console.error('Failed to publish offer:', error);
            const msg = error?.data?.message || error?.message || 'Failed to publish offer';
            showPublishFieldError(msg);
        }
    };

    // Show a clear, field-by-field guidance when publish validation fails
    const showPublishFieldError = (message) => {
        const FIELD_LABELS = {
            serviceType: 'Service Type  →  select a service chip above',
            duration: 'Offer Duration  →  fill in the Duration field above',
            platform: 'Platform  →  pick a social platform above',
            rate: 'Rate  →  enter at least a USD or NGN price',
            deliveryDays: 'Delivery Days  →  fill in the Delivery field above',
            quantity: 'Quantity  →  fill in the Quantity field above',
            description: 'Description  →  fill in your offer description',
        };

        const match = message.match(/missing required fields?:?\s*([\w,\s]+)/i);
        let guide = '';
        if (match) {
            const fields = match[1].split(',').map(f => f.trim()).filter(Boolean);
            const lines = fields.map(f => `  • ${FIELD_LABELS[f] || f}`).join('\n');
            guide = `\n\nFields to complete on this screen:\n${lines}`;
        }

        showToast(`Your offer is missing some required fields.${guide}\n\nFill them in, tap Save Changes, then Publish again.`, 'warning');
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => {
                            if (navigation?.goBack) {
                                navigation.goBack();
                            }
                        }}
                    >
                        <MaterialIcons name="arrow-back" size={24} color="#2d3748" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Edit Offer</Text>
                    <View style={styles.notificationButton} />
                </View>

                {/* Offer Title Section */}
                <View style={styles.section}>
                    <Text style={styles.inputLabel}>Offer Title</Text>
                    <View style={styles.prefixInputContainer}>
                        <View style={styles.prefixButton}>
                            <Text style={styles.prefixText}>I will</Text>
                        </View>
                        <TextInput
                            style={styles.prefixTextInput}
                            placeholder="e.g. High-Quality Instagram Post"
                            placeholderTextColor="#9ca3af"
                            value={offerTitle}
                            onChangeText={setOfferTitle}
                        />
                    </View>
                </View>

                {/* Service Type Section */}
                <View style={styles.section}>
                    <Text style={styles.inputLabel}>Service Type</Text>
                    {isLoadingServices ? (
                        <ActivityIndicator size="small" color="#337DEB" style={{ marginTop: 10 }} />
                    ) : (
                        <>
                            {availableServices.length > 0 ? (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.servicesContainer}>
                                    {availableServices.map((service) => (
                                        <TouchableOpacity
                                            key={service.identifier || service.id || service._id}
                                            style={[
                                                styles.serviceChip,
                                                (selectedService?.identifier === service.identifier || selectedService?._id === service._id) && styles.serviceChipSelected
                                            ]}
                                            onPress={() => setSelectedService(service)}
                                        >
                                            <Text style={[
                                                styles.serviceChipText,
                                                (selectedService?.identifier === service.identifier || selectedService?._id === service._id) && styles.serviceChipTextSelected
                                            ]}>
                                                {service.name || service.title || service.identifier}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            ) : (
                                <View style={styles.toggleContainer}>
                                    <TouchableOpacity
                                        style={[styles.toggleButton, selectedServiceType === 'Creator' && styles.toggleButtonSelected]}
                                        onPress={() => setSelectedServiceType('Creator')}
                                    >
                                        <Text style={[styles.toggleButtonText, selectedServiceType === 'Creator' && styles.toggleButtonTextSelected]}>
                                            Creator
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.toggleButton, selectedServiceType === 'Influencer' && styles.toggleButtonSelected]}
                                        onPress={() => setSelectedServiceType('Influencer')}
                                    >
                                        <Text style={[styles.toggleButtonText, selectedServiceType === 'Influencer' && styles.toggleButtonTextSelected]}>
                                            Influencer
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </>
                    )}
                </View>

                {/* Service Category Section */}
                <View style={styles.section}>
                    <Text style={styles.inputLabel}>Service Category</Text>
                    <TouchableOpacity style={styles.dropdownContainer} onPress={handleCategoryPress}>
                        <Text style={styles.dropdownText}>{selectedCategory}</Text>
                        <MaterialIcons name="keyboard-arrow-down" size={20} color="#6b7280" />
                    </TouchableOpacity>

                    {showCategoryDropdown && (
                        <View style={styles.dropdownOptions}>
                            {serviceCategories.map((category, index) => (
                                <TouchableOpacity
                                    key={index}
                                    style={styles.dropdownOption}
                                    onPress={() => selectCategory(category)}
                                >
                                    <Text style={styles.dropdownOptionText}>{category}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </View>

                {/* Social Platform Section */}
                <View style={styles.section}>
                    <Text style={styles.inputLabel}>Social Platform</Text>
                    <View style={styles.platformContainer}>
                        {VALID_PLATFORMS.map((platform) => (
                            <TouchableOpacity
                                key={platform}
                                style={[styles.platformButton, selectedPlatform === platform && styles.platformButtonSelected]}
                                onPress={() => setSelectedPlatform(platform)}
                            >
                                <PlatformIcon
                                    platform={platform}
                                    size={20}
                                    color={selectedPlatform === platform ? '#337DEB' : '#6b7280'}
                                />
                                <Text style={[styles.platformButtonText, selectedPlatform === platform && styles.platformButtonTextSelected]}>
                                    {platform.charAt(0).toUpperCase() + platform.slice(1)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Location Section (Required) - Country → State → City from API */}
                <View style={styles.section}>
                    <LocationPicker
                        label="Location *"
                        value={locationObject || { city: '', state: '', country: '' }}
                        onChange={(loc) => {
                            setLocationObject(loc);
                            setLocation([loc.city, loc.state, loc.country].filter(Boolean).join(', '));
                        }}
                        required
                    />
                </View>

                {/* Offer Duration Section */}
                <View style={styles.section}>
                    <Text style={styles.inputLabel}>Offer Duration (Days) *</Text>
                    <TextInput
                        style={styles.textInput}
                        placeholder="30"
                        placeholderTextColor="#9ca3af"
                        value={offerDuration}
                        onChangeText={setOfferDuration}
                        keyboardType="numeric"
                    />
                    <Text style={styles.helperText}>How long content stays visible (1-365 days)</Text>
                </View>

                {/* Rate Section - Dual Currency Side-by-Side */}
                <View style={styles.section}>
                    <Text style={styles.inputLabel}>Rate</Text>
                    <View style={styles.rowContainer}>
                        <View style={styles.halfInputGroup}>
                            <Text style={styles.subLabel}>Price in USD ($)</Text>
                            <View style={styles.prefixInputContainer}>
                                <View style={styles.ratePrefix}>
                                    <Text style={styles.prefixText}>$</Text>
                                </View>
                                <TextInput
                                    style={styles.prefixTextInput}
                                    placeholder="250"
                                    placeholderTextColor="#9ca3af"
                                    value={rates.usd}
                                    onChangeText={(text) => setRates(prev => ({ ...prev, usd: text }))}
                                    keyboardType="numeric"
                                />
                            </View>
                        </View>
                        <View style={styles.halfInputGroup}>
                            <Text style={styles.subLabel}>Price in NGN (₦)</Text>
                            <View style={styles.prefixInputContainer}>
                                <View style={styles.ratePrefix}>
                                    <Text style={styles.prefixText}>₦</Text>
                                </View>
                                <TextInput
                                    style={styles.prefixTextInput}
                                    placeholder="375000"
                                    placeholderTextColor="#9ca3af"
                                    value={rates.ngn}
                                    onChangeText={(text) => setRates(prev => ({ ...prev, ngn: text }))}
                                    keyboardType="numeric"
                                />
                            </View>
                        </View>
                    </View>

                    {/* Negotiable Toggle */}
                    <TouchableOpacity
                        style={styles.checkboxContainer}
                        onPress={() => setIsNegotiable(!isNegotiable)}
                    >
                        <MaterialIcons
                            name={isNegotiable ? "check-box" : "check-box-outline-blank"}
                            size={24}
                            color={isNegotiable ? "#337DEB" : "#9ca3af"}
                        />
                        <Text style={styles.checkboxLabel}>Is Negotiable</Text>
                    </TouchableOpacity>
                </View>

                {/* Delivery, Quantity, Revisions */}
                <View style={styles.section}>
                    <View style={styles.rowContainer}>
                        <View style={[styles.halfInputGroup, { flex: 1 }]}>
                            <Text style={[styles.inputLabel, { minHeight: 40 }]}>Delivery (Days)</Text>
                            <TextInput
                                style={styles.textInput}
                                placeholder="7"
                                placeholderTextColor="#9ca3af"
                                value={delivery}
                                onChangeText={setDelivery}
                                keyboardType="numeric"
                            />
                        </View>
                        <View style={[styles.halfInputGroup, { flex: 1 }]}>
                            <Text style={[styles.inputLabel, { minHeight: 40 }]}>Quantity</Text>
                            <TextInput
                                style={styles.textInput}
                                placeholder="1"
                                placeholderTextColor="#9ca3af"
                                value={quantity}
                                onChangeText={setQuantity}
                                keyboardType="numeric"
                            />
                        </View>
                        <View style={[styles.halfInputGroup, { flex: 1 }]}>
                            <Text style={[styles.inputLabel, { minHeight: 40 }]}>Revisions</Text>
                            <TextInput
                                style={styles.textInput}
                                placeholder="2"
                                placeholderTextColor="#9ca3af"
                                value={revisions}
                                onChangeText={setRevisions}
                                keyboardType="numeric"
                            />
                        </View>
                    </View>
                </View>

                {/* Media Section */}
                <View style={styles.section}>
                    <Text style={styles.inputLabel}>Media (Images/Videos)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaList}>
                        <TouchableOpacity
                            style={styles.addMediaButton}
                            onPress={async () => {
                                const options = {
                                    mediaType: 'mixed',
                                    selectionLimit: 5 - media.length,
                                };
                                const result = await launchImageLibrary(options);
                                if (result.assets) {
                                    setMedia([...media, ...result.assets]);
                                }
                            }}
                        >
                            <MaterialIcons name="add-photo-alternate" size={32} color="#337DEB" />
                            <Text style={styles.addMediaText}>Add Media</Text>
                        </TouchableOpacity>
                        {media.map((item, index) => (
                            <View key={index} style={styles.mediaItem}>
                                <Image
                                    source={{ uri: item.uri || item.url }}
                                    style={styles.mediaThumbnail}
                                />
                                <TouchableOpacity
                                    style={styles.removeMediaButton}
                                    onPress={() => {
                                        const newMedia = [...media];
                                        newMedia.splice(index, 1);
                                        setMedia(newMedia);
                                    }}
                                >
                                    <MaterialIcons name="close" size={16} color="#ffffff" />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </ScrollView>
                </View>

                {/* Description Section */}
                <View style={styles.section}>
                    <Text style={styles.inputLabel}>Description</Text>
                    <View style={styles.prefixInputContainer}>
                        <View style={styles.prefixButton}>
                            <Text style={styles.prefixText}>I will</Text>
                        </View>
                        <TextInput
                            style={[styles.prefixTextInput, styles.textArea]}
                            placeholder="Describe what your offer includes, what the brand will get, etc."
                            placeholderTextColor="#9ca3af"
                            multiline
                            numberOfLines={4}
                            value={description}
                            onChangeText={setDescription}
                        />
                    </View>
                </View>

                {/* Action Buttons */}
                <View style={styles.actionButtonsContainer}>
                    <TouchableOpacity
                        style={styles.saveButton}
                        onPress={handleSaveOffer}
                    >
                        <Text style={styles.saveButtonText}>Save Changes</Text>
                    </TouchableOpacity>

                    {offer.status === 'draft' && (
                        <TouchableOpacity
                            style={styles.publishButton}
                            onPress={handlePublishOffer}
                        >
                            <Text style={styles.publishButtonText}>Publish Offer</Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity
                        style={styles.cancelButton}
                        onPress={() => navigation?.goBack()}
                    >
                        <Text style={styles.cancelText}>Cancel</Text>
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
    },
    section: {
        backgroundColor: '#ffffff',
        marginHorizontal: 16,
        marginTop: 16,
        padding: 20,
        borderRadius: 12,
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
        backgroundColor: '#f9fafb',
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
    textArea: {
        height: 100,
        textAlignVertical: 'top',
    },
    toggleContainer: {
        flexDirection: 'row',
        backgroundColor: '#f3f4f6',
        borderRadius: 8,
        padding: 4,
    },
    toggleButton: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderRadius: 6,
    },
    toggleButtonSelected: {
        backgroundColor: '#337DEB',
    },
    toggleButtonText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#6b7280',
    },
    toggleButtonTextSelected: {
        color: '#ffffff',
    },
    mediaList: {
        flexDirection: 'row',
        marginBottom: 10,
    },
    addMediaButton: {
        width: 100,
        height: 100,
        backgroundColor: '#f3f4f6',
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderStyle: 'dashed',
    },
    addMediaText: {
        fontSize: 12,
        color: '#337DEB',
        marginTop: 4,
    },
    mediaItem: {
        width: 100,
        height: 100,
        marginRight: 10,
        borderRadius: 8,
        overflow: 'hidden',
        position: 'relative',
    },
    mediaThumbnail: {
        width: '100%',
        height: '100%',
    },
    removeMediaButton: {
        position: 'absolute',
        top: 4,
        right: 4,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: 10,
        padding: 2,
    },
    dropdownContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#f9fafb',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 12,
    },
    dropdownText: {
        fontSize: 16,
        color: '#374151',
    },
    dropdownOptions: {
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 8,
        marginTop: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    dropdownOption: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    dropdownOptionText: {
        fontWeight: 'bold',
        color: '#6b7280',
    },
    platformContainer: {
        flexDirection: 'row',
        gap: 8,
        flexWrap: 'wrap',
    },
    platformButton: {
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f9fafb',
        borderWidth: 2,
        borderColor: '#e5e7eb',
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        minWidth: 90,
    },
    platformButtonSelected: {
        backgroundColor: '#eef0ff',
        borderColor: '#337DEB',
    },
    platformButtonText: {
        fontSize: 12,
        color: '#6b7280',
        fontWeight: '600',
        marginTop: 6,
        textAlign: 'center',
    },
    platformButtonTextSelected: {
        color: '#337DEB',
        fontWeight: '700',
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
    helperText: {
        fontSize: 12,
        color: '#6b7280',
        marginTop: 4,
    },
    rowContainer: {
        flexDirection: 'row',
        gap: 12,
    },
    halfInputGroup: {
        flex: 1,
    },
    uploadArea: {
        backgroundColor: '#f9fafb',
        borderWidth: 2,
        borderColor: '#d1d5db',
        borderStyle: 'dashed',
        borderRadius: 8,
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    uploadText: {
        fontSize: 14,
        color: '#374151',
        marginTop: 8,
        fontWeight: '500',
    },
    uploadSubtext: {
        fontSize: 12,
        color: '#6b7280',
        marginTop: 4,
    },
    uploadedMediaContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    uploadedText: {
        fontSize: 14,
        color: '#22c55e',
        marginTop: 8,
        fontWeight: '500',
    },
    uploadedSubtext: {
        fontSize: 12,
        color: '#6b7280',
        marginTop: 4,
    },
    actionButtonsContainer: {
        paddingHorizontal: 16,
        paddingVertical: 24,
        marginBottom: 100,
    },
    saveButton: {
        backgroundColor: '#337DEB',
        borderRadius: 8,
        paddingVertical: 16,
        alignItems: 'center',
        marginBottom: 12,
    },
    saveButtonText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#ffffff',
    },
    servicesContainer: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    serviceChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#f3f4f6',
        marginRight: 8,
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    serviceChipSelected: {
        backgroundColor: '#337DEB',
        borderColor: '#337DEB',
    },
    serviceChipText: {
        fontSize: 14,
        color: '#6b7280',
        fontWeight: '500',
    },
    serviceChipTextSelected: {
        color: '#ffffff',
    },
    publishButton: {
        backgroundColor: '#10B981', // Green for publish
        borderRadius: 8,
        paddingVertical: 16,
        alignItems: 'center',
        marginBottom: 12,
    },
    publishButtonText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#ffffff',
    },
    cancelButton: {
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 8,
        borderRadius: 25,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        backgroundColor: '#fff',
    },
    cancelText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#6b7280',
    },
    labelWithCurrency: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    ratePrefix: {
        backgroundColor: '#f3f4f6',
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderRightWidth: 1,
        borderRightColor: '#e5e7eb',
        width: 45,
        alignItems: 'center',
        justifyContent: 'center',
    },
    subLabel: {
        fontSize: 12,
        color: '#6b7280',
        marginBottom: 8,
    },
    checkboxContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
    },
    checkboxLabel: {
        marginLeft: 8,
        fontSize: 14,
        color: '#374151',
        fontWeight: '500',
    },
});

export default EditOffer;
