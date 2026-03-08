import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, FlatList, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Drawer from './Drawer';
import { getCompactDualPrice } from '../utils/currency';
import { PlatformIcon } from '../utils/platformIcons';
import { getCache, setCache, DEFAULT_TTL } from '../utils/cache';
import * as offersService from '../services/offers';
import * as userService from '../services/user';

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
  if (!name) return 'U';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

const DashboardNew = ({ navigation, route }) => {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchText, setSearchText] = useState('');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [sortBy, setSortBy] = useState('followers');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterLocation, setFilterLocation] = useState('All');
  const [userRole, setUserRole] = useState('Brand'); // DashboardNew is for Brand role (Discover Influencers)
  const [userProfile, setUserProfile] = useState(null);

  useEffect(() => {
    const roleParam = route?.params?.role;
    if (roleParam) {
      setUserRole(roleParam.charAt(0).toUpperCase() + roleParam.slice(1));
    }
  }, [route?.params?.role]);

  // Fetch user profile for header
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const response = await userService.getMyProfile();
        if (response && response.data) {
          setUserProfile(response.data);
        }
      } catch (error) {
        console.error('Failed to fetch user profile in DashboardNew:', error);
      }
    };
    fetchUserProfile();
  }, []);

  const categories = ['All', 'Fashion', 'Beauty', 'Lifestyle', 'Tech', 'Fitness', 'Food', 'Travel'];
  const [featuredOffers, setFeaturedOffers] = useState([]);
  const [trendingInfluencers, setTrendingInfluencers] = useState([]);
  const [loading, setLoading] = useState(true);
  const featuredListRef = useRef(null);
  const [featuredIndex, setFeaturedIndex] = useState(0);

  useEffect(() => {
    let t;
    let t2;
    if (!loading && featuredOffers.length > 0) {
      t = setTimeout(() => {
        try {
          featuredListRef.current?.scrollToOffset?.({ offset: 12, animated: true });
          t2 = setTimeout(() => {
            featuredListRef.current?.scrollToOffset?.({ offset: 0, animated: true });
          }, 350);
        } catch (_) { }
      }, 400);
    }
    return () => {
      if (t) clearTimeout(t);
      if (t2) clearTimeout(t2);
    };
  }, [loading, featuredOffers.length]);

  // Auto-scroll Featured Offers
  useEffect(() => {
    if (loading || featuredOffers.length <= 1) return;
    let intervalId = null;
    const itemLength = 280 + 16; // card width + marginRight
    intervalId = setInterval(() => {
      setFeaturedIndex((prev) => {
        const next = (prev + 1) % featuredOffers.length;
        try {
          featuredListRef.current?.scrollToOffset?.({ offset: next * itemLength, animated: true });
        } catch (_) { }
        return next;
      });
    }, 3500);
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [loading, featuredOffers.length]);

  // Cache-first: show cached data immediately, then refresh in background
  useEffect(() => {
    const applyCache = async () => {
      try {
        const [cachedFeatured, cachedTrending] = await Promise.all([
          getCache('dashboard_new_featured'),
          getCache('dashboard_new_trending'),
        ]);
        if ((cachedFeatured && cachedFeatured.length > 0) || (cachedTrending && cachedTrending.length > 0)) {
          if (cachedFeatured?.length) setFeaturedOffers(cachedFeatured);
          if (cachedTrending?.length) setTrendingInfluencers(cachedTrending);
          setLoading(false);
        }
      } catch (e) { /* ignore */ }
    };
    applyCache();
  }, []);

  // Fetch featured offers and trending influencers from API
  useEffect(() => {
    const fetchDashboardData = async () => {
      let finalFeatured = [];
      let finalTrending = [];
      try {
        // 1. Load basic cache first (fast)
        let initialCreatorsCache = null;
        try {
          initialCreatorsCache = await getCache('dashboard_creators');
        } catch (e) {
          console.warn('[DashboardNew] Cache retrieval failed:', e);
        }

        // 3. Define helper functions
        const extractOffersFromResponse = (response) => {
          if (!response || !response.data) return [];
          if (Array.isArray(response.data)) return response.data;
          if (response.data.offers && Array.isArray(response.data.offers)) return response.data.offers;
          if (response.data.items && Array.isArray(response.data.items)) return response.data.items;
          return [];
        };

        const mapOffersToUI = async (offersArray, creatorsCache = null) => {
          if (!offersArray || offersArray.length === 0) return [];
          const creatorIdsToFetch = new Set();
          offersArray.slice(0, 3).forEach(offer => {
            if (offer.creatorId && typeof offer.creatorId === 'string') creatorIdsToFetch.add(offer.creatorId.trim());
          });

          const creatorMap = new Map();
          if (creatorsCache) {
            creatorsCache.forEach(c => {
              const cId = c.id || c._id;
              if (cId) creatorMap.set(cId.toString(), c);
            });
          }

          const missingIds = Array.from(creatorIdsToFetch).filter(id => !creatorMap.has(id));
          if (missingIds.length > 0) {
            try {
              const results = await Promise.all(missingIds.map(async (id) => {
                try {
                  const res = await userService.getProfileByUserId(id);
                  const data = res?.data || res;
                  return data && (data.id || data._id) ? { id, data } : null;
                } catch (e) { return null; }
              }));
              results.forEach(res => { if (res) creatorMap.set(res.id, res.data); });
            } catch (err) { }
          }

          return offersArray.map(offer => {
            let creatorName = 'Unknown Creator';
            let creatorImage = null;
            if (offer.creatorId) {
              if (typeof offer.creatorId === 'object' && offer.creatorId?.name) {
                creatorName = offer.creatorId.name || offer.creatorId.username || 'Unknown';
                creatorImage = offer.creatorId.profileImage || offer.creatorId.avatar || null;
              } else if (typeof offer.creatorId === 'string') {
                const data = creatorMap.get(offer.creatorId.trim());
                if (data) {
                  creatorName = data.name || data.username || data.email || 'Unknown';
                  creatorImage = data.profileImage || data.avatar || null;
                }
              }
            }
            if (creatorName === 'Unknown Creator') {
              const c = offer.creator || offer.user || {};
              creatorName = c.name || c.username || creatorName;
              creatorImage = c.profileImage || c.avatar || creatorImage;
            }
            let price = 'Free';
            if (offer.rate) {
              if (typeof offer.rate === 'object') price = getCompactDualPrice(offer.rate);
              else price = `${offer.currency === 'NGN' ? '₦' : '$'}${offer.rate}`;
            }
            return {
              id: offer._id || offer.id,
              title: offer.title || 'Untitled Offer',
              creator: creatorName,
              creatorImage: creatorImage,
              category: offer.category || 'General',
              price,
              deliverables: offer.quantity ? `${offer.quantity} ${offer.serviceType || 'items'}` : 'N/A',
              duration: offer.deliveryDays ? `${offer.deliveryDays} days` : 'N/A',
              image: (() => {
                if (offer.media?.[0]) {
                  const url = typeof offer.media[0] === 'string' ? offer.media[0] : offer.media[0].url;
                  if (url?.startsWith('http')) return url;
                }
                return creatorImage;
              })(),
              rating: offer.averageRating ? offer.averageRating.toFixed(1) : '4.5',
              serviceType: offer.serviceType || 'reel',
              platform: offer.platform?.[0] || 'instagram',
              isCustom: !!offer.isCustom,
              _original: offer,
            };
          });
        };

        // 4. Fetch creators and offers in parallel
        const [creatorsRes, featuredRes] = await Promise.allSettled([
          userService.getCreators({ page: 1, limit: 50, sortBy: 'createdAt', sortOrder: 'asc' }),
          offersService.getFeaturedOffers({ page: 1, limit: 3 })
        ]);

        const mapCategoryToUI = (cat) => {
          const m = { fashion_beauty: 'Fashion', beauty: 'Beauty', lifestyle: 'Lifestyle', tech_gadgets: 'Tech', fitness_health: 'Fitness', food_dining: 'Food', travel: 'Travel' };
          return m[cat] || cat || 'General';
        };

        let freshCreatorsCache = initialCreatorsCache;
        if (creatorsRes.status === 'fulfilled' && creatorsRes.value) {
          const data = creatorsRes.value?.data ?? creatorsRes.value;
          const creatorsData = Array.isArray(data?.creators) ? data.creators : [];
          freshCreatorsCache = creatorsData;
          try {
            await setCache('dashboard_creators', creatorsData, DEFAULT_TTL.MEDIUM);
          } catch (e) { }

          const tagColors = ['#fce7f3', '#f3e8ff', '#dcfce7'];
          const trending = creatorsData.slice(0, 10).map(creator => {
            const loc = creator.location && typeof creator.location === 'object' ? creator.location : {};
            const city = loc.city && String(loc.city).trim() && loc.city !== 'N/A' ? String(loc.city).trim() : '';
            const state = loc.state && String(loc.state).trim() && loc.state !== 'N/A' ? String(loc.state).trim() : '';
            const country = loc.country && String(loc.country).trim() && loc.country !== 'N/A' ? String(loc.country).trim() : '';
            let locDisplay = 'Worldwide';
            if (city && state) locDisplay = `${city}, ${state}`;
            else if (city && country) locDisplay = `${city}, ${country}`;
            else if (city || state || country) locDisplay = city || state || country;

            // Follower count: check totalFollowers, followersCount, and sum platformReach (Robust)
            let totalFollowers = Number(creator.totalFollowers) || Number(creator.followersCount) || 0;
            const platformReach = Array.isArray(creator.platformReach) ? creator.platformReach : [];
            if (totalFollowers === 0 && platformReach.length > 0) {
              platformReach.forEach(p => {
                const n = Number(p.followers || p.followerCount || p.count);
                if (!isNaN(n)) totalFollowers += n;
              });
            }
            const rawTags = creator.tags || creator.categories || [];
            const tags = Array.isArray(rawTags) ? rawTags.slice(0, 3) : [];
            const primaryCategory = (creator.categories && creator.categories[0]) || tags[0] || 'General';

            const socialStats = {};
            platformReach.forEach(p => {
              if (p && p.platform && (p.followers != null || p.followerCount != null)) {
                const n = Number(p.followers || p.followerCount || p.count || 0);
                socialStats[p.platform] = n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(n);
              }
            });

            // Engagement: Match CreatorProfile robust logic
            let engagementDisplay = '0%';
            let engagementValue = Number(creator.totalEngagementRate) || Number(creator.engagementRate) || Number(creator.avgEngagementRate) || Number(creator.engagement) || 0;

            if (engagementValue > 0) {
              // Normalize 0-1 to 0-100
              if (engagementValue <= 1) engagementValue = engagementValue * 100;
              engagementDisplay = `${engagementValue.toFixed(1)}%`;
            } else if (platformReach.length > 0) {
              // Average from platforms
              const rates = platformReach.map(p => Number(p.engagementRate || p.rate || 0)).filter(r => r > 0);
              if (rates.length > 0) {
                let avg = rates.reduce((a, b) => a + b, 0) / rates.length;
                if (avg > 0 && avg <= 1) avg = avg * 100;
                engagementDisplay = `${avg.toFixed(1)}%`;
              }
            }
            const ratingNum = Number(creator.rating ?? creator.averageRating) || 0;

            return {
              id: creator.id || creator._id,
              name: creator.name || 'Unknown Creator',
              username: creator.username ? `@${creator.username}` : `@${(creator.name || 'creator').toLowerCase().replace(/\s+/g, '_')}`,
              location: locDisplay,
              image: creator.profileImage || creator.avatar || null,
              tags,
              tagColors,
              category: mapCategoryToUI(primaryCategory),
              followers: totalFollowers >= 1000000 ? `${(totalFollowers / 1000000).toFixed(1)}M` : totalFollowers >= 1000 ? `${(totalFollowers / 1000).toFixed(0)}K` : String(totalFollowers),
              followersCount: totalFollowers,
              engagement: engagementDisplay,
              rating: ratingNum ? ratingNum.toFixed(1) : '5.0',
              socialStats,
              _original: creator,
            };
          });
          setTrendingInfluencers(trending);
          finalTrending = trending;
        } else {
          setTrendingInfluencers([]);
        }

        let offersFound = false;
        if (featuredRes.status === 'fulfilled') {
          const offersData = extractOffersFromResponse(featuredRes.value);
          if (offersData.length > 0) {
            const mapped = await mapOffersToUI(offersData, freshCreatorsCache);
            setFeaturedOffers(mapped);
            finalFeatured = mapped;
            offersFound = true;
          }
        }

        if (!offersFound) {
          try {
            const allRes = await offersService.getAllOffers({ page: 1, limit: 3 });
            const allData = extractOffersFromResponse(allRes);
            if (allData.length > 0) {
              const mapped = await mapOffersToUI(allData, freshCreatorsCache);
              setFeaturedOffers(mapped);
              finalFeatured = mapped;
            }
          } catch (e) { }
        }

        try {
          await setCache('dashboard_new_featured', finalFeatured, DEFAULT_TTL.SHORT);
          await setCache('dashboard_new_trending', finalTrending, DEFAULT_TTL.SHORT);
        } catch (e) { /* ignore */ }
      } catch (err) {
        console.error('DashboardNew data fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboardData();
  }, []);

  // All data is now fetched from API - no hardcoded data

  const handleMenu = () => {
    navigation?.openDrawer();
  };

  // Enhanced navigation with drawer control
  const enhancedNavigation = {
    ...navigation,
  };

  const handleNotification = () => {
    // Navigate to notifications screen
    navigation?.navigate('Notifications');
  };

  const handleProfile = () => {
    navigation?.navigate('Profile');
  };

  const handleCategorySelect = (category) => {
    setSelectedCategory(category);
  };

  const handleSearch = (text) => {
    setSearchText(text);
    // You can add search logic here to filter influencers
    // const filteredInfluencers = trendingInfluencers.filter(influencer => 
    //   influencer.name.toLowerCase().includes(text.toLowerCase()) ||
    //   influencer.username.toLowerCase().includes(text.toLowerCase()) ||
    //   influencer.tags.some(tag => tag.toLowerCase().includes(text.toLowerCase()))
    // );
  };

  const handleViewAll = () => {
    // Navigate to ExploreOffers to view all influencer offers
    navigation?.navigate('ExploreOffers');
  };

  const handleFindInfluencer = () => {
    // Navigate to CreatorsList to find and browse influencers
    navigation?.navigate('CreatorsList');
  };

  const handleFilter = () => {
    setShowFilterModal(true);
  };

  const handleSortBy = (sort) => {
    setSortBy(sort);
    setShowFilterModal(false);
  };

  const handleFilterCategory = (category) => {
    setFilterCategory(category);
    setShowFilterModal(false);
  };

  const handleFilterLocation = (location) => {
    setFilterLocation(location);
    setShowFilterModal(false);
  };

  const handleClearFilters = () => {
    setSortBy('followers');
    setFilterCategory('All');
    setFilterLocation('All');
    setShowFilterModal(false);
  };



  const handleViewProfile = (item) => {
    const userId = item.userId || item.id || item._original?.id || item._original?._id;
    if (userId) {
      navigation?.navigate('CreatorProfile', { userId });
    } else {
      Alert.alert('Error', 'Creator information not available');
    }
  };

  const renderFeaturedOffer = ({ item }) => {
    // Helper to get initials for fallback avatar - use first and last name
    const getInitials = (name) => {
      if (!name) return '?';
      const parts = name.trim().split(' ').filter(p => p.length > 0);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return name.substring(0, 2).toUpperCase();
    };

    // Use creatorImage if available, otherwise use offer media image
    const displayImage = item.creatorImage || item.image;
    const isValidImage = displayImage && typeof displayImage === 'string' && (displayImage.startsWith('http://') || displayImage.startsWith('https://'));

    return (
      <TouchableOpacity
        style={styles.featuredCard}
        onPress={() => navigation?.navigate('OfferDetails', { offerId: item.id })}
      >
        {isValidImage ? (
          <Image source={{ uri: displayImage }} style={styles.featuredImage} />
        ) : (
          <View style={[styles.featuredImage, { backgroundColor: '#337DEB', justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: 'bold' }}>
              {getInitials(item.creator)}
            </Text>
          </View>
        )}
        {item.isCustom && (
          <View style={{
            position: 'absolute',
            top: 10,
            right: 10,
            backgroundColor: '#805ad5',
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 8,
            zIndex: 10,
          }}>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>CUSTOM</Text>
          </View>
        )}
        <View style={styles.featuredContent}>
          <Text style={styles.featuredOfferTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.featuredCreator} numberOfLines={1}>by {item.creator}</Text>
          <View style={styles.featuredStats}>
            <View style={styles.featuredStatItem}>
              <Text style={styles.featuredStatValue}>{item.price}</Text>
            </View>
            <View style={styles.featuredStatItem}>
              <MaterialIcons name="check-circle" size={16} color="#ffffff" />
              <Text style={styles.featuredStatValue} numberOfLines={1}>{item.deliverables}</Text>
            </View>
          </View>
          <View style={styles.offerFooter}>
            <View style={styles.ratingContainer}>
              <MaterialIcons name="star" size={14} color="#FCD34D" />
              <Text style={styles.ratingText}>{item.rating}</Text>
            </View>
            <Text style={styles.durationText}>{item.duration}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderTrendingInfluencer = ({ item }) => {
    const getInitials = (name) => {
      if (!name) return '?';
      const parts = name.trim().split(' ').filter(p => p.length > 0);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return name.substring(0, 2).toUpperCase();
    };

    return (
      <View style={styles.trendingCard}>
        <View style={styles.trendingHeader}>
          <View style={styles.trendingProfile}>
            {item.image ? (
              <Image source={{ uri: item.image }} style={styles.trendingImage} />
            ) : (
              <View style={[styles.trendingImage, styles.trendingImagePlaceholder]}>
                <Text style={styles.trendingImageInitials}>
                  {getInitials(item.name)}
                </Text>
              </View>
            )}
            <View style={styles.trendingInfo}>
              <Text style={styles.trendingName}>{item.name}</Text>
              <Text style={styles.trendingUsername}>{item.username}</Text>
              <View style={styles.trendingLocation}>
                <MaterialIcons name="location-on" size={14} color="#6b7280" />
                <Text style={styles.trendingLocationText}>{item.location}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.trendingTags}>
          {(item.tags || []).map((tag, index) => {
            const colors = item.tagColors || ['#fce7f3', '#f3e8ff', '#dcfce7'];
            return (
              <View key={index} style={[styles.trendingTag, { backgroundColor: colors[index % colors.length] }]}>
                <Text style={styles.trendingTagText}>{String(tag)}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.trendingStats}>
          <View style={styles.trendingStatItem}>
            <Text style={styles.trendingStatValue}>{item.followers}</Text>
            <Text style={styles.trendingStatLabel}>Followers</Text>
          </View>
          <View style={styles.trendingStatItem}>
            <Text style={styles.trendingStatValue}>{item.engagement}</Text>
            <Text style={styles.trendingStatLabel}>Engagement</Text>
          </View>
          <View style={styles.trendingStatItem}>
            <Text style={styles.trendingStatValue}>{item.rating}</Text>
            <Text style={styles.trendingStatLabel}>Rating</Text>
          </View>
        </View>

        <View style={styles.trendingFooter}>
          <View style={styles.socialStatsRow}>
            {Object.entries(item.socialStats).slice(0, 3).map(([platform, count]) => (
              <View key={platform} style={styles.socialStatItemMini}>
                <PlatformIcon
                  platform={platform}
                  size={16}
                  color={platform === 'instagram' ? '#E4405F' : platform === 'tiktok' ? '#000000' : platform === 'youtube' ? '#FF0000' : '#6b7280'}
                />
                <Text style={styles.socialStatTextMini}>{count}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={styles.viewProfileButtonSmall}
            onPress={() => handleViewProfile(item)}
          >
            <Text style={styles.viewProfileButtonTextSmall}>View Profile</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.menuButton} onPress={handleMenu}>
            <MaterialIcons name="menu" size={24} color="#374151" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Dashboard</Text>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.notificationButton} onPress={handleNotification}>
              <MaterialIcons name="notifications" size={24} color="#374151" />
              <View style={styles.notificationDot} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.profileButton} onPress={handleProfile}>
              {userProfile?.profileImage || userProfile?.avatar ? (
                <Image
                  source={{ uri: userProfile.profileImage || userProfile.avatar }}
                  style={styles.profileImage}
                />
              ) : (
                <View style={[styles.profileImage, styles.profileImagePlaceholder]}>
                  <Text style={styles.profileImageInitials}>
                    {getInitials(userProfile?.name || 'User')}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Find Influencers Section */}
        <View style={styles.findSection}>
          <Text style={styles.findTitle}>Find Influencers</Text>
          <Text style={styles.findSubtitle}>Discover creators for your brand</Text>

          <View style={styles.searchContainer}>
            <MaterialIcons name="search" size={20} color="#6b7280" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search influencers, categories..."
              placeholderTextColor="#9ca3af"
              value={searchText}
              onChangeText={handleSearch}
            />
          </View>

          {/* Find Influencer Button */}
          <TouchableOpacity style={styles.findInfluencerButton} onPress={handleFindInfluencer}>
            <MaterialIcons name="person-search" size={24} color="#ffffff" />
            <Text style={styles.findInfluencerButtonText}>Find Influencer</Text>
          </TouchableOpacity>
        </View>

        {/* Featured Offers */}
        <View style={styles.featuredSection}>
          <View style={styles.featuredHeader}>
            <Text style={styles.featuredTitle}>Featured Offers</Text>
          </View>
          {loading ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Loading featured offers...</Text>
            </View>
          ) : featuredOffers.length > 0 ? (
            <FlatList
              ref={featuredListRef}
              data={featuredOffers}
              renderItem={renderFeaturedOffer}
              keyExtractor={(item) => item.id?.toString() || item._original?._id?.toString() || Math.random().toString()}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.featuredList, { paddingLeft: 16, paddingRight: 40 }]}
              snapToAlignment="start"
              decelerationRate="fast"
              getItemLayout={(_, index) => ({ length: 296, offset: 296 * index, index })}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No featured offers available</Text>
            </View>
          )}
          <TouchableOpacity onPress={handleViewAll} style={styles.viewAllOffersButton}>
            <MaterialIcons name="local-offer" size={24} color="#ffffff" />
            <Text style={styles.viewAllOffersButtonText}>View all offers</Text>
          </TouchableOpacity>
        </View>

        {/* Trending Now */}
        <View style={styles.trendingSection}>
          <View style={styles.trendingSectionHeader}>
            <Text style={styles.trendingTitle}>Trending Now</Text>
            <TouchableOpacity onPress={handleFindInfluencer} style={styles.seeAllButton}>
              <Text style={styles.seeAllText}>See all</Text>
              <MaterialIcons name="arrow-forward" size={18} color="#337DEB" />
            </TouchableOpacity>
          </View>
          {/* Category filter row - consistent with CreatorsList */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.trendingFiltersRow} contentContainerStyle={styles.trendingFiltersContent}>
            {categories.map((category) => (
              <TouchableOpacity
                key={category}
                style={[styles.filterChip, selectedCategory === category && styles.filterChipSelected]}
                onPress={() => setSelectedCategory(category)}
              >
                <Text style={[styles.filterChipText, selectedCategory === category && styles.filterChipTextSelected]}>
                  {category}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={styles.trendingHeader}>
            <View />
            <TouchableOpacity onPress={handleFilter}>
              <MaterialIcons name="tune" size={24} color="#374151" />
            </TouchableOpacity>
          </View>
          {loading ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Loading trending influencers...</Text>
            </View>
          ) : trendingInfluencers.length > 0 ? (
            <FlatList
              data={(() => {
                let filtered = [...trendingInfluencers];

                // Filter by category (from chips)
                if (selectedCategory !== 'All') {
                  filtered = filtered.filter(item =>
                    item.category === selectedCategory ||
                    (item._original && item._original.categories && item._original.categories.includes(selectedCategory.toLowerCase()))
                  );
                }

                // Filter by search text
                if (searchText) {
                  const searchLower = searchText.toLowerCase();
                  filtered = filtered.filter(item =>
                    item.name.toLowerCase().includes(searchLower) ||
                    (item.location && item.location.toLowerCase().includes(searchLower)) ||
                    (item.tags && item.tags.some(tag => tag.toLowerCase().includes(searchLower)))
                  );
                }

                // Filter by Modal Category
                if (filterCategory !== 'All') {
                  filtered = filtered.filter(item =>
                    item.category === filterCategory ||
                    (item._original && item._original.categories && item._original.categories.includes(filterCategory.toLowerCase()))
                  );
                }

                // Sort by Modal SortBy
                if (sortBy === 'followers') {
                  filtered.sort((a, b) => (b.followersCount || 0) - (a.followersCount || 0));
                } else if (sortBy === 'engagement') {
                  const getEng = (val) => parseFloat(val) || 0;
                  filtered.sort((a, b) => getEng(b.engagement) - getEng(a.engagement));
                } else if (sortBy === 'rating') {
                  filtered.sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0));
                }

                return filtered;
              })()}
              renderItem={renderTrendingInfluencer}
              keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
              scrollEnabled={false}
              contentContainerStyle={styles.trendingList}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No trending influencers available</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Filter Modal */}
      {
        showFilterModal && (
          <View style={styles.filterModal}>
            <View style={styles.filterModalContent}>
              <View style={styles.filterModalHeader}>
                <Text style={styles.filterModalTitle}>Filter & Sort</Text>
                <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                  <MaterialIcons name="close" size={24} color="#374151" />
                </TouchableOpacity>
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Sort By</Text>
                <View style={styles.filterOptions}>
                  {['followers', 'engagement', 'rating'].map((option) => (
                    <TouchableOpacity
                      key={option}
                      style={[
                        styles.filterOption,
                        sortBy === option && styles.filterOptionSelected
                      ]}
                      onPress={() => handleSortBy(option)}
                    >
                      <Text style={[
                        styles.filterOptionText,
                        sortBy === option && styles.filterOptionTextSelected
                      ]}>
                        {option.charAt(0).toUpperCase() + option.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Category</Text>
                <View style={styles.filterOptions}>
                  {['All', 'Fashion', 'Beauty', 'Lifestyle', 'Tech', 'Fitness'].map((option) => (
                    <TouchableOpacity
                      key={option}
                      style={[
                        styles.filterOption,
                        filterCategory === option && styles.filterOptionSelected
                      ]}
                      onPress={() => handleFilterCategory(option)}
                    >
                      <Text style={[
                        styles.filterOptionText,
                        filterCategory === option && styles.filterOptionTextSelected
                      ]}>
                        {option}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Location</Text>
                <View style={styles.filterOptions}>
                  {['All', 'New York', 'San Francisco', 'Miami', 'Anywhere'].map((option) => (
                    <TouchableOpacity
                      key={option}
                      style={[
                        styles.filterOption,
                        filterLocation === option && styles.filterOptionSelected
                      ]}
                      onPress={() => handleFilterLocation(option)}
                    >
                      <Text style={[
                        styles.filterOptionText,
                        filterLocation === option && styles.filterOptionTextSelected
                      ]}>
                        {option}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.filterModalActions}>
                <TouchableOpacity style={styles.clearButton} onPress={handleClearFilters}>
                  <Text style={styles.clearButtonText}>Clear All</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.applyButton} onPress={() => setShowFilterModal(false)}>
                  <Text style={styles.applyButtonText}>Apply Filters</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )
      }
    </SafeAreaView >
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollView: {
    flex: 1,
    paddingBottom: 80, // Add padding to prevent content from being hidden behind tabs
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    position: 'relative',
  },
  menuButton: {
    padding: 8,
    position: 'absolute',
    left: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#374151',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    position: 'absolute',
    right: 20,
  },
  notificationButton: {
    position: 'relative',
    padding: 8,
  },
  notificationDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#337DEB',
  },
  profileButton: {
    padding: 4,
  },
  profileImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  profileImagePlaceholder: {
    backgroundColor: '#337DEB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileImageInitials: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  findSection: {
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  findTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  findSubtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 20,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1f2937',
  },
  findInfluencerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#337DEB',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginTop: 16,
    gap: 8,
    shadowColor: '#337DEB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  findInfluencerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    marginRight: 8,
  },
  filterChipSelected: {
    backgroundColor: '#337DEB',
  },
  filterChipText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  filterChipTextSelected: {
    color: '#ffffff',
  },
  featuredSection: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  featuredHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  featuredTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  viewAllText: {
    fontSize: 14,
    color: '#337DEB',
    fontWeight: '600',
  },
  featuredList: {
    paddingRight: 16,
    paddingVertical: 4,
  },
  featuredCard: {
    width: 280,
    backgroundColor: '#337DEB',
    borderRadius: 16,
    padding: 16,
    marginRight: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  featuredImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 16,
  },
  featuredContent: {
    flex: 1,
  },
  featuredName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  featuredOfferTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 6,
  },
  featuredCreator: {
    fontSize: 13,
    color: '#ffffff',
    opacity: 0.85,
    marginBottom: 12,
  },
  featuredCategory: {
    fontSize: 14,
    color: '#ffffff',
    opacity: 0.9,
    marginBottom: 12,
  },
  featuredStats: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 12,
  },
  featuredStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  featuredStatLabel: {
    fontSize: 12,
    color: '#ffffff',
    opacity: 0.8,
    marginBottom: 2,
  },
  featuredStatValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  viewButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  viewButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  viewAllOffersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#337DEB',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginTop: 16,
    gap: 8,
    shadowColor: '#337DEB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  viewAllOffersButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  offerFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  durationText: {
    fontSize: 12,
    color: '#ffffff',
    opacity: 0.8,
  },
  trendingSection: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  trendingSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#337DEB',
  },
  trendingFiltersRow: {
    marginBottom: 12,
  },
  trendingFiltersContent: {
    paddingVertical: 8,
    gap: 8,
    paddingRight: 16,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    marginRight: 8,
  },
  filterChipSelected: {
    backgroundColor: '#337DEB',
  },
  filterChipText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  filterChipTextSelected: {
    color: '#ffffff',
  },
  trendingHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 16,
  },
  trendingTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  trendingList: {
    gap: 16,
  },
  trendingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  trendingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  trendingProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  trendingImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
    marginRight: 16,
  },
  trendingImagePlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#337DEB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  trendingImageInitials: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  trendingInfo: {
    flex: 1,
  },
  trendingName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 2,
  },
  trendingUsername: {
    fontSize: 14,
    color: '#9ca3af',
    marginBottom: 4,
  },
  trendingLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trendingLocationText: {
    fontSize: 12,
    color: '#6b7280',
  },

  trendingTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
    gap: 8,
  },
  trendingTag: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  trendingTagText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
  trendingStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    marginBottom: 20,
  },
  trendingStatItem: {
    alignItems: 'center',
  },
  trendingStatValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  trendingStatLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  trendingFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 16,
  },
  socialStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  socialStatItemMini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  socialStatTextMini: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  viewProfileButtonSmall: {
    backgroundColor: '#337DEB',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#337DEB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  viewProfileButtonTextSmall: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  bookmarkButtonMini: {
    padding: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingBottom: 20, // Extra padding for safe area
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 10, // Increased elevation to ensure tabs are above other content
    zIndex: 1000, // Ensure tabs are always on top
  },
  navItem: {
    alignItems: 'center',
    flex: 1,
  },
  navItemActive: {
    // Active state styling
  },
  navText: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 4,
  },
  navTextActive: {
    color: '#337DEB',
    fontWeight: '600',
  },
  filterModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    zIndex: 1000,
  },
  filterModalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  filterModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  filterModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  filterSection: {
    marginBottom: 20,
  },
  filterSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  filterOptionSelected: {
    backgroundColor: '#337DEB',
    borderColor: '#337DEB',
  },
  filterOptionText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  filterOptionTextSelected: {
    color: '#ffffff',
  },
  filterModalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  clearButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '600',
  },
  applyButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#337DEB',
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
  },
});

export default DashboardNew;
