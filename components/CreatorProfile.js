import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, Dimensions, Alert, Modal, TextInput, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../hooks/useAuth';
import Toast from './Toast';
import { getCompactDualPrice } from '../utils/currency';
import { getApiBaseUrl } from '../services/api';
import { PlatformIcon } from '../utils/platformIcons';
import { getCache, setCache, DEFAULT_TTL, removeCache } from '../utils/cache';
import SendToBrandModal from './SendToBrandModal';

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

// Import MaterialCommunityIcons
let MaterialCommunityIcons;
try {
  const MCIModule = require('react-native-vector-icons/MaterialCommunityIcons');
  MaterialCommunityIcons = MCIModule.default || MCIModule;
  if (typeof MaterialCommunityIcons !== 'function') {
    MaterialCommunityIcons = ({ name, size, color, style }) => (
      <MaterialIcons name={name} size={size} color={color} style={style} />
    );
  }
} catch (error) {
  MaterialCommunityIcons = ({ name, size, color, style }) => (
    <MaterialIcons name={name} size={size} color={color} style={style} />
  );
}

// Import image picker
let launchCamera, launchImageLibrary;
try {
  const ImagePicker = require('react-native-image-picker');
  launchCamera = ImagePicker.launchCamera || ImagePicker.default?.launchCamera;
  launchImageLibrary = ImagePicker.launchImageLibrary || ImagePicker.default?.launchImageLibrary;
} catch (error) {
  console.error('Error importing image picker:', error);
  launchCamera = () => {};
  launchImageLibrary = () => {};
}

const { width } = Dimensions.get('window');

const CreatorProfile = ({ navigation, route, insideAppNavigator = false }) => {
  const { user } = useAuth();
  const currentUserRole = (user?.role || user?.userRole)?.toLowerCase();
  const isCurrentUserBrand = currentUserRole === 'brand';

  const [activeTab, setActiveTab] = useState('Portfolio');
  const [activeBottomTab, setActiveBottomTab] = useState('Profile'); // Track active tab for bottom navigation
  const [showShareModal, setShowShareModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showPortfolioModal, setShowPortfolioModal] = useState(false);
  const [imageViewerUrl, setImageViewerUrl] = useState(null);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [previewAspect, setPreviewAspect] = useState(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' });
  const showToast = (message, type = 'info') => setToast({ visible: true, message, type });
  const [showPortfolioActions, setShowPortfolioActions] = useState(false);
  const [portfolioActionItem, setPortfolioActionItem] = useState(null);
  const [portfolioActionUrl, setPortfolioActionUrl] = useState(null);
  const [portfolioActionIsImage, setPortfolioActionIsImage] = useState(false);
  const [editingPortfolioItem, setEditingPortfolioItem] = useState(null);
  const [portfolioType, setPortfolioType] = useState('photo'); // photo, video, link
  const [portfolioTitle, setPortfolioTitle] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [portfolioThumbnail, setPortfolioThumbnail] = useState('');
  const [portfolioDescription, setPortfolioDescription] = useState('');
  const [portfolioTags, setPortfolioTags] = useState('');
  const [portfolioOrder, setPortfolioOrder] = useState(0);
  const [savingPortfolio, setSavingPortfolio] = useState(false);
  const [syncingInsights, setSyncingInsights] = useState(false);

  const [profile, setProfile] = useState(null);
  const [portfolio, setPortfolio] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [reviewerCache, setReviewerCache] = useState({}); // Cache for reviewer profiles
  const [connectModalVisible, setConnectModalVisible] = useState(false);
  const [connectMessage, setConnectMessage] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [isConnectedWithCreator, setIsConnectedWithCreator] = useState(false);
  const [connectionId, setConnectionId] = useState(null);
  const [showSendProposalsModal, setShowSendProposalsModal] = useState(false);
  const [creatorOffers, setCreatorOffers] = useState([]);
  const [offersLoaded, setOffersLoaded] = useState(false);
  const userId = route?.params?.userId; // If viewing another user
  const isSelf = !userId;

  const mapCategoryToUI = (category) => {
    if (!category) return '';
    const categoryMap = {
      'fashion_beauty': 'Fashion',
      'beauty': 'Beauty',
      'lifestyle': 'Lifestyle',
      'tech_gadgets': 'Tech',
      'fitness_health': 'Fitness',
      'food_dining': 'Food',
      'travel': 'Travel',
      'travel_lifestyle': 'Travel',
    };
    return categoryMap[category.toLowerCase()] || category.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  // Helper to resolve image and media URLs
  const resolveImageUrl = (data, type = 'image') => {
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

  const calculateTotalFollowers = () => {
    let total = 0;

    // 1. Prefer API aggregate (profile API returns totalFollowers from User.socialAccounts)
    if (profile?.totalFollowers != null && Number(profile.totalFollowers) > 0) {
      return formatFollowerCount(Number(profile.totalFollowers));
    }

    // 2. Sum from platformReach or platformFollowers or platformMetrics
    const metrics = profile?.platformReach || profile?.platformFollowers || profile?.platformMetrics || [];
    metrics.forEach(m => {
      if (m.followers) total += Number(m.followers);
      else if (m.followerCount) total += Number(m.followerCount);
      else if (m.count) total += Number(m.count);
    });

    // 3. Check socialAccounts (legacy) – keys may be lowercase (instagram, facebook) or mixed
    if (total === 0 && profile?.socialAccounts) {
      Object.keys(profile.socialAccounts).forEach(key => {
        const account = profile.socialAccounts[key];
        if (account && typeof account === 'object') {
          const count = account.followers ?? account.followerCount ?? account.count;
          if (count != null) total += Number(count);
        }
      });
    }

    // 4. Other profile-level aggregate fields (and creator populates)
    if (total === 0) {
      total = Number(profile?.followersCount || profile?.followerCount || profile?.totalReach || 0);
    }
    if (total === 0 && profile?.creatorId && typeof profile.creatorId === 'object') {
      const c = profile.creatorId;
      total = Number(c?.totalFollowers || c?.followersCount || c?.platformMetrics?.[0]?.followers || 0);
    }

    // 5. Check platformReach again (redundant but safe)
    if (total === 0 && Array.isArray(profile?.platformReach)) {
      profile.platformReach.forEach(m => {
        total += Number(m.followers || m.followerCount || 0);
      });
    }

    if (total === 0) return '0';
    return formatFollowerCount(total);
  };

  const formatFollowerCount = (total) => {
    if (!total || total === 0) return '0';
    if (total >= 1000000) return (total / 1000000).toFixed(1) + 'M';
    if (total >= 1000) return (total / 1000).toFixed(1) + 'K';
    return total.toString();
  };

  // Round engagement rate to max 3 decimal places (e.g. 0.025623268698060944% -> 0.026%)
  const formatEngagementRate = (value) => {
    const n = Number(value);
    if (value == null || !Number.isFinite(n) || n <= 0) return '0%';
    const fixed = parseFloat(n.toFixed(3));
    return fixed + '%';
  };

  const calculateEngagementRate = () => {
    // 1. Prefer API aggregate (profile API returns totalEngagementRate from User.socialAccounts)
    if (profile?.totalEngagementRate != null && Number(profile.totalEngagementRate) > 0) {
      return (Number(profile.totalEngagementRate) || 0).toFixed(1) + '%';
    }
    // 2. Other direct fields
    if (profile?.engagementRate) return (Number(profile.engagementRate) || 0).toFixed(1) + '%';
    if (profile?.avgEngagementRate) return (Number(profile.avgEngagementRate) || 0).toFixed(1) + '%';
    if (profile?.engagement) return (Number(profile.engagement) || 0).toFixed(1) + '%';

    // 3. Average from platformReach / platformEngagementRates / platformMetrics
    const metrics = profile?.platformReach || profile?.platformEngagementRates || profile?.platformMetrics || [];
    if (metrics.length > 0) {
      const rates = metrics.map(m => Number(m.engagementRate || m.rate || 0)).filter(r => r > 0);
      if (rates.length > 0) {
        const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
        return avg.toFixed(1) + '%';
      }
    }

    // 4. Check for top-level engagement field
    if (profile?.engagement) return (Number(profile.engagement) || 0).toFixed(1) + '%';

    // 5. From populated creatorId (when profile is populated)
    if (profile?.creatorId && typeof profile.creatorId === 'object') {
      const c = profile.creatorId;
      const rate = c?.totalEngagementRate ?? c?.engagementRate ?? c?.platformMetrics?.[0]?.engagementRate;
      if (rate != null && Number(rate) > 0) return (Number(rate)).toFixed(1) + '%';
    }

    return '0%';
  };

  // Track pending profile fetches to prevent duplicate requests
  const pendingFetchesRef = React.useRef({});

  // Fetch functions moved out of loadData for accessibility (e.g. navigation focus listener)
  const fetchProfile = useCallback(async () => {
    if (!profile && !userId && !user?.id && !user?._id) return; // Wait for initial profile or userId

    // Prevent duplicate fetches for the same ID
    const fetchKey = userId || 'self';
    if (pendingFetchesRef.current[fetchKey]) {
      return;
    }

    try {
      pendingFetchesRef.current[fetchKey] = true;
      let response;

      const userService = await import('../services/user');

      if (userId) {
        // Try getProfileByUserId first
        try {
          response = await userService.getProfileByUserId(userId);
          if (response && response.data) {
            const profileData = response.data;
            const normalizedProfile = {
              ...profileData,
              id: profileData.id || profileData._id,
              _id: profileData._id || profileData.id,
            };
            setProfile(normalizedProfile);
            try { await setCache('creator_profile_' + userId, normalizedProfile, DEFAULT_TTL.SHORT); } catch (e) { /* ignore */ }
            return;
          }
        } catch (getProfileError) {
          // Check for duplicate key error even in GET (backend bug mitigation)
          const errorMsg = getProfileError?.data?.message || getProfileError?.message || '';
          if (errorMsg.includes('E11000') || errorMsg.includes('duplicate key')) {
            console.warn('[CreatorProfile] Backend duplicate key error on GET, retrying after delay...');
            setTimeout(fetchProfile, 1000);
            return;
          }

          console.warn('[CreatorProfile] getProfileByUserId failed, using getCreators fallback:', getProfileError);
          // Fallback: Use getCreators API
          try {
            const creatorsResponse = await userService.getCreators({ page: 1, limit: 100 });
            if (creatorsResponse && creatorsResponse.success && creatorsResponse.data) {
              const creators = creatorsResponse.data.creators || [];
              const foundCreator = creators.find(c => (c.id || c._id) === userId);
              if (foundCreator) {
                const prof = { ...foundCreator, id: foundCreator.id || foundCreator._id };
                setProfile(prof);
                try { await setCache('creator_profile_' + userId, prof, DEFAULT_TTL.SHORT); } catch (e) { /* ignore */ }
                return;
              }
            }
          } catch (fallbackError) {
            console.error('[CreatorProfile] Fallback failed:', fallbackError);
          }
        }
      } else {
        // Viewing own profile - use getMyProfile
        try {
          response = await userService.getMyProfile();
          if (response && response.data) {
            const profileData = response.data;
            const normalizedProfile = {
              ...profileData,
              id: profileData.id || profileData._id,
              _id: profileData._id || profileData.id,
              profileImage: profileData.profileImage || profileData.avatar || null,
              bannerImage: profileData.bannerImage || null,
            };
            setProfile(normalizedProfile);
            try { await setCache('creator_profile_self', normalizedProfile, DEFAULT_TTL.SHORT); } catch (e) { /* ignore */ }
          }
        } catch (myProfileError) {
          const errorMsg = myProfileError?.data?.message || myProfileError?.message || '';
          if (errorMsg.includes('E11000') || errorMsg.includes('duplicate key')) {
            console.warn('[CreatorProfile] Own profile duplicate key error, retrying...');
            setTimeout(fetchProfile, 1000);
            return;
          }
          console.error('[CreatorProfile] Failed to fetch own profile', myProfileError);
        }
      }
    } catch (error) {
      console.error('[CreatorProfile] fetchProfile major error:', error);
    } finally {
      const fetchKey = userId || 'self';
      delete pendingFetchesRef.current[fetchKey];
    }
  }, [userId, user?.id, user?._id]); // Removed profile from dependencies to stop the loop

  const fetchPortfolio = useCallback(async () => {
    const targetId = userId || (user?.id || user?._id);
    if (!targetId) return;

    try {
      const portfolioService = await import('../services/portfolio');
      let portfolioResponse;

      if (userId) {
        // Viewing another user's portfolio
        portfolioResponse = await portfolioService.getUserPortfolio(userId);
      } else {
        // Viewing own portfolio
        try {
          portfolioResponse = await portfolioService.getMyPortfolio();
        } catch (e) {
          // Fallback to ID-based fetch if profile call fails
          try {
            portfolioResponse = await portfolioService.getUserPortfolio(targetId);
          } catch (_) { /* ignore */ }
        }
      }

      if (portfolioResponse && portfolioResponse.data) {
        const portfolioData = Array.isArray(portfolioResponse.data)
          ? portfolioResponse.data
          : portfolioResponse.data.items || portfolioResponse.data.portfolio || [];
        if (!userId && (!portfolioData || portfolioData.length === 0)) {
          // Final fallback: try ID-based request explicitly
          try {
            const resp2 = await portfolioService.getUserPortfolio(targetId);
            const items2 = Array.isArray(resp2?.data) ? resp2.data : (resp2?.data?.items || []);
            if (items2 && items2.length > 0) {
              setPortfolio(items2);
              return;
            }
          } catch (_) { /* ignore */ }
        }
        setPortfolio(portfolioData || []);
      }
    } catch (error) {
      console.error("Failed to fetch portfolio", error);
      setPortfolio([]);
    }
  }, [userId, user?.id, user?._id]);

  const fetchReviews = useCallback(async () => {
    let targetUserId = userId;

    // If viewing own profile, get user ID from profile
    if (!targetUserId) {
      // Use the current user's ID from auth context if not viewing another user
      targetUserId = user?.id || user?._id;
    }

    if (!targetUserId) return;

    try {
      const reviewsService = await import('../services/reviews');
      const userService = await import('../services/user'); // Import userService here for reviewer fetching

      // Fetch all reviews for accurate average calculation (increase limit to get all)
      const reviewsResponse = await reviewsService.getUserReviews(targetUserId, { type: 'received', page: 1, limit: 100 });

      if (reviewsResponse && reviewsResponse.data) {
        const reviewsData = Array.isArray(reviewsResponse.data)
          ? reviewsResponse.data
          : reviewsResponse.data.reviews || reviewsResponse.data.items || [];

        // Collect unique reviewer IDs that need fetching (deduplicate)
        const reviewerIdsToFetch = new Set();
        reviewsData.forEach(review => {
          let reviewerId = null;
          if (typeof review.reviewerId === 'string') {
            reviewerId = review.reviewerId;
          } else if (review.reviewerId && typeof review.reviewerId === 'object') {
            reviewerId = review.reviewerId._id || review.reviewerId.id;
          }

          if (reviewerId) {
            // Check if reviewer is already populated with name data
            const reviewer = review.reviewer || (typeof review.reviewerId === 'object' && review.reviewerId !== null ? review.reviewerId : null);
            const hasName = reviewer && (
              reviewer.name ||
              reviewer.companyName ||
              reviewer.username ||
              reviewer.firstName ||
              (reviewer.firstName && reviewer.lastName)
            );

            // Only fetch if not in cache and no name available
            if (!reviewerCache[reviewerId] && !hasName) {
              reviewerIdsToFetch.add(reviewerId);
            }
          }
        });

        // Fetch all reviewer profiles in parallel
        const fetchReviewerProfile = async (id) => {
          try {
            const res = await userService.getProfileByUserId(id);
            if (res && res.data) {
              setReviewerCache(prev => ({ ...prev, [id]: res.data }));
            }
          } catch (e) {
            console.warn(`Failed to fetch reviewer profile for ID ${id}:`, e);
          }
        };
        const fetchPromises = Array.from(reviewerIdsToFetch).map(id => fetchReviewerProfile(id));
        await Promise.allSettled(fetchPromises);

        // Map reviews with reviewer data
        const reviewsWithReviewers = reviewsData.map((review) => {
          let reviewerId = null;
          if (typeof review.reviewerId === 'string') {
            reviewerId = review.reviewerId;
          } else if (review.reviewerId && typeof review.reviewerId === 'object') {
            reviewerId = review.reviewerId._id || review.reviewerId.id;
          }

          let reviewer = review.reviewer || (typeof review.reviewerId === 'object' && review.reviewerId !== null ? review.reviewerId : null);

          if (!reviewer || (!reviewer.name && !reviewer.companyName && !reviewer.username && !reviewer.firstName)) {
            if (reviewerId && reviewerCache[reviewerId]) {
              reviewer = reviewerCache[reviewerId];
            }
          }

          if (!reviewer && reviewerId) {
            reviewer = { _id: reviewerId, id: reviewerId };
          }

          const cappedRating = Math.min(5, Math.max(0, review.rating || review.overallRating || 0));

          return {
            ...review,
            reviewer: reviewer || { _id: reviewerId, id: reviewerId },
            rating: cappedRating,
          };
        });

        setReviews(reviewsWithReviewers);
      }
    } catch (error) {
      console.error("Failed to fetch reviews", error);
      setReviews([]);
    }
  }, [userId, user?.id, user?._id]); // Removed reviewerCache to stop the loop

  useEffect(() => {
    const cacheKey = 'creator_profile_' + (userId || 'self');
    const applyCache = async () => {
      try {
        const cached = await getCache(cacheKey);
        if (cached && (cached.id || cached._id)) {
          setProfile(cached);
        }
      } catch (e) { /* ignore */ }
    };
    applyCache();

    const loadData = async () => {
      await Promise.all([
        fetchProfile(),
        fetchPortfolio(),
        fetchReviews()
      ]);
    };

    loadData();

    // Refresh when gaining focus if it's self profile
    if (isSelf) {
      const unsubscribe = navigation?.addListener?.('focus', () => {
        fetchProfile();
        fetchPortfolio();
        fetchReviews();
      });
      return unsubscribe;
    }
  }, [navigation, userId, fetchProfile, fetchPortfolio, fetchReviews, isSelf]);

  // Refresh profile data when screen gains focus (for self or other user)
  useEffect(() => {
    const unsubscribe = navigation?.addListener?.('focus', () => {
      fetchProfile();
      fetchPortfolio();
      fetchReviews();
    });
    return unsubscribe;
  }, [navigation, fetchProfile, fetchPortfolio, fetchReviews]);

  useEffect(() => {
    const reset = () => {
      setProfile(null);
      setPortfolio([]);
      setReviews([]);
      setReviewerCache({});
      setCreatorOffers([]);
      setOffersLoaded(false);
      const key = 'creator_profile_' + (userId || 'self');
      removeCache(key).catch(() => { });
    };
    const unsubscribe = navigation?.addListener?.('blur', reset);
    return () => {
      reset();
      if (unsubscribe) unsubscribe();
    };
  }, [navigation, userId]);

  // When a brand views a creator profile, check if already connected
  useEffect(() => {
    if (!isCurrentUserBrand || isSelf) return;
    const targetId = profile?.id || profile?._id || userId;
    if (!targetId) return;
    let cancelled = false;
    (async () => {
      try {
        const { checkConnection } = await import('../services/connections');
        const res = await checkConnection(targetId);
        if (cancelled) return;
        setIsConnectedWithCreator(!!res?.connected);
        setConnectionId(res?.connectionId || null);
      } catch (e) {
        if (!cancelled) {
          setIsConnectedWithCreator(false);
          setConnectionId(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [isCurrentUserBrand, isSelf, profile?.id, profile?._id, userId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const offersService = await import('../services/offers');
        const myId = profile?._id || profile?.id || user?._id || user?.id || null;
        const res = await offersService.getAllOffers({ page: 1, limit: 50, creatorId: myId });
        const list = Array.isArray(res?.data) ? res.data : (res?.data?.offers || []);
        const mine = list.filter(o => {
          const cid = typeof o.creatorId === 'object' ? (o.creatorId?._id || o.creatorId?.id) : o.creatorId;
          return myId && cid && String(cid) === String(myId);
        }).slice(0, 5);
        if (mounted) setCreatorOffers(mine);
      } catch (_) {
        if (mounted) setCreatorOffers([]);
      } finally {
        if (mounted) setOffersLoaded(true);
      }
    })();
    return () => { mounted = false; };
  }, [profile?._id, profile?.id, user?._id, user?.id]);

  const handleConnect = () => {
    if (isCurrentUserBrand) {
      setConnectMessage('');
      setConnectModalVisible(true);
    } else {
      handleMessage();
    }
  };

  const handleConnectSubmit = async () => {
    const targetUserId = profile?.id || profile?._id;
    const myId = user?.id || user?._id;
    if (!myId || !targetUserId) {
      showToast('Unable to connect. IDs missing.', 'error');
      return;
    }
    setConnecting(true);
    try {
      const { sendConnect } = await import('../services/connections');
      const { getOrCreateConversation, sendMessage } = await import('../services/chat');
      const messageText = (connectMessage || '').trim();

      const result = await sendConnect(targetUserId, messageText || undefined);
      if (!result || (!result.connection && !result.alreadyConnected)) {
        throw new Error(result?.message || 'Connection request failed');
      }

      const targetUserName = profile?.name || profile?.username || 'Creator';
      const targetUserAvatar = profile?.profileImage || profile?.avatar || '';
      const bName = user?.name || user?.companyName || 'Brand';
      const bAvatar = user?.profileImage || user?.avatar || '';

      const conversation = await getOrCreateConversation(myId, targetUserId, {
        brandName: bName,
        influencerName: targetUserName,
        brandAvatar: bAvatar,
        influencerAvatar: targetUserAvatar,
      });

      if (messageText && conversation?.id) {
        await sendMessage(conversation.id, { text: messageText }, myId, 'brand');
      }

      setConnectModalVisible(false);
      setConnectMessage('');
      setIsConnectedWithCreator(true);
      if (result?.connection?._id) setConnectionId(String(result.connection._id));
      navigation?.navigate('Chat', {
        conversation: {
          id: conversation.id,
          name: targetUserName,
          avatar: targetUserAvatar || (targetUserName ? targetUserName.substring(0, 2).toUpperCase() : '??'),
          subtitle: 'Creator',
        },
      });
    } catch (error) {
      console.error('Connect error:', error);
      showToast(error?.message || 'Failed to connect. Please try again.', 'error');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    const targetUserId = profile?.id || profile?._id;
    if (!targetUserId) return;
    try {
      const { disconnect } = await import('../services/connections');
      await disconnect(connectionId ? { connectionId } : { creatorId: targetUserId });
      setIsConnectedWithCreator(false);
      setConnectionId(null);
      showToast('Disconnected.', 'success');
    } catch (e) {
      console.error('Disconnect error:', e);
      showToast(e?.message || 'Failed to disconnect.', 'error');
    }
  };

  const handleMessage = async () => {
    // Navigate to Chat screen to start/continue conversation
    if (profile?.id || profile?._id) {
      try {
        const targetUserId = profile.id || profile._id;
        const targetUserName = profile.name || profile.username || 'User';
        const targetUserAvatar = profile.profileImage || profile.avatar || '';

        const myId = user?.id || user?._id;

        if (!myId || !targetUserId) {
          showToast('Unable to start chat. IDs missing.', 'error');
          return;
        }

        // Use getOrCreateConversation to ensure we have a valid conversation document
        const { getOrCreateConversation } = await import('../services/chat');

        // Determine who is brand and who is influencer
        let bId, iId, bName, iName, bAvatar, iAvatar;

        if (isCurrentUserBrand) {
          bId = myId;
          bName = user?.name || 'Brand';
          bAvatar = user?.profileImage || user?.avatar || '';
          iId = targetUserId;
          iName = targetUserName;
          iAvatar = targetUserAvatar;
        } else {
          // If a creator is messaging a creator? (Fallback logic)
          bId = targetUserId; // Assume target is brand if current is creator and messaging
          bName = targetUserName;
          bAvatar = targetUserAvatar;
          iId = myId;
          iName = user?.name || 'Creator';
          iAvatar = user?.profileImage || user?.avatar || '';
        }

        const conversation = await getOrCreateConversation(bId, iId, {
          brandName: bName,
          influencerName: iName,
          brandAvatar: bAvatar,
          influencerAvatar: iAvatar
        });

        navigation?.navigate('Chat', {
          conversation: {
            id: conversation.id,
            name: targetUserName,
            avatar: targetUserAvatar || (targetUserName ? targetUserName.substring(0, 2).toUpperCase() : '??'),
            subtitle: isCurrentUserBrand ? 'Creator' : 'Brand'
          }
        });
      } catch (error) {
        console.error('Failed to start chat from Profile:', error);
        showToast('Failed to start chat. Please try again.', 'error');
      }
    } else {
      showToast('Unable to message. User profile not found.', 'error');
    }
  };

  const handleSocialConnect = async (platform) => {
    const normalized = platform.toLowerCase();
    let openedViaBackend = false;

    // If viewing own profile, prefer backend-generated profile URL for accuracy (e.g., FB Page ID, YT channel)
    if (!userId) {
      try {
        const socialService = await import('../services/social');
        const resp = await socialService.getProfileUrl(normalized);
        const url = resp?.data?.profileUrl || resp?.profileUrl;
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
          Linking.openURL(url).catch(err => {
            console.error(`[CreatorProfile] Failed to open ${platform} URL (backend):`, err, 'URL:', url);
            showToast(`Could not open ${platform} link.`, 'error');
          });
          openedViaBackend = true;
          return;
        }
      } catch (e) {
        // Fallback to local resolution below
      }
    }

    // Fallback/local resolution from displayed profile data (works for self or viewing other creators)
    // 1. Get the raw value from profile - may be a string OR an object
    let rawValue = profile?.socialMedia?.[platform.toLowerCase()];

    // 2. Resolve if value is an object (backend may store { username, url, handle, profileUrl })
    let value;
    if (rawValue && typeof rawValue === 'object') {
      // Prefer a direct URL if present, otherwise use username/handle
      value = rawValue.url || rawValue.profileUrl || rawValue.link ||
        rawValue.username || rawValue.handle || rawValue.platformUserId || null;
    } else {
      value = rawValue || null;
    }

    // 3. Fallback to platformMetrics if not found in socialMedia
    if (!value) {
      const metrics = profile?.platformMetrics || profile?.platformReach || [];
      const metric = metrics.find(m => m.platform?.toLowerCase() === platform.toLowerCase());
      value = metric?.url || metric?.profileUrl || metric?.platformUserId || metric?.username;
    }

    // 4. Special case for Website
    if (platform.toLowerCase() === 'website') {
      const wRaw = profile?.website || profile?.socialMedia?.website;
      value = (wRaw && typeof wRaw === 'object')
        ? (wRaw.url || wRaw.link || wRaw.website)
        : wRaw;
    }

    if (value) {
      let fullUrl = String(value).trim();

      // 5. If not an absolute URL, build one from the platform base URL
      if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
        const baseUrls = {
          instagram: 'https://instagram.com/',
          tiktok: 'https://www.tiktok.com/@',
          youtube: 'https://youtube.com/',
          facebook: 'https://www.facebook.com/',
          twitter: 'https://twitter.com/',
        };

        const baseUrl = baseUrls[platform.toLowerCase()];
        if (baseUrl) {
          let handle = fullUrl.startsWith('@') ? fullUrl.slice(1) : fullUrl;

          // Ensure Facebook handles that are just IDs are handled correctly (no trailing slashes etc)
          if (platform.toLowerCase() === 'facebook' && /^\d+$/.test(handle)) {
            fullUrl = baseUrl + handle;
          } else {
            fullUrl = baseUrl + handle;
          }
        } else if (platform.toLowerCase() === 'website') {
          fullUrl = 'https://' + fullUrl;
        }
      }

      // 6. Open the resolved URL
      Linking.openURL(fullUrl).catch(err => {
        console.error(`[CreatorProfile] Failed to open ${platform} URL:`, err, 'Full URL:', fullUrl);
        showToast(`Could not open ${platform} link. Please ensure the link or handle is correct.`, 'error');
      });
    } else {
      showToast(`${platform} link not available`, 'info');
    }
  };

  const handleSendProposals = () => {
    setShowSendProposalsModal(true);
  };

  const handleDrawer = () => {
    if (navigation?.openDrawer) {
      navigation.openDrawer();
    } else {
      navigation?.goBack();
    }
  };

  const handleMenu = () => {
    setShowShareModal(true);
  };

  const handleShare = () => {
    setShowShareModal(false);
    showToast('Profile shared successfully!', 'success');
  };

  const handleReport = () => {
    setShowShareModal(false);
    setShowReportModal(true);
  };

  const handleReportSubmit = () => {
    setShowReportModal(false);
    showToast('Report submitted. Thank you for your feedback.', 'success');
  };


  const handlePortfolioItem = (item) => {
    // Resolve a viable URL from item fields
    const rawMediaUrl = (item?.media && item.media[0]) ? (typeof item.media[0] === 'string' ? item.media[0] : item.media[0]?.url) : null;
    const itemUrlString = typeof item?.url === 'string' ? item.url :
      (item?.url?.url || item?.url?.uri || item?.url?.mediaUrl || item?.url?.secure_url || null);
    const targetUrl = resolveImageUrl(itemUrlString || rawMediaUrl);
    const looksLikeImage = typeof (itemUrlString || rawMediaUrl) === 'string' && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(itemUrlString || rawMediaUrl);

    if (isSelf) {
      setPortfolioActionItem(item);
      setPortfolioActionUrl(targetUrl || null);
      setPortfolioActionIsImage(!!looksLikeImage);
      setShowPortfolioActions(true);
      return;
    }

    if (targetUrl) {
      if (looksLikeImage) {
        setImageViewerUrl(targetUrl);
        setShowImageViewer(true);
      } else {
        Linking.openURL(targetUrl).catch(() => { });
      }
      return;
    }
    showToast(item.title || 'Portfolio item', 'info');
  };

  const handleAddPortfolio = () => {
    setEditingPortfolioItem(null);
    setPortfolioType('photo');
    setPortfolioTitle('');
    setPortfolioUrl('');
    setPortfolioThumbnail('');
    setPortfolioDescription('');
    setPortfolioTags('');
    setPortfolioOrder(0);
    setShowPortfolioModal(true);
  };

  const handleEditPortfolio = (item) => {
    setEditingPortfolioItem(item);
    setPortfolioType(item.type || 'photo');
    setPortfolioTitle(item.title || '');
    setPortfolioUrl(item.url || '');
    setPortfolioThumbnail(item.thumbnail || '');
    setPortfolioDescription(item.description || '');
    setPortfolioTags(item.tags ? item.tags.join(', ') : '');
    setPortfolioOrder(item.order || 0);
    setShowPortfolioModal(true);
  };

  const handleDeletePortfolio = async (item) => {
    try {
      if (item.url || item.thumbnail) {
        try {
          const { deleteFile, extractPublicId } = await import('../services/upload');
          const fileUrl = item.url || item.thumbnail;
          if (fileUrl && typeof fileUrl === 'string' && (fileUrl.startsWith('http://') || fileUrl.startsWith('https://'))) {
            const publicId = extractPublicId(fileUrl);
            if (publicId) {
              const resourceType = item.type === 'photo' || item.type === 'image' ? 'image' : 'raw';
              try {
                await deleteFile(publicId, resourceType);
              } catch (deleteError) {
                console.warn('Failed to delete media file from Cloudinary:', deleteError);
              }
            }
          }
        } catch (uploadServiceError) {
          console.warn('Error accessing upload service:', uploadServiceError);
        }
      }

      const portfolioService = await import('../services/portfolio');
      const response = await portfolioService.deletePortfolio(item._id || item.id);

      if (response && (response.success || response.data)) {
        showToast('Portfolio item deleted successfully', 'success');
        const portfolioService2 = await import('../services/portfolio');
        const portfolioResponse = await portfolioService2.getMyPortfolio();
        if (portfolioResponse && portfolioResponse.data) {
          const portfolioData = Array.isArray(portfolioResponse.data)
            ? portfolioResponse.data
            : portfolioResponse.data.items || [];
          setPortfolio(portfolioData);
        }
      } else {
        throw new Error(response?.message || 'Failed to delete portfolio item');
      }
    } catch (error) {
      console.error('Failed to delete portfolio:', error);
      showToast(error.message || 'Failed to delete portfolio item', 'error');
    }
  };

  const handleUploadPortfolioFile = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: portfolioType === 'video' ? 'video' : 'photo',
        quality: 0.8,
        includeBase64: false,
      });

      if (result.didCancel) return;
      if (result.errorCode) {
        showToast(result.errorMessage || 'Image picker error', 'error');
        return;
      }

      const asset = result.assets?.[0];
      if (!asset?.uri) return;
      // Client-side guard: Max 60 seconds for video
      if (portfolioType === 'video' && typeof asset.duration === 'number' && asset.duration > 60) {
        showToast('Please upload a video that is 60 seconds or less.', 'warning');
        return;
      }

      setSavingPortfolio(true);

      const file = {
        uri: asset.uri,
        type: asset.type || (portfolioType === 'video' ? 'video/mp4' : 'image/jpeg'),
        name: asset.fileName || `portfolio_${Date.now()}.${portfolioType === 'video' ? 'mp4' : 'jpg'}`,
      };

      console.log('[CreatorProfile] Uploading portfolio file:', file);

      let response;
      if (portfolioType === 'video') {
        const { uploadVideo } = await import('../services/upload');
        response = await uploadVideo(file);
      } else {
        const { uploadImage } = await import('../services/upload');
        response = await uploadImage(file);
      }

      if (response && response.data && response.data.url) {
        setPortfolioUrl(response.data.url);
        if (portfolioType === 'video' && response.data.thumbnail) {
          setPortfolioThumbnail(response.data.thumbnail);
        }
        showToast('File uploaded successfully!', 'success');
      } else {
        throw new Error('Upload failed - No URL returned');
      }
    } catch (error) {
      console.error('Portfolio upload error:', error);
      showToast(error.message || 'Could not upload file', 'error');
    } finally {
      setSavingPortfolio(false);
    }
  };

  const handleSavePortfolio = async () => {
    if (!portfolioUrl.trim() && portfolioType !== 'link') {
      showToast('Please enter a URL', 'error');
      return;
    }

    if (portfolioType === 'link' && !portfolioUrl.trim()) {
      showToast('Please enter a link URL', 'error');
      return;
    }

    try {
      setSavingPortfolio(true);
      const portfolioService = await import('../services/portfolio');

      const portfolioData = {
        type: portfolioType,
        url: portfolioUrl.trim(),
        ...(portfolioThumbnail.trim() && { thumbnail: portfolioThumbnail.trim() }),
        ...(portfolioTitle.trim() && { title: portfolioTitle.trim() }),
        ...(portfolioDescription.trim() && { description: portfolioDescription.trim() }),
        ...(portfolioTags.trim() && {
          tags: portfolioTags.split(',').map(tag => tag.trim()).filter(tag => tag)
        }),
        order: portfolioOrder || 0,
        isPublic: true,
      };

      let response;
      if (editingPortfolioItem) {
        // Update existing item
        response = await portfolioService.updatePortfolio(editingPortfolioItem._id || editingPortfolioItem.id, portfolioData);
      } else {
        // Create new item
        response = await portfolioService.createPortfolioItem(portfolioData);
      }

      if (response && (response.success || response.data)) {
        showToast(editingPortfolioItem ? 'Portfolio item updated successfully' : 'Portfolio item created successfully', 'success');
        setShowPortfolioModal(false);

        // Refetch portfolio
        const portfolioResponse = await portfolioService.getMyPortfolio();
        if (portfolioResponse && portfolioResponse.data) {
          const portfolioData = Array.isArray(portfolioResponse.data)
            ? portfolioResponse.data
            : portfolioResponse.data.items || [];
          setPortfolio(portfolioData);
        }
      } else {
        throw new Error(response?.message || 'Failed to save portfolio item');
      }
    } catch (error) {
      console.error('Failed to save portfolio:', error);
      showToast(error.message || 'Failed to save portfolio item', 'error');
    } finally {
      setSavingPortfolio(false);
    }
  };

  const handleReviewPress = () => {
    navigation?.navigate('Reviews', { returnScreen: 'CreatorProfile' });
  };

  const handleEditProfile = () => {
    navigation?.navigate('EditProfile', { role: 'Creator' });
  };

  const handleInsightPress = (insight) => {
    showToast(`Viewing ${insight} insights...`, 'info');
  };

  const handleSyncInsights = async () => {
    try {
      setSyncingInsights(true);
      const socialService = await import('../services/social');
      const userService = await import('../services/user');

      // Sync Instagram by default as it's the primary source of insights
      await socialService.syncInstagram();

      // Refresh profile to get new insights
      const response = await userService.getMyProfile();
      if (response && response.data) {
        setProfile(response.data);
        showToast('Audience insights updated successfully!', 'success');
      }
    } catch (error) {
      console.error('Failed to sync insights:', error);
      showToast('Could not refresh insights. Please try again later.', 'error');
    } finally {
      setSyncingInsights(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with Background Image */}
        <View style={styles.headerSection}>
          {(() => {
            const bannerUrl = resolveImageUrl(profile?.bannerImage);
            console.log('[CreatorProfile] Rendering banner image - URL:', bannerUrl);
            return bannerUrl ? (
              <Image
                source={{ uri: bannerUrl }}
                style={styles.backgroundImage}
                resizeMode="cover"
                onError={(error) => console.error('[CreatorProfile] Banner image load error:', error.nativeEvent.error)}
              />
            ) : (
              <View style={[styles.backgroundImage, { backgroundColor: '#337DEB' }]} />
            );
          })()}

          {/* Navigation Icons */}
          <View style={styles.navIcons}>
            <TouchableOpacity style={styles.backButton} onPress={handleDrawer}>
              <MaterialIcons name={isSelf ? "menu" : "arrow-back"} size={24} color="#ffffff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuButton} onPress={handleMenu}>
              <MaterialIcons name="more-vert" size={24} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Social Media Icons Sidebar */}
          <View style={styles.socialSidebar}>
            {profile?.socialMedia?.instagram && (
              <TouchableOpacity style={styles.socialIcon} onPress={() => handleSocialConnect('Instagram')}>
                <PlatformIcon platform="Instagram" size={20} color="#ffffff" />
              </TouchableOpacity>
            )}
            {profile?.socialMedia?.tiktok && (
              <TouchableOpacity style={styles.socialIcon} onPress={() => handleSocialConnect('TikTok')}>
                <PlatformIcon platform="TikTok" size={20} color="#ffffff" />
              </TouchableOpacity>
            )}
            {profile?.socialMedia?.youtube && (
              <TouchableOpacity style={styles.socialIcon} onPress={() => handleSocialConnect('YouTube')}>
                <PlatformIcon platform="YouTube" size={20} color="#ffffff" />
              </TouchableOpacity>
            )}
            {profile?.socialMedia?.facebook && (
              <TouchableOpacity style={styles.socialIcon} onPress={() => handleSocialConnect('Facebook')}>
                <PlatformIcon platform="Facebook" size={20} color="#ffffff" />
              </TouchableOpacity>
            )}
            {profile?.socialMedia?.twitter && (
              <TouchableOpacity style={styles.socialIcon} onPress={() => handleSocialConnect('Twitter')}>
                <PlatformIcon platform="Twitter" size={20} color="#ffffff" />
              </TouchableOpacity>
            )}
            {profile?.website && (
              <TouchableOpacity style={styles.socialIcon} onPress={() => handleSocialConnect('Website')}>
                <MaterialIcons name="link" size={20} color="#ffffff" />
              </TouchableOpacity>
            )}
          </View>

          {/* Dark Overlay for Profile Info */}
          <View style={styles.darkOverlay}>
            {/* Profile Card */}
            <View style={styles.profileCard}>
              {(() => {
                // Check both profileImage and avatar fields
                const profileImageUrl = resolveImageUrl(profile?.profileImage || profile?.avatar);
                return profileImageUrl ? (
                  <Image
                    source={{ uri: profileImageUrl }}
                    style={styles.profileImage}
                    onError={(error) => console.error('[CreatorProfile] Profile image load error:', error.nativeEvent.error, 'URL:', profileImageUrl)}
                  />
                ) : (
                  <View style={[styles.profileImage, { backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' }]}>
                    <MaterialIcons name="person" size={40} color="#9CA3AF" />
                  </View>
                );
              })()}
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{profile?.name || 'Loading...'}</Text>

                {(() => {
                  const loc = profile?.location || null;
                  let displayLoc = '';
                  if (loc) {
                    if (typeof loc === 'string') {
                      displayLoc = loc.trim();
                    } else {
                      const city = loc.city && !/^(n\/?a)$/i.test(loc.city) ? loc.city : '';
                      const state = loc.state && !/^(n\/?a)$/i.test(loc.state) ? loc.state : '';
                      const country = loc.country && !/^(n\/?a)$/i.test(loc.country) ? loc.country : '';
                      if (city && state) displayLoc = `${city}, ${state}`;
                      else if (city && country) displayLoc = `${city}, ${country}`;
                      else displayLoc = state || country || city || '';
                    }
                  }
                  if (displayLoc) {
                    return (
                      <View style={styles.locationContainer}>
                        <MaterialIcons name="location-on" size={16} color="#ffffff" />
                        <Text style={styles.locationText}>{displayLoc}</Text>
                      </View>
                    );
                  }
                  return <Text style={styles.locationText}>Remote</Text>;
                })()}
              </View>
            </View>
          </View>
        </View>

        {/* Tags, Metrics & Actions Section */}
        <View style={styles.metricsSection}>
          {/* Tags */}
          <View style={styles.tagsContainer}>
            {profile?.categories && profile.categories.map((cat, index) => (
              <View key={index} style={[styles.tag, index % 2 === 1 && styles.tagGreen]}>
                <MaterialIcons name="local-florist" size={16} color="#ffffff" />
                <Text style={styles.tagText}>{mapCategoryToUI(cat)}</Text>
              </View>
            ))}
            {!profile?.categories && (
              <View style={styles.tag}>
                <MaterialIcons name="local-florist" size={16} color="#ffffff" />
                <Text style={styles.tagText}>General</Text>
              </View>
            )}
          </View>

          {/* Statistics */}
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                {calculateTotalFollowers()}
              </Text>
              <Text style={styles.statLabel}>Followers</Text>
            </View>
            {(() => {
              const rateStr = calculateEngagementRate();
              const rateNum = Number((rateStr || '0').toString().replace('%', '')) || 0;
              if (rateNum <= 0) return null;
              return (
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>
                    {rateStr}
                  </Text>
                  <Text style={styles.statLabel}>Engagement</Text>
                </View>
              );
            })()}
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                {(() => {
                  // Calculate average rating from actual reviews array (same as Reviews section)
                  if (reviews && reviews.length > 0) {
                    const totalStars = reviews.reduce((sum, r) => {
                      const rating = r.rating || r.overallRating || 0;
                      const cappedRating = Math.min(Math.max(0, rating), 5);
                      return sum + cappedRating;
                    }, 0);
                    const avgRating = totalStars / reviews.length;
                    return Math.min(5, Math.max(0, avgRating)).toFixed(1);
                  }
                  // Fallback to profile rating if reviews not loaded yet
                  // Check averageRating first (most accurate), then rating
                  // If rating > 5, it might be a sum - divide by reviewCount if available
                  const reviewCount = profile?.reviewCount || profile?.totalReviews || 1;
                  let fallbackRating = profile?.averageRating || profile?.rating;

                  if (fallbackRating !== undefined && fallbackRating !== null) {
                    fallbackRating = Number(fallbackRating) || 0;
                    // If rating > 5 and we have reviewCount > 1, it might be a sum - divide it
                    if (fallbackRating > 5 && reviewCount > 1) {
                      fallbackRating = fallbackRating / reviewCount;
                    }
                    // Cap at 5 and ensure it's a valid number
                    const cappedFallback = Math.min(5, Math.max(0, fallbackRating));
                    return cappedFallback.toFixed(1);
                  }
                  return 'N/A';
                })()}
              </Text>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            {!isSelf && isCurrentUserBrand && (
              isConnectedWithCreator ? (
                <>
                  <View style={styles.connectedBadge}>
                    <MaterialIcons name="check-circle" size={18} color="#10b981" />
                    <Text style={styles.connectedBadgeText}>Connected</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.disconnectButton}
                    onPress={handleDisconnect}
                  >
                    <Text style={styles.disconnectButtonText}>Disconnect</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={styles.connectButton}
                  onPress={handleConnect}
                >
                  <Text style={styles.connectButtonText}>Connect</Text>
                </TouchableOpacity>
              )
            )}
            <TouchableOpacity style={styles.messageButton} onPress={handleMessage}>
              <MaterialIcons name="chat" size={20} color="#6b7280" />
            </TouchableOpacity>
            {/* Only show edit button when viewing own profile (not when brand views creator) */}
            {isSelf && (
              <TouchableOpacity style={styles.editButton} onPress={handleEditProfile}>
                <MaterialIcons name="edit" size={20} color="#6b7280" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Social Media Reach Section */}
        <View style={styles.socialReachSection}>
          <Text style={styles.sectionTitle}>Social Media Reach</Text>

          {(() => {
            const platforms = ['Instagram', 'TikTok', 'YouTube', 'Facebook', 'Twitter'];
            const metrics = profile?.platformMetrics || profile?.platformReach || [];
            const socialMedia = profile?.socialMedia || {};

            const toPlatformLabel = (val) => {
              const n = String(val || '').toLowerCase();
              if (n === 'tiktok') return 'TikTok';
              if (n === 'youtube') return 'YouTube';
              if (n === 'facebook') return 'Facebook';
              if (n === 'twitter') return 'Twitter';
              return 'Instagram';
            };

            // Get unique platforms from both socialMedia and metrics
            const availablePlatforms = new Set(
              [
                ...Object.keys(socialMedia).filter(k => !!socialMedia[k]).map(toPlatformLabel),
                ...metrics.map(m => toPlatformLabel(m.platform)),
              ].filter(p => platforms.includes(p))
            );

            if (availablePlatforms.size === 0) {
              return <Text style={{ color: '#6b7280', fontStyle: 'italic', padding: 10 }}>No social media accounts linked.</Text>;
            }

            return Array.from(availablePlatforms).map(platform => {
              const platformLower = platform.toLowerCase();
              const metric = metrics.find(m => m.platform?.toLowerCase() === platformLower);

              // Optimized handle resolution: socialMedia handle -> metric username -> metric name -> fallback
              let handle = socialMedia[platformLower] || metric?.username || metric?.name;

              // If handle is a numerical ID for Facebook, try to use "Facebook Page" as a label if name is missing
              if (platformLower === 'facebook' && /^\d+$/.test(handle) && !metric?.name) {
                handle = 'Facebook Page';
              }

              if (!handle) {
                handle = metric ? 'Linked' : 'Not Linked';
              }

              const platformColors = {
                'Instagram': '#E4405F',
                'TikTok': '#000000',
                'YouTube': '#FF0000',
                'Facebook': '#1877F2',
                'Twitter': '#1DA1F2'
              };

              return (
                <TouchableOpacity
                  key={platform}
                  style={styles.socialCard}
                  onPress={() => handleSocialConnect(platform)}
                >
                  <View style={styles.socialCardHeader}>
                    <View style={styles.socialIconContainer}>
                      <PlatformIcon platform={platform} size={28} color={platformColors[platform] || '#333'} />
                    </View>
                    <View style={styles.socialInfo}>
                      <Text style={styles.socialPlatform}>{platform}</Text>
                      <Text style={styles.socialHandle}>{handle}</Text>
                      <Text style={styles.socialFollowers}>
                        {metric
                          ? `${metric.followers >= 1000 ? (metric.followers / 1000).toFixed(1) + 'K' : (metric.followers || 0)} followers`
                          : 'Linked (Connect for stats)'}
                      </Text>
                    </View>
                  </View>
                  <MaterialIcons name="chevron-right" size={24} color="#9ca3af" />
                </TouchableOpacity>
              );
            });
          })()}
        </View>

        {/* About Me Section */}
        <View style={styles.aboutSection}>
          <Text style={styles.sectionTitle}>About Me</Text>
          <Text style={styles.aboutText}>
            {profile?.bio || 'No bio added yet.'}
          </Text>
          <View style={styles.hashtagContainer}>
            {profile?.categories && profile.categories.map((cat, index) => (
              <View key={index} style={[styles.hashtag, index % 2 === 0 ? styles.hashtagBlue : styles.hashtagPink]}>
                <Text style={styles.hashtagText}>#{mapCategoryToUI(cat).replace(/\s+/g, '')}</Text>
              </View>
            ))}
            {!profile?.categories && (
              <View style={[styles.hashtag, styles.hashtagBlue]}>
                <Text style={styles.hashtagText}>#Creator</Text>
              </View>
            )}
          </View>
        </View>

        {/* Audience Insights Section */}
        <View style={styles.insightsSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Audience Insights</Text>
            {isSelf && (
              <TouchableOpacity
                style={styles.refreshBadge}
                onPress={handleSyncInsights}
                disabled={syncingInsights}
              >
                {syncingInsights ? (
                  <ActivityIndicator size="small" color="#337DEB" />
                ) : (
                  <>
                    <MaterialIcons name="refresh" size={14} color="#337DEB" />
                    <Text style={styles.refreshText}>Refresh</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Top Locations */}
          {profile?.audienceInsights?.topLocations && profile.audienceInsights.topLocations.length > 0 ? (
            <View style={styles.insightItem}>
              <Text style={styles.insightSubtitle}>Top Locations</Text>
              <Text style={styles.insightDescription}>Based on followers</Text>
              <View style={styles.progressContainer}>
                {profile.audienceInsights.topLocations.slice(0, 4).map((location, index) => {
                  const colors = [styles.progressBlue, styles.progressGreen, styles.progressPurple, styles.progressOrange];
                  return (
                    <View key={index} style={styles.progressItem}>
                      <Text style={styles.progressLabel}>{location.country}</Text>
                      <View style={styles.progressBar}>
                        <View style={[styles.progressFill, colors[index % colors.length], { width: `${location.percentage || 0}%` }]} />
                      </View>
                      <Text style={styles.progressPercent}>{location.percentage || 0}%</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : (
            <View style={styles.insightItem}>
              <Text style={styles.insightSubtitle}>Top Locations</Text>
              <Text style={styles.insightDescription}>No location data available</Text>
            </View>
          )}

          {/* Gender Distribution */}
          {profile?.audienceInsights?.genderDistribution ? (
            <View style={styles.insightItem}>
              <Text style={styles.insightSubtitle}>Gender Distribution</Text>
              <Text style={styles.insightDescription}>Based on followers</Text>
              <View style={styles.progressContainer}>
                {profile.audienceInsights.genderDistribution.female > 0 && (
                  <View style={styles.progressItem}>
                    <Text style={styles.progressLabel}>Female</Text>
                    <View style={styles.progressBar}>
                      <View style={[styles.progressFill, styles.progressPink, { width: `${profile.audienceInsights.genderDistribution.female || 0}%` }]} />
                    </View>
                    <Text style={styles.progressPercent}>{profile.audienceInsights.genderDistribution.female || 0}%</Text>
                  </View>
                )}
                {profile.audienceInsights.genderDistribution.male > 0 && (
                  <View style={styles.progressItem}>
                    <Text style={styles.progressLabel}>Male</Text>
                    <View style={styles.progressBar}>
                      <View style={[styles.progressFill, styles.progressBlue, { width: `${profile.audienceInsights.genderDistribution.male || 0}%` }]} />
                    </View>
                    <Text style={styles.progressPercent}>{profile.audienceInsights.genderDistribution.male || 0}%</Text>
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.insightItem}>
              <Text style={styles.insightSubtitle}>Gender Distribution</Text>
              <Text style={styles.insightDescription}>No gender data available</Text>
            </View>
          )}

          {/* Summary Cards */}
          {profile?.audienceInsights && (
            <View style={styles.summaryCards}>
              {profile.audienceInsights.ageGroups && profile.audienceInsights.ageGroups.length > 0 && (
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryText}>
                    Age Group {profile.audienceInsights.ageGroups[0].range} ({profile.audienceInsights.ageGroups[0].percentage}%)
                  </Text>
                </View>
              )}
              {profile.audienceInsights.avgViews && (
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryText}>
                    Avg Views {profile.audienceInsights.avgViews > 1000
                      ? `${(profile.audienceInsights.avgViews / 1000).toFixed(0)}K`
                      : profile.audienceInsights.avgViews}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Reviews Section */}
        <View style={styles.reviewsSection}>
          <TouchableOpacity
            style={styles.reviewsHeader}
            onPress={handleReviewPress}
          >
            <Text style={styles.sectionTitle}>
              Reviews {reviews && reviews.length > 0 ? `(${reviews.length})` : (profile?.reviewCount ? `(${profile.reviewCount})` : '(0)')}
            </Text>
            <View style={styles.ratingContainer}>
              <MaterialIcons name="star" size={20} color="#fbbf24" />
              <Text style={styles.ratingText}>
                {(() => {
                  // Calculate average rating from actual reviews array
                  if (reviews && reviews.length > 0) {
                    const totalStars = reviews.reduce((sum, r) => {
                      const rating = r.rating || r.overallRating || 0;
                      const cappedRating = Math.min(Math.max(0, rating), 5);
                      return sum + cappedRating;
                    }, 0);
                    const avgRating = totalStars / reviews.length;
                    return Math.min(5, Math.max(0, avgRating)).toFixed(1);
                  }
                  // Fallback to profile rating if reviews not loaded yet
                  // Check averageRating first (most accurate), then rating
                  // If rating > 5, it might be a sum - divide by reviewCount if available
                  const reviewCount = profile?.reviewCount || profile?.totalReviews || 1;
                  let fallbackRating = profile?.averageRating || profile?.rating;

                  if (fallbackRating !== undefined && fallbackRating !== null) {
                    fallbackRating = Number(fallbackRating) || 0;
                    // If rating > 5 and we have reviewCount > 1, it might be a sum - divide it
                    if (fallbackRating > 5 && reviewCount > 1) {
                      fallbackRating = fallbackRating / reviewCount;
                    }
                    // Cap at 5 and ensure it's a valid number
                    const cappedFallback = Math.min(5, Math.max(0, fallbackRating));
                    return cappedFallback.toFixed(1);
                  }
                  return 'N/A';
                })()}
              </Text>
            </View>
          </TouchableOpacity>

          {reviews && reviews.length > 0 ? (
            reviews.slice(0, 3).map((review, index) => {
              // Handle both populated reviewer object and ID - check if reviewer was fetched
              const reviewer = review.reviewer || (typeof review.reviewerId === 'object' && review.reviewerId !== null ? review.reviewerId : {});

              // Extract reviewer ID for fetching if needed
              let reviewerId = null;
              if (typeof review.reviewerId === 'string') {
                reviewerId = review.reviewerId;
              } else if (review.reviewerId && typeof review.reviewerId === 'object') {
                reviewerId = review.reviewerId._id || review.reviewerId.id;
              }

              // Check multiple possible name fields: name, companyName, username, firstName/lastName
              // Also check reviewerCache if reviewer object is empty
              let reviewerName = reviewer.name || reviewer.companyName || reviewer.username ||
                (reviewer.firstName && reviewer.lastName ? `${reviewer.firstName} ${reviewer.lastName}`.trim() : null) ||
                reviewer.firstName || reviewer.lastName || null;

              // If no name found and we have reviewerId, check cache
              if (!reviewerName && reviewerId && reviewerCache[reviewerId]) {
                const cachedReviewer = reviewerCache[reviewerId];
                reviewerName = cachedReviewer.name || cachedReviewer.companyName || cachedReviewer.username ||
                  (cachedReviewer.firstName && cachedReviewer.lastName ? `${cachedReviewer.firstName} ${cachedReviewer.lastName}`.trim() : null) ||
                  cachedReviewer.firstName || cachedReviewer.lastName || 'Anonymous';
              } else if (!reviewerName) {
                reviewerName = 'Anonymous';
              }

              const reviewerImage = reviewer.profileImage || reviewer.avatar || (reviewerId && reviewerCache[reviewerId] ? (reviewerCache[reviewerId].profileImage || reviewerCache[reviewerId].avatar) : null);
              // Cap rating at 5
              const rating = review.rating !== undefined ? review.rating : Math.min(5, Math.max(0, review.overallRating || 0));
              const comment = review.comment || review.review || 'No comment';

              // Helper to get initials
              const getInitials = (name) => {
                if (!name || name === 'Anonymous') return '?';
                const parts = name.split(' ').filter(p => p.length > 0);
                if (parts.length >= 2) {
                  return (parts[0][0] + parts[1][0]).toUpperCase();
                }
                return name.substring(0, 2).toUpperCase();
              };

              return (
                <View key={review._id || review.id || index} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    {reviewerImage ? (
                      <Image
                        source={{ uri: resolveImageUrl(reviewerImage) || 'https://via.placeholder.com/100' }}
                        style={styles.reviewerImage}
                      />
                    ) : (
                      <View style={[styles.reviewerImage, { backgroundColor: '#337DEB', justifyContent: 'center', alignItems: 'center' }]}>
                        <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: 'bold' }}>
                          {getInitials(reviewerName)}
                        </Text>
                      </View>
                    )}
                    <View style={styles.reviewInfo}>
                      <Text style={styles.reviewerName}>{reviewerName}</Text>
                      <View style={styles.reviewStars}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <MaterialIcons
                            key={star}
                            name="star"
                            size={16}
                            color={star <= rating ? "#fbbf24" : "#e5e7eb"}
                          />
                        ))}
                      </View>
                    </View>
                  </View>
                  <Text style={styles.reviewText}>
                    "{comment}"
                  </Text>
                </View>
              );
            })
          ) : (
            <View style={styles.reviewCard}>
              <Text style={styles.reviewText}>No reviews yet. Be the first to review!</Text>
            </View>
          )}
        </View>

        {/* Portfolio Section */}
        <View style={styles.portfolioSection}>
          <View style={styles.portfolioTabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'Info' && styles.activeTab]}
              onPress={() => setActiveTab('Info')}
            >
              <Text style={[styles.tabText, activeTab === 'Info' && styles.activeTabText]}>Info</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'Portfolio' && styles.activeTab]}
              onPress={() => setActiveTab('Portfolio')}
            >
              <Text style={[styles.tabText, activeTab === 'Portfolio' && styles.activeTabText]}>Portfolio</Text>
            </TouchableOpacity>

          </View>

          {activeTab === 'Info' && (
            <View style={styles.infoContent}>
              {/* About Section */}
              <View style={styles.infoSection}>
                <Text style={styles.infoSectionTitle}>About</Text>
                <Text style={styles.infoText}>{profile?.bio || 'No bio available'}</Text>
              </View>

              {/* Location */}
              <View style={styles.infoSection}>
                <Text style={styles.infoSectionTitle}>Location</Text>
                {(() => {
                  const loc = profile?.location || null;
                  let displayLoc = '';
                  if (loc) {
                    if (typeof loc === 'string') displayLoc = loc.trim();
                    else {
                      const city = loc.city && !/^(n\/?a)$/i.test(loc.city) ? loc.city : '';
                      const country = loc.country && !/^(n\/?a)$/i.test(loc.country) ? loc.country : '';
                      const state = loc.state && !/^(n\/?a)$/i.test(loc.state) ? loc.state : '';
                      if (city && state) displayLoc = `${city}, ${state}`;
                      else if (city && country) displayLoc = `${city}, ${country}`;
                      else displayLoc = state || country || city || '';
                    }
                  }
                  if (displayLoc) {
                    return (
                      <View style={styles.infoRow}>
                        <MaterialIcons name="location-on" size={20} color="#337DEB" />
                        <Text style={styles.infoText}>{displayLoc}</Text>
                      </View>
                    );
                  }
                  return <Text style={styles.infoText}>Remote</Text>;
                })()}
              </View>

              {/* Categories */}
              {profile?.categories && profile.categories.length > 0 && (
                <View style={styles.infoSection}>
                  <Text style={styles.infoSectionTitle}>Categories</Text>
                  <View style={styles.categoryTags}>
                    {profile.categories.map((cat, index) => (
                      <View key={index} style={styles.categoryTag}>
                        <Text style={styles.categoryTagText}>{mapCategoryToUI(cat)}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Tags */}
              {profile?.tags && profile.tags.length > 0 && (
                <View style={styles.infoSection}>
                  <Text style={styles.infoSectionTitle}>Tags</Text>
                  <View style={styles.tagList}>
                    {profile.tags.map((tag, index) => (
                      <View key={index} style={styles.infoTag}>
                        <Text style={styles.infoTagText}>#{tag}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Offers (before Platform Metrics) – tappable cards that open offer details */}
              {offersLoaded && creatorOffers.length > 0 && (
                <View style={styles.infoSection}>
                  <Text style={styles.infoSectionTitle}>Offers</Text>
                  {creatorOffers.map((o) => {
                    const offerId = o._id || o.id;
                    const title = o.title || 'Offer';
                    const priceStr = o.rate
                      ? (typeof o.rate === 'object' && (o.rate.usd != null || o.rate.ngn != null)
                        ? getCompactDualPrice(o.rate)
                        : (o.currency === 'NGN' ? `₦${o.rate}` : `$${o.rate}`))
                      : (o.isNegotiable ? 'Negotiable' : null);
                    return (
                      <TouchableOpacity
                        key={offerId}
                        style={styles.offerCard}
                        activeOpacity={0.7}
                        onPress={() => navigation?.navigate('OfferDetails', { offerId })}
                      >
                        <View style={styles.offerCardContent}>
                          <MaterialIcons name="local-offer" size={22} color="#337DEB" style={styles.offerCardIcon} />
                          <View style={styles.offerCardText}>
                            <Text style={styles.offerCardTitle} numberOfLines={2}>{title}</Text>
                            {priceStr ? <Text style={styles.offerCardSubtitle}>{priceStr}</Text> : null}
                          </View>
                          <MaterialIcons name="chevron-right" size={24} color="#9ca3af" />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Platform Metrics (API returns platformReach; also support platformMetrics) */}
              {((profile?.platformReach && profile.platformReach.length > 0) || (profile?.platformMetrics && profile.platformMetrics.length > 0)) && (
                <View style={styles.infoSection}>
                  <Text style={styles.infoSectionTitle}>Platform Metrics</Text>
                  {(profile.platformReach || profile.platformMetrics).map((metric, index) => (
                    <View key={index} style={styles.metricRow}>
                      <View style={styles.metricHeader}>
                        <PlatformIcon platform={metric.platform} size={20} color="#337DEB" />
                        <Text style={styles.metricPlatform}>{metric.platform?.charAt(0).toUpperCase() + metric.platform?.slice(1) || 'Platform'}</Text>
                      </View>
                      <View style={styles.metricDetails}>
                        <Text style={styles.metricLabel}>Followers: <Text style={styles.metricValue}>{formatFollowerCount(metric.followers)}</Text></Text>
                        {Number(metric.engagementRate || 0) > 0 && (
                          <Text style={styles.metricLabel}>Engagement: <Text style={styles.metricValue}>{formatEngagementRate(metric.engagementRate)}</Text></Text>
                        )}
                        {metric.avgViews && (
                          <Text style={styles.metricLabel}>Avg Views: <Text style={styles.metricValue}>{formatFollowerCount(metric.avgViews)}</Text></Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Contact Info */}
              <View style={styles.infoSection}>
                <Text style={styles.infoSectionTitle}>Contact</Text>
                {profile?.email && (
                  <View style={styles.infoRow}>
                    <MaterialIcons name="email" size={20} color="#337DEB" />
                    <Text style={styles.infoText}>{profile.email}</Text>
                  </View>
                )}
                {profile?.website && (
                  <View style={styles.infoRow}>
                    <MaterialIcons name="link" size={20} color="#337DEB" />
                    <Text style={styles.infoText}>{profile.website}</Text>
                  </View>
                )}
              </View>

              {/* Rating & Reviews */}
              {(profile?.rating || profile?.totalReviews) && (
                <View style={styles.infoSection}>
                  <Text style={styles.infoSectionTitle}>Rating & Reviews</Text>
                  <View style={styles.infoRow}>
                    <MaterialIcons name="star" size={20} color="#fbbf24" />
                    <Text style={styles.infoText}>
                      {(() => {
                        // Calculate average rating from actual reviews array (same as Reviews section)
                        if (reviews && reviews.length > 0) {
                          const totalStars = reviews.reduce((sum, r) => {
                            const rating = r.rating || r.overallRating || 0;
                            const cappedRating = Math.min(Math.max(0, rating), 5);
                            return sum + cappedRating;
                          }, 0);
                          const avgRating = totalStars / reviews.length;
                          return Math.min(5, Math.max(0, avgRating)).toFixed(1);
                        }
                        // Fallback to profile rating if reviews not loaded yet
                        // Check averageRating first (most accurate), then rating
                        // If rating > 5, it might be a sum - divide by reviewCount if available
                        const reviewCount = profile?.reviewCount || profile?.totalReviews || 1;
                        let fallbackRating = profile?.averageRating || profile?.rating;

                        if (fallbackRating !== undefined && fallbackRating !== null) {
                          fallbackRating = Number(fallbackRating) || 0;
                          // If rating > 5 and we have reviewCount > 1, it might be a sum - divide it
                          if (fallbackRating > 5 && reviewCount > 1) {
                            fallbackRating = fallbackRating / reviewCount;
                          }
                          // Cap at 5 and ensure it's a valid number
                          const cappedFallback = Math.min(5, Math.max(0, fallbackRating));
                          return cappedFallback.toFixed(1);
                        }
                        return 'N/A';
                      })()}
                      {reviews && reviews.length > 0 ? ` (${reviews.length} reviews)` : (profile.totalReviews ? ` (${profile.totalReviews} reviews)` : '')}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}



          {activeTab === 'Portfolio' && (
            <>
              {isSelf && (
                <TouchableOpacity style={styles.addPortfolioButton} onPress={handleAddPortfolio}>
                  <MaterialIcons name="add" size={20} color="#337DEB" />
                  <Text style={styles.addPortfolioButtonText}>Add Portfolio Item</Text>
                </TouchableOpacity>
              )}
              <View style={styles.portfolioGrid}>
                {portfolio && portfolio.length > 0 ? (
                  portfolio.map((item, index) => (
                    <TouchableOpacity
                      key={item._id || index}
                      style={styles.portfolioItem}
                      onPress={() => handlePortfolioItem(item)}
                    >
                      {item?.type === 'link' ? (
                        <View style={styles.linkCard}>
                          <MaterialIcons name="link" size={24} color="#ffffff" />
                          <Text style={styles.linkText} numberOfLines={2}>
                            {String(item?.title || item?.url || 'Link')}
                          </Text>
                        </View>
                      ) : (
                        (() => {
                          const isVideo = (item?.type || '').toLowerCase() === 'video';

                          // Handle item.thumbnail: ignore if it's junk like "ahahah" or too short
                          const rawThumbnail = item?.thumbnail;
                          const isValidThumb = typeof rawThumbnail === 'string' &&
                            rawThumbnail.length > 5 &&
                            (rawThumbnail.includes('/') || rawThumbnail.includes('.'));

                          const thumbUrl = isValidThumb ? resolveImageUrl(rawThumbnail) : null;
                          const rawMediaUrl = (item?.media && item.media[0]) ? (typeof item.media[0] === 'string' ? item.media[0] : item.media[0]?.url) : null;

                          // Handle item.url which might be an object containing the real URL
                          const itemUrlString = typeof item?.url === 'string' ? item.url :
                            (item?.url?.url || item?.url?.uri || item?.url?.mediaUrl || item?.url?.secure_url || null);

                          const imageUrl = (itemUrlString ? resolveImageUrl(itemUrlString) : null) || (rawMediaUrl ? resolveImageUrl(rawMediaUrl) : null);

                          const isUrlVideo = (typeof itemUrlString === 'string' && /\.(mp4|webm|mov)(\?|$)/i.test(itemUrlString)) ||
                            (typeof rawMediaUrl === 'string' && /\.(mp4|webm|mov)(\?|$)/i.test(rawMediaUrl));

                          // Prioritize imageUrl if thumbUrl looks suspicious or doesn't exist
                          const displayUrl = thumbUrl || imageUrl;

                          // Debug only first item to avoid log spam
                          if (__DEV__ && index === 0) {
                            console.log(`[CreatorProfile] Portfolio[0] resolved to: ${displayUrl}`, { itemUrl: item?.url, thumb: item?.thumbnail, isValidThumb });
                          }

                          // If it's a video without a thumbnail, don't show the video URL as an image
                          if (displayUrl && !isVideo && !isUrlVideo) {
                            return (
                              <Image
                                source={{ uri: displayUrl }}
                                style={[styles.portfolioImage, { backgroundColor: '#F3F4F6' }]}
                                resizeMode="cover"
                                onError={(e) => console.log(`[CreatorProfile] Image error for: ${displayUrl}`, e.nativeEvent.error)}
                              />
                            );
                          } else if (thumbUrl) {
                            return (
                              <Image
                                source={{ uri: thumbUrl }}
                                style={[styles.portfolioImage, { backgroundColor: '#F3F4F6' }]}
                                resizeMode="cover"
                                onError={(e) => console.log(`[CreatorProfile] Thumb error for: ${thumbUrl}`, e.nativeEvent.error)}
                              />
                            );
                          }

                          // Fallback placeholder (no image or video without thumb)
                          return (
                            <View
                              style={[
                                styles.portfolioImage,
                                {
                                  backgroundColor: '#F3F4F6',
                                  justifyContent: 'center',
                                  alignItems: 'center',
                                },
                              ]}
                            >
                              <MaterialIcons name={isVideo || isUrlVideo ? 'play-circle-outline' : 'image'} size={40} color="#6b7280" />
                              {(isVideo || isUrlVideo) && <Text style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>Video Preview</Text>}
                            </View>
                          );
                        })()
                      )}
                      {item?.type && (
                        <View style={styles.portfolioTag}>
                          <Text style={styles.portfolioTagText}>
                            {item.type === 'photo' ? 'Photo' : item.type === 'video' ? 'Video' : 'Link'}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ))
                ) : (
                  <View style={styles.emptyPortfolio}>
                    <Text style={styles.emptyPortfolioText}>No portfolio items yet</Text>
                    {isSelf && (
                      <TouchableOpacity style={styles.addFirstPortfolioButton} onPress={handleAddPortfolio}>
                        <Text style={styles.addFirstPortfolioButtonText}>Add Your First Portfolio Item</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            </>
          )}
        </View>

        {/* Bottom Action Button - Only show for creators viewing their own profile */}
        {isSelf && !isCurrentUserBrand && (
          <TouchableOpacity style={styles.bottomActionButton} onPress={handleSendProposals}>
            <Text style={styles.bottomActionText}>Send Proposals</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Internal Bottom Tab Navigation removed */}

      {/* Image Viewer Modal */}
      <Modal
        visible={!!showImageViewer}
        transparent
        animationType="fade"
        onRequestClose={() => setShowImageViewer(false)}
      >
        <View style={styles.previewOverlay}>
          <TouchableOpacity style={styles.previewClose} onPress={() => setShowImageViewer(false)}>
            <MaterialIcons name="close" size={28} color="#e5e7eb" />
          </TouchableOpacity>
          <View style={styles.previewStage}>
            {imageViewerUrl ? (
              <Image
                source={{ uri: imageViewerUrl }}
                style={styles.previewFullImage}
                resizeMode="contain"
                onLoad={(e) => {
                  const { width, height } = e.nativeEvent.source || {};
                  if (width && height) setPreviewAspect(width / height);
                }}
              />
            ) : (
              <Text style={{ color: '#e5e7eb' }}>No preview available</Text>
            )}
          </View>
        </View>
      </Modal>

      {/* Portfolio Actions Modal */}
      <Modal
        visible={showPortfolioActions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPortfolioActions(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 360 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>{portfolioActionItem?.title || 'Portfolio Item'}</Text>
              <TouchableOpacity onPress={() => setShowPortfolioActions(false)} style={styles.modalCloseButton}>
                <MaterialIcons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 16, gap: 12 }}>
              <TouchableOpacity
                style={styles.actionNeutralButton}
                onPress={() => {
                  if (portfolioActionUrl) {
                    if (portfolioActionIsImage) {
                      setImageViewerUrl(portfolioActionUrl);
                      setShowImageViewer(true);
                    } else {
                      Linking.openURL(portfolioActionUrl).catch(() => showToast('Unable to open link', 'error'));
                    }
                  } else {
                    showToast('No preview available', 'warning');
                  }
                  setShowPortfolioActions(false);
                }}
              >
                <MaterialIcons name="visibility" size={18} color="#0284c7" />
                <Text style={styles.actionNeutralText}>View</Text>
              </TouchableOpacity>

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.actionPrimaryButton}
                  onPress={() => {
                    setShowPortfolioActions(false);
                    handleEditPortfolio(portfolioActionItem);
                  }}
                >
                  <MaterialIcons name="edit" size={18} color="#ffffff" />
                  <Text style={styles.actionPrimaryText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionSecondaryButton}
                  onPress={() => {
                    setShowPortfolioActions(false);
                    handleDeletePortfolio(portfolioActionItem);
                  }}
                >
                  <MaterialIcons name="delete" size={18} color="#ef4444" />
                  <Text style={styles.actionSecondaryText}>Delete</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.actionCancelLink} onPress={() => setShowPortfolioActions(false)}>
                <Text style={styles.actionCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <SendToBrandModal
        visible={showSendProposalsModal}
        onClose={() => setShowSendProposalsModal(false)}
        user={user}
        isProposal={true}
        navigation={navigation}
      />

      {/* Connect Modal (brand connecting with creator) */}
      <Modal
        visible={connectModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !connecting && setConnectModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 400 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                Connect with {profile?.name || profile?.username || 'Creator'}
              </Text>
              <TouchableOpacity
                onPress={() => !connecting && setConnectModalVisible(false)}
                style={styles.modalCloseButton}
                disabled={connecting}
              >
                <MaterialIcons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoText, { marginBottom: 16 }]}>
                Add an optional message to introduce yourself. They'll get a notification and can chat with you.
              </Text>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Message (optional)</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={connectMessage}
                  onChangeText={setConnectMessage}
                  placeholder="Hi, I'd like to work with you on a campaign..."
                  placeholderTextColor="#9ca3af"
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  editable={!connecting}
                />
              </View>
            </View>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => !connecting && setConnectModalVisible(false)}
                disabled={connecting}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleConnectSubmit}
                disabled={connecting}
              >
                {connecting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>Connect</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Portfolio Modal */}
      <Modal
        visible={showPortfolioModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowPortfolioModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingPortfolioItem ? 'Edit Portfolio Item' : 'Add Portfolio Item'}
              </Text>
              <TouchableOpacity
                onPress={() => setShowPortfolioModal(false)}
                style={styles.modalCloseButton}
              >
                <MaterialIcons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator={false}>
              {/* Type Selection */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Type *</Text>
                <View style={styles.typeButtons}>
                  <TouchableOpacity
                    style={[
                      styles.typeButton,
                      portfolioType === 'photo' && styles.typeButtonActive,
                    ]}
                    onPress={() => setPortfolioType('photo')}
                  >
                    <Text
                      style={[
                        styles.typeButtonText,
                        portfolioType === 'photo' && styles.typeButtonTextActive,
                      ]}
                    >
                      Photo
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.typeButton,
                      portfolioType === 'video' && styles.typeButtonActive,
                    ]}
                    onPress={() => setPortfolioType('video')}
                  >
                    <Text
                      style={[
                        styles.typeButtonText,
                        portfolioType === 'video' && styles.typeButtonTextActive,
                      ]}
                    >
                      Video
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.typeButton,
                      portfolioType === 'link' && styles.typeButtonActive,
                    ]}
                    onPress={() => setPortfolioType('link')}
                  >
                    <Text
                      style={[
                        styles.typeButtonText,
                        portfolioType === 'link' && styles.typeButtonTextActive,
                      ]}
                    >
                      Link
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* URL */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>URL *</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={portfolioUrl}
                    onChangeText={setPortfolioUrl}
                    placeholder={portfolioType === 'link' ? "https://..." : "File URL (or upload below)"}
                    autoCapitalize="none"
                    keyboardType="url"
                  />
                  {portfolioType !== 'link' && (
                    <TouchableOpacity
                      style={{
                        padding: 12,
                        backgroundColor: '#337DEB',
                        borderRadius: 8,
                        justifyContent: 'center',
                        alignItems: 'center'
                      }}
                      onPress={handleUploadPortfolioFile}
                      disabled={savingPortfolio}
                    >
                      {savingPortfolio ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <MaterialIcons name="file-upload" size={20} color="#fff" />
                      )}
                    </TouchableOpacity>
                  )}
                </View>
                {portfolioType !== 'link' && (
                  <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                  Enter a URL or tap the icon to upload a file. Max video length: 60 seconds.
                  </Text>
                )}
              </View>

              {/* Thumbnail (for photo/video) */}
              {portfolioType !== 'link' && (
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Thumbnail URL</Text>
                  <TextInput
                    style={styles.input}
                    value={portfolioThumbnail}
                    onChangeText={setPortfolioThumbnail}
                    placeholder="https://..."
                    autoCapitalize="none"
                    keyboardType="url"
                  />
                </View>
              )}

              {/* Title */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Title</Text>
                <TextInput
                  style={styles.input}
                  value={portfolioTitle}
                  onChangeText={setPortfolioTitle}
                  placeholder="Enter title"
                />
              </View>

              {/* Description */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={portfolioDescription}
                  onChangeText={setPortfolioDescription}
                  placeholder="Enter description"
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>

              {/* Tags */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Tags (comma-separated)</Text>
                <TextInput
                  style={styles.input}
                  value={portfolioTags}
                  onChangeText={setPortfolioTags}
                  placeholder="tag1, tag2, tag3"
                  autoCapitalize="none"
                />
              </View>

              {/* Order */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Order</Text>
                <TextInput
                  style={styles.input}
                  value={String(portfolioOrder)}
                  onChangeText={(text) => setPortfolioOrder(parseInt(text) || 0)}
                  placeholder="0"
                  keyboardType="numeric"
                />
              </View>
            </ScrollView>

            {/* Modal Footer */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowPortfolioModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSavePortfolio}
                disabled={savingPortfolio}
              >
                {savingPortfolio ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast({ ...toast, visible: false })}
      />
    </SafeAreaView >
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollView: {
    flex: 1,
    paddingBottom: 80, // Add padding to prevent content from being hidden behind tabs
  },
  scrollContent: {
    paddingBottom: 100,
  },
  headerSection: {
    height: 450,
    position: 'relative',
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  navIcons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },
  backButton: {
    padding: 8,
  },
  menuButton: {
    padding: 8,
  },
  socialSidebar: {
    position: 'absolute',
    left: 16,
    top: 80,
    zIndex: 2,
  },
  socialIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  darkOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 16,
    paddingBottom: 20,
    zIndex: 3,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginRight: 16,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  profileUsername: {
    fontSize: 16,
    color: '#ffffff',
    marginBottom: 8,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationText: {
    fontSize: 14,
    color: '#ffffff',
    marginLeft: 4,
  },
  metricsSection: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 24,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  tagsContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 12,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 25,
  },
  tagGreen: {
    backgroundColor: '#10b981',
  },
  tagText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
    paddingVertical: 12,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  statLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  connectButton: {
    flex: 1,
    backgroundColor: '#337DEB',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  connectButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#dcfce7',
  },
  connectedBadgeText: {
    color: '#16a34a',
    fontSize: 16,
    fontWeight: '600',
  },
  disconnectButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f87171',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disconnectButtonText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '600',
  },
  connectedButton: {
    backgroundColor: '#10b981',
  },
  messageButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialReachSection: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 16,
  },
  socialCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  socialCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  socialIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  socialInfo: {
    flex: 1,
  },
  socialPlatform: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  socialHandle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  socialFollowers: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  socialConnectButton: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  socialConnectText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  aboutSection: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  aboutText: {
    fontSize: 16,
    color: '#374151',
    lineHeight: 24,
    marginBottom: 16,
  },
  hashtagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  hashtag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  hashtagBlue: {
    backgroundColor: '#dbeafe',
  },
  hashtagPink: {
    backgroundColor: '#fce7f3',
  },
  hashtagGreen: {
    backgroundColor: '#dcfce7',
  },
  hashtagText: {
    fontSize: 14,
    fontWeight: '500',
  },
  insightsSection: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  insightItem: {
    marginBottom: 24,
  },
  insightSubtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  insightDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12,
  },
  progressContainer: {
    gap: 8,
  },
  progressItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressLabel: {
    fontSize: 14,
    color: '#374151',
    width: 100,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressBlue: {
    backgroundColor: '#337DEB',
  },
  progressGreen: {
    backgroundColor: '#10b981',
  },
  progressPurple: {
    backgroundColor: '#8b5cf6',
  },
  progressOrange: {
    backgroundColor: '#f59e0b',
  },
  progressPink: {
    backgroundColor: '#ec4899',
  },
  progressPercent: {
    fontSize: 14,
    color: '#374151',
    width: 40,
    textAlign: 'right',
  },
  summaryCards: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  summaryText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  reviewsSection: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  reviewsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginLeft: 4,
  },
  reviewCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  reviewerImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  reviewInfo: {
    flex: 1,
  },
  reviewerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  reviewStars: {
    flexDirection: 'row',
  },
  reviewText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  portfolioSection: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  portfolioTabs: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  activeTab: {
    backgroundColor: '#337DEB',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  activeTabText: {
    color: '#ffffff',
  },
  portfolioGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  portfolioItem: {
    width: (width - 44) / 2,
    height: 120,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  portfolioImage: {
    width: '100%',
    height: '100%',
  },
  portfolioTag: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  portfolioTagText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
  },
  linkCard: {
    width: '100%',
    height: '100%',
    backgroundColor: '#337DEB',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  linkText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  emptyPortfolio: {
    width: '100%',
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPortfolioText: {
    fontSize: 16,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  emptyPortfolioSubtext: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 8,
  },
  offersList: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  offerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  offerImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#f3f4f6',
  },
  offerContent: {
    padding: 16,
  },
  offerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 12,
  },
  offerMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
    gap: 12,
  },
  offerMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  offerMetaText: {
    fontSize: 14,
    color: '#6b7280',
  },
  offerFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  offerPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#337DEB',
  },
  offerDelivery: {
    fontSize: 14,
    color: '#6b7280',
  },
  addPortfolioButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f0ff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  addPortfolioButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#337DEB',
  },
  addFirstPortfolioButton: {
    marginTop: 16,
    backgroundColor: '#337DEB',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  addFirstPortfolioButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
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
  modalCloseButton: {
    padding: 4,
  },
  modalScrollView: {
    maxHeight: 500,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 12,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e5e7eb',
    marginTop: 8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionPrimaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#337DEB',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  actionPrimaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  actionNeutralButton: {
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
  actionNeutralText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0284c7',
  },
  actionSecondaryButton: {
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
  actionSecondaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ef4444',
  },
  actionCancelLink: {
    alignSelf: 'center',
    paddingVertical: 10,
  },
  actionCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  previewContainer: {
    padding: 12,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    maxHeight: 520,
  },
  previewImage: {
    width: '100%',
    height: undefined,
    backgroundColor: '#000',
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewStage: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewFullImage: {
    width: '100%',
    height: '100%',
  },
  previewClose: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 2,
    padding: 8,
  },
  // Form Styles
  formGroup: {
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#1f2937',
    backgroundColor: '#ffffff',
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  typeButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  typeButtonActive: {
    backgroundColor: '#337DEB',
    borderColor: '#337DEB',
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  typeButtonTextActive: {
    color: '#ffffff',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#337DEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  infoContent: {
    padding: 16,
  },
  infoSection: {
    marginBottom: 24,
  },
  infoSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  offerCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    marginBottom: 10,
    overflow: 'hidden',
  },
  offerCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  offerCardIcon: {
    marginRight: 12,
  },
  offerCardText: {
    flex: 1,
  },
  offerCardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  offerCardSubtitle: {
    fontSize: 13,
    color: '#6b7280',
  },
  categoryTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryTag: {
    backgroundColor: '#337DEB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  categoryTagText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
  },
  tagList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  infoTag: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  infoTagText: {
    color: '#337DEB',
    fontSize: 12,
    fontWeight: '500',
  },
  metricRow: {
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  metricPlatform: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  metricDetails: {
    paddingLeft: 28,
  },
  metricLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  metricValue: {
    fontWeight: '600',
    color: '#1f2937',
  },
  bottomActionButton: {
    backgroundColor: '#000000',
    marginHorizontal: 16,
    marginBottom: 24,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  bottomActionText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  refreshBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  refreshText: {
    fontSize: 12,
    color: '#337DEB',
    fontWeight: '600',
  },
});

export default CreatorProfile;
