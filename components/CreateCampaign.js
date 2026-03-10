import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Platform, ActivityIndicator, Dimensions } from 'react-native';
import LocationPicker from './LocationPicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { launchImageLibrary } from 'react-native-image-picker';
import { uploadImage, uploadImages } from '../services/upload';
import { useMetadata } from '../context/MetadataContext';
import { getCurrencySymbol } from '../utils/currency';
import DateTimePicker from '@react-native-community/datetimepicker';
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

const { width } = Dimensions.get('window');

// Option lists
const serviceTypes = [
  { id: 'influencer_service', name: 'Influencer Service' },
  { id: 'service_creator', name: 'Service Creator' }
];

const campaignGoals = [
  { id: 'brand_awareness', name: 'Brand Awareness' },
  { id: 'engagement', name: 'Engagement' },
  { id: 'sales', name: 'Sales' },
  { id: 'content_creation', name: 'Content Creation' }
];

const compensationTypes = ['Paid', 'Free Product', 'Both'];
const platformsList = ['Instagram', 'Tiktok', 'Youtube', 'Facebook', 'Twitter'];

// Dynamic services fetched from API, fallback to minimal defaults
const defaultInfluencerServices = [
  { id: "feed_post", name: "Instagram Feed Post", description: "Create and post content on Instagram feed", platform: "instagram" },
  { id: "short_video", name: "Short Video", description: "Create short-form video content", platform: "tiktok" },
  { id: "full_video_review", name: "YouTube Full Review", description: "Create comprehensive product reviews for YouTube", platform: "youtube" }
];
const defaultCreatorServices = [
  { id: "ugc_video", name: "UGC Video Creation", description: "Create user-generated content videos" },
  { id: "ad_script", name: "Advertisement Script Writing", description: "Write scripts for advertisements" }
];

const nichesList = [
  'Fashion & Beauty', 'Tech & Gadgets', 'Fitness & Health',
  'Travel & Lifestyle', 'Food & Drink', 'Entertainment & Media',
  'Sports', 'Education', 'Business', 'Parenting',
  'Automotive', 'Gaming', 'Music', 'Art & Design'
];

const gendersList = ['All', 'Male', 'Female', 'Non-Binary'];

const CreateCampaign = ({ navigation, route }) => {
  const { categories: metadataCategories } = useMetadata();

  // Check if we're in edit mode
  const isEditMode = route.params?.campaign ? true : false;
  const campaignData = route.params?.campaign || null;
  const campaignId = route?.params?.campaignId || campaignData?._id || campaignData?.id || null;

  // Reset form when not in edit mode (prevent stale state after editing another campaign)
  React.useEffect(() => {
    if (!isEditMode) {
      setCampaignName('');
      setDescription('');
      setSelectedGoals(['brand_awareness']);
      setBudget('');
      setBudgetMin('');
      setBudgetMax('');
      setCurrency('NGN');
      setSelectedCompensation('Paid');
      setMediaUrls([]);
      setSelectedPlatforms([]);
      setSelectedDeliverables([]);
      setSelectedNiches([]);
      setSelectedFollowerRange('1k - 1M');
      setMinFollowers('');
      setMaxFollowers('');
      setSelectedGenders(['All']);
      setCity('');
      setState('');
      setCountry('');
      setTags('');
      setTagChips([]);
      setCampaignDuration('');
      setPostVisibilityDuration('');
      setIsUrgent(false);
      setIsPublic(true);
      setMaxApplicants('50');
      setDueDate('');
      setApplicationDeadline('');
      setSelectedServiceType('influencer_service');
    }
  }, [isEditMode]);

  // Map to reverse-convert backend niche/category keys to UI display labels
  const backendNicheToUI = (key) => {
    const map = {
      'fashion_beauty': 'Fashion & Beauty',
      'tech_gadgets': 'Tech & Gadgets',
      'fitness_health': 'Fitness & Health',
      'travel_lifestyle': 'Travel & Lifestyle',
      'food_drink': 'Food & Drink',
      'entertainment_media': 'Entertainment & Media',
      'sports': 'Sports',
      'education': 'Education',
      'business': 'Business',
      'parenting': 'Parenting',
      'automotive': 'Automotive',
      'gaming': 'Gaming',
      'music': 'Music',
      'art_design': 'Art & Design',
    };
    return map[key] || key;
  };

  // Determine which service type group a deliverable ID belongs to
  const [influencerServicesData, setInfluencerServicesData] = React.useState(defaultInfluencerServices);
  const [creatorServicesData, setCreatorServicesData] = React.useState(defaultCreatorServices);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const servicesApi = await import('../services/services');
        const [infRes, creRes] = await Promise.allSettled([
          servicesApi.getServicesByRole('influencer'),
          servicesApi.getServicesByRole('service_creator'),
        ]);
        if (mounted) {
          if (infRes.status === 'fulfilled' && infRes.value?.data) {
            const list = infRes.value.data.services || infRes.value.data || [];
            if (Array.isArray(list) && list.length > 0) setInfluencerServicesData(list);
          }
          if (creRes.status === 'fulfilled' && creRes.value?.data) {
            const list = creRes.value.data.services || creRes.value.data || [];
            if (Array.isArray(list) && list.length > 0) setCreatorServicesData(list);
          }
        }
      } catch (_) { /* fallback to defaults */ }
    })();
    return () => { mounted = false; };
  }, []);

  const getServiceTypeFromDeliverable = (deliverableId) => {
    const influencerIds = influencerServicesData.map(s => s.id);
    const creatorIds = creatorServicesData.map(s => s.id);
    if (influencerIds.includes(deliverableId)) return 'influencer_service';
    if (creatorIds.includes(deliverableId)) return 'service_creator';
    return 'influencer_service'; // default
  };

  // Form State
  const [campaignName, setCampaignName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedServiceType, setSelectedServiceType] = useState('influencer_service');
  const [selectedGoals, setSelectedGoals] = useState(['brand_awareness']);
  const [budget, setBudget] = useState('');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [currency, setCurrency] = useState('NGN');
  const [selectedCompensation, setSelectedCompensation] = useState('Paid');
  const [mediaUrls, setMediaUrls] = useState([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState([]);
  const [selectedDeliverables, setSelectedDeliverables] = useState([]);
  const [minFollowers, setMinFollowers] = useState('');
  const [maxFollowers, setMaxFollowers] = useState('');
  const [selectedNiches, setSelectedNiches] = useState([]);
  const [selectedGenders, setSelectedGenders] = useState(['All']);
  const [selectedLocations, setSelectedLocations] = useState(['United States']);
  const [selectedFollowerRange, setSelectedFollowerRange] = useState('micro');
  const [tags, setTags] = useState('');
  const [tagChips, setTagChips] = useState([]);
  const [maxApplicants, setMaxApplicants] = useState('50');
  const [isUrgent, setIsUrgent] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [campaignDuration, setCampaignDuration] = useState('3 weeks');
  const [postVisibilityDuration, setPostVisibilityDuration] = useState('30 days on page');
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [applicationDeadline, setApplicationDeadline] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('');

  // UI State
  const [loading, setLoading] = useState(false);
  const ui = (useUIStore && typeof useUIStore === 'function') ? useUIStore() : null;
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerMode, setDatePickerMode] = useState('deadline'); // 'deadline' or 'due'

  // Pre-fill form when in edit mode
  useEffect(() => {
    if (isEditMode && campaignData) {
      setCampaignName(campaignData.name || '');
      setDescription(campaignData.description || '');

      // FIX: serviceType from backend is the deliverable ID (e.g. 'feed_post'), not 'influencer_service'.
      // Determine the correct group based on the first deliverable listed, or the serviceType field if it matches.
      const rawServiceType = campaignData.serviceType || '';
      if (rawServiceType === 'influencer_service' || rawServiceType === 'service_creator') {
        setSelectedServiceType(rawServiceType);
      } else if (campaignData.deliverables && campaignData.deliverables.length > 0) {
        setSelectedServiceType(getServiceTypeFromDeliverable(campaignData.deliverables[0]));
      } else if (rawServiceType) {
        // rawServiceType is a deliverable ID; derive service type group from it
        setSelectedServiceType(getServiceTypeFromDeliverable(rawServiceType));
      } else {
        setSelectedServiceType('influencer_service');
      }

      setSelectedGoals(campaignData.goals || (campaignData.mainGoal ? [campaignData.mainGoal] : ['brand_awareness']));
      setBudget(campaignData.budget?.toString() || '');
      setBudgetMin(campaignData.budgetRange?.min?.toString() || '');
      setBudgetMax(campaignData.budgetRange?.max?.toString() || '');
      setCurrency(campaignData.currency || 'NGN');
      setSelectedCompensation(campaignData.compensationType ? (campaignData.compensationType.charAt(0).toUpperCase() + campaignData.compensationType.slice(1)) : 'Paid');
      setMediaUrls(campaignData.media?.map(m => typeof m === 'string' ? m : m.url) || []);

      if (Array.isArray(campaignData.platform)) {
        setSelectedPlatforms(campaignData.platform.map(p => p.charAt(0).toUpperCase() + p.slice(1)));
      } else if (typeof campaignData.platform === 'string' && campaignData.platform !== 'Any') {
        setSelectedPlatforms([campaignData.platform.charAt(0).toUpperCase() + campaignData.platform.slice(1)]);
      }

      setSelectedDeliverables(campaignData.deliverables || []);
      setMinFollowers(campaignData.requirements?.followers?.min?.toString() || campaignData.requirements?.followerRange?.min?.toString() || '');
      setMaxFollowers(campaignData.requirements?.followerRange?.max?.toString() || '');
      setSelectedFollowerRange(campaignData.requirements?.followerRange?.range || 'micro');

      // FIX: Reverse-map backend niche keys ('fashion_beauty') to UI labels ('Fashion & Beauty')
      const rawNiches = campaignData.requirements?.niche || [];
      setSelectedNiches(rawNiches.map(n => backendNicheToUI(n)));

      setSelectedGenders(campaignData.requirements?.gender?.map(g => g === 'all' ? 'All' : g.charAt(0).toUpperCase() + g.slice(1)) || ['All']);
      setSelectedLocations(campaignData.requirements?.location || ['United States']);

      if (campaignData.location && !Array.isArray(campaignData.location)) {
        setCity(campaignData.location.city || '');
        setState(campaignData.location.state || '');
        setCountry(campaignData.location.country || '');
      }
      setDueDate(campaignData.dueDate ? new Date(campaignData.dueDate).toISOString().split('T')[0] : '');
      setApplicationDeadline(campaignData.applicationDeadline ? new Date(campaignData.applicationDeadline).toISOString().split('T')[0] : '');
      setCampaignDuration(campaignData.campaignDuration || '3 weeks');
      setPostVisibilityDuration(campaignData.postVisibilityDuration || '30 days on page');

      // FIX: Populate both the tags text input AND the tag chips
      const tagsArray = campaignData.tags || [];
      setTags(tagsArray.join(', '));
      setTagChips(tagsArray);

      setMaxApplicants(campaignData.maxApplicants?.toString() || '50');
      setIsUrgent(campaignData.isUrgent || false);
      setIsPublic(campaignData.isPublic !== undefined ? campaignData.isPublic : true);
    }
  }, [isEditMode, campaignData]);

  const handleMediaUpload = async () => {
    try {
      setUploadingMedia(true);
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.8,
        selectionLimit: 10,
        includeBase64: false,
      });

      if (result.assets && result.assets.length > 0) {
        const files = result.assets.map(asset => ({
          uri: asset.uri,
          type: asset.type || 'image/jpeg',
          name: asset.fileName || `campaign_media_${Date.now()}.jpg`,
        }));

        const uploadResult = files.length === 1
          ? await uploadImage(files[0])
          : await uploadImages(files);

        const urls = files.length === 1
          ? [uploadResult.data.url]
          : uploadResult.data.urls || [];

        setMediaUrls(prev => [...prev, ...urls]);
        ui?.showToast?.(`Successfully uploaded ${urls.length} image${urls.length > 1 ? 's' : ''}`, 'success');
      }
    } catch (error) {
      ui?.showToast?.('Failed to upload media', 'error');
    } finally {
      setUploadingMedia(false);
    }
  };

  const onDateChange = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) {
      const formattedDate = selectedDate.toISOString().split('T')[0];
      if (datePickerMode === 'deadline') {
        setApplicationDeadline(formattedDate);
      } else {
        setDueDate(formattedDate);
      }
    }
  };

  const togglePlatform = (p) => {
    setSelectedPlatforms(prev => prev.includes(p) ? prev.filter(item => item !== p) : [...prev, p]);
  };

  const toggleDeliverable = (d) => {
    setSelectedDeliverables(prev => prev.includes(d) ? prev.filter(item => item !== d) : [...prev, d]);
  };

  const toggleNiche = (n) => {
    setSelectedNiches(prev => prev.includes(n) ? prev.filter(item => item !== n) : [...prev, n]);
  };

  const toggleGender = (g) => {
    if (g === 'All') {
      setSelectedGenders(['All']);
    } else {
      setSelectedGenders(prev => {
        const filtered = prev.filter(item => item !== 'All');
        return filtered.includes(g) ? filtered.filter(item => item !== g) : [...filtered, g];
      });
    }
  };

  const handleSubmit = async (statusOverride = null) => {
    if (!statusOverride && (!campaignName || !description || selectedPlatforms.length === 0 || selectedDeliverables.length === 0)) {
      ui?.showToast?.('Please fill in all required fields marked with *', 'warning');
      return;
    }

    try {
      setLoading(true);
      // Determine final status:
      // 1. If statusOverride is provided (e.g., 'draft' or current status when saving changes), use it.
      // 2. If it's a new campaign and no override, it's 'open'.
      // 3. When editing, "Save Changes" passes current status so draft stays draft; "Post Campaign" / create uses 'open'.
      let finalStatus = statusOverride;
      if (finalStatus === undefined || finalStatus === null) {
        finalStatus = isEditMode ? (campaignData?.status || 'open') : 'open';
      }

      // Convert UI niche names to backend format (snake_case)
      const convertNicheToBackend = (nicheName) => {
        const mapping = {
          'Fashion & Beauty': 'fashion_beauty',
          'Tech & Gadgets': 'tech_gadgets',
          'Fitness & Health': 'fitness_health',
          'Travel & Lifestyle': 'travel_lifestyle',
          'Food & Drink': 'food_drink',
          'Entertainment & Media': 'entertainment_media',
          'Sports': 'sports',
          'Education': 'education',
          'Business': 'business',
          'Parenting': 'parenting',
          'Automotive': 'automotive',
          'Gaming': 'gaming',
          'Music': 'music',
          'Art & Design': 'art_design',
        };
        return mapping[nicheName] || nicheName.toLowerCase().replace(/ & /g, '_').replace(/ /g, '_');
      };

      const payload = {
        name: campaignName.trim() || 'Untitled Campaign',
        description: description.trim(),
        status: finalStatus,
        budget: parseFloat(budget) || 0,
        currency,
        budgetRange: {
          min: parseFloat(budgetMin) || 0,
          max: parseFloat(budgetMax) || 0,
          currency: currency
        },
        platform: selectedPlatforms.map(p => p.toLowerCase()),
        mainGoal: selectedGoals[0] || 'brand_awareness',
        goals: selectedGoals,
        serviceType: selectedDeliverables[0] || 'feed_post', // Use first deliverable as serviceType (valid service ID)
        compensationType: selectedCompensation.toLowerCase(),
        deliverables: selectedDeliverables,
        media: mediaUrls.map(url => ({
          url: url,
          type: 'image',
          caption: ''
        })),
        campaignDuration: campaignDuration,
        postVisibilityDuration: postVisibilityDuration,
        requirements: {
          followerRange: {
            range: selectedFollowerRange,
            min: parseInt(minFollowers) || 1000,
            max: parseInt(maxFollowers) || 1000000,
          },
          followers: {
            min: parseInt(minFollowers) || 0
          },
          location: selectedLocations,
          niche: selectedNiches.map(n => convertNicheToBackend(n)), // Convert to backend format
          gender: selectedGenders.map(g => g.toLowerCase()),
        },
        location: {
          city: city.trim(),
          state: state.trim(),
          country: country.trim()
        },
        tags: tagChips.length > 0 ? tagChips : tags.split(',').map(t => t.trim()).filter(t => t !== ''),
        isUrgent: isUrgent,
        isPublic: isPublic,
        maxApplicants: parseInt(maxApplicants) || 50,
        dueDate: dueDate ? new Date(dueDate).toISOString() : new Date().toISOString(),
        applicationDeadline: applicationDeadline ? new Date(applicationDeadline).toISOString() : new Date().toISOString()
      };

      console.log('Sending Payload:', JSON.stringify(payload, null, 2));

      const campaignsService = await import('../services/campaigns');
      const response = isEditMode
        ? await campaignsService.updateCampaign(campaignId, payload)
        : await campaignsService.createCampaign(payload);

      if (response && (response.success || response.data)) {
        const message = statusOverride === 'draft' ? 'Campaign saved as draft!' : (isEditMode ? 'Campaign updated!' : 'Campaign created!');

        // Automatically close the screen
        if (isEditMode) {
          navigation.goBack();
        } else {
          navigation.navigate('Campaigns', { refresh: true });
        }

        ui?.showToast?.(message, 'success');
      }
    } catch (error) {
      console.error('Submit Error:', error);
      ui?.showToast?.(error.response?.data?.message || error.message || 'Failed to save campaign', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePublishCampaign = async () => {
    try {
      setLoading(true);
      const campaignsService = await import('../services/campaigns');
      const id = campaignId || campaignData?._id || campaignData?.id;
      const response = await campaignsService.publishCampaign(id);
      if (response && (response.success || response.data)) {
        navigation.navigate('Campaigns', { refresh: true });
        ui?.showToast?.('Campaign published successfully!', 'success');
      } else {
        ui?.showToast?.('Failed to publish campaign', 'error');
      }
    } catch (error) {
      console.error('Publish campaign error:', error);
      ui?.showToast?.(error.response?.data?.message || error.message || 'Failed to publish campaign', 'error');
    } finally {
      setLoading(false);
    }
  };


  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle}>{isEditMode ? 'Edit Campaign' : 'Create Campaign'}</Text>
          {isEditMode && campaignData?.status && (
            <View style={[styles.statusMiniTag, { backgroundColor: campaignData.status === 'draft' ? '#f1f5f9' : '#f0fdf4' }]}>
              <Text style={[styles.statusMiniText, { color: campaignData.status === 'draft' ? '#64748b' : '#16a34a' }]}>
                {campaignData.status.toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.contentPadding}>
          {/* Campaign Details */}
          <View style={styles.card}>
            <Text style={styles.cardHeader}>Campaign Identity</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Campaign Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Summer Collection Launch"
                placeholderTextColor="#9ca3af"
                value={campaignName}
                onChangeText={setCampaignName}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Description *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Describe your campaign objectives, brand story, and what you're looking for in creators."
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={4}
                value={description}
                onChangeText={setDescription}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Tags (comma separated)</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="e.g., sustainable, fashion, summer"
                  placeholderTextColor="#9ca3af"
                  value={tags}
                  onChangeText={setTags}
                  onSubmitEditing={() => {
                    const newChips = tags.split(',').map(t => t.trim()).filter(t => t !== '');
                    if (newChips.length > 0) {
                      setTagChips(prev => [...new Set([...prev, ...newChips])]);
                      setTags('');
                    }
                  }}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={{ marginLeft: 8, backgroundColor: '#337DEB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 }}
                  onPress={() => {
                    const newChips = tags.split(',').map(t => t.trim()).filter(t => t !== '');
                    if (newChips.length > 0) {
                      setTagChips(prev => [...new Set([...prev, ...newChips])]);
                      setTags('');
                    }
                  }}
                >
                  <MaterialIcons name="add" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
              {tagChips.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 6 }}>
                  {tagChips.map((chip, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#eef2ff', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 }}
                      onPress={() => setTagChips(prev => prev.filter((_, i) => i !== idx))}
                    >
                      <Text style={{ color: '#337DEB', fontSize: 13, marginRight: 4 }}>#{chip}</Text>
                      <MaterialIcons name="close" size={14} color="#337DEB" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>

          {/* Service & Goals */}
          <View style={styles.card}>
            <Text style={styles.cardHeader}>Service & Goals</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Service Type</Text>
              <View style={styles.serviceTypeRow}>
                {serviceTypes.map(type => (
                  <TouchableOpacity
                    key={type.id}
                    style={[
                      styles.serviceTypeBtn,
                      selectedServiceType === type.id && styles.serviceTypeBtnActive
                    ]}
                    onPress={() => {
                      setSelectedServiceType(type.id);
                      setSelectedDeliverables([]); // Reset deliverables when switching type
                    }}
                  >
                    <Text style={[
                      styles.serviceTypeBtnText,
                      selectedServiceType === type.id && styles.serviceTypeBtnTextActive
                    ]}>{type.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Campaign Goals</Text>
              <View style={styles.goalGrid}>
                {campaignGoals.map(goal => {
                  const isSelected = selectedGoals.includes(goal.id);
                  return (
                    <TouchableOpacity
                      key={goal.id}
                      style={[
                        styles.goalPill,
                        isSelected && styles.goalPillActive
                      ]}
                      onPress={() => {
                        setSelectedGoals(prev =>
                          prev.includes(goal.id)
                            ? prev.filter(g => g !== goal.id)
                            : [...prev, goal.id]
                        );
                      }}
                    >
                      <Text style={[
                        styles.goalPillText,
                        isSelected && styles.goalPillTextActive
                      ]}>{goal.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Logistics & Timing */}
          <View style={styles.card}>
            <Text style={styles.cardHeader}>Logistics & Timing</Text>
            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.label}>Application Deadline</Text>
                <TouchableOpacity
                  style={styles.input}
                  onPress={() => {
                    setDatePickerMode('deadline');
                    setShowDatePicker(true);
                  }}
                >
                  <Text style={{ color: applicationDeadline ? '#1f2937' : '#9ca3af', lineHeight: 20 }}>
                    {applicationDeadline || 'YYYY-MM-DD'}
                  </Text>
                  <MaterialIcons name="event" size={20} color="#64748b" style={{ position: 'absolute', right: 10, top: 10 }} />
                </TouchableOpacity>
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Campaign Due Date</Text>
                <TouchableOpacity
                  style={styles.input}
                  onPress={() => {
                    setDatePickerMode('due');
                    setShowDatePicker(true);
                  }}
                >
                  <Text style={{ color: dueDate ? '#1f2937' : '#9ca3af', lineHeight: 20 }}>
                    {dueDate || 'YYYY-MM-DD'}
                  </Text>
                  <MaterialIcons name="event" size={20} color="#64748b" style={{ position: 'absolute', right: 10, top: 10 }} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.label}>Campaign Duration</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., 3 weeks"
                  placeholderTextColor="#9ca3af"
                  value={campaignDuration}
                  onChangeText={setCampaignDuration}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Post Visibility</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., 30 days on page"
                  placeholderTextColor="#9ca3af"
                  value={postVisibilityDuration}
                  onChangeText={setPostVisibilityDuration}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Max Applicants</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 50"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                value={maxApplicants}
                onChangeText={setMaxApplicants}
              />
            </View>

            <View style={styles.row}>
              <TouchableOpacity
                style={styles.switchRow}
                onPress={() => setIsUrgent(!isUrgent)}
              >
                <MaterialIcons
                  name={isUrgent ? "check-circle" : "radio-button-unchecked"}
                  size={24}
                  color={isUrgent ? "#ef4444" : "#cbd5e1"}
                />
                <Text style={styles.switchLabel}>Is this Urgent?</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.switchRow}
                onPress={() => setIsPublic(!isPublic)}
              >
                <MaterialIcons
                  name={isPublic ? "check-circle" : "radio-button-unchecked"}
                  size={24}
                  color={isPublic ? "#337DEB" : "#cbd5e1"}
                />
                <Text style={styles.switchLabel}>Public Campaign</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Campaign Location - Country → State → City from API */}
          <View style={styles.card}>
            <Text style={styles.cardHeader}>Campaign Location</Text>
            <LocationPicker
              label=""
              value={{ city, state, country }}
              onChange={(loc) => {
                setCity(loc.city || '');
                setState(loc.state || '');
                setCountry(loc.country || '');
              }}
              required={false}
            />
          </View>

          {/* Budget & Compensation */}
          <View style={styles.card}>
            <Text style={styles.cardHeader}>Budget & Compensation</Text>

            {/* Currency Selector */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Currency</Text>
              <TouchableOpacity
                style={styles.currencySelector}
                onPress={() => setShowCurrencyDropdown(!showCurrencyDropdown)}
              >
                <View style={styles.currencySelectorContent}>
                  <MaterialIcons name="attach-money" size={20} color="#337DEB" />
                  <Text style={styles.currencySelectorText}>{currency === 'USD' ? 'USD ($)' : 'NGN (₦)'}</Text>
                </View>
                <MaterialIcons name={showCurrencyDropdown ? "expand-less" : "expand-more"} size={24} color="#64748b" />
              </TouchableOpacity>
              {showCurrencyDropdown && (
                <View style={styles.currencyDropdown}>
                  <TouchableOpacity
                    style={[styles.currencyOption, currency === 'USD' && styles.currencyOptionSelected]}
                    onPress={() => {
                      setCurrency('USD');
                      setShowCurrencyDropdown(false);
                    }}
                  >
                    <Text style={[styles.currencyOptionText, currency === 'USD' && styles.currencyOptionTextSelected]}>
                      USD ($) - US Dollar
                    </Text>
                    {currency === 'USD' && <MaterialIcons name="check" size={20} color="#337DEB" />}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.currencyOption, currency === 'NGN' && styles.currencyOptionSelected]}
                    onPress={() => {
                      setCurrency('NGN');
                      setShowCurrencyDropdown(false);
                    }}
                  >
                    <Text style={[styles.currencyOptionText, currency === 'NGN' && styles.currencyOptionTextSelected]}>
                      NGN (₦) - Nigerian Naira
                    </Text>
                    {currency === 'NGN' && <MaterialIcons name="check" size={20} color="#337DEB" />}
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Overall Campaign Budget</Text>
              <View style={styles.budgetInputWrapper}>
                <Text style={styles.currencyPrefix}>{getCurrencySymbol(currency)}</Text>
                <TextInput
                  style={styles.budgetInput}
                  placeholder="0.00"
                  placeholderTextColor="#9ca3af"
                  keyboardType="numeric"
                  value={budget}
                  onChangeText={setBudget}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Budget Per Creator (Range)</Text>
              <View style={styles.row}>
                <View style={[styles.budgetInputWrapper, { flex: 1, marginRight: 10 }]}>
                  <Text style={styles.currencyPrefix}>{getCurrencySymbol(currency)}</Text>
                  <TextInput
                    style={styles.budgetInput}
                    placeholder="Min"
                    placeholderTextColor="#9ca3af"
                    keyboardType="numeric"
                    value={budgetMin}
                    onChangeText={setBudgetMin}
                  />
                </View>
                <View style={[styles.budgetInputWrapper, { flex: 1 }]}>
                  <Text style={styles.currencyPrefix}>{getCurrencySymbol(currency)}</Text>
                  <TextInput
                    style={styles.budgetInput}
                    placeholder="Max"
                    placeholderTextColor="#9ca3af"
                    keyboardType="numeric"
                    value={budgetMax}
                    onChangeText={setBudgetMax}
                  />
                </View>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Compensation Type</Text>
              <View style={styles.compToggleRow}>
                {compensationTypes.map(type => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.compToggleButton,
                      selectedCompensation === type && styles.compToggleButtonActive
                    ]}
                    onPress={() => setSelectedCompensation(type)}
                  >
                    <Text style={[
                      styles.compToggleText,
                      selectedCompensation === type && styles.compToggleTextActive
                    ]}>{type}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* Deliverables */}
          <View style={styles.card}>
            <Text style={styles.cardHeader}>Required Deliverables</Text>
            <View style={styles.deliverablesList}>
              {(selectedServiceType === 'influencer_service' ? influencerServicesData : creatorServicesData).map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.deliverableItem,
                    selectedDeliverables.includes(item.id) && styles.deliverableItemActive
                  ]}
                  onPress={() => {
                    setSelectedDeliverables(prev =>
                      prev.includes(item.id)
                        ? prev.filter(i => i !== item.id)
                        : [...prev, item.id]
                    );
                  }}
                >
                  <View style={styles.deliverableInfo}>
                    <Text style={[
                      styles.deliverableName,
                      selectedDeliverables.includes(item.id) && styles.deliverableNameActive
                    ]}>{item.name}</Text>
                    <Text style={styles.deliverableDesc}>{item.description}</Text>
                  </View>
                  <MaterialIcons
                    name={selectedDeliverables.includes(item.id) ? "check-circle" : "add-circle-outline"}
                    size={24}
                    color={selectedDeliverables.includes(item.id) ? "#337DEB" : "#cbd5e1"}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Creator Requirements */}
          <View style={styles.card}>
            <Text style={styles.cardHeader}>Creator Requirements</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Platforms</Text>
              <View style={styles.platformRow}>
                {platformsList.map(p => {
                  const isSelected = selectedPlatforms.includes(p);
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[
                        styles.platformPill,
                        isSelected && styles.platformPillActive
                      ]}
                      onPress={() => {
                        setSelectedPlatforms(prev =>
                          prev.includes(p) ? prev.filter(i => i !== p) : [...prev, p]
                        );
                      }}
                    >
                      <Text style={[
                        styles.platformPillText,
                        isSelected && styles.platformPillTextActive
                      ]}>{p}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Follower Range</Text>
              <View style={styles.compToggleRow}>
                {['Nano', 'Micro', 'Mid', 'Macro', 'Mega'].map(range => (
                  <TouchableOpacity
                    key={range}
                    style={[
                      styles.compToggleButton,
                      selectedFollowerRange === range.toLowerCase() && styles.compToggleButtonActive
                    ]}
                    onPress={() => setSelectedFollowerRange(range.toLowerCase())}
                  >
                    <Text style={[
                      styles.compToggleText,
                      selectedFollowerRange === range.toLowerCase() && styles.compToggleTextActive
                    ]}>{range}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.label}>Min Followers</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., 1000"
                  placeholderTextColor="#9ca3af"
                  keyboardType="numeric"
                  value={minFollowers}
                  onChangeText={setMinFollowers}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Max Followers</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., 10000"
                  placeholderTextColor="#9ca3af"
                  keyboardType="numeric"
                  value={maxFollowers}
                  onChangeText={setMaxFollowers}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Niches</Text>
              <View style={styles.nicheGrid}>
                {(metadataCategories && metadataCategories.length > 0 ? metadataCategories.map(c => c.label) : nichesList).map(n => (
                  <TouchableOpacity
                    key={n}
                    style={[
                      styles.nicheItem,
                      selectedNiches.includes(n) && styles.nicheItemActive
                    ]}
                    onPress={() => {
                      setSelectedNiches(prev =>
                        prev.includes(n) ? prev.filter(i => i !== n) : [...prev, n]
                      );
                    }}
                  >
                    <Text style={[
                      styles.nicheItemText,
                      selectedNiches.includes(n) && styles.nicheItemTextActive
                    ]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Target Gender</Text>
              <View style={styles.compToggleRow}>
                {['All', 'Male', 'Female', 'Non Binary'].map(gender => (
                  <TouchableOpacity
                    key={gender}
                    style={[
                      styles.compToggleButton,
                      selectedGenders.includes(gender) && styles.compToggleButtonActive
                    ]}
                    onPress={() => {
                      if (gender === 'All') {
                        setSelectedGenders(['All']);
                      } else {
                        setSelectedGenders(prev => {
                          const filtered = prev.filter(g => g !== 'All');
                          return filtered.includes(gender)
                            ? filtered.filter(g => g !== gender)
                            : [...filtered, gender];
                        });
                      }
                    }}
                  >
                    <Text style={[
                      styles.compToggleText,
                      selectedGenders.includes(gender) && styles.compToggleTextActive
                    ]}>{gender}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Target Audience Location</Text>
              <View style={styles.nicheGrid}>
                {['United States', 'Canada', 'United Kingdom', 'Australia', 'Germany', 'France', 'India', 'Nigeria', 'Brazil', 'Mexico', 'Global'].map(location => (
                  <TouchableOpacity
                    key={location}
                    style={[
                      styles.nicheItem,
                      selectedLocations.includes(location) && styles.nicheItemActive
                    ]}
                    onPress={() => {
                      setSelectedLocations(prev =>
                        prev.includes(location) ? prev.filter(l => l !== location) : [...prev, location]
                      );
                    }}
                  >
                    <Text style={[
                      styles.nicheItemText,
                      selectedLocations.includes(location) && styles.nicheItemTextActive
                    ]}>{location}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* Media Upload */}
          <View style={styles.card}>
            <Text style={styles.cardHeader}>Campaign Assets</Text>
            <View style={styles.mediaUploadContainer}>
              <TouchableOpacity style={styles.uploadBox} onPress={handleMediaUpload} disabled={uploadingMedia}>
                {uploadingMedia ? (
                  <ActivityIndicator color="#337DEB" />
                ) : (
                  <>
                    <MaterialIcons name="cloud-upload" size={32} color="#337DEB" />
                    <Text style={styles.uploadText}>Upload Reference Media</Text>
                    <Text style={styles.uploadSubtext}>Images only, max 10</Text>
                  </>
                )}
              </TouchableOpacity>

              {mediaUrls.length > 0 && (
                <View style={styles.previewContainer}>
                  <Text style={styles.previewTitle}>{mediaUrls.length} Files Uploaded</Text>
                  <TouchableOpacity onPress={() => setMediaUrls([])}>
                    <Text style={styles.clearText}>Clear All</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.footerActions}>
            {isEditMode ? (
              <>
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={() => handleSubmit(campaignData?.status || 'open')}
                  disabled={loading}
                >
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
                </TouchableOpacity>
                {campaignData?.status === 'draft' && (
                  <TouchableOpacity
                    style={styles.publishButton}
                    onPress={handlePublishCampaign}
                    disabled={loading}
                  >
                    <Text style={styles.publishButtonText}>Publish Campaign</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.postButton}
                  onPress={() => handleSubmit()}
                  disabled={loading}
                >
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.postButtonText}>Post Campaign</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.draftButton}
                  onPress={() => handleSubmit('draft')}
                  disabled={loading}
                >
                  <Text style={styles.draftButtonText}>Save as Draft</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </ScrollView>
      {showDatePicker && (
        <DateTimePicker
          value={datePickerMode === 'deadline'
            ? (applicationDeadline ? new Date(applicationDeadline) : new Date())
            : (dueDate ? new Date(dueDate) : new Date())
          }
          mode="date"
          display="default"
          onChange={onDateChange}
          minimumDate={new Date()}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 0,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: -0.3,
  },
  statusMiniTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 2,
  },
  statusMiniText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  scrollView: {
    flex: 1,
  },
  contentPadding: {
    padding: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 16,
    letterSpacing: -0.2,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
    letterSpacing: 0,
  },
  input: {
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1f2937',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  serviceTypeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  serviceTypeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  serviceTypeBtnActive: {
    borderColor: '#337DEB',
    backgroundColor: '#eef2ff',
  },
  serviceTypeBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  serviceTypeBtnTextActive: {
    color: '#337DEB',
  },
  goalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  goalPill: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  goalPillActive: {
    borderColor: '#337DEB',
    backgroundColor: '#337DEB',
  },
  goalPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  goalPillTextActive: {
    color: '#fff',
  },
  switchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  budgetInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 14,
  },
  currencyPrefix: {
    fontSize: 15,
    fontWeight: '700',
    color: '#337DEB',
    marginRight: 8,
  },
  budgetInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
  },
  compToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  compToggleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  compToggleButtonActive: {
    borderColor: '#337DEB',
    backgroundColor: '#eef2ff',
  },
  compToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  compToggleTextActive: {
    color: '#337DEB',
  },
  deliverablesList: {
    gap: 12,
  },
  deliverableItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#f1f5f9',
    backgroundColor: '#f8fafc',
  },
  deliverableItemActive: {
    borderColor: '#337DEB',
    backgroundColor: '#f5f6ff',
  },
  currencySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
  },
  currencySelectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  currencySelectorText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  currencyDropdown: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  currencyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  currencyOptionSelected: {
    backgroundColor: '#f5f6ff',
  },
  currencyOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  currencyOptionTextSelected: {
    color: '#337DEB',
    fontWeight: '700',
  },
  deliverableInfo: {
    flex: 1,
    marginRight: 10,
  },
  deliverableName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  deliverableNameActive: {
    color: '#337DEB',
  },
  deliverableDesc: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 16,
  },
  platformRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  platformPill: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  platformPillActive: {
    backgroundColor: '#337DEB',
    borderColor: '#337DEB',
  },
  platformPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  platformPillTextActive: {
    color: '#fff',
  },
  nicheGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  nicheItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  nicheItemActive: {
    borderColor: '#337DEB',
    backgroundColor: '#eef2ff',
  },
  nicheItemText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  nicheItemTextActive: {
    color: '#337DEB',
  },
  mediaUploadContainer: {
    gap: 16,
  },
  uploadBox: {
    borderWidth: 2,
    borderColor: '#337DEB',
    borderStyle: 'dashed',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    backgroundColor: '#f5f6ff',
  },
  uploadText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#337DEB',
    marginTop: 12,
  },
  uploadSubtext: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  previewContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 14,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  clearText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ef4444',
  },
  footerActions: {
    gap: 12,
    marginTop: 24,
    marginBottom: 40,
    paddingHorizontal: 20,
  },
  postButton: {
    backgroundColor: '#337DEB',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#337DEB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  postButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  draftButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
  },
  draftButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  saveButton: {
    backgroundColor: '#337DEB',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  publishButton: {
    backgroundColor: '#10B981',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  publishButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  cancelButton: {
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
});

export default CreateCampaign;
