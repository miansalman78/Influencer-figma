import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../hooks/useAuth';
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

// Helper function to get initials from name
const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.split(' ').filter(p => p.length > 0);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

const LeaveReview = ({ navigation, route }) => {
  const { user } = useAuth();
  const ui = (useUIStore && typeof useUIStore === 'function') ? useUIStore() : { showToast: () => {} };
  const showToast = ui.showToast || (() => {});
  const userRole = user?.role?.toLowerCase();
  const isBrand = userRole === 'brand';
  const isCreator = userRole === 'creator' || userRole === 'influencer';

  const [overallRating, setOverallRating] = useState(0);
  const [communicationRating, setCommunicationRating] = useState(0);
  const [qualityRating, setQualityRating] = useState(0);
  const [professionalismRating, setProfessionalismRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [revieweeData, setRevieweeData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [campaignTitle, setCampaignTitle] = useState('');

  const handleOverallRating = (rating) => {
    setOverallRating(rating);
  };

  const handleCommunicationRating = (rating) => {
    setCommunicationRating(rating);
  };

  const handleQualityRating = (rating) => {
    setQualityRating(rating);
  };

  const handleProfessionalismRating = (rating) => {
    setProfessionalismRating(rating);
  };

  // Fetch reviewee data based on order and user role
  useEffect(() => {
    const fetchRevieweeData = async () => {
      try {
        const order = route?.params?.order;
        if (!order) {
          setLoading(false);
          return;
        }

        // Determine who to review based on current user's role
        // Brand reviews creator, Creator reviews brand
        let revieweeId = null;
        let revieweeDataFromOrder = null;

        if (isBrand) {
          // Brand is reviewing the creator - check multiple possible fields
          // First check if there's a mapped creatorName from previous screens
          if (order.creatorName) {
            // Still need to get the ID
            const creator = order.creatorId || order.creator || 
                            order.proposalId?.creatorId || order.proposal?.creator ||
                            order.proposalId?.creator || {};
            if (typeof creator === 'object' && creator !== null) {
              revieweeId = creator._id || creator.id;
            } else {
              revieweeId = creator;
            }
            // Use the mapped data from OrderDetails/ActiveOrders
            revieweeDataFromOrder = {
              _id: revieweeId,
              id: revieweeId,
              name: order.creatorName,
              profileImage: order.creatorImage || order.creatorAvatar || null,
              username: order.creatorUsername || null,
            };
          } else {
            // Fallback to original extraction logic
            revieweeDataFromOrder = order.creatorId || order.creator || 
                                    order.proposalId?.creatorId || order.proposal?.creator ||
                                    order.proposalId?.creator || {};
            
            // Extract ID whether it's an object or string
            if (typeof revieweeDataFromOrder === 'object' && revieweeDataFromOrder !== null) {
              revieweeId = revieweeDataFromOrder._id || revieweeDataFromOrder.id;
            } else {
              revieweeId = revieweeDataFromOrder;
              revieweeDataFromOrder = null; // Reset if it's just a string
            }
          }
        } else if (isCreator) {
          // Creator is reviewing the brand - check multiple possible fields
          // First check if there's a mapped company name from previous screens
          if (order.company) {
            // Still need to get the ID
            const brand = order.brandId || order.brand || 
                          order.campaignId?.brandId || order.campaign?.brand ||
                          order.campaignId?.brand || {};
            if (typeof brand === 'object' && brand !== null) {
              revieweeId = brand._id || brand.id;
            } else {
              revieweeId = brand;
            }
            // Use the mapped data from OrderDetails/ActiveOrders
            revieweeDataFromOrder = {
              _id: revieweeId,
              id: revieweeId,
              name: order.company,
              companyName: order.company,
              profileImage: null, // Brand image not typically in order mapping
            };
          } else {
            // Fallback to original extraction logic
            revieweeDataFromOrder = order.brandId || order.brand || 
                                    order.campaignId?.brandId || order.campaign?.brand ||
                                    order.campaignId?.brand || {};
            
            // Extract ID whether it's an object or string
            if (typeof revieweeDataFromOrder === 'object' && revieweeDataFromOrder !== null) {
              revieweeId = revieweeDataFromOrder._id || revieweeDataFromOrder.id;
            } else {
              revieweeId = revieweeDataFromOrder;
              revieweeDataFromOrder = null; // Reset if it's just a string
            }
          }
        }

        console.log('[LeaveReview] Reviewee data extraction:', {
          isBrand,
          isCreator,
          revieweeId,
          hasRevieweeData: !!revieweeDataFromOrder,
          revieweeDataKeys: revieweeDataFromOrder ? Object.keys(revieweeDataFromOrder) : [],
          orderKeys: Object.keys(order || {})
        });

        // If we have populated data from order, use it directly
        if (revieweeDataFromOrder && typeof revieweeDataFromOrder === 'object' && revieweeDataFromOrder !== null) {
          const name = revieweeDataFromOrder.name || revieweeDataFromOrder.companyName || 
                       revieweeDataFromOrder.username || 'Unknown';
          setRevieweeData({
            id: revieweeDataFromOrder._id || revieweeDataFromOrder.id || revieweeId,
            name: name,
            profileImage: revieweeDataFromOrder.profileImage || revieweeDataFromOrder.avatar || null,
          });
          console.log('[LeaveReview] Using reviewee data from order:', name);
          setLoading(false);
        } else if (revieweeId) {
          // Try to fetch from API, but handle errors gracefully
          try {
            const userService = await import('../services/user');
            const response = await userService.getProfileByUserId(revieweeId);
            
            // Handle different response structures
            let revieweeData = null;
            if (response) {
              if (response.data && typeof response.data === 'object') {
                revieweeData = response.data;
              } else if (response.id || response._id || response.name) {
                revieweeData = response;
              }
            }
            
            if (revieweeData && (revieweeData.name || revieweeData.companyName || revieweeData.username)) {
              const name = revieweeData.name || revieweeData.companyName || revieweeData.username || 'Unknown';
              setRevieweeData({
                id: revieweeData._id || revieweeData.id || revieweeId,
                name: name,
                profileImage: revieweeData.profileImage || revieweeData.avatar || null,
              });
              console.log('[LeaveReview] Fetched reviewee data from API:', name);
            } else {
              console.warn('[LeaveReview] Could not extract reviewee data from API response:', response);
              // Set a fallback with the ID
              setRevieweeData({
                id: revieweeId,
                name: 'Unknown',
                profileImage: null,
              });
            }
          } catch (error) {
            console.error('[LeaveReview] Failed to fetch reviewee data from API:', error?.message || error);
            // Set a fallback with the ID
            setRevieweeData({
              id: revieweeId,
              name: 'Unknown',
              profileImage: null,
            });
          }
          setLoading(false);
        } else {
          console.warn('[LeaveReview] No reviewee ID found in order');
          setRevieweeData({
            id: null,
            name: 'Unknown',
            profileImage: null,
          });
          setLoading(false);
        }

        // Set campaign title
        const campaignTitleFromOrder = order.campaignId?.name || order.campaign?.name || order.title || '';
        setCampaignTitle(campaignTitleFromOrder);

        setLoading(false);
      } catch (error) {
        console.error('Failed to fetch reviewee data:', error);
        setLoading(false);
      }
    };

    fetchRevieweeData();
  }, [route?.params?.order, isBrand, isCreator]);

  const handleSubmitReview = async () => {
    if (overallRating === 0) {
      Alert.alert('Rating Required', 'Please select an overall rating');
      return;
    }

    try {
      const order = route?.params?.order;
      
      // Determine reviewee ID based on user role
      let revieweeId = null;
      if (isBrand) {
        // Brand reviews creator
        const creator = order.creatorId || order.creator;
        revieweeId = typeof creator === 'object' ? (creator._id || creator.id) : creator;
      } else if (isCreator) {
        // Creator reviews brand
        const brand = order.brandId || order.brand;
        revieweeId = typeof brand === 'object' ? (brand._id || brand.id) : brand;
      }

      if (!revieweeId) {
        showToast('Unable to identify the person to review', 'error');
        return;
      }

      // Get campaign ID and other context from order
      const campaignId = order.campaignId?._id || order.campaignId || order.campaign?._id || order.campaign || null;
      const deliverables = order.deliverables || [];
      const platform = deliverables.length > 0 ? deliverables[0].platform : (order.platform?.[0] || null);
      const serviceType = order.serviceType || null;

      const reviewsService = await import('../services/reviews');
      // Cap all ratings at 5 to ensure they don't exceed maximum
      const cappedRating = Math.min(5, Math.max(1, overallRating));
      const cappedProfessionalism = Math.min(5, Math.max(1, professionalismRating || overallRating));
      const cappedCommunication = Math.min(5, Math.max(1, communicationRating || overallRating));
      const cappedQuality = Math.min(5, Math.max(1, qualityRating || overallRating));
      
      const reviewData = {
        revieweeId,
        rating: cappedRating,
        comment: reviewText,
        professionalism: cappedProfessionalism,
        communication: cappedCommunication,
        quality: cappedQuality,
        context: {
          campaignId,
          serviceType,
          platform,
        },
      };

      await reviewsService.createReview(reviewData);
      showToast('Review submitted successfully!', 'success');
      navigation?.goBack();
    } catch (error) {
      console.error('Failed to submit review:', error);
      showToast(error.message || 'Failed to submit review. Please try again.', 'error');
    }
  };

  const StarRating = ({ rating, onRatingChange, size = 24 }) => {
    return (
      <View style={styles.starContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            onPress={() => onRatingChange(star)}
            style={styles.starButton}
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
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation?.navigate('AppNavigator', { initialTab: 'Orders' })}
          >
            <MaterialIcons name="arrow-back" size={24} color="#2d3748" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Leave a Review</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Profile Section */}
        <View style={styles.profileSection}>
          {loading ? (
            <ActivityIndicator size="large" color="#337DEB" />
          ) : (
            <>
              <View style={styles.profileImageContainer}>
                {revieweeData?.profileImage ? (
                  <Image
                    source={{ uri: revieweeData.profileImage }}
                    style={styles.profileImage}
                  />
                ) : (
                  <View style={styles.profileImage}>
                    <Text style={styles.profileImageText}>
                      {getInitials(revieweeData?.name || 'Unknown')}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.profileName}>{revieweeData?.name || 'Unknown'}</Text>
              {campaignTitle && (
                <Text style={styles.campaignText}>
                  Your review is for the '{campaignTitle}' campaign.
                </Text>
              )}
            </>
          )}
        </View>

        {/* Overall Experience Rating */}
        <View style={styles.ratingCard}>
          <Text style={styles.ratingTitle}>How was your experience?</Text>
          <StarRating 
            rating={overallRating} 
            onRatingChange={handleOverallRating}
            size={32}
          />
        </View>

        {/* Detailed Rating */}
        <View style={styles.detailedRatingSection}>
          <Text style={styles.detailedRatingTitle}>Detailed Rating</Text>
          
          <View style={styles.ratingRow}>
            <Text style={styles.ratingLabel}>Communication</Text>
            <StarRating 
              rating={communicationRating} 
              onRatingChange={handleCommunicationRating}
              size={20}
            />
          </View>
          
          <View style={styles.ratingRow}>
            <Text style={styles.ratingLabel}>Quality of Work</Text>
            <StarRating 
              rating={qualityRating} 
              onRatingChange={handleQualityRating}
              size={20}
            />
          </View>
          
          <View style={styles.ratingRow}>
            <Text style={styles.ratingLabel}>Professionalism</Text>
            <StarRating 
              rating={professionalismRating} 
              onRatingChange={handleProfessionalismRating}
              size={20}
            />
          </View>
        </View>

        {/* Share Experience */}
        <View style={styles.experienceSection}>
          <Text style={styles.experienceTitle}>Share your experience</Text>
          <TextInput
            style={styles.experienceInput}
            placeholder="Tell us more about your experience..."
            placeholderTextColor="#9ca3af"
            value={reviewText}
            onChangeText={setReviewText}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />
        </View>

        {/* Submit Button */}
        <TouchableOpacity style={styles.submitButton} onPress={handleSubmitReview}>
          <Text style={styles.submitButtonText}>Submit Review</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
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
  profileSection: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  profileImageContainer: {
    marginBottom: 16,
  },
  profileImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#337DEB',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  profileImageLoaded: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e5e7eb',
  },
  profileImageText: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: 'bold',
  },
  profileName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 8,
  },
  campaignText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  ratingCard: {
    backgroundColor: '#f9fafb',
    marginHorizontal: 16,
    marginBottom: 24,
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  ratingTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 16,
  },
  starContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  starButton: {
    padding: 4,
  },
  detailedRatingSection: {
    marginHorizontal: 16,
    marginBottom: 24,
  },
  detailedRatingTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 16,
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  ratingLabel: {
    fontSize: 16,
    color: '#374151',
    flex: 1,
  },
  experienceSection: {
    marginHorizontal: 16,
    marginBottom: 24,
  },
  experienceTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 16,
  },
  experienceInput: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#374151',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    minHeight: 120,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#337DEB',
    marginHorizontal: 16,
    marginBottom: 24,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});

export default LeaveReview;
