import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Image } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { mapCategoryToOffer, VALID_PLATFORMS, USER_PROFILE_CATEGORIES, mapBackendCategoryToUI } from '../utils/apiConstants';
import { useMetadata } from '../context/MetadataContext';
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
  console.error('Error importing MaterialIcons:', error);
  MaterialIcons = ({ name, size, color, style }) => (
    <Text style={[{ fontSize: size || 20, color: color || '#000' }, style]}>?</Text>
  );
}

const CreateOffer = ({ navigation, route }) => {
  const { categories: dynamicCategories, loading: metadataLoading } = useMetadata();
  const ui = (useUIStore && typeof useUIStore === 'function') ? useUIStore() : { showToast: () => {} };
  const showToast = ui.showToast || (() => {});

  const [selectedServiceType, setSelectedServiceType] = useState('Creator');
  const [isCustomOffer, setIsCustomOffer] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState(VALID_PLATFORMS[0] || 'instagram');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [offerTitle, setOfferTitle] = useState('');
  const [rates, setRates] = useState({ usd: '', ngn: '' });
  const [delivery, setDelivery] = useState('');
  const [offerDuration, setOfferDuration] = useState('');
  const [description, setDescription] = useState('');
  const [isNegotiable, setIsNegotiable] = useState(false);
  const [revisions, setRevisions] = useState('');
  // const [selectedCurrency, setSelectedCurrency] = useState('USD'); // Removed
  const [availableServices, setAvailableServices] = useState([]);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [location, setLocation] = useState({ city: '', state: '', country: '' });
  const [media, setMedia] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitGuardRef = useRef(false);

  // Set default category when dynamic categories are loaded
  useEffect(() => {
    if (dynamicCategories.length > 0 && !selectedCategory) {
      setSelectedCategory(dynamicCategories[0]);
    }
  }, [dynamicCategories]);

  // Fetch user profile and available services
  useEffect(() => {
    const fetchServices = async () => {
      try {
        setIsLoadingServices(true);
        const profileRes = await getMyProfile();

        if (profileRes && profileRes.success && profileRes.data) {
          const role = profileRes.data.role;
          setUserRole(role);

          // Set default service type based on role
          if (role && role.toLowerCase() === 'influencer') {
            setSelectedServiceType('Influencer');
          } else {
            setSelectedServiceType('Creator');
          }

          // Only fetch services if role is valid (creator or influencer)
          if (role && (role.toLowerCase() === 'creator' || role.toLowerCase() === 'influencer')) {
            try {
              // Map 'creator' to 'service_creator' for the API
              const apiRole = role.toLowerCase() === 'creator' ? 'service_creator' : role.toLowerCase();
              const servicesRes = await getServicesByRole(apiRole);
              if (servicesRes && servicesRes.success && servicesRes.data) {
                setAvailableServices(servicesRes.data);

                // Set default selected service if available
                if (servicesRes.data.length > 0) {
                  setSelectedService(servicesRes.data[0]);
                }
              }
            } catch (serviceError) {
              // Silently handle service fetch errors - user can still create offers with fallback
              logger.warn('[CreateOffer] Could not fetch services, using fallback', serviceError);
              setAvailableServices([]);
              setSelectedService(null);
            }
          } else {
            // Role is not creator/influencer, use fallback
            logger.info('[CreateOffer] User role is not creator/influencer, using fallback');
            setAvailableServices([]);
            setSelectedService(null);
          }
        }
      } catch (error) {
        logger.error('[CreateOffer] Error fetching profile', error);
        // Set default services if API fails
        setAvailableServices([]);
        setSelectedService(null);
      } finally {
        setIsLoadingServices(false);
      }
    };

    fetchServices();
  }, []);


  // Category mapping is now handled by apiConstants utility

  const handleCategoryPress = () => {
    setShowCategoryDropdown(!showCategoryDropdown);
  };

  const selectCategory = (category) => {
    setSelectedCategory(category);
    setShowCategoryDropdown(false);
  };

  // Shared helper: build offer payload (JSON or FormData based on media presence)
  const buildOfferPayload = (status) => {
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

    const ratePayload = { usd: parseFloat(rates.usd) || 0, ngn: parseFloat(rates.ngn) || 0 };
    const locationData = { city: location.city.trim(), state: location.state.trim(), country: location.country.trim() };
    const category = mapCategoryToOffer(selectedCategory);
    const tags = selectedCategory ? [selectedCategory.toLowerCase().replace(/\s+/g, '_')] : [];

    if (media.length > 0) {
      const fd = new FormData();
      fd.append('title', offerTitle.trim());
      fd.append('serviceType', serviceType);
      fd.append('platform', JSON.stringify([selectedPlatform]));
      fd.append('rate', JSON.stringify(ratePayload));
      fd.append('deliveryDays', parseInt(delivery || '7').toString());
      fd.append('duration', parseInt(offerDuration || '30').toString());
      fd.append('quantity', parseInt(quantity || '1').toString());
      fd.append('description', description.trim());
      fd.append('category', category);
      fd.append('tags', JSON.stringify(tags));
      fd.append('location', JSON.stringify(locationData));
      fd.append('isNegotiable', isNegotiable.toString());
      fd.append('revisions', parseInt(revisions || '0').toString());
      fd.append('status', status);
      media.forEach((file) => {
        fd.append('media', { uri: file.uri, type: file.type || 'image/jpeg', name: file.fileName || file.name || 'upload.jpg' });
      });
      return fd;
    } else {
      return {
        title: offerTitle.trim(),
        serviceType,
        platform: [selectedPlatform],
        rate: ratePayload,
        deliveryDays: parseInt(delivery || '7'),
        duration: parseInt(offerDuration || '30'),
        quantity: parseInt(quantity || '1'),
        description: description.trim(),
        category,
        tags,
        location: locationData,
        isNegotiable,
        revisions: parseInt(revisions || '0'),
        status,
      };
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              // Use goBack() to properly maintain navigation history
              if (navigation?.goBack) {
                navigation.goBack();
              }
            }}
          >
            <MaterialIcons name="arrow-back" size={24} color="#2d3748" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create an Offer</Text>
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
                <View style={styles.servicesDropdownWrapper}>
                  <Text style={styles.subLabel}>Choose a specific service:</Text>
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
                </View>
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



        {/* Custom Offer Toggle */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.customOfferToggleContainer}
            onPress={() => setIsCustomOffer(!isCustomOffer)}
            activeOpacity={0.7}
          >
            <View style={styles.customOfferToggleContent}>
              <View style={styles.customOfferToggleTextContainer}>
                <Text style={styles.customOfferToggleLabel}>Custom Offer</Text>
                <Text style={styles.customOfferToggleDescription}>
                  Create a custom offer with flexible terms and pricing
                </Text>
              </View>
              <View style={[styles.toggleSwitch, isCustomOffer && styles.toggleSwitchActive]}>
                <View style={[styles.toggleSwitchIndicator, isCustomOffer && styles.toggleSwitchIndicatorActive]} />
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* Service Category Section */}
        <View style={styles.section}>
          <Text style={styles.inputLabel}>Service Category</Text>
          {metadataLoading ? (
            <ActivityIndicator size="small" color="#337DEB" />
          ) : (
            <>
              <TouchableOpacity style={styles.dropdownContainer} onPress={handleCategoryPress}>
                <Text style={styles.dropdownText}>{mapBackendCategoryToUI(selectedCategory) || 'Select Category'}</Text>
                <MaterialIcons name="keyboard-arrow-down" size={20} color="#6b7280" />
              </TouchableOpacity>

              {showCategoryDropdown && (
                <View style={styles.dropdownOptions}>
                  {USER_PROFILE_CATEGORIES.map((category, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.dropdownOption}
                      onPress={() => selectCategory(category)}
                    >
                      <Text style={styles.dropdownOptionText}>
                        {mapBackendCategoryToUI(category)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

              )}
            </>
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

        {/* Location Section - Country → State → City from API */}
        <View style={styles.section}>
          <LocationPicker
            label="Location Requirements (optional)"
            value={location}
            onChange={setLocation}
            required={false}
          />
        </View>

        {/* Offer Duration Section (Influencer services only) */}
        {(() => {
          const inferInfluencerFromService = () => {
            const text = (selectedService?.identifier || selectedService?.name || '').toString().toLowerCase();
            if (!text) return false;
            const hints = ['instagram', 'tiktok', 'youtube', 'feed', 'story', 'reel', 'short', 'video', 'review', 'carousel', 'post', 'duet', 'mention'];
            return hints.some(h => text.includes(h));
          };
          const isInfluencerSelected =
            (selectedService ? inferInfluencerFromService() : (selectedServiceType === 'Influencer'));
          if (!isInfluencerSelected) return null;
          return (
            <View style={styles.section}>
              <Text style={styles.inputLabel}>Offer Duration (Days)</Text>
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
          );
        })()}

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
                <Image source={{ uri: item.uri }} style={styles.mediaThumbnail} />
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
            style={[styles.createOfferButton, isSubmitting && styles.createOfferButtonDisabled]}
            disabled={isSubmitting}
            activeOpacity={isSubmitting ? 1 : 0.7}
            onPress={async () => {
              if (submitGuardRef.current) return;
              if (!offerTitle.trim()) {
                showToast('Please enter an offer title', 'error');
                return;
              }
              submitGuardRef.current = true;
              setIsSubmitting(true);
              try {
                const offersService = await import('../services/offers');
                const offerData = buildOfferPayload('active');

                const response = isCustomOffer
                  ? await offersService.createCustomOffer(offerData)
                  : await offersService.createOffer(offerData);

                if (response && response.data) {
                  if (isCustomOffer) {
                    showToast('Custom offer created successfully!', 'success');
                    navigation?.navigate('ExploreOffers', { refresh: true });
                  } else {
                    showToast('Offer created successfully!', 'success');
                    navigation?.navigate('OfferConfirmation', { offer: response.data, isCustomOffer: false });
                  }
                } else {
                  showToast('Failed to create offer', 'error');
                }
              } catch (error) {
                console.error('Failed to create offer:', error);
                showToast(error.message || 'Failed to create offer. Please try again.', 'error');
              } finally {
                submitGuardRef.current = false;
                setIsSubmitting(false);
              }
            }}
          >
            {isSubmitting ? (
              <View style={styles.createOfferButtonContent}>
                <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.createOfferButtonText}>Creating...</Text>
              </View>
            ) : (
              <Text style={styles.createOfferButtonText}>Create Offer</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveDraftButton, isSubmitting && { opacity: 0.6 }]}
            disabled={isSubmitting}
            onPress={async () => {
              if (!offerTitle.trim()) {
                showToast('Please enter an offer title', 'error');
                return;
              }
              try {
                setIsSubmitting(true);
                const offersService = await import('../services/offers');
                const draftData = buildOfferPayload('draft');

                const response = isCustomOffer
                  ? await offersService.createCustomOffer(draftData)
                  : await offersService.createOffer(draftData);

                if (response && response.data) {
                  showToast('Offer saved as draft!', 'success');
                  navigation?.navigate('ExploreOffers', { refresh: true });
                } else {
                  showToast('Failed to save draft', 'error');
                }
              } catch (error) {
                console.error('Failed to save draft:', error);
                showToast(error.message || 'Failed to save draft', 'error');
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            <Text style={styles.saveDraftText}>Save as Draft</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView >
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
    width: '100%',
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
    fontSize: 14,
    color: '#374151',
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
  createOfferButton: {
    backgroundColor: '#337DEB',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginBottom: 12,
  },
  createOfferButtonDisabled: {
    opacity: 0.7,
  },
  createOfferButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createOfferButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  saveDraftButton: {
    alignItems: 'center',
  },
  saveDraftText: {
    fontSize: 14,
    color: '#6b7280',
  },
  customOfferToggleContainer: {
    marginTop: 8,
  },
  customOfferToggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  customOfferToggleTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  customOfferToggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: 4,
  },
  customOfferToggleDescription: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 16,
  },
  toggleSwitch: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleSwitchActive: {
    backgroundColor: '#337DEB',
  },
  toggleSwitchIndicator: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ffffff',
    alignSelf: 'flex-start',
  },
  toggleSwitchIndicatorActive: {
    alignSelf: 'flex-end',
  },
  servicesContainer: {
    marginTop: 8,
    flexDirection: 'row',
  },
  serviceChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  serviceChipSelected: {
    backgroundColor: '#337DEB10',
    borderColor: '#337DEB',
  },
  serviceChipText: {
    fontSize: 14,
    color: '#6b7280',
  },
  serviceChipTextSelected: {
    color: '#337DEB',
    fontWeight: '600',
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  navItem: {
    alignItems: 'center',
    flex: 1,
  },
  navText: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 4,
  },
  navTextActive: {
    color: '#337DEB',
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
  servicesDropdownWrapper: {
    marginTop: 8,
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

export default CreateOffer;
