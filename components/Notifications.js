import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Dimensions, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../hooks/useAuth";
import * as NotificationsService from "../services/notifications";
import { useUIStore } from "../store/useStore";

const { width, height } = Dimensions.get("window");

// Import Ionicons - handle both ES6 and CommonJS
let Ionicons;
try {
  const IoniconsModule = require('react-native-vector-icons/Ionicons');
  Ionicons = IoniconsModule.default || IoniconsModule;
  if (typeof Ionicons !== 'function') {
    Ionicons = ({ name, size, color, style }) => (
      <Text style={[{ fontSize: size || 20, color: color || '#000' }, style]}>?</Text>
    );
  }
} catch (error) {
  Ionicons = ({ name, size, color, style }) => (
    <Text style={[{ fontSize: size || 20, color: color || '#000' }, style]}>?</Text>
  );
}

const TYPE_ICON_COLOR = {
  proposal_submitted: { icon: 'document-text', color: '#337DEB' },
  proposal_accepted: { icon: 'checkmark-circle', color: '#10B981' },
  proposal_rejected: { icon: 'close-circle', color: '#EF4444' },
  order_created: { icon: 'receipt', color: '#3B82F6' },
  order_paid: { icon: 'wallet', color: '#F59E0B' },
  order_completed: { icon: 'checkmark-done', color: '#10B981' },
  order_deliverables_submitted: { icon: 'cloud-upload', color: '#8B5CF6' },
  message_new: { icon: 'chatbubble-ellipses', color: '#337DEB' },
  payment_received: { icon: 'wallet', color: '#10B981' },
  payment_released: { icon: 'cash', color: '#F59E0B' },
  campaign_new_applicant: { icon: 'people', color: '#3B82F6' },
  campaign_deadline_reminder: { icon: 'time', color: '#EF4444' },
  review_received: { icon: 'star', color: '#8B5CF6' },
  offer_purchased: { icon: 'cart', color: '#10B981' },
  offer_sent: { icon: 'send', color: '#3B82F6' },
  brand_connected: { icon: 'person-add', color: '#10B981' },
  campaign_new_from_connection: { icon: 'campaign', color: '#3B82F6' },
  offer_new_from_connection: { icon: 'local-offer', color: '#10B981' },
  general: { icon: 'notifications', color: '#6B7280' },
};

function formatTimeAgo(date) {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  const sec = Math.floor((now - d) / 1000);
  if (sec < 60) return 'Just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  if (sec < 2592000) return `${Math.floor(sec / 604800)}w ago`;
  return d.toLocaleDateString();
}

// Map returnScreen (from drawer/other) to AppNavigator tab and role-aware back
const getReturnNav = (returnScreen, roleParam) => {
  if (!returnScreen) return { screen: 'AppNavigator', params: { role: roleParam, initialTab: 'Home' } };
  const m = {
    ActiveOrders: { screen: 'AppNavigator', params: { role: roleParam, initialTab: 'Orders' } },
    Inbox: { screen: 'AppNavigator', params: { role: roleParam, initialTab: 'Messages' } },
    CreateOffer: { screen: 'CreateOffer', params: {} },
    DashboardNew: { screen: 'AppNavigator', params: { role: roleParam, initialTab: 'Home' } },
    Dashboard: { screen: 'AppNavigator', params: { role: roleParam, initialTab: 'Home' } },
    Campaigns: { screen: 'AppNavigator', params: { role: roleParam, initialTab: 'Campaigns' } },
    ExploreCampaigns: { screen: 'AppNavigator', params: { role: roleParam, initialTab: 'ExploreCampaigns' } },
    Proposals: { screen: 'AppNavigator', params: { role: roleParam, initialTab: 'Proposals' } },
    MyProposals: { screen: 'AppNavigator', params: { role: roleParam, initialTab: 'MyProposals' } },
    ExploreOffers: { screen: 'AppNavigator', params: { role: roleParam, initialTab: 'Offers' } },
  };
  return m[returnScreen] || { screen: 'AppNavigator', params: { role: roleParam, initialTab: 'Home' } };
};

const Notifications = ({ navigation, route }) => {
  const { user } = useAuth();
  const ui = (useUIStore && typeof useUIStore === 'function') ? useUIStore() : { showToast: () => {} };
  const showToast = ui.showToast || (() => {});
  const userRole = user?.role?.toLowerCase() || route?.params?.role?.toLowerCase() || 'creator';
  const isBrand = userRole === 'brand';
  const isCreator = userRole === 'creator' || userRole === 'influencer';
  const roleParam = (user?.role && typeof user.role === 'string')
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
    : (isBrand ? 'Brand' : 'Creator');
  const returnScreen = route?.params?.returnScreen || navigation?.getParam?.('returnScreen');

  const [activeFilter, setActiveFilter] = useState("All");
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  // Removed test push button per request

  const fetchNotifications = useCallback(async (options = {}) => {
    const readFilter = activeFilter === "Unread" ? false : undefined;
    try {
      const res = await NotificationsService.getNotifications({
        page: 1,
        limit: 50,
        read: readFilter,
      });
      const data = res?.data ?? res;
      const list = data?.notifications ?? data ?? [];
      setNotifications(Array.isArray(list) ? list : []);
      setError(null);
    } catch (e) {
      setError(e?.message || 'Failed to load notifications');
      setNotifications([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFilter]);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await NotificationsService.getUnreadCount();
      const data = res?.data ?? res;
      setUnreadCount(data?.count ?? 0);
    } catch (_) {
      setUnreadCount(0);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount, notifications.length]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchNotifications(), fetchUnreadCount()]);
    setRefreshing(false);
  }, [fetchNotifications, fetchUnreadCount]);

  // Removed handleSendTestPush

  const filters = ["All", "Unread"];

  const filteredNotifications = activeFilter === "Unread"
    ? notifications
    : notifications;

  const mapItem = (n) => {
    const { icon, color } = TYPE_ICON_COLOR[n.type] || TYPE_ICON_COLOR.general;
    return {
      id: n._id || n.id,
      type: n.type,
      title: n.title || 'Notification',
      description: n.body || '',
      timestamp: formatTimeAgo(n.createdAt),
      isRead: !!n.read,
      icon,
      color,
      data: n.data || {},
    };
  };

  const handleNotificationPress = async (notification) => {
    const id = notification.id;
    try {
      await NotificationsService.markAsRead(id);
      setNotifications(prev => prev.map(n => (n._id || n.id) === id ? { ...n, read: true } : n));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch (_) { }
    const data = notification.data || {};
    const baseParams = { role: roleParam, returnScreen: 'Notifications' };
    if (notification.type === 'message_new' && data.conversationId && navigation?.navigate) {
      navigation.navigate('Chat', {
        conversation: {
          id: data.conversationId,
          name: 'Chat',
          subtitle: 'Conversation',
          avatar: ''
        }
      });
      return;
    }
    if (data.orderId && navigation?.navigate) {
      navigation.navigate('OrderDetails', { orderId: data.orderId, ...baseParams, preservedTab: 'Orders' });
      return;
    }
    if (data.campaignId && navigation?.navigate) {
      navigation.navigate('CampaignDetails', { campaignId: data.campaignId, ...baseParams, preservedTab: isBrand ? 'Campaigns' : 'ExploreCampaigns' });
      return;
    }
    if (data.proposalId && navigation?.navigate) {
      // Navigate to ProposalDetails; merge params so AppNavigator receives them. ProposalDetails can fetch by ID.
      navigation.navigate('ProposalDetails', {
        proposal: { _id: data.proposalId, id: data.proposalId },
        proposalId: data.proposalId,
        campaign: data.campaignId ? { _id: data.campaignId, id: data.campaignId } : null,
        isMyProposal: !isBrand,
        ...baseParams,
      });
      return;
    }
    if (notification.type === 'brand_connected' && navigation?.navigate) {
      navigation.navigate('AppNavigator', { initialTab: 'Messages', role: roleParam, returnScreen: 'Notifications', preservedTab: 'Messages' });
      return;
    }
    if (notification.type === 'campaign_new_from_connection' && data.campaignId && navigation?.navigate) {
      navigation.navigate('CampaignDetails', { campaignId: data.campaignId, ...baseParams, preservedTab: 'ExploreCampaigns' });
      return;
    }
    if ((notification.type === 'payment_received' || notification.type === 'payment_released') && navigation?.navigate) {
      navigation.navigate('Wallet', { ...baseParams });
      return;
    }
    if ((notification.type === 'offer_sent' || data.offerId) && navigation?.navigate) {
      navigation.navigate('OfferDetails', { offerId: data.offerId, ...baseParams, preservedTab: isBrand ? 'Offers' : 'ExploreOffers' });
    }
  };

  const handleMarkAsRead = async (id) => {
    try {
      await NotificationsService.markAsRead(id);
      setNotifications(prev => prev.map(n => (n._id || n.id) === id ? { ...n, read: true } : n));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch (_) { }
  };

  const handleClearAll = async () => {
    try {
      await NotificationsService.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
      fetchNotifications();
    } catch (e) {
      showToast(e?.message || 'Failed to mark all as read', 'error');
    }
  };

  const displayList = (activeFilter === "Unread"
    ? filteredNotifications.filter((n) => !n.read)
    : filteredNotifications
  ).map(mapItem);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {
          if (returnScreen) {
            const { screen, params } = getReturnNav(returnScreen, roleParam);
            navigation?.navigate(screen, { ...params });
          } else if (navigation?.canGoBack?.()) {
            navigation.goBack();
          } else {
            navigation?.navigate('AppNavigator', { role: roleParam, initialTab: 'Home' });
          }
        }}>
          <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.headerActions}>
          {/* Test push button removed */}
          <TouchableOpacity onPress={handleRefresh} style={styles.headerIcon} disabled={refreshing}>
            <Ionicons name="refresh" size={24} color="#1a1a1a" />
          </TouchableOpacity>
          {unreadCount > 0 && (
            <TouchableOpacity onPress={handleClearAll} style={[styles.headerIcon, { marginLeft: 12 }]}>
              <Ionicons name="checkmark-done" size={24} color="#337DEB" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersContainer}
        contentContainerStyle={styles.filtersContent}
      >
        {filters.map((filter) => {
          const count = filter === "All" ? notifications.length : unreadCount;
          return (
            <TouchableOpacity
              key={filter}
              style={[
                styles.filterButton,
                activeFilter === filter && styles.filterButtonActive
              ]}
              onPress={() => setActiveFilter(filter)}
            >
              <Text
                style={[
                  styles.filterText,
                  activeFilter === filter && styles.filterTextActive
                ]}
              >
                {filter}
              </Text>
              {count > 0 && (
                <View style={[
                  styles.filterBadge,
                  activeFilter === filter && styles.filterBadgeActive
                ]}>
                  <Text style={[
                    styles.filterBadgeText,
                    activeFilter === filter && styles.filterBadgeTextActive
                  ]}>
                    {count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Loading / Error / List */}
      {loading ? (
        <View style={[styles.emptyContainer, { paddingTop: 80 }]}>
          <ActivityIndicator size="large" color="#337DEB" />
          <Text style={[styles.emptyText, { marginTop: 16 }]}>Loading notifications…</Text>
        </View>
      ) : error ? (
        <View style={[styles.emptyContainer, { paddingTop: 80 }]}>
          <Ionicons name="alert-circle-outline" size={64} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>Couldn't load notifications</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity style={[styles.filterButton, { marginTop: 16 }]} onPress={handleRefresh}>
            <Text style={styles.filterText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : displayList.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="notifications-off-outline" size={80} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>No notifications yet</Text>
          <Text style={styles.emptyText}>
            {isBrand
              ? "When creators apply or message you, updates will show here."
              : isCreator
                ? "When brands accept your proposals, pay you, or message you, they'll show up here."
                : "When you get messages, campaign updates, or payments, they'll show up here."}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.notificationsList}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={["#337DEB"]} />
          }
        >
          {displayList.map((notification) => (
            <TouchableOpacity
              key={notification.id}
              style={[
                styles.notificationItem,
                !notification.isRead && styles.notificationItemUnread
              ]}
              onPress={() => handleNotificationPress(notification)}
              activeOpacity={0.7}
            >
              <View style={styles.notificationContent}>
                <View style={[styles.iconContainer, { backgroundColor: `${notification.color}15` }]}>
                  <Ionicons
                    name={notification.icon}
                    size={24}
                    color={notification.color}
                  />
                </View>
                <View style={styles.notificationTextContainer}>
                  <View style={styles.notificationHeader}>
                    <Text style={[
                      styles.notificationTitle,
                      !notification.isRead && styles.notificationTitleUnread
                    ]}>
                      {notification.title}
                    </Text>
                    {!notification.isRead && (
                      <View style={styles.unreadDot} />
                    )}
                  </View>
                  <Text style={styles.notificationDescription} numberOfLines={2}>
                    {notification.description}
                  </Text>
                  <Text style={styles.timestamp}>
                    {notification.timestamp}
                  </Text>
                </View>
              </View>
              <View style={styles.notificationActions}>
                {!notification.isRead && (
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      handleMarkAsRead(notification.id);
                    }}
                    style={styles.actionButton}
                  >
                    <Ionicons name="checkmark" size={20} color="#337DEB" />
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

export default Notifications;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  headerActions: {
    flexDirection: "row",
  },
  headerIcon: {
    padding: 4,
  },
  filtersContainer: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    maxHeight: height * 0.13,
  },
  filtersContent: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    alignItems: "center",
    minHeight: 48,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    marginRight: 6,
    height: 32,
  },
  filterButtonActive: {
    backgroundColor: "#337DEB",
    shadowColor: "#337DEB",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  filterText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    letterSpacing: 0.2,
  },
  filterTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  filterBadge: {
    marginLeft: 6,
    backgroundColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  filterBadgeActive: {
    backgroundColor: "#FFFFFF",
    opacity: 0.3,
  },
  filterBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#6B7280",
    lineHeight: 12,
  },
  filterBadgeTextActive: {
    color: "#FFFFFF",
    opacity: 1,
  },
  notificationsList: {
    flex: 1,
  },
  notificationItem: {
    backgroundColor: "#fff",
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  notificationItemUnread: {
    backgroundColor: "#F0F7FF",
    borderLeftWidth: 3,
    borderLeftColor: "#337DEB",
  },
  notificationContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  notificationTextContainer: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1F2937",
    flex: 1,
  },
  notificationTitleUnread: {
    fontWeight: "700",
    color: "#1a1a1a",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#337DEB",
    marginLeft: 8,
  },
  notificationDescription: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
    marginBottom: 6,
  },
  timestamp: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  notificationActions: {
    flexDirection: "row",
    marginLeft: 12,
  },
  actionButton: {
    padding: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
    marginTop: 20,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
  },
});

