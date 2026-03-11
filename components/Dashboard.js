import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ScrollView, FlatList, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlatformIcon } from '../utils/platformIcons';
import { getCache, setCache, DEFAULT_TTL } from '../utils/cache';
import * as userService from '../services/user';
import * as notifService from '../services/notifications';
import * as campaignsService from '../services/campaigns';
import * as ordersService from '../services/orders';
import * as walletService from '../services/wallet';
import * as statsUtils from '../utils/dashboardStats';

// Import MaterialIcons - handle both ES6 and CommonJS
let MaterialIcons;
try {
  const MaterialIconModule = require('react-native-vector-icons/MaterialIcons');
  MaterialIcons = MaterialIconModule.default || MaterialIconModule;
  // Verify it's a valid component
  if (typeof MaterialIcons !== 'function') {
    console.warn('MaterialIcons is not a function, creating fallback');
    MaterialIcons = ({ name, size, color, style }) => (
      <Text style={[{ fontSize: size || 20, color: color || '#000' }, style]}>?</Text>
    );
  }
} catch (error) {
  console.error('Error importing MaterialIcons:', error);
  // Fallback component
  MaterialIcons = ({ name, size, color, style }) => (
    <Text style={[{ fontSize: size || 20, color: color || '#000' }, style]}>?</Text>
  );
}

const { width } = Dimensions.get('window');

// Helper function to get initials from name
const getInitials = (name) => {
  if (!name) return 'U';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

const ACTIVITY_ICON_MAP = {
  proposal_submitted: 'description',
  proposal_accepted: 'check-circle',
  proposal_rejected: 'cancel',
  order_created: 'receipt',
  order_paid: 'account-balance-wallet',
  order_completed: 'done-all',
  order_deliverables_submitted: 'cloud-upload',
  message_new: 'chat',
  payment_received: 'account-balance-wallet',
  payment_released: 'payments',
  campaign_new_applicant: 'people',
  campaign_deadline_reminder: 'schedule',
  review_received: 'star',
  offer_purchased: 'shopping-cart',
  offer_sent: 'send',
  general: 'notifications',
};

const formatActivityTime = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  const sec = Math.floor((now - d) / 1000);
  if (sec < 60) return 'Just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return d.toLocaleDateString();
};

const Dashboard = ({ navigation, route }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef(null);
  const [userProfile, setUserProfile] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [stats, setStats] = useState({ totalEarnings: 0, activeOrders: 0, balances: {} });
  const [recentActivities, setRecentActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [userRole, setUserRole] = useState(route?.params?.role || navigation?.getParam?.('role') || 'Creator');
  const isBrand = userRole?.toLowerCase() === 'brand';

  // Fetch user profile and dashboard data (cache-first: show cached data immediately, then refresh in background)
  useEffect(() => {
    const cacheKey = isBrand ? 'dashboard_brand' : 'dashboard_creator';

    const applyCache = async () => {
      try {
        const cached = await getCache(cacheKey);
        if (cached && (cached.campaigns?.length > 0 || cached.userProfile || Object.keys(cached.stats || {}).length > 0)) {
          if (cached.userProfile) setUserProfile(cached.userProfile);
          if (cached.campaigns?.length) setCampaigns(cached.campaigns);
          if (cached.stats) setStats(cached.stats);
          if (cached.recentActivities?.length) setRecentActivities(cached.recentActivities);
          setLoading(false);
        }
      } catch (e) { /* ignore */ }
    };
    applyCache();

    const fetchDashboardData = async () => {
      try {
        // 2. Fetch critical and secondary data in parallel where possible
        // Note: some calls depend on profileResponse to get current user role
        // but we already have userRole from route/navigation fallback.

        // Fetch Profile and Unread Count in parallel
        const [profileResponse, unreadRes] = await Promise.all([
          userService.getMyProfile(),
          notifService.getUnreadCount().catch(err => {
            console.warn('Failed to fetch unread count:', err);
            return { data: { count: 0 } };
          })
        ]);

        if (profileResponse && profileResponse.data) {
          setUserProfile(profileResponse.data);
          const userRoleFromProfile = profileResponse.data.role || profileResponse.data.userRole;
          if (userRoleFromProfile) {
            const normalizedRole = userRoleFromProfile.charAt(0).toUpperCase() + userRoleFromProfile.slice(1).toLowerCase();
            if (normalizedRole !== userRole) {
              setUserRole(normalizedRole);
            }
          }
        }

        setUnreadCount(unreadRes?.data?.count || 0);

        const currentUserRole = profileResponse?.data?.role || profileResponse?.data?.userRole || userRole;
        const isBrandRole = currentUserRole?.toLowerCase() === 'brand';

        if (isBrandRole) {
          // Brand specific data fetching in parallel
          const [campaignsResponse, allOrdersResponse] = await Promise.all([
            campaignsService.getMyCampaigns({ page: 1, limit: 100 }),
            ordersService.getAllOrders({ page: 1, limit: 100 }).catch(err => {
              console.error('Failed to fetch orders for brand stats:', err);
              return { data: [] };
            })
          ]);

          let campaignsData = [];
          if (campaignsResponse && campaignsResponse.data) {
            campaignsData = Array.isArray(campaignsResponse.data)
              ? campaignsResponse.data
              : campaignsResponse.data.campaigns || campaignsResponse.data.items || [];
            setCampaigns(campaignsData.slice(0, 3));
          }

          const orders = allOrdersResponse && allOrdersResponse.data
            ? (Array.isArray(allOrdersResponse.data)
              ? allOrdersResponse.data
              : allOrdersResponse.data.orders || allOrdersResponse.data.items || [])
            : [];

          const calculatedStats = statsUtils.calculateBrandStats({
            campaigns: campaignsData,
            orders: orders,
          });

          setStats({
            totalSpent: calculatedStats.totalSpent,
            activeCampaigns: calculatedStats.activeCampaigns,
            pendingProposals: calculatedStats.pendingProposals || 0,
            completedOrders: calculatedStats.completedOrders || 0,
          });
          try {
            await setCache('dashboard_brand', {
              userProfile: profileResponse?.data,
              campaigns: campaignsData.slice(0, 3),
              stats: { totalSpent: calculatedStats.totalSpent, activeCampaigns: calculatedStats.activeCampaigns, pendingProposals: calculatedStats.pendingProposals || 0, completedOrders: calculatedStats.completedOrders || 0 },
              recentActivities: [],
            }, DEFAULT_TTL.SHORT);
          } catch (e) { /* ignore */ }
        } else {
          // Creator specific data fetching in parallel
          let walletBalance = 0;
          let walletBalances = {};
          try {
            const [campaignsResponse, walletResponse] = await Promise.all([
              campaignsService.browseCampaigns({ page: 1, limit: 10 }),
              walletService.getWallet().catch(err => {
                console.warn('Failed to fetch wallet:', err);
                return { data: { balance: 0, balances: {} } };
              })
            ]);

            if (campaignsResponse && campaignsResponse.data) {
              const campaignsData = Array.isArray(campaignsResponse.data)
                ? campaignsResponse.data
                : campaignsResponse.data.campaigns || campaignsResponse.data.items || [];
              setCampaigns(campaignsData.slice(0, 3));
            }

            if (walletResponse && walletResponse.data) {
              walletBalance = walletResponse.data.balance || walletResponse.data.totalEarnings || 0;
              walletBalances = walletResponse.data.availableBalances || walletResponse.data.balances || {};
            }
          } catch (walletError) {
            // Silently handle wallet errors (e.g., authentication issues)
            console.log('Failed to fetch wallet balance:', walletError?.message || String(walletError));
          }

          // Fetch all orders to calculate accurate stats
          try {
            const allOrdersResponse = await ordersService.getAllOrders({ page: 1, limit: 100 });
            const orders = allOrdersResponse && allOrdersResponse.data
              ? (Array.isArray(allOrdersResponse.data)
                ? allOrdersResponse.data
                : allOrdersResponse.data.orders || allOrdersResponse.data.items || [])
              : [];

            // Calculate stats using utility function
            const calculatedStats = statsUtils.calculateCreatorStats({
              walletBalance: walletBalance,
              orders: orders,
            });

            setStats({
              totalEarnings: calculatedStats.totalEarnings,
              activeOrders: calculatedStats.activeOrders,
              completedOrders: calculatedStats.completedOrders || 0,
              balances: walletBalances,
            });
          } catch (statsError) {
            console.error('Failed to calculate creator stats:', statsError);
            setStats({
              totalEarnings: walletBalance,
              activeOrders: 0,
            });
          }

          // Creator recent activities: unread only (latest 5); if all read, show latest 5 read
          let recentActivitiesForCache = [];
          try {
            const unreadRes = await notifService.getNotifications({ limit: 5, read: false });
            const unreadData = unreadRes?.data ?? unreadRes;
            const unreadList = unreadData?.notifications ?? [];
            if (unreadList.length > 0) {
              recentActivitiesForCache = Array.isArray(unreadList) ? unreadList : [];
              setRecentActivities(recentActivitiesForCache);
            } else {
              const readRes = await notifService.getNotifications({ limit: 5, read: true });
              const readData = readRes?.data ?? readRes;
              const readList = readData?.notifications ?? [];
              recentActivitiesForCache = Array.isArray(readList) ? readList : [];
              setRecentActivities(recentActivitiesForCache);
            }
          } catch (activitiesError) {
            console.warn('Failed to fetch creator recent activities:', activitiesError?.message || activitiesError);
            setRecentActivities([]);
          }
          try {
            const campaignsForCache = campaignsResponse?.data
              ? (Array.isArray(campaignsResponse.data) ? campaignsResponse.data : campaignsResponse.data.campaigns || campaignsResponse.data.items || []).slice(0, 10)
              : [];
            await setCache('dashboard_creator', {
              userProfile: profileResponse?.data,
              campaigns: campaignsForCache,
              stats: { totalEarnings: walletBalance, activeOrders: 0, completedOrders: 0, balances: walletBalances || {} },
              recentActivities: recentActivitiesForCache,
            }, DEFAULT_TTL.SHORT);
          } catch (e) { /* ignore */ }
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [userRole]);

  // Map API data to UI format
  const campaignData = campaigns && campaigns.length > 0 ? campaigns.map((item, index) => {
    const platform = Array.isArray(item.platform) ? item.platform[0] : item.platform || 'instagram';
    const platformLower = platform.toLowerCase();
    const iconMap = {
      instagram: 'photo-camera',
      tiktok: 'music-note',
      youtube: 'play-circle-filled',
      facebook: 'thumb-up',
      twitter: 'tag',
    };

    // Handle budget - can be number, budgetRange object, or missing
    // Handle budget - can be number, budgetRange object, or missing
    let priceDisplay = 'N/A';
    const currency = (item.currency || item.budgetRange?.currency || '').toUpperCase();
    const symbol = currency === 'USD' ? '$' : '₦';

    if (item.budget) {
      priceDisplay = `${symbol}${item.budget}`;
    } else if (item.budgetRange) {
      if (item.budgetRange.min && item.budgetRange.max) {
        priceDisplay = `${symbol}${item.budgetRange.min} - ${symbol}${item.budgetRange.max}`;
      } else if (item.budgetRange.min) {
        priceDisplay = `${symbol}${item.budgetRange.min}+`;
      } else if (item.budgetRange.max) {
        priceDisplay = `Up to ${symbol}${item.budgetRange.max}`;
      }
    } else if (item.rate) {
      priceDisplay = `${symbol}${item.rate}`;
    }

    // Resolve campaign image
    let displayImage = null;
    if (item.media && Array.isArray(item.media) && item.media.length > 0) {
      const firstMedia = item.media[0];
      displayImage = typeof firstMedia === 'string' ? firstMedia : firstMedia.url;
    }

    // Fallbacks
    if (!displayImage) {
      displayImage = item.image ||
        (item.brandId && typeof item.brandId === 'object' ? (item.brandId.companyLogo || item.brandId.profileImage) : null) ||
        item.brandLogo ||
        null;
    }

    return {
      id: item._id || item.id || index,
      title: item.name || item.title || 'Untitled Campaign',
      image: displayImage,
      platform: platform.charAt(0).toUpperCase() + platform.slice(1),
      icon: iconMap[platformLower] || 'camera-alt',
      price: priceDisplay,
      description: item.description || 'No description available',
      _original: item,
    };
  }) : [];

  const renderCampaignItem = ({ item }) => {
    const handleCampaignPress = () => {
      // Navigate to CampaignDetails for both brands and creators
      // Creators can then choose to Chat or Send Proposal from the details page
      const campaignObj = item._original || item;
      console.log('Navigating to CampaignDetails with:', { id: campaignObj._id || campaignObj.id, title: campaignObj.title || campaignObj.name });

      navigation?.navigate('CampaignDetails', {
        campaign: campaignObj,
        campaignId: campaignObj._id || campaignObj.id, // Explicit ID pass
        role: isBrand ? 'Brand' : 'Creator'
      });
    };

    return (
      <TouchableOpacity
        style={styles.campaignBox}
        onPress={handleCampaignPress}
        activeOpacity={0.7}
      >
        {item.image ? (
          <Image
            source={{ uri: item.image }}
            style={styles.campaignImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.campaignImage, styles.campaignImagePlaceholder]}>
            <MaterialIcons name="image" size={32} color="#9CA3AF" />
          </View>
        )}
        <Text style={styles.campaignTitle}>{item.title}</Text>
        <View style={styles.campaignDetailRow}>
          <PlatformIcon platform={item.platform} size={14} color="#337DEB" />
          <Text style={styles.campaignDetail}>{item.platform} • {item.price}</Text>
        </View>
        <Text style={styles.campaignDetailSmall}>{item.description}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header with hamburger and bell */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.hamburger}
            onPress={() => navigation?.openDrawer?.()}
          >
            <MaterialIcons name="menu" size={24} color="#2d3748" />
          </TouchableOpacity>
          <Text style={styles.headerText}>Dashboard</Text>
          <TouchableOpacity
            style={styles.bell}
            onPress={() => navigation?.navigate('Notifications')}
          >
            <MaterialIcons name="notifications" size={24} color="#2d3748" />
            {unreadCount > 0 && <View style={styles.notificationBadge} />}
          </TouchableOpacity>
        </View>

        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeText}>
            Welcome{'\n'}back, {loading ? '...' : (userProfile?.name?.split(' ')[0] || 'User')}!
          </Text>
          {userProfile?.profileImage || userProfile?.avatar ? (
            <Image
              source={{ uri: userProfile.profileImage || userProfile.avatar }}
              style={styles.userImage}
            />
          ) : (
            <View style={[styles.userImage, styles.userImagePlaceholder]}>
              <Text style={styles.userImageInitials}>
                {getInitials(userProfile?.name || 'User')}
              </Text>
            </View>
          )}
        </View>

        {/* Stats Section - Role-based */}
        <View style={styles.statsContainer}>
          <TouchableOpacity
            style={styles.statBox}
            onPress={() => navigation?.navigate('Wallet')}
          >
            <Text style={styles.statLabel}>{isBrand ? 'Total Spent' : 'Total Earnings'}</Text>
            {loading ? (
              <View style={styles.skeletonBox} />
            ) : (
              <Text style={styles.statValue}>
                {(isBrand
                  ? `$${stats.totalSpent?.toLocaleString() || '0'}`
                  : (stats.balances && Object.keys(stats.balances).length > 0) ? (
                    <View style={{ alignItems: 'center' }}>
                      {Object.entries(stats.balances).map(([curr, amt]) => (
                        <Text key={curr} style={{ fontSize: 18, fontWeight: 'bold', color: '#2d3748' }}>
                          {curr === 'USD' ? '$' : '₦'}{(amt || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Text>
                      ))}
                    </View>
                  ) : (
                    `₦${(stats.totalEarnings || 0).toLocaleString()}`
                  )
                )}
              </Text>
            )}
          </TouchableOpacity>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>{isBrand ? 'Active Campaigns' : 'Active Orders'}</Text>
            {loading ? (
              <View style={styles.skeletonBox} />
            ) : (
              <Text style={styles.statValue}>
                {(isBrand ? stats.activeCampaigns || '0' : stats.activeOrders || '0')}
              </Text>
            )}
          </View>
        </View>

        {/* New Opportunities Section - Role-based */}
        <View style={styles.opportunitiesSection}>
          <Text style={styles.sectionTitle}>{isBrand ? 'YOUR CAMPAIGNS' : 'NEW OPPORTUNITIES'}</Text>
          <Text style={styles.sectionSubtitle}>{isBrand ? 'Manage your active campaigns' : 'We have new brand campaigns!'}</Text>
          <View style={styles.campaignsContainer}>
            {loading ? (
              // Skeleton loading rows for campaigns
              <View style={{ paddingHorizontal: 8 }}>
                {[1, 2].map(i => (
                  <View key={i} style={[styles.skeletonCard, { marginBottom: 10 }]}>
                    <View style={[styles.skeletonBox, { height: 90, borderRadius: 8, marginBottom: 8 }]} />
                    <View style={[styles.skeletonBox, { height: 14, width: '70%', borderRadius: 4, marginBottom: 6 }]} />
                    <View style={[styles.skeletonBox, { height: 12, width: '50%', borderRadius: 4 }]} />
                  </View>
                ))}
              </View>
            ) : (
              <View>
                <FlatList
                  ref={flatListRef}
                  data={campaignData}
                  renderItem={renderCampaignItem}
                  keyExtractor={(item) => item.id.toString()}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  pagingEnabled
                  onMomentumScrollEnd={(event) => {
                    const index = Math.round(event.nativeEvent.contentOffset.x / (width * 0.8));
                    setCurrentIndex(index);
                  }}
                  style={styles.campaignSlider}
                  contentContainerStyle={styles.campaignSliderContent}
                />
                {/* Pagination Dots */}
                <View style={styles.paginationDots}>
                  {campaignData.map((_, index) => (
                    <View
                      key={index}
                      style={[
                        styles.dot,
                        index === currentIndex && styles.activeDot
                      ]}
                    />
                  ))}
                </View>
              </View>
            )}
          </View>
          {isBrand ? (
            <>
              <TouchableOpacity
                style={styles.viewButton}
                onPress={() => navigation?.navigate('Campaigns', { insideAppNavigator: true })}
              >
                <Text style={styles.viewButtonText}>View All Campaigns</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.viewButtonSecondary}
                onPress={() => navigation?.navigate('CreatorsList')}
              >
                <Text style={styles.viewButtonTextSecondary}>Browse Creators</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={styles.viewButton}
                onPress={() => navigation?.navigate('ExploreCampaigns', { insideAppNavigator: true })}
              >
                <Text style={styles.viewButtonText}>View All Campaigns</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.viewButtonSecondary}
                onPress={() => navigation?.navigate('ExploreOffers')}
              >
                <Text style={styles.viewButtonTextSecondary}>Explore Offers</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Quick Links Section */}
        <View style={styles.quickLinksSection}>
          <Text style={styles.sectionTitle}>Quick Links</Text>
          <View style={styles.linksContainer}>
            <TouchableOpacity
              style={styles.linkBox}
              onPress={() => navigation?.navigate('ActiveOrders')}
            >
              <View style={styles.linkMaterialIconsContainer}>
                <MaterialIcons name="shopping-basket" size={20} color="#337DEB" />
              </View>
              <Text style={styles.linkText}>My Orders</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.linkBox}
              onPress={() => navigation?.navigate('Wallet')}
            >
              <View style={styles.linkMaterialIconsContainer}>
                <MaterialIcons name="account-balance-wallet" size={20} color="#337DEB" />
              </View>
              <Text style={styles.linkText}>Wallet</Text>
            </TouchableOpacity>
            {isBrand && (
              <TouchableOpacity
                style={styles.linkBox}
                onPress={() => navigation?.navigate('Inbox')}
              >
                <View style={styles.linkMaterialIconsContainer}>
                  <MaterialIcons name="chat-bubble-outline" size={20} color="#337DEB" />
                </View>
                <Text style={styles.linkText}>Messages</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.linkBox}
              onPress={() => navigation?.navigate('HelpSupport')}
            >
              <View style={styles.linkMaterialIconsContainer}>
                <MaterialIcons name="headset" size={20} color="#337DEB" />
              </View>
              <Text style={styles.linkText}>Support</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recent Activity Section - Creator only, from API */}
        {!loading && !isBrand && (
          <View style={styles.activitySection}>
            <View style={styles.activitySectionHeader}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
              {recentActivities.length > 0 && (
                <TouchableOpacity onPress={() => navigation?.navigate('Notifications', { returnScreen: 'Dashboard' })}>
                  <Text style={styles.activityViewAll}>View all</Text>
                </TouchableOpacity>
              )}
            </View>
            {recentActivities.length === 0 ? (
              <View style={styles.emptyActivityContainer}>
                <MaterialIcons name="history" size={48} color="#9ca3af" />
                <Text style={styles.emptyActivityText}>No recent activity</Text>
                <Text style={styles.emptyActivitySubtext}>Your recent activities will appear here</Text>
              </View>
            ) : (
              <View style={styles.activityList}>
                {recentActivities.map((activity) => {
                  const icon = ACTIVITY_ICON_MAP[activity.type] || 'notifications';
                  const data = activity.data || {};
                  return (
                    <TouchableOpacity
                      key={activity._id || activity.id || Math.random()}
                      style={styles.activityItem}
                      onPress={() => {
                        if (data.orderId) {
                          navigation?.navigate('OrderDetails', { orderId: data.orderId });
                        } else if (data.campaignId) {
                          navigation?.navigate('CampaignDetails', { campaignId: data.campaignId });
                        } else {
                          navigation?.navigate('Notifications', { returnScreen: 'Dashboard' });
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.activityIconWrap}>
                        <MaterialIcons name={icon} size={22} color="#337DEB" />
                      </View>
                      <View style={styles.activityContent}>
                        <Text style={styles.activityTitle} numberOfLines={1}>{activity.title || 'Activity'}</Text>
                        {activity.body ? (
                          <Text style={styles.activityBody} numberOfLines={2}>{activity.body}</Text>
                        ) : null}
                        <Text style={styles.activityTime}>{formatActivityTime(activity.createdAt)}</Text>
                      </View>
                      <MaterialIcons name="chevron-right" size={20} color="#9ca3af" />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    paddingTop: 50,
    backgroundColor: '#fff',
  },
  hamburger: {
    padding: 4,
  },
  headerText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2d3748',
  },
  bell: {
    padding: 4,
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#5a67d8',
  },
  welcomeSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 8,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2d3748',
    flex: 1,
  },
  userImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginLeft: 8,
  },
  userImagePlaceholder: {
    backgroundColor: '#337DEB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userImageInitials: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  statBox: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    flex: 0.45,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statLabel: {
    fontSize: 12,
    color: '#718096',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2d3748',
  },
  opportunitiesSection: {
    backgroundColor: '#f0f4ff',
    padding: 16,
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#337DEB',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  sectionSubtitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2d3748',
    marginBottom: 16,
  },
  campaignsContainer: {
    marginBottom: 16,
  },
  campaignSlider: {
    height: 200,
  },
  campaignSliderContent: {
    paddingHorizontal: 8,
  },
  campaignBox: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 12,
    width: width * 0.5,
    marginHorizontal: 8,
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  paginationDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#cbd5e0',
    marginHorizontal: 4,
  },
  activeDot: {
    backgroundColor: '#337DEB',
    width: 12,
    height: 8,
    borderRadius: 4,
  },
  campaignImage: {
    width: '100%',
    height: 100,
    borderRadius: 8,
    marginBottom: 8,
  },
  campaignImagePlaceholder: {
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  campaignTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2d3748',
    marginBottom: 4,
    textAlign: 'left',
  },
  campaignDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    justifyContent: 'flex-start',
  },
  campaignDetail: {
    fontSize: 12,
    color: '#718096',
    marginLeft: 4,
  },
  campaignDetailSmall: {
    fontSize: 11,
    color: '#718096',
    textAlign: 'left',
    lineHeight: 14,
  },
  viewButton: {
    backgroundColor: '#337DEB',
    paddingVertical: 12,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 8,
  },
  viewButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,

  },
  viewButtonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#337DEB',
    paddingVertical: 12,
    borderRadius: 20,
    alignItems: 'center',
  },
  viewButtonTextSecondary: {
    color: '#337DEB',
    fontWeight: 'bold',
    fontSize: 16,
  },
  quickLinksSection: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 20,
  },
  linksContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    gap: 12,
  },
  linkBox: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  linkMaterialIconsContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  linkText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  skeletonBox: {
    backgroundColor: '#e2e8f0',
    borderRadius: 6,
    height: 22,
    width: '60%',
    alignSelf: 'center',
    opacity: 0.7,
  },
  skeletonCard: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 12,
    width: '80%',
  },
  activitySection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    marginBottom: 100,
  },
  activitySectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  activityViewAll: {
    fontSize: 14,
    color: '#337DEB',
    fontWeight: '600',
  },
  activityList: {
    gap: 10,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  activityIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  activityContent: {
    flex: 1,
    minWidth: 0,
  },
  activityTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
  },
  activityBody: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
    lineHeight: 18,
  },
  activityTime: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 6,
  },
  emptyActivityContainer: {
    backgroundColor: '#fff',
    padding: 40,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  emptyActivityText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
  },
  emptyActivitySubtext: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 8,
    textAlign: 'center',
  },
});

export default Dashboard;
