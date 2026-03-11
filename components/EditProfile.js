import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Image, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../hooks/useAuth';
import { useMetadata } from '../context/MetadataContext';
import { USER_PROFILE_CATEGORIES, VALID_PLATFORMS } from '../utils/apiConstants';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import { uploadImage } from '../services/upload';
import logger from '../utils/logger';
import { PlatformIcon } from '../utils/platformIcons';

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
  logger.error('Error importing MaterialIcons', error);
  MaterialIcons = ({ name, size, color, style }) => (
    <Text style={[{ fontSize: size || 20, color: color || '#000' }, style]}>?</Text>
  );
}

const EditProfile = ({ navigation, route }) => {
  // Get basic user info from AuthContext as a fallback/pre-fill source
  const { user } = useAuth();
  // Get user role from navigation params
  // Check multiple possible formats: 'Creator', 'creator', 'Brand', 'brand'
  let userRoleParam = route?.params?.role || navigation?.getParam?.('role');

  // If role not found in params, try to determine from navigation state
  if (!userRoleParam) {
    // Check if we can determine from navigation state or screen history
    // This is a fallback - ideally role should be passed as param
    userRoleParam = 'Creator'; // Default fallback
  }

  // Determine role - normalize to lowercase for comparison
  const roleLower = userRoleParam?.toLowerCase() || 'creator';

  const isCreator = roleLower === 'creator';
  const isBrand = roleLower === 'brand';

  // Debug log to help identify the issue
  logger.debug('EditProfile - Role detection', { userRoleParam, roleLower, isCreator, isBrand });

  // Use the normalized role
  const userRole = isBrand ? 'Brand' : 'Creator';

  // Personal Details State (start empty, filled from API)
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('');
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [bio, setBio] = useState('');
  const [tags, setTags] = useState('');
  const [isPublic, setIsPublic] = useState(true);

  // Social Media State
  const [instagram, setInstagram] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [youtube, setYoutube] = useState('');
  const [twitter, setTwitter] = useState('');
  const [facebook, setFacebook] = useState('');

  // Creator-specific State
  const [categories, setCategories] = useState([]);
  const [creatorRole, setCreatorRole] = useState('');
  const [services, setServices] = useState([]);
  const [platformMetrics, setPlatformMetrics] = useState([]);

  // Brand-specific State
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [website, setWebsite] = useState('');
  const [campaignBudget, setCampaignBudget] = useState('');
  const [brandTagline, setBrandTagline] = useState('');

  // Payment Details (Creator only)
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [paystackEmail, setPaystackEmail] = useState('');

  // Profile Images (blank until loaded from API)
  const [profileImage, setProfileImage] = useState('');
  const [bannerImage, setBannerImage] = useState('');
  const [profileImageLocal, setProfileImageLocal] = useState(null);
  const [bannerImageLocal, setBannerImageLocal] = useState(null);

  // Loading state
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Location dropdown state
  const [countries, setCountries] = useState([]);
  const [statesList, setStatesList] = useState([]); // Renamed from 'states' to avoid conflict with 'state' variable
  const [citiesList, setCitiesList] = useState([]); // Renamed from 'cities' to avoid conflict with 'city' variable
  const [loadingLocations, setLoadingLocations] = useState({ countries: false, states: false, cities: false });
  const [showDropdowns, setShowDropdowns] = useState({ country: false, state: false, city: false });
  const [uploadingImage, setUploadingImage] = useState(false);

  const { categories: dynamicCategories, loading: metadataLoading } = useMetadata();

  const [expandedSections, setExpandedSections] = useState({
    personal: true,
    social: true,
    roleSpecific: true,
    payment: false,
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Helper to check if a social platform is connected/linked via OAuth
  const isPlatformConnected = (platformName) => {
    if (!platformMetrics || !Array.isArray(platformMetrics)) return false;
    return platformMetrics.some(m => m.platform?.toLowerCase() === platformName.toLowerCase());
  };

  const handleImagePicker = async (imageType = 'profile') => {
    Alert.alert(
      'Select Image',
      'Choose an option',
      [
        {
          text: 'Camera',
          onPress: async () => {
            try {
              const result = await launchCamera({
                mediaType: 'photo',
                quality: 0.8,
                includeBase64: false,
              });

              if (result.assets && result.assets[0]) {
                await handleImageUpload(result.assets[0], imageType);
              }
            } catch (error) {
              logger.error('Camera error', error);
              Alert.alert('Error', 'Failed to open camera');
            }
          },
        },
        {
          text: 'Gallery',
          onPress: async () => {
            try {
              const result = await launchImageLibrary({
                mediaType: 'photo',
                quality: 0.8,
                includeBase64: false,
              });

              if (result.assets && result.assets[0]) {
                await handleImageUpload(result.assets[0], imageType);
              }
            } catch (error) {
              logger.error('Gallery error', error);
              Alert.alert('Error', 'Failed to open gallery');
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleImageUpload = async (asset, imageType) => {
    try {
      setUploadingImage(true);

      const file = {
        uri: asset.uri,
        type: asset.type || 'image/jpeg',
        name: asset.fileName || `${imageType}_${Date.now()}.jpg`,
      };

      const uploadResult = await uploadImage(file);
      logger.debug('[EditProfile] Upload result', uploadResult);

      if (uploadResult && uploadResult.data && uploadResult.data.url) {
        const imageUrl = uploadResult.data.url;
        logger.info(`[EditProfile] ${imageType === 'profile' ? 'Profile' : 'Banner'} image uploaded`, { url: imageUrl });

        if (imageType === 'profile') {
          setProfileImage(imageUrl);
          setProfileImageLocal(asset.uri);
          logger.debug('[EditProfile] Profile image state updated', { url: imageUrl });
        } else {
          setBannerImage(imageUrl);
          setBannerImageLocal(asset.uri);
          logger.debug('[EditProfile] Banner image state updated', { url: imageUrl });
        }

        Alert.alert('Success', `${imageType === 'profile' ? 'Profile' : 'Banner'} image uploaded successfully`);
      } else {
        logger.error('[EditProfile] Upload failed - invalid response', uploadResult);
        throw new Error('Upload failed - no URL returned');
      }
    } catch (error) {
      logger.error('Upload error', error);
      Alert.alert('Error', error.message || 'Failed to upload image. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    // Validate required fields
    if (!fullName.trim()) {
      Alert.alert('Error', 'Please enter your full name');
      return;
    }

    setSubmitting(true);
    logger.debug('[EditProfile] Saving profile...');

    // Prepare profile data based on role - matching API structure exactly as provided
    const profileData = {
      name: fullName,
      phone: phone || undefined,
      bio: bio || undefined,
      website: website || undefined,
      profileImage: profileImage || undefined,
      bannerImage: bannerImage || undefined,
      isPublic: isPublic,
    };

    // Location structure matching API - includes coordinates
    if (city || state || country || (latitude && longitude)) {
      profileData.location = {
        ...(city && { city: city.trim() }),
        ...(state && { state: state.trim() }),
        ...(country && { country: country.trim() }),
        ...((latitude && longitude) && {
          coordinates: {
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
          },
        }),
      };
    }

    // Social Media - only include if at least one field has value
    const socialMediaObj = {};
    if (instagram) socialMediaObj.instagram = instagram.trim();
    if (tiktok) socialMediaObj.tiktok = tiktok.trim();
    if (youtube) socialMediaObj.youtube = youtube.trim();
    if (twitter) socialMediaObj.twitter = twitter.trim();
    if (facebook) socialMediaObj.facebook = facebook.trim();
    if (Object.keys(socialMediaObj).length > 0) {
      profileData.socialMedia = socialMediaObj;
    }

    // Tags - convert comma-separated string to array
    // Tags logic removed to allow mapping services to tags for creators
    // if (tags) {
    //   profileData.tags = tags.split(',').map(tag => tag.trim()).filter(tag => tag);
    // }

    if (isCreator) {
      // Removed username from payload - field removed from UI
      // Categories: Validate and ensure all are valid backend enum values
      if (categories.length > 0) {
        const validCategories = categories.filter(cat => USER_PROFILE_CATEGORIES.includes(cat));
        if (validCategories.length > 0) {
          profileData.categories = validCategories;
        }
      }
      // platformMetrics structure: [{ platform, followers, engagementRate, avgViews, verified }]
      // Ensure platform values are valid enum values (lowercase)
      if (platformMetrics.length > 0) {
        profileData.platformMetrics = platformMetrics.map(metric => {
          const platform = metric.platform?.toLowerCase() || '';
          return {
            platform: VALID_PLATFORMS.includes(platform) ? platform : metric.platform, // Backend will validate
            followers: metric.followers || metric.count || 0,
            engagementRate: metric.engagementRate || metric.rate || 0,
            avgViews: metric.avgViews || 0,
            verified: metric.verified || false,
          };
        });
      }
      // Payment details - only include if at least one field has value
      if (bankName || accountNumber || accountHolderName || paystackEmail) {
        profileData.payment = {
          bankName: bankName.trim(),
          accountNumber: accountNumber.trim(),
          accountHolderName: accountHolderName.trim(),
          paystackEmail: paystackEmail.trim(),
        };
      }
      if (creatorRole) {
        // Map creatorRole to industry to bypass backend validation whitelist
        profileData.industry = creatorRole;
      }
      if (services.length > 0) {
        // Map services to tags to bypass backend validation whitelist
        profileData.tags = services;
      }
    } else {
      // Brand specific fields
      if (companyName) profileData.companyName = companyName;
      if (industry) profileData.industry = industry;
      if (brandTagline) profileData.brandTagline = brandTagline;
      if (campaignBudget) profileData.campaignBudget = campaignBudget;
    }

    // Remove undefined values to keep payload clean
    Object.keys(profileData).forEach(key => {
      if (profileData[key] === undefined) {
        delete profileData[key];
      }
    });

    logger.debug('[EditProfile] Update payload', profileData);

    try {
      const { updateProfile } = await import('../services/user');
      const response = await updateProfile(profileData);
      logger.debug('[EditProfile] Update API Response', response);

      if (response && (response.success !== false)) {
        // Refetch profile data to display updated values
        try {
          const { getMyProfile } = await import('../services/user');
          const refreshResponse = await getMyProfile();
          logger.debug('[EditProfile] Refresh API Response after save', refreshResponse);
          const refreshedProfile = refreshResponse?.data || refreshResponse;

          if (refreshedProfile) {
            logger.debug('[EditProfile] Refreshed profile data', {
              name: refreshedProfile.name,
              profileImage: refreshedProfile.profileImage,
              bannerImage: refreshedProfile.bannerImage
            });

            // Update profile and banner images from refreshed data
            if (refreshedProfile.profileImage && typeof refreshedProfile.profileImage === 'string' && refreshedProfile.profileImage.trim()) {
              console.log('[EditProfile] Updating profile image from refresh:', refreshedProfile.profileImage);
              setProfileImage(refreshedProfile.profileImage.trim());
              setProfileImageLocal(null);
            }

            if (refreshedProfile.bannerImage && typeof refreshedProfile.bannerImage === 'string' && refreshedProfile.bannerImage.trim()) {
              logger.debug('[EditProfile] Updating banner image from refresh', { url: refreshedProfile.bannerImage });
              setBannerImage(refreshedProfile.bannerImage.trim());
              setBannerImageLocal(null);
            }
            // Update social media - check both socialMedia and platformReach - use case-insensitive matching
            const smRefreshed = refreshedProfile.socialMedia || {};
            const prRefreshed = refreshedProfile.platformMetrics || refreshedProfile.platformReach || [];

            const findMetric = (platform) => prRefreshed.find(m => m.platform?.toLowerCase() === platform.toLowerCase());

            setInstagram(smRefreshed.instagram || findMetric('instagram')?.username || findMetric('instagram')?.platformUserId || instagram);
            setTiktok(smRefreshed.tiktok || findMetric('tiktok')?.username || findMetric('tiktok')?.platformUserId || tiktok);
            setYoutube(smRefreshed.youtube || findMetric('youtube')?.username || findMetric('youtube')?.platformUserId || youtube);
            setTwitter(smRefreshed.twitter || findMetric('twitter')?.username || findMetric('twitter')?.platformUserId || twitter);
            setFacebook(smRefreshed.facebook || findMetric('facebook')?.username || findMetric('facebook')?.platformUserId || facebook);
          }
        } catch (refreshError) {
          console.error('[EditProfile] Error refreshing profile after save:', refreshError);
        }

        // Save payment details separately if changed
        if (isCreator && (bankName || accountNumber || accountHolderName)) {
          try {
            const { addPaymentMethod } = await import('../services/wallet');
            await addPaymentMethod({
              bankName: bankName.trim(),
              accountNumber: accountNumber.trim(),
              accountName: accountHolderName.trim(),
              accountType: 'savings',
              currency: 'NGN',
              isDefault: true
            });
          } catch (paymentError) {
            console.error('[EditProfile] Failed to save payment details:', paymentError);
          }
        }

        // Save manual social media entries separately
        const platforms = [
          { name: 'instagram', value: instagram },
          { name: 'tiktok', value: tiktok },
          { name: 'youtube', value: youtube },
          { name: 'twitter', value: twitter },
          { name: 'facebook', value: facebook },
        ];

        try {
          const { updateSocialMedia } = await import('../services/social');
          const { syncSocialPlatform } = await import('../services/social');
          for (const p of platforms) {
            if (p.value) {
              await updateSocialMedia({
                platform: p.name,
                username: p.value,
                followers: 0,
                engagement: 0,
                avgViews: 0
              });
              // Proactively sync metrics for TikTok to ensure it appears under social reach
              if (p.name === 'tiktok') {
                try {
                  await syncSocialPlatform('tiktok');
                } catch (_) { /* ignore sync errors */ }
              }
            }
          }
        } catch (socialError) {
          console.error('[EditProfile] Failed to save social media:', socialError);
        }

        // Automatically close the screen
        navigation?.goBack();
        Alert.alert('Success', 'Profile updated successfully!');
      } else {
        Alert.alert('Error', response?.message || 'Failed to update profile.');
      }
    } catch (error) {
      console.error('[EditProfile] Update error:', error?.message || error);
      Alert.alert('Error', error.message || 'Failed to update profile. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Fetch Profile Data Function
  const fetchProfileData = async () => {
    logger.debug('[EditProfile] Fetching profile data...');
    setLoading(true);
    let hasProfileData = false;
    try {
      const { getMyProfile } = await import('../services/user');
      const response = await getMyProfile();
      console.log('[EditProfile] API Response:', JSON.stringify(response, null, 2));
      console.log('[EditProfile] Response structure:', {
        hasData: !!response?.data,
        hasProfileImage: !!response?.data?.profileImage,
        hasAvatar: !!response?.data?.avatar,
        profileImageValue: response?.data?.profileImage,
        avatarValue: response?.data?.avatar
      });

      // Handle different response structures
      const p = response?.data || response;

      // Normalize profileImage - check both profileImage and avatar fields
      if (p && !p.profileImage && p.avatar) {
        p.profileImage = p.avatar;
        console.log('[EditProfile] Using avatar as profileImage:', p.avatar);
      }

      if (p) {
        console.log('[EditProfile] Profile data found:', p.name, p.email);
        hasProfileData = true;
        setFullName(p.name || '');
        // Removed username/brand name field - not needed
        setEmail(p.email || '');
        setPhone(p.phone || '');
        setBio(p.bio || '');
        setWebsite(p.website || '');

        if (p.location) {
          if (typeof p.location === 'string') {
            // Handle string location format
            const parts = p.location.split(',');
            setCity(parts[0]?.trim() || '');
            setState(parts[1]?.trim() || '');
            setCountry(parts[2]?.trim() || '');
          } else {
            // Handle object location format
            setCity(p.location.city || '');
            setState(p.location.state || '');
            setCountry(p.location.country || '');
            // Extract coordinates if available
            if (p.location.coordinates) {
              setLatitude(p.location.coordinates.latitude || null);
              setLongitude(p.location.coordinates.longitude || null);
            }
          }
        }

        if (p.isPublic !== undefined) {
          setIsPublic(p.isPublic);
        }

        if (p.tags && Array.isArray(p.tags)) {
          setTags(p.tags.join(', '));
        } else if (p.tags) {
          setTags(p.tags);
        }

        // Social Media - load for all users (creators and brands)
        const smFetched = p.socialMedia || {};
        const platformReach = p.platformMetrics || p.platformReach || [];

        // Normalize platformReach platforms to lowercase early for robust matching
        const normalizedReach = platformReach.map(m => ({
          ...m,
          platform: m.platform ? m.platform.toLowerCase() : ''
        }));

        // Helper to get display value for social fields, prioritizing connected accounts (links)
        const getSocialDisplayVal = (platform) => {
          const reach = normalizedReach.find(m => m.platform === platform);
          if (reach) {
            // Priority: profileUrl (link) -> username -> ID
            return reach.profileUrl || reach.username || reach.platformUserId || 'Linked';
          }
          return smFetched[platform] || '';
        };

        const instagramVal = getSocialDisplayVal('instagram');
        const tiktokVal = getSocialDisplayVal('tiktok');
        const youtubeVal = getSocialDisplayVal('youtube');
        const twitterVal = getSocialDisplayVal('twitter');
        const facebookVal = getSocialDisplayVal('facebook');

        setInstagram(instagramVal);
        setTiktok(tiktokVal);
        setYoutube(youtubeVal);
        setTwitter(twitterVal);
        setFacebook(facebookVal);

        // Handle profile image - log and validate URL (check both profileImage and avatar)
        const profileImageValue = p.profileImage || p.avatar;
        console.log('[EditProfile] Profile Image from API:', {
          profileImage: p.profileImage,
          avatar: p.avatar,
          using: profileImageValue
        });
        if (profileImageValue && typeof profileImageValue === 'string' && profileImageValue.trim()) {
          const profileImageUrl = profileImageValue.trim();
          console.log('[EditProfile] Setting profile image URL:', profileImageUrl);
          setProfileImage(profileImageUrl);
          setProfileImageLocal(null); // Clear local image when loading from API
        } else {
          console.log('[EditProfile] No valid profile image in API response');
          setProfileImage('');
          setProfileImageLocal(null);
        }

        // Handle banner image - log and validate URL
        console.log('[EditProfile] Banner Image from API:', p.bannerImage);
        if (p.bannerImage && typeof p.bannerImage === 'string' && p.bannerImage.trim()) {
          const bannerImageUrl = p.bannerImage.trim();
          console.log('[EditProfile] Setting banner image URL:', bannerImageUrl);
          setBannerImage(bannerImageUrl);
          setBannerImageLocal(null); // Clear local image when loading from API
        } else {
          console.log('[EditProfile] No valid banner image in API response');
          setBannerImage('');
          setBannerImageLocal(null);
        }

        if (isCreator) {
          // Categories: Backend sends enum values, keep as-is (they're already in backend format)
          if (p.categories && Array.isArray(p.categories)) {
            // Validate and filter to only valid backend enum values
            const validCategories = p.categories.filter(cat => USER_PROFILE_CATEGORIES.includes(cat));
            setCategories(validCategories);
          } else if (p.categories) {
            const validCategories = USER_PROFILE_CATEGORIES.includes(p.categories) ? [p.categories] : [];
            setCategories(validCategories);
          }

          // Load all platform metrics from API - ensure platform values are valid
          if (p.platformMetrics && Array.isArray(p.platformMetrics)) {
            const validatedMetrics = p.platformMetrics.map(metric => ({
              ...metric,
              platform: VALID_PLATFORMS.includes(metric.platform?.toLowerCase())
                ? metric.platform.toLowerCase()
                : metric.platform, // Keep original if invalid, backend will validate
            }));
            setPlatformMetrics(validatedMetrics);
          }

          // Read creatorRole from industry (shim) or creatorRole
          setCreatorRole(p.creatorRole || p.industry || '');
          // Read services from tags (shim) or services
          setServices(p.services || p.tags || []);
          // Payment details are now fetched from wallet service
          setBankName('');
          setAccountNumber('');
          setAccountHolderName('');
          setPaystackEmail('');
        } else {
          setCompanyName(p.companyName || p.name || '');
          setIndustry(p.industry || '');
          setWebsite(p.website || '');
          setCampaignBudget(p.campaignBudget || '');
          setBrandTagline(p.brandTagline || '');
        }

        // Fetch Payment Details from Wallet Service for creators
        if (isCreator) {
          try {
            const { getPaymentMethods } = await import('../services/wallet');
            const paymentResponse = await getPaymentMethods();
            if (paymentResponse && paymentResponse.data && paymentResponse.data.paymentMethods) {
              const defaultMethod = paymentResponse.data.paymentMethods.find(m => m.isDefault) || paymentResponse.data.paymentMethods[0];
              if (defaultMethod) {
                setBankName(defaultMethod.bankName || '');
                setAccountNumber(defaultMethod.accountNumber || '');
                setAccountHolderName(defaultMethod.accountName || '');
              }
            }
          } catch (err) {
            console.error('[EditProfile] Failed to fetch payment methods:', err);
          }
        }
      } else {
        console.warn('[EditProfile] No profile data in response');
      }
    } catch (error) {
      console.error('[EditProfile] Failed to fetch profile:', error?.message || error);
      Alert.alert('Error', 'Failed to load profile. Please try again.');
    } finally {
      // If no profile data was loaded from API, fall back to basic user info from AuthContext
      if (!hasProfileData && user) {
        logger.debug('[EditProfile] Falling back to AuthContext user data');
        if (user.name) setFullName(prev => prev || user.name);
        if (user.email) setEmail(prev => prev || user.email);
        if (user.phone) setPhone(prev => prev || user.phone);

        if (user.location) {
          if (typeof user.location === 'string') {
            const parts = user.location.split(',');
            setCity(prev => prev || parts[0]?.trim() || '');
            setState(prev => prev || parts[1]?.trim() || '');
            setCountry(prev => prev || parts[2]?.trim() || '');
          } else {
            setCity(prev => prev || user.location.city || '');
            setState(prev => prev || user.location.state || '');
            setCountry(prev => prev || user.location.country || '');
            if (user.location.coordinates) {
              setLatitude(user.location.coordinates.latitude || null);
              setLongitude(user.location.coordinates.longitude || null);
            }
          }
        }
      }
      setLoading(false);
    }
  };

  // Fetch Profile Data on Mount and when screen comes into focus
  useEffect(() => {
    fetchProfileData();
  }, []);

  // Fetch countries on mount
  useEffect(() => {
    const fetchCountries = async () => {
      try {
        setLoadingLocations(prev => ({ ...prev, countries: true }));
        const locationService = await import('../services/location');
        const response = await locationService.getCountries();
        if (response && response.success && Array.isArray(response.data)) {
          setCountries(response.data);
        }
      } catch (err) {
        logger.error('[EditProfile] Error fetching countries:', err);
      } finally {
        setLoadingLocations(prev => ({ ...prev, countries: false }));
      }
    };

    fetchCountries();
  }, []);

  // Fetch states when country changes
  useEffect(() => {
    const fetchStates = async () => {
      if (!country) {
        setStatesList([]);
        return;
      }

      const countryObj = countries.find(c => (c.name || '').toLowerCase() === country.toLowerCase() || (c.isoCode || c.iso2 || '').toLowerCase() === country.toLowerCase());
      const countryCode = countryObj?.isoCode || countryObj?.iso2;

      if (!countryCode) {
        logger.debug('[EditProfile] No valid country code found for:', country);
        setStatesList([]);
        return;
      }

      try {
        setLoadingLocations(prev => ({ ...prev, states: true }));
        const locationService = await import('../services/location');
        const response = await locationService.getStates(countryCode);
        if (response && response.success && Array.isArray(response.data)) {
          setStatesList(response.data);
        }
      } catch (err) {
        logger.error('[EditProfile] Error fetching states:', err);
      } finally {
        setLoadingLocations(prev => ({ ...prev, states: false }));
      }
    };

    if (country && countries.length > 0) {
      fetchStates();
    }
  }, [country, countries]);

  // Fetch cities when state changes
  useEffect(() => {
    const fetchCities = async () => {
      if (!country || !state) {
        setCitiesList([]);
        return;
      }

      const countryObj = countries.find(c => (c.name || '').toLowerCase() === country.toLowerCase() || (c.isoCode || c.iso2 || '').toLowerCase() === country.toLowerCase());
      const countryCode = countryObj?.isoCode || countryObj?.iso2;

      const stateObj = statesList.find(s => (s.name || '').toLowerCase() === state.toLowerCase() || (s.isoCode || s.iso2 || '').toLowerCase() === state.toLowerCase());
      const stateCode = stateObj?.isoCode || stateObj?.iso2;

      if (!countryCode || !stateCode) {
        logger.debug('[EditProfile] Missing code(s) for cities:', { countryCode, stateCode });
        setCitiesList([]);
        return;
      }

      try {
        setLoadingLocations(prev => ({ ...prev, cities: true }));
        const locationService = await import('../services/location');
        const response = await locationService.getCities(countryCode, stateCode);
        if (response && response.success && Array.isArray(response.data)) {
          setCitiesList(response.data);
        }
      } catch (err) {
        logger.error('[EditProfile] Error fetching cities:', err);
      } finally {
        setLoadingLocations(prev => ({ ...prev, cities: false }));
      }
    };

    if (country && state && statesList.length > 0) {
      fetchCities();
    }
  }, [country, state, statesList]);

  // Refetch when screen comes into focus (when user returns to this screen)
  useEffect(() => {
    const unsubscribe = navigation?.addListener?.('focus', () => {
      logger.debug('[EditProfile] Screen focused, refetching profile...');
      fetchProfileData();
    });

    return unsubscribe;
  }, [navigation, isCreator]);

  // Log image state changes for debugging
  useEffect(() => {
    logger.debug('[EditProfile] Profile image state changed', {
      profileImage: profileImage,
      profileImageLocal: profileImageLocal,
      profileImageType: typeof profileImage,
      profileImageLength: profileImage ? profileImage.length : 0
    });
  }, [profileImage, profileImageLocal]);

  useEffect(() => {
    console.log('[EditProfile] Banner image state changed:', {
      bannerImage: bannerImage,
      bannerImageLocal: bannerImageLocal,
      bannerImageType: typeof bannerImage,
      bannerImageLength: bannerImage ? bannerImage.length : 0
    });
  }, [bannerImage, bannerImageLocal]);

  const handleCancel = () => {
    navigation?.goBack();
  };

  // Category mapping: Normalized from dynamic categories
  const categoryOptions = dynamicCategories.map(cat => ({
    label: cat.charAt(0).toUpperCase() + cat.replace(/_/g, ' ').slice(1),
    value: cat
  }));

  const industries = ['Fashion', 'Technology', 'Food & Beverage', 'Beauty', 'Fitness', 'Travel', 'Other'];

  // Show loading indicator while fetching profile
  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#337DEB" />
        <Text style={{ marginTop: 16, color: '#6B7280' }}>Loading profile...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} disabled={submitting}>
          <MaterialIcons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <TouchableOpacity onPress={handleSave} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator size="small" color="#337DEB" />
          ) : (
            <Text style={styles.saveButton}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Profile Photo Section */}
        <View style={styles.profilePhotoSection}>
          <TouchableOpacity
            onPress={() => handleImagePicker('profile')}
            style={styles.imageContainer}
            disabled={uploadingImage}
          >
            {(() => {
              const imageSource = profileImageLocal
                ? { uri: profileImageLocal }
                : profileImage && typeof profileImage === 'string' && (profileImage.startsWith('http://') || profileImage.startsWith('https://'))
                  ? { uri: profileImage }
                  : require('../assets/app-icon.png');
              console.log('[EditProfile] Rendering profile image - Local:', profileImageLocal, 'API URL:', profileImage, 'Using source:', imageSource);
              return (
                <Image
                  source={imageSource}
                  style={styles.profileImage}
                  onError={(error) => console.error('[EditProfile] Profile image load error:', error.nativeEvent.error, 'URL:', profileImage)}
                  onLoad={() => console.log('[EditProfile] Profile image loaded successfully:', profileImageLocal || profileImage)}
                />
              );
            })()}
            <View style={styles.editImageOverlay}>
              {uploadingImage ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <MaterialIcons name="camera-alt" size={24} color="#FFFFFF" />
              )}
            </View>
          </TouchableOpacity>
          <Text style={styles.imageHint}>Tap to change profile photo</Text>

          {/* Banner Image */}
          <View style={styles.bannerImageContainer}>
            <TouchableOpacity
              onPress={() => handleImagePicker('banner')}
              style={styles.bannerImageWrapper}
              disabled={uploadingImage}
            >
              {(() => {
                const bannerSource = bannerImageLocal
                  ? { uri: bannerImageLocal }
                  : bannerImage && typeof bannerImage === 'string' && (bannerImage.startsWith('http://') || bannerImage.startsWith('https://'))
                    ? { uri: bannerImage }
                    : require('../assets/app-icon.png');
                console.log('[EditProfile] Rendering banner image - Local:', bannerImageLocal, 'API URL:', bannerImage, 'Using source:', bannerSource);
                return (
                  <Image
                    source={bannerSource}
                    style={styles.bannerImage}
                    resizeMode="cover"
                    onError={(error) => console.error('[EditProfile] Banner image load error:', error.nativeEvent.error, 'URL:', bannerImage)}
                    onLoad={() => console.log('[EditProfile] Banner image loaded successfully:', bannerImageLocal || bannerImage)}
                  />
                );
              })()}
              <View style={styles.editBannerOverlay}>
                {uploadingImage ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialIcons name="camera-alt" size={20} color="#FFFFFF" />
                    <Text style={styles.bannerHint}>Banner</Text>
                  </>
                )}
              </View>
            </TouchableOpacity>
            <Text style={styles.imageHint}>Tap to change banner image</Text>
          </View>
        </View>

        {/* Personal Details Section */}
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={() => toggleSection('personal')}
        >
          <Text style={styles.sectionTitle}>Personal Details</Text>
          <MaterialIcons
            name={expandedSections.personal ? 'expand-less' : 'expand-more'}
            size={24}
            color="#6B7280"
          />
        </TouchableOpacity>
        {expandedSections.personal && (
          <View style={styles.sectionContent}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name *</Text>
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Enter your full name"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            {/* Removed Username/Brand Name field - not needed for Brands and Creators */}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={[styles.input, styles.inputDisabled]}
                value={email}
                onChangeText={setEmail}
                editable={false}
                placeholder="Enter your email"
                placeholderTextColor="#9CA3AF"
              />
              <Text style={styles.helperText}>Email cannot be changed here. Use Settings to update email.</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone Number</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="Enter your phone number"
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Country</Text>
              <TouchableOpacity
                style={styles.dropdownContainer}
                onPress={() => setShowDropdowns(prev => ({ ...prev, country: !prev.country }))}
                disabled={loadingLocations.countries}
              >
                {loadingLocations.countries ? (
                  <ActivityIndicator size="small" color="#337DEB" />
                ) : (
                  <Text style={[styles.dropdownText, !country && { color: '#9ca3af' }]}>
                    {country || 'Select Country'}
                  </Text>
                )}
                <MaterialIcons name="keyboard-arrow-down" size={20} color="#6b7280" />
              </TouchableOpacity>

              {showDropdowns.country && (
                <View style={styles.dropdownOptionsContainer}>
                  <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200 }}>
                    {countries.map((item, index) => (
                      <TouchableOpacity
                        key={index}
                        style={styles.dropdownOption}
                        onPress={() => {
                          setCountry(item.name);
                          setState('');
                          setCity('');
                          setShowDropdowns(prev => ({ ...prev, country: false }));
                        }}
                      >
                        <Text style={styles.dropdownOptionText}>{item.name}</Text>
                        {country === item.name && (
                          <MaterialIcons name="check" size={20} color="#337DEB" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>State</Text>
              <TouchableOpacity
                style={styles.dropdownContainer}
                onPress={() => setShowDropdowns(prev => ({ ...prev, state: !prev.state }))}
                disabled={!country || loadingLocations.states}
              >
                {loadingLocations.states ? (
                  <ActivityIndicator size="small" color="#337DEB" />
                ) : (
                  <Text style={[styles.dropdownText, !state && { color: '#9ca3af' }]}>
                    {state || 'Select State'}
                  </Text>
                )}
                <MaterialIcons name="keyboard-arrow-down" size={20} color="#6b7280" />
              </TouchableOpacity>

              {showDropdowns.state && (
                <View style={styles.dropdownOptionsContainer}>
                  <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200 }}>
                    {statesList.length === 0 ? (
                      <View style={styles.dropdownOption}>
                        <Text style={[styles.dropdownOptionText, { color: '#9ca3af' }]}>No states found</Text>
                      </View>
                    ) : (
                      statesList.map((item, index) => (
                        <TouchableOpacity
                          key={index}
                          style={styles.dropdownOption}
                          onPress={() => {
                            setState(item.name);
                            setCity('');
                            setShowDropdowns(prev => ({ ...prev, state: false }));
                          }}
                        >
                          <Text style={styles.dropdownOptionText}>{item.name}</Text>
                          {state === item.name && (
                            <MaterialIcons name="check" size={20} color="#337DEB" />
                          )}
                        </TouchableOpacity>
                      ))
                    )}
                  </ScrollView>
                </View>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>City</Text>
              <TouchableOpacity
                style={styles.dropdownContainer}
                onPress={() => setShowDropdowns(prev => ({ ...prev, city: !prev.city }))}
                disabled={!state || loadingLocations.cities}
              >
                {loadingLocations.cities ? (
                  <ActivityIndicator size="small" color="#337DEB" />
                ) : (
                  <Text style={[styles.dropdownText, !city && { color: '#9ca3af' }]}>
                    {city || 'Select City'}
                  </Text>
                )}
                <MaterialIcons name="keyboard-arrow-down" size={20} color="#6b7280" />
              </TouchableOpacity>

              {showDropdowns.city && (
                <View style={styles.dropdownOptionsContainer}>
                  <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200 }}>
                    {citiesList.length === 0 ? (
                      <View style={styles.dropdownOption}>
                        <Text style={[styles.dropdownOptionText, { color: '#9ca3af' }]}>No cities found</Text>
                      </View>
                    ) : (
                      citiesList.map((item, index) => (
                        <TouchableOpacity
                          key={index}
                          style={styles.dropdownOption}
                          onPress={() => {
                            setCity(item.name);
                            setShowDropdowns(prev => ({ ...prev, city: false }));
                          }}
                        >
                          <Text style={styles.dropdownOptionText}>{item.name}</Text>
                          {city === item.name && (
                            <MaterialIcons name="check" size={20} color="#337DEB" />
                          )}
                        </TouchableOpacity>
                      ))
                    )}
                  </ScrollView>
                </View>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Bio</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={bio}
                onChangeText={setBio}
                placeholder="Tell us about yourself"
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Tags (comma-separated)</Text>
              <TextInput
                style={styles.input}
                value={tags}
                onChangeText={setTags}
                placeholder="e.g., #Fashion, #Beauty, #Lifestyle"
                placeholderTextColor="#9CA3AF"
              />
              <Text style={styles.helperText}>Separate tags with commas</Text>
            </View>
          </View>
        )}

        {/* Social Media Links Section */}
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={() => toggleSection('social')}
        >
          <Text style={styles.sectionTitle}>Social Media Links</Text>
          <MaterialIcons
            name={expandedSections.social ? 'expand-less' : 'expand-more'}
            size={24}
            color="#6B7280"
          />
        </TouchableOpacity>
        {expandedSections.social && (
          <View style={styles.sectionContent}>
            <View style={styles.inputGroup}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <PlatformIcon platform="Instagram" size={20} style={{ marginRight: 8 }} />
                <Text style={styles.label}>Instagram</Text>
              </View>
              <TextInput
                style={[styles.input, isPlatformConnected('instagram') && styles.inputDisabled]}
                value={instagram}
                onChangeText={setInstagram}
                placeholder={isPlatformConnected('instagram') ? "Connected" : "Enter your Instagram username"}
                placeholderTextColor="#9CA3AF"
                editable={!isPlatformConnected('instagram')}
              />
              {isPlatformConnected('instagram') && <Text style={styles.helperText}>Connected via OAuth - Not editable here</Text>}
            </View>

            <View style={styles.inputGroup}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <PlatformIcon platform="TikTok" size={20} style={{ marginRight: 8 }} />
                <Text style={styles.label}>TikTok</Text>
              </View>
              <TextInput
                style={[styles.input, isPlatformConnected('tiktok') && styles.inputDisabled]}
                value={tiktok}
                onChangeText={setTiktok}
                placeholder={isPlatformConnected('tiktok') ? "Connected" : "Enter your TikTok username"}
                placeholderTextColor="#9CA3AF"
                editable={!isPlatformConnected('tiktok')}
              />
              {isPlatformConnected('tiktok') && <Text style={styles.helperText}>Connected via OAuth - Not editable here</Text>}
            </View>

            <View style={styles.inputGroup}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <PlatformIcon platform="YouTube" size={20} style={{ marginRight: 8 }} />
                <Text style={styles.label}>YouTube</Text>
              </View>
              <TextInput
                style={[styles.input, isPlatformConnected('youtube') && styles.inputDisabled]}
                value={youtube}
                onChangeText={setYoutube}
                placeholder={isPlatformConnected('youtube') ? "Connected" : "Enter your YouTube channel URL"}
                placeholderTextColor="#9CA3AF"
                editable={!isPlatformConnected('youtube')}
              />
              {isPlatformConnected('youtube') && <Text style={styles.helperText}>Connected via OAuth - Not editable here</Text>}
            </View>

            <View style={styles.inputGroup}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <PlatformIcon platform="Twitter" size={20} style={{ marginRight: 8 }} />
                <Text style={styles.label}>X (Twitter)</Text>
              </View>
              <TextInput
                style={[styles.input, isPlatformConnected('twitter') && styles.inputDisabled]}
                value={twitter}
                onChangeText={setTwitter}
                placeholder={isPlatformConnected('twitter') ? "Connected" : "Enter your Twitter handle"}
                placeholderTextColor="#9CA3AF"
                editable={!isPlatformConnected('twitter')}
              />
              {isPlatformConnected('twitter') && <Text style={styles.helperText}>Connected via OAuth - Not editable here</Text>}
            </View>

            <View style={styles.inputGroup}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <PlatformIcon platform="Facebook" size={20} style={{ marginRight: 8 }} />
                <Text style={styles.label}>Facebook</Text>
              </View>
              <TextInput
                style={[styles.input, isPlatformConnected('facebook') && styles.inputDisabled]}
                value={facebook}
                onChangeText={setFacebook}
                placeholder={isPlatformConnected('facebook') ? "Connected" : "Enter your Facebook page URL"}
                placeholderTextColor="#9CA3AF"
                editable={!isPlatformConnected('facebook')}
              />
              {isPlatformConnected('facebook') && <Text style={styles.helperText}>Connected via OAuth - Not editable here</Text>}
            </View>
          </View>
        )}

        {/* Role-Specific Section */}
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={() => toggleSection('roleSpecific')}
        >
          <Text style={styles.sectionTitle}>
            {isCreator ? 'Creator Details' : 'Brand Details'}
          </Text>
          <MaterialIcons
            name={expandedSections.roleSpecific ? 'expand-less' : 'expand-more'}
            size={24}
            color="#6B7280"
          />
        </TouchableOpacity>
        {expandedSections.roleSpecific && (
          <View style={styles.sectionContent}>
            {isCreator ? (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Categories</Text>
                  <View style={styles.pickerContainer}>
                    {metadataLoading ? (
                      <ActivityIndicator size="small" color="#337DEB" />
                    ) : categoryOptions.length === 0 ? (
                      <Text style={styles.helperText}>No categories available</Text>
                    ) : (
                      categoryOptions.map((option) => {
                        const isSelected = categories.includes(option.value);
                        return (
                          <TouchableOpacity
                            key={option.value}
                            style={[
                              styles.pickerOption,
                              isSelected && styles.pickerOptionSelected,
                            ]}
                            onPress={() => {
                              if (isSelected) {
                                setCategories(categories.filter(c => c !== option.value));
                              } else {
                                setCategories([...categories, option.value]);
                              }
                            }}
                          >
                            <Text
                              style={[
                                styles.pickerOptionText,
                                isSelected && styles.pickerOptionTextSelected,
                              ]}
                            >
                              {option.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </View>
                  <Text style={styles.helperText}>Select multiple categories ({categories.length} selected)</Text>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Platform Metrics</Text>
                  <Text style={styles.helperText}>
                    Platform metrics are managed through your profile. Current: {platformMetrics.length} platform(s) configured.
                  </Text>
                  {platformMetrics.length > 0 && (
                    <View style={styles.metricsList}>
                      {platformMetrics.map((metric, index) => {
                        const platformName = metric.platform
                          ? metric.platform.charAt(0).toUpperCase() + metric.platform.slice(1)
                          : 'Unknown';
                        return (
                          <View key={index} style={styles.metricItem}>
                            <Text style={styles.metricText}>
                              {platformName}: {metric.followers?.toLocaleString() || 0} followers,
                              {metric.engagementRate || 0}% engagement
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Creator Role</Text>
                  <TextInput
                    style={styles.input}
                    value={creatorRole}
                    onChangeText={setCreatorRole}
                    placeholder="e.g., Influencer, Photographer, Video Editor"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Services (Optional)</Text>
                  <TextInput
                    style={styles.input}
                    value={services.join(', ')}
                    onChangeText={(text) => setServices(text.split(',').map(s => s.trim()).filter(s => s))}
                    placeholder="e.g., Content Creation, Brand Strategy (comma separated)"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
              </>
            ) : (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Company Name</Text>
                  <TextInput
                    style={styles.input}
                    value={companyName}
                    onChangeText={setCompanyName}
                    placeholder="Enter company name"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Industry</Text>
                  <View style={styles.pickerContainer}>
                    {industries.map((ind) => (
                      <TouchableOpacity
                        key={ind}
                        style={[
                          styles.pickerOption,
                          industry === ind && styles.pickerOptionSelected,
                        ]}
                        onPress={() => setIndustry(ind)}
                      >
                        <Text
                          style={[
                            styles.pickerOptionText,
                            industry === ind && styles.pickerOptionTextSelected,
                          ]}
                        >
                          {ind}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Website</Text>
                  <TextInput
                    style={styles.input}
                    value={website}
                    onChangeText={setWebsite}
                    placeholder="Enter website URL"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="url"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Average Campaign Budget</Text>
                  <TextInput
                    style={styles.input}
                    value={campaignBudget}
                    onChangeText={setCampaignBudget}
                    placeholder="e.g., $5,000 - $10,000"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numeric"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Brand Tagline</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={brandTagline}
                    onChangeText={setBrandTagline}
                    placeholder="Enter your brand tagline"
                    placeholderTextColor="#9CA3AF"
                    multiline
                    numberOfLines={2}
                  />
                </View>
              </>
            )}
          </View>
        )}

        {/* Payment Details Section (Creator only) */}
        {isCreator && (
          <>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => toggleSection('payment')}
            >
              <Text style={styles.sectionTitle}>Payment Details</Text>
              <MaterialIcons
                name={expandedSections.payment ? 'expand-less' : 'expand-more'}
                size={24}
                color="#6B7280"
              />
            </TouchableOpacity>
            {expandedSections.payment && (
              <View style={styles.sectionContent}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Bank Name</Text>
                  <TextInput
                    style={styles.input}
                    value={bankName}
                    onChangeText={setBankName}
                    placeholder="Enter bank name"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Account Number</Text>
                  <TextInput
                    style={styles.input}
                    value={accountNumber}
                    onChangeText={setAccountNumber}
                    placeholder="Enter account number"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numeric"
                    secureTextEntry
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Account Holder Name</Text>
                  <TextInput
                    style={styles.input}
                    value={accountHolderName}
                    onChangeText={setAccountHolderName}
                    placeholder="Enter account holder name"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Paystack Email</Text>
                  <TextInput
                    style={styles.input}
                    value={paystackEmail}
                    onChangeText={setPaystackEmail}
                    placeholder="Enter Paystack email"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="email-address"
                  />
                </View>
              </View>
            )}
          </>
        )}

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancel} disabled={submitting}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveButtonLarge, submitting && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },
  saveButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#337DEB',
  },
  scrollView: {
    flex: 1,
  },
  profilePhotoSection: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  imageContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  editImageOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#337DEB',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  imageHint: {
    fontSize: 14,
    color: '#6B7280',
  },
  bannerImageContainer: {
    marginTop: 20,
    width: '100%',
    alignItems: 'center',
  },
  bannerImageWrapper: {
    width: '90%',
    height: 150,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 8,
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  editBannerOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  bannerHint: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  helperText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
    fontStyle: 'italic',
  },
  metricsList: {
    marginTop: 8,
    gap: 8,
  },
  metricItem: {
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 8,
  },
  metricText: {
    fontSize: 14,
    color: '#374151',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  sectionContent: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  dropdownContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dropdownText: {
    fontSize: 16,
    color: '#1F2937',
  },
  dropdownOptionsContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    marginTop: 4,
    maxHeight: 200,
    zIndex: 1000,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  dropdownOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  dropdownOptionText: {
    fontSize: 15,
    color: '#1F2937',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1F2937',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  inputDisabled: {
    backgroundColor: '#F3F4F6',
    color: '#6B7280',
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pickerOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  pickerOptionSelected: {
    backgroundColor: '#337DEB',
    borderColor: '#337DEB',
  },
  pickerOptionText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  pickerOptionTextSelected: {
    color: '#FFFFFF',
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  saveButtonLarge: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#337DEB',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default EditProfile;

