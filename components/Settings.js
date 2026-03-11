import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Switch, TextInput, Alert, Modal, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useAuth from '../hooks/useAuth';
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

const Settings = ({ navigation, route }) => {
  const { signOut } = useAuth();
  const [pushNotifications, setPushNotifications] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [smsNotifications, setSmsNotifications] = useState(false);

  // User profile data
  const [userEmail, setUserEmail] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [socialMedia, setSocialMedia] = useState({
    instagram: '',
    tiktok: '',
    youtube: '',
    twitter: '',
    facebook: '',
  });
  const [platformMetrics, setPlatformMetrics] = useState([]);
  const [loading, setLoading] = useState(true);

  // Password change modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Email change modal state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [changingEmail, setChangingEmail] = useState(false);

  // Phone change modal state
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [changingPhone, setChangingPhone] = useState(false);

  // Social media management modal state
  const [showSocialMediaModal, setShowSocialMediaModal] = useState(false);
  const [editingPlatform, setEditingPlatform] = useState(null);
  const [socialMediaUrl, setSocialMediaUrl] = useState('');
  const [savingSocialMedia, setSavingSocialMedia] = useState(false);
  const [connectingPlatform, setConnectingPlatform] = useState(null);
  const [syncingPlatform, setSyncingPlatform] = useState(null);

  // Get user role from navigation params
  const userRole = route?.params?.role || navigation?.getParam?.('role') || 'Creator';

  // Fetch user profile data
  const fetchUserProfile = useCallback(async () => {
    try {
      setLoading(true);
      const userService = await import('../services/user');
      const response = await userService.getMyProfile();

      if (response && response.data) {
        const profile = response.data;
        setUserEmail(profile.email || '');
        setUserPhone(profile.phone || '');

        // Set platform metrics (handle both platformMetrics and platformReach)
        const metrics = profile.platformMetrics || profile.platformReach || [];
        if (Array.isArray(metrics)) {
          setPlatformMetrics(metrics);
        } else {
          setPlatformMetrics([]);
        }

        // Construct social media object from profile.socialMedia OR platformReach
        const sm = {
          instagram: profile.socialMedia?.instagram || '',
          tiktok: profile.socialMedia?.tiktok || '',
          youtube: profile.socialMedia?.youtube || '',
          twitter: profile.socialMedia?.twitter || '',
          facebook: profile.socialMedia?.facebook || '',
        };

        // Fallback: If any field is empty, check in metrics/platformReach
        if (Array.isArray(metrics)) {
          metrics.forEach(m => {
            const platform = m.platform?.toLowerCase();
            if (platform && sm.hasOwnProperty(platform) && !sm[platform]) {
              // Priority: m.username -> m.platformUserId -> m.name
              sm[platform] = m.username || m.platformUserId || m.name || 'Linked';
            }
          });
        }

        setSocialMedia(sm);
      }
    } catch (error) {
      logger.error('Failed to fetch user profile', error);
      Alert.alert('Error', 'Failed to load profile information');
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle deep links for OAuth callbacks and refresh profile
  useEffect(() => {
    const handleDeepLink = async ({ url }) => {
      logger.debug('[Settings] Deep link received', { url });

      if (!url) return;

      // Check for both protocol schemes
      if (url.includes('adpartnr://social/callback') || url.includes('https://adpartnr.onrender.com/social/callback')) {
        logger.debug('[Settings] OAuth callback match found');

        let platform = '';
        let success = false;
        let username = '';
        let errorMsg = '';
        let profileUrl = '';

        try {
          // Manual parsing for robustness
          const queryString = url.split('?')[1];
          if (queryString) {
            const params = queryString.split('&');
            params.forEach(param => {
              const [key, value] = param.split('=');
              if (key === 'platform') platform = decodeURIComponent(value);
              if (key === 'success') success = value === 'true';
              if (key === 'username') username = decodeURIComponent((value || '').replace(/\+/g, ' '));
              if (key === 'error') errorMsg = decodeURIComponent(value || '').replace(/\+/g, ' ');
              if (key === 'profileUrl') profileUrl = decodeURIComponent((value || '').replace(/\+/g, ' '));
            });
          }
        } catch (e) {
          logger.error('[Settings] Error parsing deep link', e);
          Alert.alert('Error', 'Failed to process connection response');
          return;
        }

        const formattedPlatform = platform ? (platform.charAt(0).toUpperCase() + platform.slice(1)) : 'Platform';

        if (success) {
          logger.info(`[Settings] ${formattedPlatform} connected successfully`);
          try {
            const lowPlatform = platform?.toLowerCase();
            if (lowPlatform === 'facebook' || lowPlatform === 'instagram') {
              const socialService = await import('../services/social');

              // For Facebook, we might need to select a page if not already done
              if (lowPlatform === 'facebook') {
                const pagesResp = await socialService.getFacebookPages();
                const pages = pagesResp?.data?.pages || [];
                if (Array.isArray(pages) && pages.length > 0) {
                  if (pages.length === 1) {
                    await socialService.selectFacebookPage(pages[0].id);
                  } else {
                    // Present a selection
                    const top = pages.slice(0, 3);
                    await new Promise((resolve) => {
                      Alert.alert(
                        'Select Facebook Page',
                        'Choose which page to connect',
                        [
                          ...top.map(p => ({
                            text: p.name,
                            onPress: async () => {
                              try { await socialService.selectFacebookPage(p.id); }
                              catch (e) { logger.error('Select page error', e); }
                              finally { resolve(); }
                            }
                          })),
                          { text: 'Cancel', style: 'cancel', onPress: () => resolve() }
                        ],
                        { cancelable: true }
                      );
                    });
                  }
                }
              }

              // Always refresh profile URL from backend after connection/selection
              const profileResp = await socialService.getProfileUrl(lowPlatform);
              profileUrl = profileResp?.data?.profileUrl || profileUrl || '';
            }
          } catch (selErr) {
            logger.error('Social page/profile resolution error', selErr);
          } finally {
            fetchUserProfile(); // Refresh profile data
          }

          // Offer to open the external profile/page if available
          if (profileUrl) {
            Alert.alert(
              'Success',
              `${formattedPlatform} account${username ? ` (${username})` : ''} connected successfully!`,
              [
                { text: 'Open', onPress: async () => { try { await Linking.openURL(profileUrl); } catch (_) { } } },
                { text: 'OK' }
              ]
            );
          } else {
            Alert.alert(
              'Success',
              `${formattedPlatform} account${username ? ` (${username})` : ''} connected successfully!`,
              [{ text: 'OK' }]
            );
          }
        } else {
          logger.warn(`[Settings] ${formattedPlatform} connection failed:`, errorMsg);
          Alert.alert(
            'Connection Failed',
            errorMsg || `Could not connect to ${formattedPlatform}. Please try again.`,
            [{ text: 'OK' }]
          );
        }
      }
    };

    // Check if app was opened via deep link (initial launch)
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    }).catch((err) => {
      logger.error('[Settings] Error getting initial URL', err);
    });

    // Listen for deep links while component is mounted (running in background)
    const subscription = Linking.addEventListener('url', handleDeepLink);

    return () => {
      subscription?.remove();
    };
  }, [fetchUserProfile]);

  // Initial fetch and focus listener
  useEffect(() => {
    fetchUserProfile();

    // Refetch when screen comes into focus (after returning from EditProfile or OAuth callback)
    const unsubscribe = navigation?.addListener?.('focus', () => {
      fetchUserProfile();
    });
    return unsubscribe;
  }, [fetchUserProfile, navigation]);

  // Handle password change
  const handlePasswordChange = async () => {
    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Validation Error', 'Please fill in all password fields');
      return;
    }

    if (newPassword.length < 8) {
      Alert.alert('Validation Error', 'Password must be at least 8 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Validation Error', 'New passwords do not match');
      return;
    }

    try {
      setChangingPassword(true);

      // Use password change service
      // API: POST /api/auth/change-password
      // Payload: { oldPassword: string, newPassword: string }
      const userService = await import('../services/user');
      const response = await userService.changePassword(currentPassword, newPassword);

      if (response && (response.success || response.data || response.message)) {
        Alert.alert('Success', response.message || 'Password changed successfully', [
          {
            text: 'OK',
            onPress: () => {
              setShowPasswordModal(false);
              setCurrentPassword('');
              setNewPassword('');
              setConfirmPassword('');
            },
          },
        ]);
      } else {
        throw new Error(response?.message || 'Failed to change password');
      }
    } catch (error) {
      logger.error('Password change error', error);
      const errorMessage = error.message || error.data?.message || 'Failed to change password. Please try again.';
      Alert.alert('Error', errorMessage);
    } finally {
      setChangingPassword(false);
    }
  };

  // Handle social media link management
  const handleSocialMediaEdit = (platform) => {
    setEditingPlatform(platform);
    setSocialMediaUrl(socialMedia[platform] || '');
    setShowSocialMediaModal(true);
  };

  const handleSocialMediaDelete = async (platform) => {
    Alert.alert(
      'Delete Social Media Link',
      `Are you sure you want to remove your ${platform} link?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setSavingSocialMedia(true);
              const updatedSocialMedia = { ...socialMedia };
              delete updatedSocialMedia[platform]; // Remove the platform key

              // Remove empty/undefined values
              Object.keys(updatedSocialMedia).forEach(key => {
                if (!updatedSocialMedia[key]) {
                  delete updatedSocialMedia[key];
                }
              });

              const userService = await import('../services/user');
              await userService.updateProfile({
                socialMedia: updatedSocialMedia,
              });

              // Refetch profile to get updated social media from API
              try {
                const refreshResponse = await userService.getMyProfile();
                if (refreshResponse && refreshResponse.data) {
                  const refreshedProfile = refreshResponse.data;
                  if (refreshedProfile.socialMedia && typeof refreshedProfile.socialMedia === 'object') {
                    setSocialMedia({
                      instagram: refreshedProfile.socialMedia.instagram || '',
                      tiktok: refreshedProfile.socialMedia.tiktok || '',
                      youtube: refreshedProfile.socialMedia.youtube || '',
                      twitter: refreshedProfile.socialMedia.twitter || '',
                      facebook: refreshedProfile.socialMedia.facebook || '',
                    });
                  } else {
                    // If socialMedia is null/undefined/empty, reset all
                    setSocialMedia({
                      instagram: '',
                      tiktok: '',
                      youtube: '',
                      twitter: '',
                      facebook: '',
                    });
                  }
                }
              } catch (refreshError) {
                logger.error('Failed to refetch profile after social media delete', refreshError);
                // Fallback to local state if refetch fails
                setSocialMedia({
                  instagram: updatedSocialMedia.instagram || '',
                  tiktok: updatedSocialMedia.tiktok || '',
                  youtube: updatedSocialMedia.youtube || '',
                  twitter: updatedSocialMedia.twitter || '',
                  facebook: updatedSocialMedia.facebook || '',
                });
              }

              Alert.alert('Success', `${platform} link removed successfully`);
            } catch (error) {
              logger.error('Failed to delete social media link', error);
              Alert.alert('Error', error.message || 'Failed to remove link');
            } finally {
              setSavingSocialMedia(false);
            }
          },
        },
      ]
    );
  };

  const handleSocialMediaSave = async () => {
    if (!editingPlatform) return;

    try {
      setSavingSocialMedia(true);
      const trimmedUrl = socialMediaUrl.trim();
      const updatedSocialMedia = {
        ...socialMedia,
        [editingPlatform]: trimmedUrl || undefined,
      };

      // Remove undefined/empty values to keep payload clean
      Object.keys(updatedSocialMedia).forEach(key => {
        if (!updatedSocialMedia[key]) {
          delete updatedSocialMedia[key];
        }
      });

      const userService = await import('../services/user');
      const response = await userService.updateProfile({
        socialMedia: updatedSocialMedia,
      });

      if (response && (response.success || response.data)) {
        // Refetch profile to get updated social media from API
        try {
          const refreshResponse = await userService.getMyProfile();
          if (refreshResponse && refreshResponse.data) {
            const refreshedProfile = refreshResponse.data;
            if (refreshedProfile.socialMedia && typeof refreshedProfile.socialMedia === 'object') {
              setSocialMedia({
                instagram: refreshedProfile.socialMedia.instagram || '',
                tiktok: refreshedProfile.socialMedia.tiktok || '',
                youtube: refreshedProfile.socialMedia.youtube || '',
                twitter: refreshedProfile.socialMedia.twitter || '',
                facebook: refreshedProfile.socialMedia.facebook || '',
              });
            } else {
              // If socialMedia is null/undefined/empty, reset all
              setSocialMedia({
                instagram: '',
                tiktok: '',
                youtube: '',
                twitter: '',
                facebook: '',
              });
            }
          }
        } catch (refreshError) {
          logger.error('Failed to refetch profile after social media update', refreshError);
          // Fallback to local state if refetch fails
          setSocialMedia({
            instagram: updatedSocialMedia.instagram || '',
            tiktok: updatedSocialMedia.tiktok || '',
            youtube: updatedSocialMedia.youtube || '',
            twitter: updatedSocialMedia.twitter || '',
            facebook: updatedSocialMedia.facebook || '',
          });
        }

        setShowSocialMediaModal(false);
        setEditingPlatform(null);
        setSocialMediaUrl('');
        Alert.alert('Success', `${editingPlatform} link ${trimmedUrl ? 'updated' : 'removed'} successfully`);
      } else {
        throw new Error(response?.message || 'Failed to update social media link');
      }
    } catch (error) {
      logger.error('Failed to save social media link', error);
      Alert.alert('Error', error.message || 'Failed to update link. Please try again.');
    } finally {
      setSavingSocialMedia(false);
    }
  };

  // Use row's platform key to avoid wrong label (e.g. Facebook data showing under Instagram row)
  const getSocialMediaStatus = (platform) => {
    const platformLower = (platform || '').toLowerCase();
    const hasOAuthConnection = platformMetrics.some(
      m => m.platform && String(m.platform).toLowerCase() === platformLower
    );
    const hasUrl = socialMedia[platformLower];
    return (hasOAuthConnection || hasUrl) ? 'Connected' : 'Not Connected';
  };

  // Handle social media OAuth connection
  const handleSocialConnect = async (platform) => {
    try {
      setConnectingPlatform(platform);
      const socialService = await import('../services/social');

      let response;
      switch (platform.toLowerCase()) {
        case 'instagram':
          response = await socialService.connectInstagram('adpartnr://social/callback');
          break;
        case 'facebook':
          response = await socialService.connectFacebook('adpartnr://social/callback');
          break;
        case 'tiktok':
          response = await socialService.connectTikTok('adpartnr://social/callback');
          break;
        case 'twitter':
          response = await socialService.connectTwitter('adpartnr://social/callback');
          break;
        case 'youtube':
          response = await socialService.connectYouTube('adpartnr://social/callback');
          break;
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }

      if (response && response.success && response.data && response.data.authUrl) {
        // Store platform being connected for callback handling
        // This will be used when deep link is received
        const connectionState = response.data.state;

        // Open OAuth URL in browser
        const canOpen = await Linking.canOpenURL(response.data.authUrl);
        if (canOpen) {
          await Linking.openURL(response.data.authUrl);
          Alert.alert(
            'Connection Started',
            `Please complete the ${platform} authentication in your browser. After authentication, you will be redirected back to the app automatically.`,
            [{ text: 'OK' }]
          );
        } else {
          Alert.alert('Error', 'Cannot open browser. Please check your device settings.');
        }
      } else {
        throw new Error('Failed to get OAuth URL');
      }
    } catch (error) {
      logger.error(`Failed to connect ${platform}`, error);
      let errorMessage = error.message || `Failed to connect ${platform}. Please try again.`;

      // Provide helpful error message for common OAuth issues
      if (platform.toLowerCase() === 'facebook' || platform.toLowerCase() === 'instagram') {
        errorMessage += '\n\nNote: Facebook and Instagram require secure HTTPS connections. If you see a security error, please contact support.';
      }

      Alert.alert('Connection Error', errorMessage);
    } finally {
      setConnectingPlatform(null);
    }
  };

  // Handle social media metrics sync
  const handleSocialSync = async (platform) => {
    try {
      setSyncingPlatform(platform);
      const socialService = await import('../services/social');
      const userService = await import('../services/user');

      let response;
      switch (platform.toLowerCase()) {
        case 'instagram':
          response = await socialService.syncInstagram();
          break;
        case 'facebook':
          response = await socialService.syncFacebook();
          break;
        case 'tiktok':
          response = await socialService.syncTikTok();
          break;
        case 'twitter':
          response = await socialService.syncTwitter();
          break;
        case 'youtube':
          response = await socialService.syncYouTube();
          break;
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }

      if (response && response.success && response.data && response.data.metrics) {
        const platformLower = platform.toLowerCase();
        const syncPlatform = response.data.platform || platformLower;
        const metrics = response.data.metrics;

        try {
          const currentProfileResponse = await userService.getMyProfile();
          const currentProfile = currentProfileResponse?.data || currentProfileResponse;

          if (!currentProfile) {
            throw new Error('Failed to fetch current profile');
          }

          const currentPlatformMetrics = Array.isArray(currentProfile.platformMetrics)
            ? [...currentProfile.platformMetrics]
            : [];

          const existingIndex = currentPlatformMetrics.findIndex(
            m => m.platform && m.platform.toLowerCase() === platformLower
          );

          const updatedMetric = {
            platform: syncPlatform,
            followers: metrics.followers || 0,
            engagementRate: metrics.engagement ? (metrics.engagement * 100) : (metrics.engagementRate || 0),
            avgViews: metrics.avgViews || 0,
            verified: metrics.verified || false,
          };

          if (existingIndex >= 0) {
            currentPlatformMetrics[existingIndex] = updatedMetric;
          } else {
            currentPlatformMetrics.push(updatedMetric);
          }

          const updateResponse = await userService.updateProfile({
            platformMetrics: currentPlatformMetrics,
          });

          if (updateResponse && updateResponse.success !== false) {
            setPlatformMetrics(currentPlatformMetrics);

            Alert.alert(
              'Success',
              `${platform} metrics synced and saved successfully!`,
              [{ text: 'OK' }]
            );

            const refreshResponse = await userService.getMyProfile();
            if (refreshResponse && refreshResponse.data) {
              const refreshedProfile = refreshResponse.data;
              if (refreshedProfile.platformMetrics && Array.isArray(refreshedProfile.platformMetrics)) {
                setPlatformMetrics(refreshedProfile.platformMetrics);
              }
            }
          } else {
            throw new Error(updateResponse?.message || 'Failed to update profile with synced metrics');
          }
        } catch (updateError) {
          logger.error('Failed to update profile with synced metrics', updateError);
          Alert.alert(
            'Warning',
            `Metrics synced from ${platform}, but failed to save to profile. ${updateError.message || 'Please try again.'}`,
            [{ text: 'OK' }]
          );
        }
      } else {
        throw new Error(response?.message || 'Failed to sync metrics');
      }
    } catch (error) {
      logger.error(`Failed to sync ${platform}`, error);
      Alert.alert('Error', error.message || `Failed to sync ${platform} metrics. Please try again.`);
    } finally {
      setSyncingPlatform(null);
    }
  };

  const settingsSections = [
    {
      title: 'Account Settings',
      items: [
        {
          id: 'editProfile',
          label: 'Edit Profile',
          value: '',
          type: 'button',
          icon: 'edit',
          action: () => navigation?.navigate('EditProfile', { role: userRole }),
        },
        {
          id: 'email',
          label: 'Email',
          value: loading ? 'Loading...' : (userEmail || 'Not set'),
          type: 'text',
          icon: 'email',
          editable: false,
        },
        {
          id: 'phone',
          label: 'Phone Number',
          value: 'Change Phone Number',
          type: 'button',
          icon: 'phone',
          action: () => {
            setNewPhone(userPhone || '');
            setShowPhoneModal(true);
          },
        },
        {
          id: 'password',
          label: 'Password',
          value: 'Change Password',
          type: 'button',
          icon: 'lock',
          action: () => setShowPasswordModal(true),
        },
        ...(userRole?.toLowerCase() === 'creator' || userRole?.toLowerCase() === 'influencer' ? [{
          id: 'services',
          label: 'Services',
          value: 'Manage Services',
          type: 'button',
          icon: 'work',
          action: () => navigation?.navigate('ServicesManagement', { role: userRole }),
        }] : []),
      ],
    },
    {
      title: 'Notifications',
      items: [
        {
          id: 'push',
          label: 'Push Notifications',
          value: pushNotifications,
          type: 'switch',
          onToggle: setPushNotifications,
        },
        {
          id: 'email',
          label: 'Email Notifications',
          value: emailNotifications,
          type: 'switch',
          onToggle: setEmailNotifications,
        },
        {
          id: 'sms',
          label: 'SMS Notifications',
          value: smsNotifications,
          type: 'switch',
          onToggle: setSmsNotifications,
        },
      ],
    },
    {
      title: 'Privacy',
      items: [
        {
          id: 'profile',
          label: 'Profile Visibility',
          value: 'Public',
          type: 'button',
          icon: 'visibility',
          action: () => alert('Change Profile Visibility'),
        },
        {
          id: 'data',
          label: 'Data Usage',
          value: 'Standard',
          type: 'button',
          icon: 'data-usage',
          action: () => alert('Manage Data Usage'),
        },
        {
          id: 'instagram',
          label: 'Instagram',
          value: loading ? 'Loading...' : getSocialMediaStatus('instagram'),
          type: 'social',
          icon: null,
          platform: 'instagram',
          action: () => handleSocialMediaEdit('instagram'),
        },
        {
          id: 'tiktok',
          label: 'TikTok',
          value: loading ? 'Loading...' : getSocialMediaStatus('tiktok'),
          type: 'social',
          icon: null,
          platform: 'tiktok',
          action: () => handleSocialMediaEdit('tiktok'),
        },
        {
          id: 'youtube',
          label: 'YouTube',
          value: loading ? 'Loading...' : getSocialMediaStatus('youtube'),
          type: 'social',
          icon: null,
          platform: 'youtube',
          action: () => handleSocialMediaEdit('youtube'),
        },
        {
          id: 'twitter',
          label: 'X (Twitter)',
          value: loading ? 'Loading...' : getSocialMediaStatus('twitter'),
          type: 'social',
          icon: null,
          platform: 'twitter',
          action: () => handleSocialMediaEdit('twitter'),
        },
        {
          id: 'facebook',
          label: 'Facebook',
          value: loading ? 'Loading...' : getSocialMediaStatus('facebook'),
          type: 'social',
          icon: null,
          platform: 'facebook',
          action: () => handleSocialMediaEdit('facebook'),
        },
      ],
    },
    {
      title: 'Exit',
      items: [
        {
          id: 'logout',
          label: 'Logout',
          value: 'Sign out of your account',
          type: 'button',
          icon: 'logout',
          action: () => {
            Alert.alert(
              'Logout',
              'Are you sure you want to logout?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Logout',
                  style: 'destructive',
                  onPress: handleLogout,
                },
              ]
            );
          },
        },
      ],
    },
  ];

  const handleLogout = async () => {
    try {
      setLoading(true);
      await signOut();
      navigation?.reset('ChooseRole');
    } catch (error) {
      logger.error('Logout error', error);
      Alert.alert('Error', 'Failed to logout. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {
          const returnScreen = route?.params?.returnScreen || navigation?.getParam?.('returnScreen');
          if (returnScreen === 'CreatorProfile') {
            navigation?.navigate('AppNavigator', { initialTab: 'Profile' });
          } else if (returnScreen === 'CreateOffer') {
            navigation?.navigate('CreateOffer');
          } else if (returnScreen === 'Inbox') {
            navigation?.navigate('AppNavigator', { initialTab: 'Messages' });
          } else if (returnScreen === 'ActiveOrders') {
            navigation?.navigate('AppNavigator', { initialTab: 'Orders' });
          } else if (navigation?.goBack) {
            navigation.goBack();
          }
        }}>
          <MaterialIcons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {settingsSections.map((section, sectionIndex) => (
          <View key={sectionIndex} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionContent}>
              {section.items.map((item, itemIndex) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.settingItem,
                    itemIndex === section.items.length - 1 && styles.settingItemLast,
                  ]}
                  onPress={item.action}
                  activeOpacity={item.type === 'button' ? 0.7 : 1}
                  disabled={item.type === 'switch' || (item.type === 'text' && item.editable === false)}
                >
                  <View style={styles.settingItemLeft}>
                    {item.platform ? (
                      <PlatformIcon
                        platform={item.platform}
                        size={24}
                        color="#337DEB"
                        style={styles.settingIcon}
                      />
                    ) : item.icon ? (
                      <MaterialIcons
                        name={item.icon}
                        size={24}
                        color="#337DEB"
                        style={styles.settingIcon}
                      />
                    ) : null}
                    <View style={styles.settingTextContainer}>
                      <Text style={styles.settingLabel}>{item.label}</Text>
                      {item.type === 'text' && (
                        <Text style={styles.settingValue}>{item.value}</Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.settingItemRight}>
                    {item.type === 'switch' && (
                      <Switch
                        value={item.value}
                        onValueChange={item.onToggle}
                        trackColor={{ false: '#D1D5DB', true: '#337DEB' }}
                        thumbColor="#FFFFFF"
                      />
                    )}
                    {item.type === 'social' && item.platform && (
                      <View style={styles.socialActions}>
                        <TouchableOpacity
                          style={styles.socialButton}
                          onPress={(e) => {
                            e.stopPropagation();
                            handleSocialConnect(item.platform);
                          }}
                          disabled={connectingPlatform === item.platform}
                        >
                          {connectingPlatform === item.platform ? (
                            <ActivityIndicator size="small" color="#337DEB" />
                          ) : (
                            <>
                              <MaterialIcons name="link" size={16} color="#337DEB" />
                              <Text style={styles.socialButtonText}>Connect</Text>
                            </>
                          )}
                        </TouchableOpacity>
                        {(socialMedia[item.platform] || platformMetrics.some(m => m.platform && m.platform.toLowerCase() === item.platform.toLowerCase())) && (
                          <TouchableOpacity
                            style={[styles.socialButton, styles.syncButton]}
                            onPress={(e) => {
                              e.stopPropagation();
                              handleSocialSync(item.platform);
                            }}
                            disabled={syncingPlatform === item.platform}
                          >
                            {syncingPlatform === item.platform ? (
                              <ActivityIndicator size="small" color="#10b981" />
                            ) : (
                              <>
                                <MaterialIcons name="sync" size={16} color="#10b981" />
                                <Text style={[styles.socialButtonText, styles.syncButtonText]}>Sync</Text>
                              </>
                            )}
                          </TouchableOpacity>
                        )}
                        <Text style={styles.settingValueText}>{item.value}</Text>
                      </View>
                    )}
                    {item.type === 'button' && !item.platform && (
                      <>
                        <Text style={styles.settingValueText}>{item.value}</Text>
                        <MaterialIcons name="chevron-right" size={24} color="#CBD5E0" />
                      </>
                    )}
                    {item.type === 'text' && (
                      <MaterialIcons name="lock" size={20} color="#9CA3AF" style={{ marginLeft: 8 }} />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Password Change Modal */}
      <Modal
        visible={showPasswordModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowPasswordModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Password</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowPasswordModal(false);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
              >
                <MaterialIcons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Current Password</Text>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Enter current password"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>New Password</Text>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Enter new password (min. 8 characters)"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry
                  value={newPassword}
                  onChangeText={setNewPassword}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Confirm New Password</Text>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Confirm new password"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                />
              </View>

              <TouchableOpacity
                style={[styles.changePasswordButton, changingPassword && styles.changePasswordButtonDisabled]}
                onPress={handlePasswordChange}
                disabled={changingPassword}
              >
                <Text style={styles.changePasswordButtonText}>
                  {changingPassword ? 'Changing Password...' : 'Change Password'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Phone Change Modal */}
      <Modal
        visible={showPhoneModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowPhoneModal(false);
          setNewPhone('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Phone Number</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowPhoneModal(false);
                  setNewPhone('');
                }}
              >
                <MaterialIcons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Current Phone Number</Text>
                <TextInput
                  style={[styles.passwordInput, { backgroundColor: '#F3F4F6', color: '#6B7280' }]}
                  value={userPhone || 'Not set'}
                  editable={false}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>New Phone Number</Text>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Enter new phone number (e.g., +1234567890)"
                  placeholderTextColor="#9CA3AF"
                  value={newPhone}
                  onChangeText={setNewPhone}
                  keyboardType="phone-pad"
                  autoCorrect={false}
                />
                <Text style={styles.inputHint}>
                  Include country code (e.g., +1 for US, +234 for Nigeria)
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.changePasswordButton, (changingPhone || !newPhone.trim() || newPhone === userPhone) && styles.changePasswordButtonDisabled]}
                onPress={async () => {
                  if (!newPhone.trim()) {
                    Alert.alert('Validation Error', 'Please enter a new phone number');
                    return;
                  }

                  if (newPhone.trim() === userPhone) {
                    Alert.alert('Validation Error', 'New phone number must be different from current phone number');
                    return;
                  }

                  try {
                    setChangingPhone(true);
                    const userService = await import('../services/user');
                    const response = await userService.updateProfile({
                      phone: newPhone.trim(),
                    });

                    if (response && (response.success !== false || response.data || response.message)) {
                      // Refetch profile to get updated phone
                      const refreshResponse = await userService.getMyProfile();
                      if (refreshResponse && refreshResponse.data) {
                        setUserPhone(refreshResponse.data.phone || newPhone.trim());
                      } else {
                        setUserPhone(newPhone.trim());
                      }

                      Alert.alert('Success', 'Phone number updated successfully', [
                        {
                          text: 'OK',
                          onPress: () => {
                            setShowPhoneModal(false);
                            setNewPhone('');
                          },
                        },
                      ]);
                    } else {
                      throw new Error(response?.message || 'Failed to update phone number');
                    }
                  } catch (error) {
                    logger.error('Phone change error', error);
                    const errorMessage = error.message || error.data?.message || 'Failed to update phone number. Please try again.';
                    Alert.alert('Error', errorMessage);
                  } finally {
                    setChangingPhone(false);
                  }
                }}
                disabled={changingPhone || !newPhone.trim() || newPhone === userPhone}
              >
                <Text style={styles.changePasswordButtonText}>
                  {changingPhone ? 'Updating Phone Number...' : 'Update Phone Number'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Social Media Management Modal */}
      <Modal
        visible={showSocialMediaModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowSocialMediaModal(false);
          setEditingPlatform(null);
          setSocialMediaUrl('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingPlatform ? `Manage ${editingPlatform.charAt(0).toUpperCase() + editingPlatform.slice(1)}` : 'Social Media Link'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowSocialMediaModal(false);
                  setEditingPlatform(null);
                  setSocialMediaUrl('');
                }}
              >
                <MaterialIcons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>
                  {editingPlatform ? `${editingPlatform.charAt(0).toUpperCase() + editingPlatform.slice(1)} URL` : 'Social Media URL'}
                </Text>
                <TextInput
                  style={styles.passwordInput}
                  placeholder={`Enter your ${editingPlatform} profile URL`}
                  placeholderTextColor="#9CA3AF"
                  value={socialMediaUrl}
                  onChangeText={setSocialMediaUrl}
                  autoCapitalize="none"
                  keyboardType="url"
                />
                <Text style={styles.inputHint}>
                  Example: https://instagram.com/yourusername or https://www.tiktok.com/@yourusername
                </Text>
              </View>

              <View style={styles.socialMediaActions}>
                <TouchableOpacity
                  style={[styles.saveButton, savingSocialMedia && styles.saveButtonDisabled]}
                  onPress={handleSocialMediaSave}
                  disabled={savingSocialMedia}
                >
                  <Text style={styles.saveButtonText}>
                    {savingSocialMedia ? 'Saving...' : 'Save'}
                  </Text>
                </TouchableOpacity>

                {socialMedia[editingPlatform] && (
                  <TouchableOpacity
                    style={[styles.deleteButton, savingSocialMedia && styles.deleteButtonDisabled]}
                    onPress={() => {
                      setShowSocialMediaModal(false);
                      handleSocialMediaDelete(editingPlatform);
                    }}
                    disabled={savingSocialMedia}
                  >
                    <MaterialIcons name="delete-outline" size={20} color="#EF4444" />
                    <Text style={styles.deleteButtonText}>Remove Link</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  scrollView: {
    flex: 1,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  settingItemLast: {
    borderBottomWidth: 0,
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingIcon: {
    marginRight: 12,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
    marginBottom: 2,
  },
  settingValue: {
    fontSize: 14,
    color: '#6B7280',
  },
  settingItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingValueText: {
    fontSize: 14,
    color: '#6B7280',
    marginRight: 4,
  },
  // Password Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  inputHint: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    fontStyle: 'italic',
  },
  passwordInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1F2937',
  },
  changePasswordButton: {
    backgroundColor: '#337DEB',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  changePasswordButtonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.6,
  },
  changePasswordButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Social Media Modal Styles
  socialMediaActions: {
    marginTop: 20,
    gap: 12,
  },
  saveButton: {
    backgroundColor: '#337DEB',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    paddingVertical: 14,
    gap: 8,
  },
  deleteButtonDisabled: {
    opacity: 0.6,
  },
  deleteButtonText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default Settings;
