import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Image, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMetadata } from '../context/MetadataContext';
import { uploadImage, uploadImages } from '../services/upload';
import { useAuth } from '../hooks/useAuth';
import { getApiBaseUrl } from '../services/api';
import { updateProfile } from '../services/user';
import { createPortfolioItem } from '../services/portfolio';
import logger from '../utils/logger';
import { mapCategoryToUserProfile, mapBackendCategoryToUI } from '../utils/apiConstants';
import { useUIStore } from '../store/useStore';

// Import image picker - handle both ES6 and CommonJS
let launchCamera, launchImageLibrary;
try {
    const ImagePicker = require('react-native-image-picker');
    launchCamera = ImagePicker.launchCamera || ImagePicker.default?.launchCamera;
    launchImageLibrary = ImagePicker.launchImageLibrary || ImagePicker.default?.launchImageLibrary;

    // Fallback if still not found
    if (!launchCamera || !launchImageLibrary) {
        console.warn('Image picker not properly loaded, using fallback');
        launchCamera = () => {};
        launchImageLibrary = () => {};
    }
} catch (error) {
    console.error('Error importing image picker:', error);
    launchCamera = () => {};
    launchImageLibrary = () => {};
}

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

const CreatorDetailsSetup = ({ navigation, route }) => {
    const primaryRole = route?.params?.primaryRole || 'Creator';
    const roleId = route?.params?.roleId || '';
    const ui = (useUIStore && typeof useUIStore === 'function') ? useUIStore() : { showToast: () => {} };
    const showToast = ui.showToast || (() => {});

    const [currentStep, setCurrentStep] = useState(1);
    const totalSteps = 6;

    const { categories: dynamicCategories, loading: metadataLoading } = useMetadata();

    // Form data
    const [category, setCategory] = useState(null);
    const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
    const [gender, setGender] = useState(null);
    const [profilePicture, setProfilePicture] = useState(null);
    const [portfolio, setPortfolio] = useState(null);
    const [portfolioUrls, setPortfolioUrls] = useState([]);
    const [uploadingPortfolio, setUploadingPortfolio] = useState(false);
    const [uploadingProfilePicture, setUploadingProfilePicture] = useState(false);
    const [completing, setCompleting] = useState(false);

    const { user } = useAuth();

    // Helper to resolve image and media URLs
    const resolveImageUrl = (data) => {
        if (!data) return null;

        // Handle object inputs (extract URL/URI from potential wrapper objects)
        let url = data;
        if (typeof data === 'object' && data !== null) {
            // Prioritize common URL fields
            url = data.url || data.uri || data.mediaUrl || data.secure_url ||
                (data.media && Array.isArray(data.media) && data.media[0]?.url) ||
                (data.data && data.data.url) || data;
        }

        if (typeof url !== 'string' || !url.trim()) return null;
        url = url.trim();

        // 1. Absolute Web URLs
        if (url.startsWith('http://') || url.startsWith('https://')) return url;

        // 2. Protocol-relative URLs (e.g., //res.cloudinary.com/...)
        if (url.startsWith('//')) return `https:${url}`;

        // 3. Local assets (file:// or content://)
        if (url.startsWith('file://') || url.startsWith('content://') || url.startsWith('data:')) return url;

        // 4. Fallback for relative paths - construct using API base
        // Remove leading slash if present for consistency
        const cleanPath = url.startsWith('/') ? url.slice(1) : url;

        // Get API base URL and remove '/api' if it's there for asset resolution
        const apiBase = (typeof getApiBaseUrl === 'function' ? getApiBaseUrl() : 'https://adpartnr.onrender.com/api').replace(/\/api\/?$/, '');

        // Construct final URL
        return `${apiBase}/${cleanPath}`;
    };

    const [categoryOptions, setCategoryOptions] = useState([]);



    // Set default category when dynamic categories are loaded
    useEffect(() => {
        const loadCategories = async () => {
            try {
                // 1. Try dynamic categories from MetadataContext first
                let rawList = dynamicCategories || [];

                // 2. If metadata context is empty, try the categories service directly
                if (rawList.length === 0) {
                    try {
                        const categoriesService = await import('../services/categories');
                        const apiCategories = await categoriesService.getCategories();
                        if (Array.isArray(apiCategories) && apiCategories.length > 0) {
                            rawList = apiCategories;
                        }
                    } catch (e) {
                        console.warn('[CreatorDetailsSetup] Failed to fetch from categories service', e);
                    }
                }

                // 3. Fallback list if everything else fails
                if (rawList.length === 0) {
                    rawList = [
                        'Fashion', 'Beauty', 'Tech', 'Food', 'Lifestyle',
                        'Travel', 'Fitness', 'Gaming', 'Art', 'Entertainment', 'Others'
                    ];
                }

                // 4. Process into a consistent { value, label } format
                const processedCategories = rawList.map(c => {
                    if (typeof c === 'object' && c !== null) {
                        const val = c.value || c.id;
                        const lab = c.label || c.name;
                        return {
                            value: val || mapCategoryToUserProfile(lab),
                            label: lab || mapBackendCategoryToUI(val)
                        };
                    }
                    // Handle string input
                    return {
                        value: mapCategoryToUserProfile(c),
                        label: c
                    };
                });

                // Deduplicate by value
                const uniqueCategories = [];
                const seenValues = new Set();
                processedCategories.forEach(c => {
                    if (!seenValues.has(c.value)) {
                        seenValues.add(c.value);
                        uniqueCategories.push(c);
                    }
                });

                setCategoryOptions(uniqueCategories);

                // Set initial selection if not already set
                if (uniqueCategories.length > 0 && !category) {
                    setCategory(uniqueCategories[0]);
                }
            } catch (err) {
                console.error('[CreatorDetailsSetup] Error loading categories:', err);
            }
        };

        loadCategories();
    }, [dynamicCategories]);



    const genderOptions = [
        { id: 'male', name: 'Male', icon: 'male' },
        { id: 'female', name: 'Female', icon: 'female' },
        { id: 'other', name: 'Other', icon: 'transgender' },
        { id: 'prefer_not_to_say', name: 'Prefer not to say', icon: 'help-outline' },
    ];

    const [socialInputs, setSocialInputs] = useState({
        instagram: '',
        facebook: '',
        tiktok: '',
        twitter: ''
    });
    const [socialResults, setSocialResults] = useState({
        instagram: { count: null, verified: false, engagement: null, handle: '' },
        facebook: { count: null, verified: false, engagement: null, handle: '' },
        tiktok: { count: null, verified: false, engagement: null, handle: '' },
        twitter: { count: null, verified: false, engagement: null, handle: '' }
    });
    const [socialLoading, setSocialLoading] = useState({
        instagram: false,
        facebook: false,
        tiktok: false,
        twitter: false
    });

    const formatFollowerCount = (n) => {
        if (!n || isNaN(n)) return '0';
        if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
        if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
        return String(n);
    };

    const submitSocial = async (platform) => {
        const value = socialInputs[platform] || '';
        if (!value.trim()) return;
        try {
            setSocialLoading(prev => ({ ...prev, [platform]: true }));
            const socialService = await import('../services/social');

            // Call the new scraper API with positional arguments
            const response = await socialService.scrapeFollowers(platform, value);

            if (response.success && response.data) {
                const count = response.data.followers_count ?? null;
                const verified = !!response.data.verified;
                const engagement = response.data.engagement_rate ?? null;
                const username = response.data.username || value;

                // Save to database immediately (socialAccounts object)
                await socialService.updateSocialMedia({
                    platform,
                    username,
                    followers: count || 0,
                    engagement: engagement || 0,
                    verified
                });

                setSocialResults(prev => ({
                    ...prev,
                    [platform]: {
                        count,
                        verified,
                        engagement,
                        handle: username
                    }
                }));

                // Sync the input if backend returned a cleaned username
                if (username && username !== value) {
                    setSocialInputs(prev => ({ ...prev, [platform]: username }));
                }
            }
        } catch (e) {
            showToast(e?.message || 'Unable to fetch social metrics', 'error');
        } finally {
            setSocialLoading(prev => ({ ...prev, [platform]: false }));
        }
    };

    const handleNext = () => {
        if (currentStep < totalSteps) {
            setCurrentStep(currentStep + 1);
        } else {
            handleComplete();
        }
    };

    const handleBack = () => {
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1);
        }
    };

    const handleSkip = () => {
        if (currentStep === 3 || currentStep === 4 || currentStep === 5) {
            handleNext();
        }
    };

    const handleComplete = async () => {
        try {
            setCompleting(true);
            logger.info('[CreatorDetailsSetup] Completing setup for user:', user?.id || user?._id);

            // 1. Prepare profile data
            const profileData = {
                name: user?.name,
                creatorRole: roleId || (primaryRole === 'Influencer' ? 'influencer' : 'creator'),
                categories: category ? [category.value || category] : [],
                gender,
                // Include social identifiers (usernames) in socialMedia object
                socialMedia: {
                    instagram: socialResults.instagram.handle || socialInputs.instagram || '',
                    tiktok: socialResults.tiktok.handle || socialInputs.tiktok || '',
                    twitter: socialResults.twitter.handle || socialInputs.twitter || '',
                    facebook: socialResults.facebook.handle || socialInputs.facebook || '',
                    youtube: socialInputs.youtube || ''
                }
            };

            // Add profile image if uploaded (ensure it's the remote URL)
            if (profilePicture && profilePicture.uri && (profilePicture.uri.startsWith('http') || !profilePicture.isLocal)) {
                profileData.profileImage = profilePicture.uri;
            }

            // 2. Update profile on backend
            // This ensures the profile document is correctly initialized/updated
            const profileResponse = await updateProfile(profileData);

            if (!profileResponse || !profileResponse.success) {
                throw new Error(profileResponse?.message || 'Failed to update profile');
            }

            // 3. Save portfolio items if any
            if (portfolioUrls.length > 0) {
                logger.info('[CreatorDetailsSetup] Saving portfolio items:', portfolioUrls.length);
                const portfolioPromises = portfolioUrls.map(url => {
                    const isVideo = url && /\.(mp4|webm|mov)(\?|$)/i.test(url);
                    return createPortfolioItem({
                        type: isVideo ? 'video' : 'photo',
                        url,
                        title: 'Portfolio Item',
                        isPublic: true
                    });
                }
                );
                // Run in parallel but wait for completion
                await Promise.allSettled(portfolioPromises);
            }

            const creatorData = {
                primaryRole,
                roleId,
                category,
                gender,
                profilePicture,
                portfolio: portfolioUrls,
            };

            logger.info('[CreatorDetailsSetup] Setup complete, navigating to CreateFirstOffer');
            navigation?.navigate('CreateFirstOffer', { creatorData });
        } catch (error) {
            logger.error('[CreatorDetailsSetup] Error completing setup:', error);
            // Check for the specific duplicate key error 
            if (error?.data?.message?.includes('E11000') || error?.message?.includes('duplicate key')) {
                logger.warn('[CreatorDetailsSetup] Profile already exists (duplicate key), proceeding anyway');
                navigation?.navigate('CreateFirstOffer', {
                    creatorData: {
                        primaryRole,
                        roleId,
                        category,
                        gender,
                        profilePicture,
                        portfolio: portfolioUrls,
                    }
                });
            } else {
                showToast(error.message || 'Failed to finish setup. Please try again.', 'error');
            }
        } finally {
            setCompleting(false);
        }
    };

    const [showImageSourceModal, setShowImageSourceModal] = useState(false);
    const [imageSourceType, setImageSourceType] = useState('profile'); // 'profile' | 'portfolio'

    const handleUploadProfilePicture = () => {
        setImageSourceType('profile');
        setShowImageSourceModal(true);
    };

    const runProfilePictureFromCamera = async () => {
        setShowImageSourceModal(false);
        try {
            const result = await launchCamera({ mediaType: 'photo', quality: 0.8, includeBase64: false });
            if (result.assets && result.assets[0]) {
                setProfilePicture({ uri: result.assets[0].uri, isLocal: true });
                setUploadingProfilePicture(true);
                await uploadProfilePictureImage(result.assets[0]);
            }
        } catch (error) {
            console.error('Camera error:', error);
            showToast('Failed to open camera', 'error');
        } finally {
            setUploadingProfilePicture(false);
        }
    };

    const runProfilePictureFromGallery = async () => {
        setShowImageSourceModal(false);
        try {
            const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.8, includeBase64: false });
            if (result.assets && result.assets[0]) {
                setProfilePicture({ uri: result.assets[0].uri, isLocal: true });
                setUploadingProfilePicture(true);
                await uploadProfilePictureImage(result.assets[0]);
            }
        } catch (error) {
            console.error('Gallery error:', error);
            showToast('Failed to open gallery', 'error');
        } finally {
            setUploadingProfilePicture(false);
        }
    };

    const uploadProfilePictureImage = async (asset) => {
        try {
            const file = {
                uri: asset.uri,
                type: asset.type || 'image/jpeg',
                name: asset.fileName || `profile_${Date.now()}.jpg`,
            };

            const uploadResult = await uploadImage(file);

            if (uploadResult && uploadResult.data && uploadResult.data.url) {
                const imageUrl = uploadResult.data.url;
                setProfilePicture({ uri: imageUrl, fileName: file.name, type: file.type });
                showToast('Profile picture uploaded successfully', 'success');
            } else {
                throw new Error('Upload failed - no URL returned');
            }
        } catch (error) {
            console.error('Upload error:', error);
            showToast(error.message || 'Failed to upload profile picture. Please try again.', 'error');
        }
    };

    const handleUploadPortfolio = () => {
        setImageSourceType('portfolio');
        setShowImageSourceModal(true);
    };

    const runPortfolioFromCamera = async () => {
        setShowImageSourceModal(false);
        try {
            setUploadingPortfolio(true);
            const result = await launchCamera({ mediaType: 'photo', quality: 0.8, includeBase64: false });
            if (result.assets && result.assets[0]) {
                await uploadPortfolioImage(result.assets[0]);
            }
        } catch (error) {
            console.error('Camera error:', error);
            showToast('Failed to open camera', 'error');
        } finally {
            setUploadingPortfolio(false);
        }
    };

    const runPortfolioFromGallery = async () => {
        setShowImageSourceModal(false);
        try {
            setUploadingPortfolio(true);
            const result = await launchImageLibrary({
                mediaType: 'mixed',
                quality: 0.8,
                selectionLimit: 10,
                includeBase64: false,
            });
            if (result.assets && result.assets.length > 0) {
                if (result.assets.length === 1) {
                    await uploadPortfolioImage(result.assets[0]);
                } else {
                    await uploadPortfolioImages(result.assets);
                }
            }
        } catch (error) {
            console.error('Gallery error:', error);
            showToast('Failed to open gallery', 'error');
        } finally {
            setUploadingPortfolio(false);
        }
    };

    const uploadPortfolioImage = async (asset) => {
        try {
            const isVideo = asset.type?.startsWith('video/') || asset.uri?.toLowerCase().endsWith('.mp4');
            // Client-side guard: limit video duration to 60 seconds if duration available
            if (isVideo && typeof asset.duration === 'number' && asset.duration > 60) {
                showToast('Please upload a video that is 60 seconds or less.', 'warning');
                return;
            }
            const file = {
                uri: asset.uri,
                type: asset.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
                name: asset.fileName || `portfolio_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`,
            };

            let uploadResult;
            if (isVideo) {
                const { uploadVideo } = await import('../services/upload');
                uploadResult = await uploadVideo(file);
            } else {
                uploadResult = await uploadImage(file);
            }

            if (uploadResult && uploadResult.data && uploadResult.data.url) {
                const imageUrl = uploadResult.data.url;
                setPortfolio({ uri: imageUrl, fileName: file.name, type: file.type });
                setPortfolioUrls(prev => [...prev, imageUrl]);
                showToast(`Portfolio ${isVideo ? 'video' : 'image'} uploaded successfully`, 'success');
            } else {
                throw new Error('Upload failed - no URL returned');
            }
        } catch (error) {
            console.error('Upload error:', error);
            showToast(error.message || `Failed to upload portfolio ${isVideo ? 'video' : 'image'}. Please try again.`, 'error');
        }
    };

    const uploadPortfolioImages = async (assets) => {
        try {
            const files = assets.map(asset => ({
                uri: asset.uri,
                type: asset.type || 'image/jpeg',
                name: asset.fileName || `portfolio_${Date.now()}.jpg`,
            }));

            const uploadResult = await uploadImages(files);

            if (uploadResult && uploadResult.data) {
                const urls = uploadResult.data.urls || [uploadResult.data.url].filter(Boolean);
                setPortfolioUrls(prev => [...prev, ...urls]);
                setPortfolio({ uri: urls[0], fileName: files[0].name, type: files[0].type });
                showToast(`Successfully uploaded ${urls.length} portfolio image${urls.length > 1 ? 's' : ''}`, 'success');
            } else {
                throw new Error('Upload failed - no URLs returned');
            }
        } catch (error) {
            console.error('Upload error:', error);
            showToast(error.message || 'Failed to upload portfolio images. Please try again.', 'error');
        }
    };

    const getProgressPercentage = () => {
        return `${(currentStep / totalSteps) * 100}%`;
    };

    const canProceed = () => {
        switch (currentStep) {
            case 1: return category !== null;
            case 2: return gender !== null;
            case 3: return true; // Profile picture is skippable
            case 4: return true; // Social handles step is optional
            case 5: return true; // Portfolio is skippable
            case 6: return true; // Final review step
            default: return false;
        }
    };

    const renderStepContent = () => {
        switch (currentStep) {
            case 1:
                return (
                    <View style={styles.stepContent}>
                        <Text style={styles.stepTitle}>Choose Your Category</Text>
                        <Text style={styles.stepSubtitle}>Select the category that best fits your services</Text>

                        {metadataLoading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="small" color="#337DEB" />
                                <Text style={styles.loadingText}>Loading categories...</Text>
                            </View>
                        ) : (
                            <>
                                <TouchableOpacity
                                    style={styles.dropdownContainer}
                                    onPress={() => setShowCategoryDropdown(!showCategoryDropdown)}
                                >
                                    <Text style={styles.dropdownText}>
                                        {category?.label || (typeof category === 'string' ? category : 'Select a category')}
                                    </Text>
                                    <MaterialIcons name="keyboard-arrow-down" size={20} color="#6b7280" />
                                </TouchableOpacity>

                                {showCategoryDropdown && (
                                    <View style={styles.dropdownOptions}>
                                        <ScrollView nestedScrollEnabled style={{ maxHeight: 250 }}>
                                            {categoryOptions.length === 0 ? (
                                                <TouchableOpacity style={styles.dropdownOption}>
                                                    <Text style={[styles.dropdownOptionText, { color: '#9ca3af' }]}>No categories available</Text>
                                                </TouchableOpacity>
                                            ) : (
                                                categoryOptions.map((cat, index) => (
                                                    <TouchableOpacity
                                                        key={index}
                                                        style={styles.dropdownOption}
                                                        onPress={() => {
                                                            setCategory(cat);
                                                            setShowCategoryDropdown(false);
                                                        }}
                                                    >
                                                        <Text style={styles.dropdownOptionText}>{cat.label || cat}</Text>
                                                        {(category?.value === cat.value || category === cat) && (
                                                            <MaterialIcons name="check" size={20} color="#337DEB" />
                                                        )}
                                                    </TouchableOpacity>
                                                ))
                                            )}
                                        </ScrollView>
                                    </View>
                                )}
                            </>
                        )}
                    </View>
                );

            case 2:
                return (
                    <View style={styles.stepContent}>
                        <Text style={styles.stepTitle}>What's Your Gender?</Text>
                        <Text style={styles.stepSubtitle}>This helps us personalize your experience</Text>

                        <View style={styles.genderGrid}>
                            {genderOptions.map((option) => (
                                <TouchableOpacity
                                    key={option.id}
                                    style={[
                                        styles.genderCard,
                                        gender === option.id && styles.genderCardSelected
                                    ]}
                                    onPress={() => setGender(option.id)}
                                >
                                    <MaterialIcons
                                        name={option.icon}
                                        size={32}
                                        color={gender === option.id ? '#337DEB' : '#6b7280'}
                                    />
                                    <Text style={[
                                        styles.genderText,
                                        gender === option.id && styles.genderTextSelected
                                    ]}>
                                        {option.name}
                                    </Text>
                                    {gender === option.id && (
                                        <View style={styles.checkmark}>
                                            <MaterialIcons name="check-circle" size={20} color="#337DEB" />
                                        </View>
                                    )}
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                );

            case 3:
                return (
                    <View style={styles.stepContent}>
                        <Text style={styles.stepTitle}>Upload Profile Picture</Text>
                        <Text style={styles.stepSubtitle}>Add a photo to personalize your profile</Text>

                        <TouchableOpacity
                            style={styles.uploadArea}
                            onPress={handleUploadProfilePicture}
                            disabled={uploadingProfilePicture}
                        >
                            {profilePicture ? (
                                <View style={styles.uploadedContainer}>
                                    <View style={styles.profileImageWrapper}>
                                        <Image
                                            source={{ uri: resolveImageUrl(profilePicture.uri) }}
                                            style={styles.uploadedImage}
                                        />
                                        {uploadingProfilePicture && (
                                            <View style={styles.imageOverlay}>
                                                <ActivityIndicator size="small" color="#FFFFFF" />
                                            </View>
                                        )}
                                    </View>
                                    {!uploadingProfilePicture && (
                                        <MaterialIcons name="check-circle" size={32} color="#22c55e" style={styles.checkIcon} />
                                    )}
                                    <Text style={[styles.uploadedText, uploadingProfilePicture && { color: '#6b7280' }]}>
                                        {uploadingProfilePicture ? 'Uploading...' : 'Profile picture uploaded!'}
                                    </Text>
                                    <Text style={styles.uploadedSubtext}>Tap to change</Text>
                                </View>
                            ) : (
                                <View style={styles.uploadPlaceholder}>
                                    {uploadingProfilePicture ? (
                                        <ActivityIndicator size="large" color="#337DEB" />
                                    ) : (
                                        <MaterialIcons name="account-circle" size={80} color="#cbd5e1" />
                                    )}
                                    <Text style={styles.uploadText}>
                                        {uploadingProfilePicture ? 'Uploading...' : 'Tap to upload photo'}
                                    </Text>
                                    <Text style={styles.uploadSubtext}>Camera or Gallery</Text>
                                </View>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
                            <Text style={styles.skipButtonText}>Skip - Use default avatar</Text>
                        </TouchableOpacity>
                    </View>
                );

            case 4:
                return (
                    <View style={styles.stepContent}>
                        <Text style={styles.stepTitle}>Add Your Social Handles (Optional)</Text>
                        <Text style={styles.stepSubtitle}>We’ll estimate your follower count. You can verify later for accurate stats.</Text>

                        <View style={styles.socialField}>
                            <View style={styles.socialLabelRow}>
                                <MaterialIcons name="photo-camera" size={20} color="#6b7280" />
                                <Text style={styles.socialLabelText}>Instagram username</Text>
                            </View>
                            <View style={styles.socialInputRow}>
                                <TextInput
                                    style={styles.socialTextInput}
                                    placeholder="@username"
                                    placeholderTextColor="#9ca3af"
                                    value={socialInputs.instagram}
                                    onChangeText={(t) => setSocialInputs(prev => ({ ...prev, instagram: t }))}
                                />
                                <TouchableOpacity
                                    style={[styles.socialSubmitButton, socialLoading.instagram && styles.socialSubmitButtonDisabled]}
                                    onPress={() => submitSocial('instagram')}
                                    disabled={socialLoading.instagram}
                                >
                                    {socialLoading.instagram ? (
                                        <ActivityIndicator size="small" color="#ffffff" />
                                    ) : (
                                        <Text style={styles.socialSubmitText}>Submit</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                            {socialResults.instagram.count != null && (
                                <Text style={styles.socialResultText}>
                                    {formatFollowerCount(socialResults.instagram.count)} {socialResults.instagram.verified ? '(verified)' : '(estimated)'}
                                </Text>
                            )}
                        </View>

                        <View style={styles.socialField}>
                            <View style={styles.socialLabelRow}>
                                <MaterialIcons name="language" size={20} color="#6b7280" />
                                <Text style={styles.socialLabelText}>Facebook page/profile URL</Text>
                            </View>
                            <View style={styles.socialInputRow}>
                                <TextInput
                                    style={styles.socialTextInput}
                                    placeholder="https://www.facebook.com/yourpage"
                                    placeholderTextColor="#9ca3af"
                                    value={socialInputs.facebook}
                                    onChangeText={(t) => setSocialInputs(prev => ({ ...prev, facebook: t }))}
                                />
                                <TouchableOpacity
                                    style={[styles.socialSubmitButton, socialLoading.facebook && styles.socialSubmitButtonDisabled]}
                                    onPress={() => submitSocial('facebook')}
                                    disabled={socialLoading.facebook}
                                >
                                    {socialLoading.facebook ? (
                                        <ActivityIndicator size="small" color="#ffffff" />
                                    ) : (
                                        <Text style={styles.socialSubmitText}>Submit</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                            {socialResults.facebook.count != null && (
                                <Text style={styles.socialResultText}>
                                    {formatFollowerCount(socialResults.facebook.count)} {socialResults.facebook.verified ? '(verified)' : '(estimated)'}
                                </Text>
                            )}
                        </View>

                        <View style={styles.socialField}>
                            <View style={styles.socialLabelRow}>
                                <MaterialIcons name="music-note" size={20} color="#6b7280" />
                                <Text style={styles.socialLabelText}>TikTok username</Text>
                            </View>
                            <View style={styles.socialInputRow}>
                                <TextInput
                                    style={styles.socialTextInput}
                                    placeholder="@username"
                                    placeholderTextColor="#9ca3af"
                                    value={socialInputs.tiktok}
                                    onChangeText={(t) => setSocialInputs(prev => ({ ...prev, tiktok: t }))}
                                />
                                <TouchableOpacity
                                    style={[styles.socialSubmitButton, socialLoading.tiktok && styles.socialSubmitButtonDisabled]}
                                    onPress={() => submitSocial('tiktok')}
                                    disabled={socialLoading.tiktok}
                                >
                                    {socialLoading.tiktok ? (
                                        <ActivityIndicator size="small" color="#ffffff" />
                                    ) : (
                                        <Text style={styles.socialSubmitText}>Submit</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                            {socialResults.tiktok.count != null && (
                                <Text style={styles.socialResultText}>
                                    {formatFollowerCount(socialResults.tiktok.count)} {socialResults.tiktok.verified ? '(verified)' : '(estimated)'}
                                    {socialResults.tiktok.engagement ? ` • ${(socialResults.tiktok.engagement * 100).toFixed(2)}% engagement` : ''}
                                </Text>
                            )}
                        </View>

                        <View style={styles.socialField}>
                            <View style={styles.socialLabelRow}>
                                <MaterialIcons name="tag" size={20} color="#6b7280" />
                                <Text style={styles.socialLabelText}>Twitter (X) username</Text>
                            </View>
                            <View style={styles.socialInputRow}>
                                <TextInput
                                    style={styles.socialTextInput}
                                    placeholder="@username"
                                    placeholderTextColor="#9ca3af"
                                    value={socialInputs.twitter}
                                    onChangeText={(t) => setSocialInputs(prev => ({ ...prev, twitter: t }))}
                                />
                                <TouchableOpacity
                                    style={[styles.socialSubmitButton, socialLoading.twitter && styles.socialSubmitButtonDisabled]}
                                    onPress={() => submitSocial('twitter')}
                                    disabled={socialLoading.twitter}
                                >
                                    {socialLoading.twitter ? (
                                        <ActivityIndicator size="small" color="#ffffff" />
                                    ) : (
                                        <Text style={styles.socialSubmitText}>Submit</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                            {socialResults.twitter.count != null && (
                                <Text style={styles.socialResultText}>
                                    {formatFollowerCount(socialResults.twitter.count)} {socialResults.twitter.verified ? '(verified)' : '(estimated)'}
                                </Text>
                            )}
                        </View>

                        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
                            <Text style={styles.skipButtonText}>Skip for now</Text>
                        </TouchableOpacity>
                    </View>
                );

            case 5:
                return (
                    <View style={styles.stepContent}>
                        <Text style={styles.stepTitle}>Upload Your First Portfolio Item</Text>
                        <Text style={styles.stepSubtitle}>Showcase your work to attract brands</Text>

                        <TouchableOpacity
                            style={styles.uploadArea}
                            onPress={handleUploadPortfolio}
                            disabled={uploadingPortfolio}
                        >
                            {uploadingPortfolio ? (
                                <View style={styles.uploadPlaceholder}>
                                    <ActivityIndicator size="large" color="#337DEB" />
                                    <Text style={styles.uploadText}>Uploading...</Text>
                                </View>
                            ) : portfolioUrls.length > 0 ? (
                                <View style={styles.portfolioUploadedContainer}>
                                    <View style={styles.portfolioPreviewWrapper}>
                                        <ScrollView
                                            horizontal
                                            showsHorizontalScrollIndicator={false}
                                            contentContainerStyle={styles.portfolioPreviewList}
                                        >
                                            {portfolioUrls.map((url, idx) => (
                                                <Image
                                                    key={idx}
                                                    source={{ uri: resolveImageUrl(url) }}
                                                    style={[styles.portfolioPreviewImage, { backgroundColor: '#F3F4F6' }]}
                                                    resizeMode="cover"
                                                    onError={(e) => console.log(`[CreatorDetailsSetup] Portfolio preview load error for URL: ${url}`, e.nativeEvent.error)}
                                                />
                                            ))}
                                        </ScrollView>
                                        <View style={styles.portfolioCheckBadge}>
                                            <MaterialIcons name="check-circle" size={24} color="#22c55e" />
                                        </View>
                                    </View>
                                    <View style={styles.successMessageContainer}>
                                        <Text style={styles.uploadedText}>
                                            {portfolioUrls.length} portfolio item{portfolioUrls.length > 1 ? 's' : ''} uploaded!
                                        </Text>
                                        <Text style={styles.uploadedSubtext}>Tap to add more</Text>
                                    </View>
                                </View>
                            ) : (
                                <View style={styles.uploadPlaceholder}>
                                    <MaterialIcons name="collections" size={80} color="#cbd5e1" />
                                    <Text style={styles.uploadText}>Tap to upload</Text>
                                    <Text style={styles.uploadSubtext}>Camera or Gallery</Text>
                                    <Text style={[styles.uploadSubtext, { marginTop: 6 }]}>Max video length: 60 seconds</Text>
                                </View>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
                            <Text style={styles.skipButtonText}>Skip - Add later from profile</Text>
                        </TouchableOpacity>
                    </View>
                );

            case 6:
                return (
                    <View style={styles.stepContent}>
                        <View style={styles.summaryContainer}>
                            <MaterialIcons name="check-circle" size={64} color="#22c55e" />
                            <Text style={styles.summaryTitle}>Almost Done!</Text>
                            <Text style={styles.summarySubtitle}>
                                Your profile is set up. Next, you can create your first offer or skip to dashboard.
                            </Text>

                            <View style={styles.summaryDetails}>
                                <View style={styles.summaryItem}>
                                    <MaterialIcons name="work" size={20} color="#337DEB" />
                                    <Text style={styles.summaryItemText}>{primaryRole}</Text>
                                </View>
                                <View style={styles.summaryItem}>
                                    <MaterialIcons name="category" size={20} color="#337DEB" />
                                    <Text style={styles.summaryItemText}>
                                        {category?.label || (typeof category === 'string' ? category : 'None')}
                                    </Text>
                                </View>
                                {gender && (
                                    <View style={styles.summaryItem}>
                                        <MaterialIcons name="person" size={20} color="#337DEB" />
                                        <Text style={styles.summaryItemText}>
                                            {genderOptions.find(g => g.id === gender)?.name}
                                        </Text>
                                    </View>
                                )}

                            </View>
                        </View>
                    </View>
                );

            default:
                return null;
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                {/* Header */}
                <View style={styles.header}>
                    {currentStep > 1 && (
                        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                            <MaterialIcons name="arrow-back" size={24} color="#2d3748" />
                        </TouchableOpacity>
                    )}
                    <Text style={styles.headerTitle}>Complete Your Profile</Text>
                    <View style={styles.headerSpacer} />
                </View>

                {/* Progress Bar */}
                <View style={styles.progressContainer}>
                    <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: getProgressPercentage() }]} />
                    </View>
                    <Text style={styles.progressText}>Step {currentStep} of {totalSteps}</Text>
                </View>

                {/* Step Content */}
                {renderStepContent()}

                {/* Navigation Buttons */}
                <View style={styles.buttonContainer}>
                    <TouchableOpacity
                        style={[
                            styles.continueButton,
                            (!canProceed() || completing) && styles.continueButtonDisabled
                        ]}
                        onPress={handleNext}
                        disabled={!canProceed() || completing}
                    >
                        {completing ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                            <>
                                <Text style={styles.continueButtonText}>
                                    {currentStep === totalSteps ? 'Complete Setup' : 'Continue'}
                                </Text>
                                <MaterialIcons name="arrow-forward" size={20} color="#ffffff" />
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </ScrollView>

            <Modal visible={showImageSourceModal} transparent animationType="fade">
                <TouchableOpacity
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}
                    activeOpacity={1}
                    onPress={() => setShowImageSourceModal(false)}
                >
                    <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 20 }}>
                        <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 16, color: '#2d3748' }}>
                            {imageSourceType === 'profile' ? 'Upload Profile Picture' : 'Upload Portfolio'}
                        </Text>
                        <TouchableOpacity
                            style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}
                            onPress={imageSourceType === 'profile' ? runProfilePictureFromCamera : runPortfolioFromCamera}
                        >
                            <Text style={{ fontSize: 16, color: '#337DEB' }}>Take Photo</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}
                            onPress={imageSourceType === 'profile' ? runProfilePictureFromGallery : runPortfolioFromGallery}
                        >
                            <Text style={{ fontSize: 16, color: '#337DEB' }}>Choose from Gallery</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={{ paddingVertical: 14, marginTop: 8 }}
                            onPress={() => setShowImageSourceModal(false)}
                        >
                            <Text style={{ fontSize: 16, color: '#6b7280' }}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>
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
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 16,
        backgroundColor: '#ffffff',
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#2d3748',
    },
    headerSpacer: {
        width: 32,
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
        backgroundColor: '#337DEB',
        borderRadius: 3,
    },
    progressText: {
        fontSize: 12,
        color: '#6b7280',
        textAlign: 'center',
    },
    stepContent: {
        paddingHorizontal: 20,
        paddingTop: 8,
    },
    stepTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#2d3748',
        marginBottom: 8,
    },
    stepSubtitle: {
        fontSize: 16,
        color: '#6b7280',
        marginBottom: 24,
        lineHeight: 22,
    },
    dropdownContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 14,
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
        marginTop: 8,
        maxHeight: 300,
        overflow: 'hidden',
        zIndex: 1000,
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
    },
    dropdownOptionsContainer: {
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 8,
        marginTop: 4,
        maxHeight: 250,
        overflow: 'hidden',
        zIndex: 1000,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    dropdownOption: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    dropdownOptionText: {
        fontSize: 15,
        color: '#374151',
    },
    inputGroup: {
        marginBottom: 16,
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#2d3748',
        marginBottom: 8,
    },
    textInput: {
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 16,
        color: '#374151',
    },
    genderGrid: {
        gap: 12,
    },
    genderCard: {
        backgroundColor: '#ffffff',
        borderRadius: 12,
        padding: 20,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#e5e7eb',
        position: 'relative',
    },
    genderCardSelected: {
        borderColor: '#337DEB',
        backgroundColor: '#f0f4ff',
    },
    genderText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#2d3748',
        marginLeft: 16,
        flex: 1,
    },
    genderTextSelected: {
        color: '#337DEB',
    },
    checkmark: {
        position: 'absolute',
        top: 12,
        right: 12,
    },
    uploadArea: {
        backgroundColor: '#ffffff',
        borderWidth: 2,
        borderColor: '#d1d5db',
        borderStyle: 'dashed',
        borderRadius: 12,
        padding: 40,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 200,
    },
    uploadPlaceholder: {
        alignItems: 'center',
    },
    uploadText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#374151',
        marginTop: 16,
    },
    uploadSubtext: {
        fontSize: 14,
        color: '#6b7280',
        marginTop: 4,
    },
    uploadedContainer: {
        alignItems: 'center',
        position: 'relative',
    },
    uploadedImage: {
        width: 150,
        height: 150,
        borderRadius: 75,
        marginBottom: 12,
    },
    profileImageWrapper: {
        position: 'relative',
        width: 150,
        height: 150,
        borderRadius: 75,
        overflow: 'hidden',
        marginBottom: 12,
    },
    imageOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.4)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkIcon: {
        position: 'absolute',
        top: 0,
        right: 0,
        backgroundColor: '#ffffff',
        borderRadius: 16,
    },
    uploadedText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#22c55e',
        marginTop: 8,
    },
    uploadedSubtext: {
        fontSize: 13,
        color: '#6b7280',
        marginTop: 4,
        textAlign: 'center',
    },
    portfolioUploadedContainer: {
        width: '100%',
        alignItems: 'center',
        paddingVertical: 10,
    },
    portfolioPreviewWrapper: {
        position: 'relative',
        width: '100%',
        height: 120,
        marginBottom: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    portfolioCheckBadge: {
        position: 'absolute',
        top: -10,
        right: '25%', // Position it relative to the center cluster
        backgroundColor: '#ffffff',
        borderRadius: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 1,
    },
    successMessageContainer: {
        alignItems: 'center',
    },
    portfolioPreviewList: {
        paddingHorizontal: 20,
        alignItems: 'center',
    },
    portfolioPreviewImage: {
        width: 100,
        height: 100,
        borderRadius: 8,
        marginHorizontal: 6,
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    skipButton: {
        marginTop: 16,
        paddingVertical: 12,
        alignItems: 'center',
    },
    skipButtonText: {
        fontSize: 15,
        color: '#6b7280',
        fontWeight: '500',
    },
    locationToggleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 16,
        marginBottom: 8,
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
        marginRight: 12,
    },
    checkboxSelected: {
        backgroundColor: '#337DEB',
        borderColor: '#337DEB',
    },
    locationToggleText: {
        fontSize: 14,
        color: '#374151',
        fontWeight: '500',
    },
    loadingContainer: {
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingText: {
        marginTop: 8,
        fontSize: 14,
        color: '#6b7280',
    },
    summaryContainer: {
        alignItems: 'center',
        paddingVertical: 20,
    },
    summaryTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#2d3748',
        marginTop: 16,
        marginBottom: 8,
    },
    summarySubtitle: {
        fontSize: 16,
        color: '#6b7280',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 32,
    },
    summaryDetails: {
        width: '100%',
        backgroundColor: '#ffffff',
        borderRadius: 12,
        padding: 20,
        gap: 16,
    },
    summaryItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    summaryItemText: {
        fontSize: 15,
        color: '#374151',
        flex: 1,
    },
    buttonContainer: {
        paddingHorizontal: 20,
        paddingVertical: 24,
        marginBottom: 40,
    },
    continueButton: {
        backgroundColor: '#337DEB',
        borderRadius: 12,
        paddingVertical: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    continueButtonDisabled: {
        backgroundColor: '#cbd5e1',
    },
    continueButtonText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#ffffff',
    },
    socialField: {
        marginBottom: 16,
    },
    socialLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    socialLabelText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#2d3748',
    },
    socialInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    socialTextInput: {
        flex: 1,
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 16,
        color: '#374151',
    },
    socialSubmitButton: {
        backgroundColor: '#337DEB',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    socialSubmitButtonDisabled: {
        backgroundColor: '#9ca3af',
    },
    socialSubmitText: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '600',
    },
    socialResultText: {
        fontSize: 13,
        color: '#6b7280',
        marginTop: 6,
    },
});

export default CreatorDetailsSetup;
