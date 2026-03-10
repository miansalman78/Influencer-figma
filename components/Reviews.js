import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, ActivityIndicator, Alert, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../hooks/useAuth';

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

const Reviews = ({ navigation, route }) => {
  const { user } = useAuth();
  const userRole = user?.role?.toLowerCase();
  // For creators: always 'Received' tab only.
  // For brands: always 'Given' tab only (no Received tab shown).
  const [activeTab, setActiveTab] = useState(userRole === 'brand' ? 'Given' : 'Received'); // 'Received' or 'Given'
  const [receivedReviews, setReceivedReviews] = useState([]);
  const [givenReviews, setGivenReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userCache, setUserCache] = useState({}); // Cache for fetched user profiles
  const [editingReview, setEditingReview] = useState(null);
  const [editRating, setEditRating] = useState(0);
  const [editComment, setEditComment] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRespondModal, setShowRespondModal] = useState(false);
  const [respondingToReview, setRespondingToReview] = useState(null);
  const [responseText, setResponseText] = useState('');
  const [helpfulVotes, setHelpfulVotes] = useState({}); // Track helpful votes: { reviewId: true/false }
  const [processing, setProcessing] = useState(false);

  // Fetch user profile by ID
  const fetchUserProfile = async (userId) => {
    if (!userId) return null;

    // Check cache first
    if (userCache[userId]) {
      return userCache[userId];
    }

    try {
      const userService = await import('../services/user');
      const response = await userService.getProfileByUserId(userId);

      // Handle different response structures
      let userProfileData = null;
      if (response?.data) {
        userProfileData = response.data;
      } else if (response && (response.name || response.companyName || response.username || response._id || response.id)) {
        // Response might be the user object directly
        userProfileData = response;
      }

      if (userProfileData) {
        // Check multiple possible name fields: name, companyName, username, firstName/lastName
        const name = userProfileData.name || userProfileData.companyName || userProfileData.username ||
          (userProfileData.firstName && userProfileData.lastName ? `${userProfileData.firstName} ${userProfileData.lastName}`.trim() : null) ||
          userProfileData.firstName || userProfileData.lastName || null;

        // Only cache if we have a valid name
        if (name) {
          const userData = {
            name: name,
            companyName: userProfileData.companyName || userProfileData.name || name,
            username: userProfileData.username || null,
            firstName: userProfileData.firstName || null,
            lastName: userProfileData.lastName || null,
            profileImage: userProfileData.profileImage || userProfileData.avatar,
            avatar: userProfileData.avatar || userProfileData.profileImage,
            role: userProfileData.role || userProfileData.userRole || null,
          };
          // Update cache
          setUserCache(prev => ({ ...prev, [userId]: userData }));
          return userData;
        } else {
          console.warn(`[Reviews] User profile ${userId} exists but has no name field`);
        }
      }
    } catch (error) {
      // Check if it's the backend "Assignment to constant variable" error
      if (error?.status === 500 && error?.data?.message?.includes('Assignment to constant variable')) {
        console.warn(`[Reviews] Backend error fetching user ${userId}: Assignment to constant variable - This is a backend bug.`);
        // Don't try fallback for backend errors, return null to show Anonymous
        return null;
      }

      // Silently log error - don't show to user, will use "Anonymous" as fallback
      console.warn(`[Reviews] Failed to fetch user profile ${userId}:`, error?.message || error);
      // Fallback: try getCreators API (only for non-backend errors)
      try {
        const userService = await import('../services/user');
        const creatorsResponse = await userService.getCreators({ page: 1, limit: 100 });
        if (creatorsResponse && creatorsResponse.data) {
          const creators = creatorsResponse.data.creators || [];
          const foundCreator = creators.find(c => {
            const creatorId = c.id || c._id;
            return creatorId === userId || creatorId?.toString() === userId?.toString();
          });
          if (foundCreator) {
            // Check multiple possible name fields
            const name = foundCreator.name || foundCreator.companyName || foundCreator.username ||
              (foundCreator.firstName && foundCreator.lastName ? `${foundCreator.firstName} ${foundCreator.lastName}`.trim() : null) ||
              foundCreator.firstName || foundCreator.lastName || 'Anonymous';
            const userData = {
              name: name,
              companyName: foundCreator.companyName || foundCreator.name || name,
              username: foundCreator.username || null,
              firstName: foundCreator.firstName || null,
              lastName: foundCreator.lastName || null,
              profileImage: foundCreator.profileImage || foundCreator.avatar,
              avatar: foundCreator.avatar || foundCreator.profileImage,
              role: foundCreator.role || null,
            };
            setUserCache(prev => ({ ...prev, [userId]: userData }));
            return userData;
          }
        }
      } catch (fallbackError) {
        // Silently log - will use "Anonymous" as fallback
        console.warn(`[Reviews] Failed to fetch user ${userId} from creators fallback:`, fallbackError?.message || fallbackError);
      }
    }
    return null;
  };

  // Fetch reviews from API
  useEffect(() => {
    const fetchReviews = async () => {
      try {
        setLoading(true);
        const { getMyProfile } = await import('../services/user');
        const profileResponse = await getMyProfile();
        const userId = profileResponse?.data?._id || profileResponse?.data?.id;

        if (userId) {
          const reviewsService = await import('../services/reviews');
          // Fetch received reviews (reviews about current user)
          const receivedResponse = await reviewsService.getUserReviews(userId, { type: 'received', page: 1, limit: 50 });
          if (receivedResponse && receivedResponse.data) {
            const received = Array.isArray(receivedResponse.data)
              ? receivedResponse.data
              : receivedResponse.data.reviews || receivedResponse.data.items || [];

            // Log first review structure to debug API response format
            if (received.length > 0) {
              console.log('[Reviews] First review structure:', JSON.stringify({
                reviewerId: received[0].reviewerId,
                reviewerIdType: typeof received[0].reviewerId,
                hasReviewer: !!received[0].reviewer,
                reviewer: received[0].reviewer ? {
                  name: received[0].reviewer.name,
                  companyName: received[0].reviewer.companyName,
                  username: received[0].reviewer.username,
                } : null
              }, null, 2));
            }

            setReceivedReviews(received);

            // Initialize helpful votes from API response
            const votesMap = {};
            received.forEach(review => {
              const reviewId = review._id || review.id;
              if (reviewId && review.isHelpful !== undefined) {
                votesMap[reviewId] = review.isHelpful;
              }
            });
            setHelpfulVotes(votesMap);

            // Fetch reviewer profiles for reviews that only have IDs
            // But first, check if reviewer is partially populated (has some data but not name)
            const reviewerIds = new Set();
            received.forEach(review => {
              const reviewerId = typeof review.reviewerId === 'string' ? review.reviewerId : (review.reviewerId?._id || review.reviewerId?.id);
              const reviewer = review.reviewer || (typeof review.reviewerId === 'object' && review.reviewerId !== null ? review.reviewerId : null);

              // Check if reviewer exists but doesn't have a name field (check all possible name fields)
              const hasName = reviewer && (
                reviewer.name ||
                reviewer.companyName ||
                reviewer.username ||
                reviewer.firstName ||
                (reviewer.firstName && reviewer.lastName)
              );

              // Only fetch if we have an ID and either no reviewer object or no name
              if (reviewerId && (!reviewer || !hasName)) {
                reviewerIds.add(reviewerId);
              }
            });

            // Deduplicate reviewer IDs and filter out already cached ones
            const uniqueReviewerIds = Array.from(reviewerIds).filter(id => !userCache[id]);

            // Fetch all reviewer profiles in parallel (with error handling to not block other reviews)
            // Use Promise.allSettled to ensure all attempts complete even if some fail
            // Track pending fetches to prevent duplicates
            const pendingFetches = new Set();
            const fetchPromises = uniqueReviewerIds.map(async (id) => {
              // Skip if already fetching
              if (pendingFetches.has(id)) return null;
              pendingFetches.add(id);

              try {
                const result = await fetchUserProfile(id);
                pendingFetches.delete(id);
                return result;
              } catch (err) {
                pendingFetches.delete(id);
                // Check if it's the backend "Assignment to constant variable" error
                if (err?.status === 500 && err?.data?.message?.includes('Assignment to constant variable')) {
                  console.warn(`[Reviews] Backend error fetching reviewer ${id}: Assignment to constant variable - This is a backend bug.`);
                } else {
                  console.warn(`[Reviews] Failed to fetch reviewer profile for ${id}:`, err?.message || err);
                }
                return null;
              }
            });
            await Promise.allSettled(fetchPromises);
          }

          // Fetch given reviews (reviews by current user) - Only for brands, not creators
          const userRole = user?.role?.toLowerCase();
          if (userRole === 'brand') {
            const givenResponse = await reviewsService.getUserReviews(userId, { type: 'given', page: 1, limit: 50 });
            if (givenResponse && givenResponse.data) {
              const given = Array.isArray(givenResponse.data)
                ? givenResponse.data
                : givenResponse.data.reviews || givenResponse.data.items || [];
              setGivenReviews(given);

              // Fetch reviewee profiles to get their roles (important for edit/delete logic)
              // Always fetch even if populated, to ensure we have role information
              const revieweeIds = new Set();
              given.forEach(review => {
                const revieweeId = typeof review.revieweeId === 'string' ? review.revieweeId : (review.revieweeId?._id || review.revieweeId?.id);
                if (revieweeId) {
                  revieweeIds.add(revieweeId);
                }
              });

              // Fetch all reviewee profiles in parallel to get their roles
              await Promise.all(
                Array.from(revieweeIds).map(id => fetchUserProfile(id))
              );
              // Cache is updated in fetchUserProfile, no need to update state here
            }
          } else {
            // For creators, set empty array for given reviews
            setGivenReviews([]);
          }
        }
      } catch (err) {
        console.error('Failed to fetch reviews:', err);
        setError(err.message || 'Failed to load reviews');
        // Fallback: try to get reviews from profile
        try {
          const { getMyProfile } = await import('../services/user');
          const profile = await getMyProfile();
          if (profile?.data?.recentReviews) {
            setReceivedReviews(profile.data.recentReviews);
          }
        } catch (e) {
          console.error('Failed to get reviews from profile:', e);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchReviews();
  }, []);

  // Trigger re-render when cache updates to refresh reviewer names
  const [cacheVersion, setCacheVersion] = useState(0);

  useEffect(() => {
    // When userCache updates, increment cacheVersion to trigger re-mapping
    if (Object.keys(userCache).length > 0) {
      setCacheVersion(prev => prev + 1);
    }
  }, [userCache]);

  // Helper function to map API review data to UI format
  const mapReviewToUI = (review, isReceived) => {
    // Extract IDs first - handle both string IDs and populated objects
    let reviewerId = null;
    let revieweeId = null;

    if (typeof review.reviewerId === 'string') {
      reviewerId = review.reviewerId;
    } else if (review.reviewerId && typeof review.reviewerId === 'object') {
      reviewerId = review.reviewerId._id || review.reviewerId.id || null;
    }

    if (typeof review.revieweeId === 'string') {
      revieweeId = review.revieweeId;
    } else if (review.revieweeId && typeof review.revieweeId === 'object') {
      revieweeId = review.revieweeId._id || review.revieweeId.id || null;
    }

    // Handle populated objects - API might return reviewer/reviewee as populated objects
    // Check if reviewerId is a populated object with user data
    let reviewer = null;
    if (review.reviewer && typeof review.reviewer === 'object' && review.reviewer !== null) {
      reviewer = review.reviewer;
    } else if (typeof review.reviewerId === 'object' && review.reviewerId !== null && (review.reviewerId.name || review.reviewerId.companyName || review.reviewerId.username)) {
      // reviewerId is populated as an object with user data
      reviewer = review.reviewerId;
    }

    let reviewee = null;
    if (review.reviewee && typeof review.reviewee === 'object' && review.reviewee !== null) {
      reviewee = review.reviewee;
    } else if (typeof review.revieweeId === 'object' && review.revieweeId !== null && (review.revieweeId.name || review.revieweeId.companyName || review.revieweeId.username)) {
      // revieweeId is populated as an object with user data
      reviewee = review.revieweeId;
    }

    // If we have IDs but no populated objects, check cache
    if (reviewerId && (!reviewer || (!reviewer.name && !reviewer.companyName && !reviewer.username && !reviewer.firstName)) && userCache[reviewerId]) {
      reviewer = userCache[reviewerId];
    }
    if (revieweeId && (!reviewee || (!reviewee.name && !reviewee.companyName && !reviewee.username && !reviewee.firstName)) && userCache[revieweeId]) {
      reviewee = userCache[revieweeId];
    }

    // Ensure we have at least empty objects to avoid errors
    if (!reviewer) reviewer = {};
    if (!reviewee) reviewee = {};

    // Get reviewer role - check from review object, reviewer object, or cache
    let reviewerRole = review.reviewerRole || reviewer.role || reviewer.userRole || null;
    if (!reviewerRole && reviewerId && userCache[reviewerId]) {
      reviewerRole = userCache[reviewerId].role;
    }

    // Get reviewee role - check from review object, reviewee object, or cache
    let revieweeRole = review.revieweeRole || reviewee.role || reviewee.userRole || null;
    if (!revieweeRole && revieweeId && userCache[revieweeId]) {
      revieweeRole = userCache[revieweeId].role;
    }

    const createdAt = review.createdAt || review.date;
    const dateStr = createdAt
      ? new Date(createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'N/A';

    // Get campaign name - handle both ID and populated object
    let campaignName = 'N/A';
    const campaignId = review.context?.campaignId;
    const campaign = review.context?.campaign || review.campaign;
    if (campaign && typeof campaign === 'object') {
      campaignName = campaign.name || campaign.title || 'N/A';
    } else if (campaignId && typeof campaignId === 'object') {
      campaignName = campaignId.name || campaignId.title || 'N/A';
    } else if (campaignId) {
      // If it's just an ID string, we'll fetch it later if needed, for now show "Campaign"
      campaignName = 'Campaign';
    }

    // Get reviewer/reviewee names - handle both populated objects and IDs
    // Check multiple possible name fields: name, companyName, username, firstName/lastName
    // Priority: name -> companyName -> firstName+lastName -> username -> 'Anonymous'
    const getBestName = (userObj) => {
      if (!userObj) return 'Anonymous';
      return userObj.name ||
        userObj.companyName ||
        (userObj.firstName && userObj.lastName ? `${userObj.firstName} ${userObj.lastName}`.trim() : null) ||
        userObj.firstName ||
        userObj.username ||
        'Anonymous';
    };

    const reviewerName = getBestName(reviewer);
    const revieweeName = getBestName(reviewee);

    return {
      id: review._id || review.id,
      // For Given tab: show creator (reviewee) name in BOTH fields so UI finds it either way
      reviewerName: isReceived ? reviewerName : revieweeName,
      reviewerImage: isReceived ? (reviewer.profileImage || reviewer.avatar) : (reviewee.profileImage || reviewee.avatar),
      revieweeName: revieweeName, // Always populated (creator name on Given, or reviewer's target name on Received)
      revieweeImage: reviewee.profileImage || reviewee.avatar || null,
      rating: Math.min(5, Math.max(0, review.rating || review.overallRating || 0)),
      review: review.comment || review.review || 'No comment',
      campaign: campaignName,
      campaignId: typeof campaignId === 'string' ? campaignId : (campaignId?._id || campaignId?.id),
      reviewerId,
      revieweeId,
      reviewerRole: reviewerRole?.toLowerCase() || null,
      revieweeRole: revieweeRole?.toLowerCase() || null,
      date: dateStr,
      helpfulVotes: review.helpful || review.helpfulVotes || review.helpfulCount || 0, // backend field is `helpful`
      isHelpful: review.isHelpful || false,
      response: review.response || null,
      _original: review,
    };
  };

  // Map reviews to UI format - re-compute when reviews, cache, or cacheVersion changes to ensure names are updated
  const mappedReceivedReviews = useMemo(() => {
    return receivedReviews.map(r => mapReviewToUI(r, true));
  }, [receivedReviews, userCache, cacheVersion]);

  const mappedGivenReviews = useMemo(() => {
    return user?.role?.toLowerCase() === 'brand' ? givenReviews.map(r => mapReviewToUI(r, false)) : [];
  }, [givenReviews, userCache, cacheVersion, user?.role]);

  // For creators, always show received reviews only (hide "Given" tab)
  const currentReviews = (user?.role?.toLowerCase() === 'brand')
    ? (activeTab === 'Received' ? mappedReceivedReviews : mappedGivenReviews)
    : mappedReceivedReviews;

  // Calculate average rating: total stars / number of reviews, capped at 5
  const totalStars = currentReviews.reduce((sum, r) => {
    const rating = r.rating || 0;
    // Ensure rating is capped at 5
    const cappedRating = Math.min(Math.max(0, rating), 5);
    return sum + cappedRating;
  }, 0);
  const averageRating = currentReviews.length > 0
    ? Math.min(5, (totalStars / currentReviews.length)).toFixed(1)
    : '0.0';

  const handleEditReview = (review) => {
    setEditingReview(review);
    setEditRating(review.rating);
    setEditComment(review.review);
    setShowEditModal(true);
  };

  const handleUpdateReview = async () => {
    if (!editingReview) return;
    if (editRating === 0) {
      Alert.alert('Error', 'Please select a rating');
      return;
    }
    if (!editComment.trim()) {
      Alert.alert('Error', 'Please enter a comment');
      return;
    }

    try {
      setProcessing(true);
      const reviewsService = await import('../services/reviews');
      await reviewsService.updateReview(editingReview.id, {
        rating: editRating,
        comment: editComment.trim(),
      });

      Alert.alert('Success', 'Review updated successfully', [
        {
          text: 'OK',
          onPress: () => {
            setShowEditModal(false);
            setEditingReview(null);
            setEditRating(0);
            setEditComment('');
            // Refresh reviews
            const fetchReviews = async () => {
              try {
                const { getMyProfile } = await import('../services/user');
                const profileResponse = await getMyProfile();
                const userId = profileResponse?.data?._id || profileResponse?.data?.id;

                if (userId) {
                  const reviewsService = await import('../services/reviews');
                  const givenResponse = await reviewsService.getUserReviews(userId, { type: 'given', page: 1, limit: 50 });
                  if (givenResponse && givenResponse.data) {
                    const given = Array.isArray(givenResponse.data)
                      ? givenResponse.data
                      : givenResponse.data.reviews || givenResponse.data.items || [];
                    setGivenReviews(given);
                  }
                }
              } catch (err) {
                console.error('Failed to refresh reviews:', err);
              }
            };
            fetchReviews();
          },
        },
      ]);
    } catch (error) {
      console.error('Failed to update review:', error);
      Alert.alert('Error', error.message || 'Failed to update review. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteReview = (review) => {
    Alert.alert(
      'Delete Review',
      'Are you sure you want to delete this review? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setProcessing(true);
              const reviewsService = await import('../services/reviews');
              await reviewsService.deleteReview(review.id);

              Alert.alert('Success', 'Review deleted successfully', [
                {
                  text: 'OK',
                  onPress: () => {
                    // Refresh reviews
                    const fetchReviews = async () => {
                      try {
                        const { getMyProfile } = await import('../services/user');
                        const profileResponse = await getMyProfile();
                        const userId = profileResponse?.data?._id || profileResponse?.data?.id;

                        if (userId) {
                          const reviewsService = await import('../services/reviews');
                          const givenResponse = await reviewsService.getUserReviews(userId, { type: 'given', page: 1, limit: 50 });
                          if (givenResponse && givenResponse.data) {
                            const given = Array.isArray(givenResponse.data)
                              ? givenResponse.data
                              : givenResponse.data.reviews || givenResponse.data.items || [];
                            setGivenReviews(given);
                          }
                        }
                      } catch (err) {
                        console.error('Failed to refresh reviews:', err);
                      }
                    };
                    fetchReviews();
                  },
                },
              ]);
            } catch (error) {
              console.error('Failed to delete review:', error);
              Alert.alert('Error', error.message || 'Failed to delete review. Please try again.');
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleVoteHelpful = async (review, helpful) => {
    try {
      setProcessing(true);
      const reviewsService = await import('../services/reviews');
      await reviewsService.voteReviewHelpful(review.id, helpful);

      // Update local state
      setHelpfulVotes(prev => ({ ...prev, [review.id]: helpful }));

      // Refresh received reviews to get updated helpful count
      const fetchReviews = async () => {
        try {
          const { getMyProfile } = await import('../services/user');
          const profileResponse = await getMyProfile();
          const userId = profileResponse?.data?._id || profileResponse?.data?.id;

          if (userId) {
            const reviewsService = await import('../services/reviews');
            const receivedResponse = await reviewsService.getUserReviews(userId, { type: 'received', page: 1, limit: 50 });
            if (receivedResponse && receivedResponse.data) {
              const received = Array.isArray(receivedResponse.data)
                ? receivedResponse.data
                : receivedResponse.data.reviews || receivedResponse.data.items || [];
              setReceivedReviews(received);
            }
          }
        } catch (err) {
          console.error('Failed to refresh reviews:', err);
        }
      };
      fetchReviews();
    } catch (error) {
      console.error('Failed to vote helpful:', error);
      Alert.alert('Error', error.message || 'Failed to vote. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleRespondToReview = (review) => {
    setRespondingToReview(review);
    setResponseText(review.response?.comment || '');
    setShowRespondModal(true);
  };

  const handleSubmitResponse = async () => {
    if (!respondingToReview) return;
    if (!responseText.trim()) {
      Alert.alert('Error', 'Please enter a response');
      return;
    }

    try {
      setProcessing(true);
      const reviewsService = await import('../services/reviews');
      await reviewsService.respondToReview(respondingToReview.id, responseText.trim());

      Alert.alert('Success', 'Response submitted successfully', [
        {
          text: 'OK',
          onPress: () => {
            setShowRespondModal(false);
            setRespondingToReview(null);
            setResponseText('');
            // Refresh reviews
            const fetchReviews = async () => {
              try {
                const { getMyProfile } = await import('../services/user');
                const profileResponse = await getMyProfile();
                const userId = profileResponse?.data?._id || profileResponse?.data?.id;

                if (userId) {
                  const reviewsService = await import('../services/reviews');
                  const receivedResponse = await reviewsService.getUserReviews(userId, { type: 'received', page: 1, limit: 50 });
                  if (receivedResponse && receivedResponse.data) {
                    const received = Array.isArray(receivedResponse.data)
                      ? receivedResponse.data
                      : receivedResponse.data.reviews || receivedResponse.data.items || [];
                    setReceivedReviews(received);
                  }
                }
              } catch (err) {
                console.error('Failed to refresh reviews:', err);
              }
            };
            fetchReviews();
          },
        },
      ]);
    } catch (error) {
      console.error('Failed to submit response:', error);
      Alert.alert('Error', error.message || 'Failed to submit response. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const StarRating = ({ rating, onRatingChange, size = 20, editable = false }) => {
    return (
      <View style={styles.starContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            onPress={editable ? () => onRatingChange(star) : undefined}
            style={styles.starButton}
            disabled={!editable}
          >
            <MaterialIcons
              name={star <= rating ? 'star' : 'star-border'}
              size={size}
              color={star <= rating ? '#fbbf24' : '#d1d5db'}
            />
          </TouchableOpacity>
        ))}
      </View>
    );
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
          } else {
            navigation?.navigate('AppNavigator', { initialTab: 'Home' });
          }
        }}>
          <MaterialIcons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {userRole === 'brand' ? 'Reviews Given' : 'Reviews'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Tabs — only show for creators (brands have only 'Given', no tab switcher needed) */}
      {userRole !== 'brand' && (
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, styles.activeTab]}
          >
            <Text style={[styles.tabText, styles.activeTabText]}>
              Received ({receivedReviews.length})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryLeft}>
            <Text style={styles.summaryLabel}>
              {userRole === 'brand' ? 'Your Average Rating Given' : 'Average Rating'}
            </Text>
            <View style={styles.ratingContainer}>
              <MaterialIcons name="star" size={32} color="#FBBF24" />
              <Text style={styles.ratingValue}>{averageRating}</Text>
            </View>
          </View>
          <View style={styles.summaryRight}>
            <Text style={styles.reviewCount}>{currentReviews.length}</Text>
            <Text style={styles.reviewCountLabel}>Reviews</Text>
          </View>
        </View>

        {/* Reviews List */}
        {currentReviews.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="star-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No reviews yet</Text>
            <Text style={styles.emptyText}>
              {activeTab === 'Received'
                ? 'You haven\'t received any reviews yet.'
                : 'You haven\'t given any reviews yet.'}
            </Text>
            {activeTab === 'Given' && userRole === 'brand' && (
              <TouchableOpacity
                style={styles.leaveReviewButton}
                onPress={() => navigation?.navigate('LeaveReview')}
              >
                <Text style={styles.leaveReviewButtonText}>Leave a Review</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.reviewsList}>
            {currentReviews.map((review) => {
              // Helper to get initials
              const getInitials = (name) => {
                if (!name || name === 'Anonymous' || name === 'Loading...') return '?';
                const parts = name.split(' ').filter(p => p.length > 0);
                if (parts.length >= 2) {
                  return (parts[0][0] + parts[1][0]).toUpperCase();
                }
                return name.substring(0, 2).toUpperCase();
              };

              // On Given tab (brand side): show the creator (reviewee) name & image
              // On Received tab: show the reviewer (who wrote the review)
              const isGivenTab = activeTab === 'Given' && userRole === 'brand';
              const imageUri = isGivenTab
                ? (review.revieweeImage || review.reviewerImage)
                : (review.reviewerImage || review.revieweeImage);
              const displayName = isGivenTab
                ? (review.revieweeName || review.reviewerName || 'Anonymous')
                : (review.reviewerName || review.revieweeName || 'Anonymous');

              return (
                <View key={review.id} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    {imageUri ? (
                      <Image
                        source={{ uri: imageUri }}
                        style={styles.reviewerImage}
                      />
                    ) : (
                      <View style={[styles.reviewerImage, { backgroundColor: '#337DEB', justifyContent: 'center', alignItems: 'center' }]}>
                        <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: 'bold' }}>
                          {getInitials(displayName)}
                        </Text>
                      </View>
                    )}
                    <View style={styles.reviewInfo}>
                      <Text style={styles.reviewerName}>
                        {displayName}
                      </Text>
                      <View style={styles.starsContainer}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <MaterialIcons
                            key={star}
                            name={star <= review.rating ? 'star' : 'star-border'}
                            size={16}
                            color="#FBBF24"
                          />
                        ))}
                      </View>
                    </View>
                    <Text style={styles.reviewDate}>{review.date}</Text>
                  </View>
                  {review.campaign && review.campaign !== 'N/A' && (
                    <Text style={styles.campaignName}>{review.campaign}</Text>
                  )}
                  <Text style={styles.reviewText}>{review.review}</Text>

                  {/* Response to review (for received reviews = brand's own reply) */}
                  {activeTab === 'Received' && review.response && (
                    <View style={styles.responseContainer}>
                      <View style={styles.responseHeader}>
                        <MaterialIcons name="reply" size={14} color="#337DEB" />
                        <Text style={styles.responseLabel}>Your Response:</Text>
                      </View>
                      <Text style={styles.responseText}>{review.response.comment || review.response}</Text>
                    </View>
                  )}

                  {/* Creator's response (for Given tab = brand sees creator's reply) */}
                  {activeTab === 'Given' && userRole === 'brand' && review.response && (
                    <View style={[styles.responseContainer, { borderLeftColor: '#10B981', backgroundColor: '#F0FDF4' }]}>
                      <View style={styles.responseHeader}>
                        <MaterialIcons name="reply" size={14} color="#10B981" />
                        <Text style={[styles.responseLabel, { color: '#10B981' }]}>
                          {displayName}'s Response:
                        </Text>
                      </View>
                      <Text style={styles.responseText}>{review.response.comment || review.response}</Text>
                    </View>
                  )}

                  {/* No response yet badge on Given tab */}
                  {activeTab === 'Given' && userRole === 'brand' && !review.response && (
                    <View style={styles.noResponseBadge}>
                      <MaterialIcons name="hourglass-empty" size={13} color="#9CA3AF" />
                      <Text style={styles.noResponseBadgeText}>No response yet</Text>
                    </View>
                  )}

                  {/* Action Buttons */}
                  <View style={styles.reviewActions}>
                    {activeTab === 'Received' && (
                      <>
                        {/* Helpful Vote */}
                        <TouchableOpacity
                          style={[
                            styles.actionButton,
                            helpfulVotes[review.id] === true && styles.actionButtonActive
                          ]}
                          onPress={() => handleVoteHelpful(review, helpfulVotes[review.id] !== true)}
                          disabled={processing}
                        >
                          <MaterialIcons
                            name={helpfulVotes[review.id] === true ? 'thumb-up' : 'thumb-up-outline'}
                            size={18}
                            color={helpfulVotes[review.id] === true ? '#337DEB' : '#6B7280'}
                          />
                          <Text style={[
                            styles.actionButtonText,
                            helpfulVotes[review.id] === true && styles.actionButtonTextActive
                          ]}>
                            Helpful {review.helpfulVotes > 0 ? `(${review.helpfulVotes})` : ''}
                          </Text>
                        </TouchableOpacity>

                        {/* Respond Button */}
                        {!review.response && (
                          <TouchableOpacity
                            style={styles.actionButton}
                            onPress={() => handleRespondToReview(review)}
                            disabled={processing}
                          >
                            <MaterialIcons name="reply" size={18} color="#6B7280" />
                            <Text style={styles.actionButtonText}>Respond</Text>
                          </TouchableOpacity>
                        )}
                      </>
                    )}

                    {activeTab === 'Given' && userRole === 'brand' && (() => {
                      // Get current user role (should always be 'brand' here since we check above)
                      const currentUserRole = user?.role?.toLowerCase();
                      const isCurrentUserInfluencer = currentUserRole === 'creator' || currentUserRole === 'influencer';
                      const isCurrentUserBrand = currentUserRole === 'brand';

                      // In "Given" tab, current user IS the reviewer (they wrote the review)
                      // Check if reviewee (person being reviewed) is a brand
                      const isRevieweeBrand = review.revieweeRole === 'brand';

                      // Logic:
                      // - Brands can always edit/delete their own reviews
                      // - Influencers CANNOT edit/delete reviews they gave to brands
                      // - Influencers CAN edit/delete reviews they gave to other influencers/creators
                      const canEditDelete = isCurrentUserBrand || (isCurrentUserInfluencer && !isRevieweeBrand);

                      if (!canEditDelete) {
                        return null; // Don't show edit/delete buttons
                      }

                      return (
                        <>
                          {/* Edit Button */}
                          <TouchableOpacity
                            style={styles.actionButton}
                            onPress={() => handleEditReview(review)}
                            disabled={processing}
                          >
                            <MaterialIcons name="edit" size={18} color="#6B7280" />
                            <Text style={styles.actionButtonText}>Edit</Text>
                          </TouchableOpacity>

                          {/* Delete Button */}
                          <TouchableOpacity
                            style={[styles.actionButton, styles.deleteButton]}
                            onPress={() => handleDeleteReview(review)}
                            disabled={processing}
                          >
                            <MaterialIcons name="delete" size={18} color="#EF4444" />
                            <Text style={[styles.actionButtonText, styles.deleteButtonText]}>Delete</Text>
                          </TouchableOpacity>
                        </>
                      );
                    })()}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Edit Review Modal */}
      <Modal
        visible={showEditModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Review</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <MaterialIcons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScrollView}>
              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>Rating *</Text>
                <StarRating
                  rating={editRating}
                  onRatingChange={setEditRating}
                  size={32}
                  editable={true}
                />
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>Comment *</Text>
                <TextInput
                  style={styles.modalTextInput}
                  placeholder="Write your review..."
                  placeholderTextColor="#9CA3AF"
                  value={editComment}
                  onChangeText={setEditComment}
                  multiline
                  numberOfLines={6}
                  textAlignVertical="top"
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowEditModal(false);
                  setEditingReview(null);
                  setEditRating(0);
                  setEditComment('');
                }}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitButton, processing && styles.modalSubmitButtonDisabled]}
                onPress={handleUpdateReview}
                disabled={processing}
              >
                {processing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSubmitButtonText}>Update Review</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Respond to Review Modal */}
      <Modal
        visible={showRespondModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowRespondModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Respond to Review</Text>
              <TouchableOpacity onPress={() => {
                setShowRespondModal(false);
                setRespondingToReview(null);
                setResponseText('');
              }}>
                <MaterialIcons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScrollView}>
              {respondingToReview && (
                <View style={styles.responseReviewCard}>
                  <Text style={styles.responseReviewText}>"{respondingToReview.review}"</Text>
                  <Text style={styles.responseReviewAuthor}>- {respondingToReview.reviewerName}</Text>
                </View>
              )}

              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>Your Response *</Text>
                <TextInput
                  style={styles.modalTextInput}
                  placeholder="Write your response..."
                  placeholderTextColor="#9CA3AF"
                  value={responseText}
                  onChangeText={setResponseText}
                  multiline
                  numberOfLines={6}
                  textAlignVertical="top"
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowRespondModal(false);
                  setRespondingToReview(null);
                  setResponseText('');
                }}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitButton, processing && styles.modalSubmitButtonDisabled]}
                onPress={handleSubmitResponse}
                disabled={processing}
              >
                {processing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSubmitButtonText}>Submit Response</Text>
                )}
              </TouchableOpacity>
            </View>
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
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
    marginHorizontal: 4,
  },
  activeTab: {
    backgroundColor: '#F0F4FF',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  activeTabText: {
    color: '#337DEB',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  summaryLeft: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ratingValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
  },
  summaryRight: {
    alignItems: 'center',
  },
  reviewCount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#337DEB',
  },
  reviewCountLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  reviewsList: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 100,
  },
  reviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  reviewerImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  reviewInfo: {
    flex: 1,
  },
  reviewerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 2,
  },
  reviewDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  campaignName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#337DEB',
    marginBottom: 8,
  },
  reviewText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 20,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  leaveReviewButton: {
    backgroundColor: '#337DEB',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 20,
  },
  leaveReviewButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  reviewActions: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    gap: 6,
  },
  actionButtonActive: {
    backgroundColor: '#EEF2FF',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  actionButtonTextActive: {
    color: '#337DEB',
  },
  deleteButton: {
    backgroundColor: '#FEF2F2',
  },
  deleteButtonText: {
    color: '#EF4444',
  },
  responseContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#337DEB',
  },
  responseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  responseLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#337DEB',
    textTransform: 'uppercase',
  },
  responseText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },
  modalScrollView: {
    maxHeight: 400,
  },
  modalSection: {
    padding: 20,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  modalTextInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#1F2937',
    minHeight: 120,
    textAlignVertical: 'top',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  modalSubmitButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#337DEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubmitButtonDisabled: {
    opacity: 0.5,
  },
  modalSubmitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  starContainer: {
    flexDirection: 'row',
    gap: 4,
  },
  starButton: {
    padding: 4,
  },
  responseReviewCard: {
    padding: 16,
    margin: 20,
    marginBottom: 0,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#E5E7EB',
  },
  responseReviewText: {
    fontSize: 14,
    color: '#374151',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  responseReviewAuthor: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'right',
  },
  noResponseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  noResponseBadgeText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
});

export default Reviews;

