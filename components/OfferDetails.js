import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, ActivityIndicator, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Linking } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import DirectPayModal from './DirectPayModal';
import SendToBrandModal from './SendToBrandModal';
import { getCompactDualPrice, isFreeProduct, formatDualCurrency } from '../utils/currency';
import * as offersService from '../services/offers';
import { PlatformIcon } from '../utils/platformIcons';
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

// Helper function to map API offer data to UI format
// Handles GET /offers/:id response format: { _id, creatorId, title, serviceType, platform, rate, etc. }
const mapOfferToUI = (offerData) => {
  if (!offerData) return null;

  // Handle creatorId - can be string ID or populated object
  let creator = offerData.creator || offerData.user || {};
  if (offerData.creatorId) {
    if (typeof offerData.creatorId === 'object' && offerData.creatorId !== null) {
      // creatorId is populated (from Get Offer by ID) - has creator info
      creator = offerData.creatorId;
    }
    // If creatorId is a string, we'll need to fetch it separately (handled in useEffect)
  }

  const location = offerData.location || {};
  const platformMetrics = creator.platformMetrics || [];
  const primaryPlatform = offerData.platform?.[0] || platformMetrics[0]?.platform || 'instagram';

  // Map serviceType from API to display format
  const serviceTypeDisplay = offerData.serviceType === 'reel' ? 'Creator'
    : offerData.serviceType === 'short_video' ? 'Influencer'
      : offerData.serviceType || 'Creator';


  // Handle rate - use dual currency utility
  const priceDisplay = getCompactDualPrice(offerData.rate);


  // Extract creatorId for navigation
  let creatorIdForNav = null;
  if (offerData.creatorId) {
    if (typeof offerData.creatorId === 'object' && offerData.creatorId !== null) {
      creatorIdForNav = offerData.creatorId._id || offerData.creatorId.id;
    } else if (typeof offerData.creatorId === 'string') {
      creatorIdForNav = offerData.creatorId;
    }
  }
  // Fallback to creator object
  if (!creatorIdForNav && creator && (creator._id || creator.id)) {
    creatorIdForNav = creator._id || creator.id;
  }

  // Extract creator name with better fallback logic
  let creatorName = 'Unknown Creator';
  if (creator) {
    // Check name first (trim to handle whitespace-only names)
    if (creator.name && creator.name.trim()) {
      creatorName = creator.name.trim();
    } else if (creator.username && creator.username.trim()) {
      creatorName = `@${creator.username.trim()}`;
    } else if (creator.email && creator.email.trim()) {
      // Fallback to email if name/username not available
      creatorName = creator.email.split('@')[0];
    }
  }

  // Get follower count from social accounts based on primary platform
  let followers = 0;
  if (creator && creator.socialAccounts) {
    const platformKey = typeof primaryPlatform === 'string' ? primaryPlatform.toLowerCase() : 'instagram';
    const socialAccount = creator.socialAccounts[platformKey];
    if (socialAccount && socialAccount.followers) {
      followers = socialAccount.followers;
    }
  }

  // Safely format platform name
  const safePlatformName = (typeof primaryPlatform === 'string' ? primaryPlatform : 'instagram');
  const formattedPlatform = safePlatformName.charAt(0).toUpperCase() + safePlatformName.slice(1);

  const norm = (v) => {
    if (!v) return '';
    const s = String(v).trim();
    if (s.toLowerCase() === 'n/a') return '';
    return s;
  };

  return {
    id: offerData._id || offerData.id,
    title: offerData.title || 'Untitled Offer',
    creator: creatorName,
    avatar: creator.profileImage || creator.avatar || null,
    followers: followers,
    creatorId: creatorIdForNav, // Store creatorId for navigation
    location: norm(location.city) || norm(location.country)
      ? [norm(location.city), norm(location.state), norm(location.country)].filter(Boolean).join(', ')
      : 'Remote',
    // Removed audience - not in offer API payload
    platform: formattedPlatform,
    platformIcon: safePlatformName === 'instagram' ? 'camera-alt'
      : safePlatformName === 'tiktok' ? 'music-note'
        : safePlatformName === 'youtube' ? 'play-circle-filled'
          : 'link',
    price: priceDisplay,
    isFreeProduct: isFreeProduct(offerData.rate),
    image: offerData.media?.[0]?.url || (offerData.media?.[0] && typeof offerData.media[0] === 'string' ? offerData.media[0] : null),
    serviceType: serviceTypeDisplay, // Use serviceType from offer data (reel/short_video)
    quantity: offerData.quantity || '1',
    deliveryDays: offerData.deliveryDays || 0,
    duration: offerData.duration || 30,
    category: offerData.category || 'General',
    tags: offerData.tags || [],
    isCustom: !!offerData.isCustom,
    about: offerData.about || offerData.description || 'No information available',
    description: offerData.description || 'No description available',
    _original: offerData,
  };
};

const OfferDetails = ({ navigation, route }) => {
  const { user } = useAuth();
  const ui = (useUIStore && typeof useUIStore === 'function') ? useUIStore() : { showToast: () => {} };
  const showToast = ui.showToast || (() => {});
  const userRole = user?.role?.toLowerCase() || route?.params?.role?.toLowerCase() || navigation?.getParam?.('role')?.toLowerCase() || 'creator';
  const isBrand = userRole === 'brand';
  const isCreator = userRole === 'creator' || userRole === 'influencer';

  // Single source of truth: offer id from route params every render (depth-level fix for second offer showing first)
  const paramsOfferId = route?.params?.offerId || route?.params?.offer?._id || route?.params?.offer?.id || route?.params?.campaign?._id || route?.params?.campaign?.id;

  const [offer, setOffer] = useState(null);
  const [currentOfferId, setCurrentOfferId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [quantity, setQuantity] = useState('1');
  const [showDirectPay, setShowDirectPay] = useState(false);

  const [creatorId, setCreatorId] = useState(null);
  const [showSendToBrand, setShowSendToBrand] = useState(false);

  const loadedOfferId = offer?._id || offer?.id;
  const paramsMatchLoaded =
    paramsOfferId != null &&
    loadedOfferId != null &&
    String(paramsOfferId) === String(loadedOfferId);
  const mappedOffer = useMemo(() => mapOfferToUI(offer), [offer]);
  const displayOffer = paramsMatchLoaded ? (mappedOffer || offer || {}) : {};
  const showLoadingForMismatch = Boolean(paramsOfferId && !paramsMatchLoaded);

  // Fetch offer details from API – offerIdParam must be passed so we always fetch the correct offer (avoids showing first offer when opening second)
  const fetchOfferDetails = useCallback(async (offerIdParam, isMountedRef) => {
    const offerIdToCheck = offerIdParam || route?.params?.offerId || route?.params?.offer?._id || route?.params?.offer?.id;

    if (!offerIdToCheck) {
      if (isMountedRef.current) {
        setError('No offer information available');
        setLoading(false);
      }
      return;
    }

    try {
      if (isMountedRef.current) setLoading(true);

      const response = await offersService.getOfferById(offerIdToCheck);

      if (isMountedRef.current && response && response.data) {
        setOffer(response.data);
        setCurrentOfferId(offerIdToCheck);
        setError(null);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err.message || 'Failed to load offer details');
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [route?.params?.offerId, route?.params?.offer]);

  useEffect(() => {
    const isMountedRef = { current: true };
    const newOfferId = paramsOfferId;

    setCurrentOfferId(newOfferId);
    if (!newOfferId) {
      setOffer(null);
      if (isMountedRef.current) setLoading(false);
      return () => { isMountedRef.current = false; };
    }

    setOffer(null);
    setLoading(true);

    fetchOfferDetails(newOfferId, isMountedRef);

    return () => {
      isMountedRef.current = false;
    };
  }, [paramsOfferId, fetchOfferDetails]);

  // Focus listener – re-fetch current offer when screen gains focus (e.g. after purchase)
  useEffect(() => {
    let unsubscribe = () => { };
    if (navigation && typeof navigation.addListener === 'function') {
      unsubscribe = navigation.addListener('focus', () => {
        const id = route?.params?.offerId || route?.params?.offer?._id || route?.params?.offer?.id || currentOfferId;
        if (id) fetchOfferDetails(id, { current: true });
      });
    }
    return () => unsubscribe();
  }, [navigation, fetchOfferDetails, route?.params?.offerId, route?.params?.offer, currentOfferId]);


  // Extract creatorId from offer whenever it changes
  useEffect(() => {
    if (offer) {
      let extractedCreatorId = null;
      if (offer.creatorId) {
        if (typeof offer.creatorId === 'object' && offer.creatorId !== null) {
          extractedCreatorId = offer.creatorId._id || offer.creatorId.id;
        } else if (typeof offer.creatorId === 'string') {
          extractedCreatorId = offer.creatorId;
        }
      }

      if (extractedCreatorId) {
        setCreatorId(extractedCreatorId);
      }
    }
  }, [offer]);

  // Handle purchase offer - Navigate to checkout screen
  const handlePurchaseOffer = () => {
    if (!offer || !mappedOffer) {
      showToast('Offer information not available', 'error');
      return;
    }

    const offerId = mappedOffer?._original?._id || mappedOffer?._original?.id || offer?._id || offer?.id;

    if (!offerId) {
      showToast('Offer ID not available', 'error');
      return;
    }

    // Navigate to checkout screen with offer details
    navigation?.navigate('Checkout', {
      offerId,
      offer: mappedOffer?._original || offer,
      quantity: parseInt(quantity) || 1,
      role: userRole,
    });
  };

  // Handle start chat with creator
  const handleStartChat = async () => {
    if (!creatorId) {
      showToast('Creator information not available', 'error');
      return;
    }

    try {
      // Get creator name for the conversation
      const creatorName = mappedOffer?.creator || displayOffer?.creator || 'Creator';

      // Use getOrCreateConversation to ensure we have a valid conversation document
      const { getOrCreateConversation } = await import('../services/chat');

      const brandId = user?.id || user?._id;
      const influencerId = creatorId;

      if (!brandId || !influencerId) {
        throw new Error('Missing participant IDs');
      }

      const conversation = await getOrCreateConversation(brandId, influencerId, {
        brandName: user?.name || 'Brand',
        influencerName: creatorName,
        brandAvatar: user?.profileImage || user?.avatar || '',
        influencerAvatar: mappedOffer?.avatar || displayOffer?.avatar || ''
      });

      // Navigate to Chat screen (not Messages!)
      navigation?.navigate('Chat', {
        conversation: {
          id: conversation.id,
          name: creatorName,
          avatar: mappedOffer?.avatar || displayOffer?.avatar || null,
          subtitle: 'Creator'
        }
      });
    } catch (error) {
      console.error('Failed to start chat:', error);
      showToast('Failed to start chat. Please try again.', 'error');
    }
  };

  const handleGoBack = () => {
    // Explicitly navigate to the 'Offers' tab which shows "My Offers" or "Explore Offers" depending on role
    // This ensures we always go back to the list and never get stuck or show splash screen
    if (navigation?.navigate) {
      navigation.navigate('Offers');
    } else if (navigation?.goBack) {
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleGoBack}
          >
            <MaterialIcons name="arrow-back" size={24} color="#2d3748" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Offer Details</Text>
          {!isBrand ? (
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => {
                  const preservedTab = route?.params?.preservedTab;
                  navigation?.navigate('EditOffer', {
                    offer: mappedOffer?._original || offer,
                    preservedTab: preservedTab
                  });
                }}
              >
                <MaterialIcons name="edit" size={20} color="#337DEB" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={async () => {
                  try {
                    const originalOffer = mappedOffer?._original || offer || {};
                    const offerMedia = originalOffer.media || [];

                    if (offerMedia.length > 0) {
                      try {
                        const { deleteFile, extractPublicId } = await import('../services/upload');
                        for (const media of offerMedia) {
                          if (media && media.url) {
                            const publicId = extractPublicId(media.url);
                            if (publicId) {
                              try {
                                await deleteFile(publicId, 'image');
                              } catch (deleteError) {
                                console.warn('Failed to delete media file:', deleteError);
                              }
                            }
                          }
                        }
                      } catch (uploadServiceError) {
                        console.warn('Error deleting media files:', uploadServiceError);
                      }
                    }

                    const offersService = await import('../services/offers');
                    const offerId = mappedOffer?._original?._id || mappedOffer?._original?.id || offer?._id || offer?.id;
                    if (offerId) {
                      await offersService.deleteOffer(offerId);
                      showToast('Offer deleted successfully', 'success');
                      navigation?.goBack();
                    } else {
                      showToast('Unable to delete offer', 'error');
                    }
                  } catch (err) {
                    showToast(err.message || 'Failed to delete offer', 'error');
                  }
                }}
              >
                <MaterialIcons name="delete" size={20} color="#ef4444" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.headerSpacer} />
          )}
        </View>

        {(loading || showLoadingForMismatch) ? (
          <View style={{ padding: 40, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color="#337DEB" />
            <Text style={{ marginTop: 10, color: '#6b7280' }}>Loading details...</Text>
          </View>
        ) : error ? (
          <View style={{ padding: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#ef4444', textAlign: 'center', fontSize: 16 }}>{error}</Text>
            <TouchableOpacity
              style={{ marginTop: 20, padding: 10, backgroundColor: '#337DEB', borderRadius: 8 }}
              onPress={() => navigation.goBack()}
            >
              <Text style={{ color: 'white' }}>Go Back</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Hero image - same as Campaign Details */}
            <View style={styles.heroImageContainer}>
              <Image
                source={{ uri: displayOffer?.image || (offer?.media?.[0]?.url || offer?.media?.[0]) || 'https://via.placeholder.com/800x400?text=Offer' }}
                style={styles.heroImage}
                resizeMode="cover"
              />
            </View>
            {/* Offer Title */}
            <View style={styles.titleContainer}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                <Text style={styles.campaignTitle}>{displayOffer?.title}</Text>
                {displayOffer?._original?.status === 'draft' && (
                  <View style={{
                    backgroundColor: '#FEF3C7',
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 4,
                    marginLeft: 8,
                    alignSelf: 'center'
                  }}>
                    <Text style={{ color: '#D97706', fontSize: 12, fontWeight: 'bold' }}>DRAFT</Text>
                  </View>
                )}
                {displayOffer?._original?.isCustom && (
                  <View style={{
                    backgroundColor: '#F3E8FF',
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 4,
                    marginLeft: 8,
                    alignSelf: 'center'
                  }}>
                    <Text style={{ color: '#8B5CF6', fontSize: 12, fontWeight: 'bold' }}>CUSTOM</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Creator Information */}
            <TouchableOpacity
              style={styles.brandContainer}
              onPress={() => {
                if (displayOffer?.creatorId) {
                  navigation?.navigate('CreatorProfile', { userId: displayOffer.creatorId });
                }
              }}
            >
              {displayOffer?.avatar ? (
                <Image source={{ uri: displayOffer.avatar }} style={styles.brandImage} />
              ) : (
                <View style={[styles.brandImage, { backgroundColor: '#337DEB', justifyContent: 'center', alignItems: 'center' }]}>
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>{displayOffer?.creator?.[0]?.toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.brandInfo}>
                <Text style={styles.brandName}>{displayOffer?.creator}</Text>
                <Text style={styles.brandTagline}>{displayOffer?.serviceType || 'Creator'} Service</Text>
                {displayOffer?.followers > 0 && (
                  <Text style={styles.followerCount}>
                    {displayOffer.followers >= 1000000
                      ? `${(displayOffer.followers / 1000000).toFixed(1)}M followers`
                      : displayOffer.followers >= 1000
                        ? `${(displayOffer.followers / 1000).toFixed(1)}K followers`
                        : `${displayOffer.followers} followers`}
                  </Text>
                )}
              </View>
            </TouchableOpacity>

            {/* Budget & Platform Cards */}
            <View style={styles.detailsContainer}>
              <View style={styles.detailCard}>
                <Text style={styles.detailLabel}>PRICE</Text>
                <Text style={styles.detailValue}>
                  {displayOffer?.isFreeProduct ? 'Free' : (displayOffer?.price || 'Negotiable')}
                </Text>
              </View>
              <View style={styles.detailCard}>
                <Text style={styles.detailLabel}>PLATFORM</Text>
                <View style={styles.platformRow}>
                  <PlatformIcon
                    platform={displayOffer.platform}
                    size={20}
                    color="#000"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.detailValue}>{displayOffer.platform || 'General'}</Text>
                </View>
              </View>
            </View>

            {/* About Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>About This Offer</Text>
              <Text style={styles.descriptionText}>
                {displayOffer.about || displayOffer.description || 'No information available'}
              </Text>
            </View>

            {/* Service Details Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Service Details</Text>
              <View style={styles.deliverablesList}>
                <View style={styles.deliverableItem}>
                  <MaterialIcons name="check-circle" size={16} color="#337DEB" />
                  <Text style={styles.deliverableText}>Professional content on {displayOffer.platform}</Text>
                </View>
                <View style={styles.deliverableItem}>
                  <MaterialIcons name="check-circle" size={16} color="#337DEB" />
                  <Text style={styles.deliverableText}>Quantity: {displayOffer.quantity || '1'} items</Text>
                </View>
                <View style={styles.deliverableItem}>
                  <MaterialIcons name="check-circle" size={16} color="#337DEB" />
                  <Text style={styles.deliverableText}>Delivery in {displayOffer.deliveryDays || 0} days</Text>
                </View>
              </View>
            </View>

            {/* Compensation Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Compensation</Text>
              <View style={styles.compensationContainer}>
                <View style={styles.compensationCard}>
                  {displayOffer?.isFreeProduct && (
                    <MaterialIcons
                      name="card-giftcard"
                      size={20}
                      color="#10b981"
                    />
                  )}
                  <Text style={[styles.compensationText, !displayOffer?.isFreeProduct && { marginLeft: 0 }]}>
                    {displayOffer?.isFreeProduct ? 'Product Gifting' : 'Paid Collaboration'}
                  </Text>
                </View>
              </View>
            </View>



            {/* Action Buttons */}
            {isBrand ? (
              <View style={styles.brandActionButtonsContainer}>
                <View style={styles.brandTopButtonsRow}>
                  <TouchableOpacity
                    style={styles.brandPrimaryButton}
                    onPress={handlePurchaseOffer}
                  >
                    <MaterialIcons name="shopping-cart" size={20} color="#ffffff" />
                    <Text style={styles.brandPrimaryButtonText}>Purchase Offer</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.brandSecondaryButton}
                    onPress={() => {
                      if (creatorId) {
                        navigation?.navigate('CreatorProfile', { userId: creatorId });
                      } else {
                        showToast('Creator information not available', 'error');
                      }
                    }}
                  >
                    <MaterialIcons name="person" size={20} color="#337DEB" />
                    <Text style={styles.brandSecondaryButtonText}>View Profile</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.brandChatButton}
                  onPress={handleStartChat}
                >
                  <MaterialIcons name="chat" size={20} color="#337DEB" />
                  <Text style={styles.brandChatButtonText}>Start Chat</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.actionButtonsContainer}>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => setShowSendToBrand(true)}
                >
                  <MaterialIcons name="send" size={20} color="#ffffff" />
                  <Text style={styles.primaryButtonText}>Send to Brand</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => navigation?.navigate('ActiveOrders', { fromOffer: offer })}
                >
                  <MaterialIcons name="list-alt" size={20} color="#337DEB" />
                  <Text style={styles.secondaryButtonText}>View Orders</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <DirectPayModal
        visible={showDirectPay}
        onClose={() => setShowDirectPay(false)}
        onSuccess={(paymentData) => {
          setShowDirectPay(false);
          showToast('Payment processed successfully!', 'success');
          navigation?.navigate('ActiveOrders');
        }}
        offerId={mappedOffer?.id || offer?._id || offer?.id}
        currency={offer?.rate?.usd ? 'USD' : 'NGN'}
        quantity={parseInt(quantity) || 1}
      />

      <SendToBrandModal
        visible={showSendToBrand}
        onClose={() => setShowSendToBrand(false)}
        offer={mappedOffer?._original || offer}
        navigation={navigation}
        user={user}
        onSuccess={() => {
          // Modal already shows success message, no need for redundant alert here
        }}
      />
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
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  editButton: {
    padding: 4,
  },
  deleteButton: {
    padding: 4,
  },
  heroImageContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  heroImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  titleContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  campaignTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2d3748',
    lineHeight: 32,
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  brandImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
    overflow: 'hidden',
  },
  brandInfo: {
    flex: 1,
  },
  brandName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2d3748',
    marginBottom: 2,
  },
  brandTagline: {
    fontSize: 14,
    color: '#718096',
  },
  detailsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 24,
    gap: 12,
  },
  detailCard: {
    flex: 1,
    backgroundColor: '#e6ecff',
    padding: 16,
    borderRadius: 12,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#337DEB',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2d3748',
  },
  platformRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2d3748',
    marginBottom: 12,
  },
  descriptionText: {
    fontSize: 14,
    color: '#4a5568',
    lineHeight: 20,
  },
  deliverablesList: {
    gap: 12,
  },
  deliverableItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  deliverableText: {
    fontSize: 14,
    color: '#4a5568',
    marginLeft: 8,
    flex: 1,
    lineHeight: 20,
  },
  compensationContainer: {
    gap: 12,
  },
  compensationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6ecff',
    padding: 17,
    borderRadius: 12,
  },
  compensationText: {
    fontSize: 14,
    color: '#2d3748',
    marginLeft: 12,
    fontWeight: '500',
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 40,
    marginTop: 0,
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#337DEB',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#337DEB',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#337DEB',
  },
  // Brand-specific button styles
  brandActionButtonsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    marginTop: 0,
    gap: 12,
  },
  brandTopButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  brandPrimaryButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#337DEB',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  brandPrimaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  brandSecondaryButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#337DEB',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  brandSecondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#337DEB',
  },
  brandChatButton: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#337DEB',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  brandChatButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#337DEB',
  },
  followerCount: {
    fontSize: 12,
    color: '#10b981',
    fontWeight: '600',
    marginTop: 4,
  },

});

export default OfferDetails;
