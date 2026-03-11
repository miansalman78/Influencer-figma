import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Image, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaView } from 'react-native-safe-area-context';
import logger from '../utils/logger';
import { useAuth } from '../hooks/useAuth';

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

// Orders list for both Brand and Creator — same API, same timeline/status flow (index level)
const ActiveOrders = ({ navigation, route, insideAppNavigator = false, userRole, canGoBack = false }) => {
  const [activeTab, setActiveTab] = useState('Orders');
  const [filterType, setFilterType] = useState('all');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const insets = useSafeAreaInsets();

  // Logic for Back vs Menu button
  const showBackButton = canGoBack || !insideAppNavigator;

  const { user } = useAuth(); // Hook usage must be inside component
  const rawUserRole = userRole || user?.role || 'Creator'; // Fallback
  const effectiveUserRole = rawUserRole.charAt(0).toUpperCase() + rawUserRole.slice(1).toLowerCase(); // Normalize to 'Brand' or 'Creator'

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const ordersService = await import('../services/orders');

      let response;
      if (filterType === 'all') {
        response = await ordersService.getAllOrders();
      } else {
        response = await ordersService.getAllOrders({ status: filterType });
      }

      if (response && response.data) {
        const ordersData = Array.isArray(response.data)
          ? response.data
          : (response.data.orders || response.data.items || []);
        setOrders(ordersData);
      } else {
        setOrders([]);
      }
    } catch (err) {
      console.error('[ActiveOrders] Error fetching orders:', err);
      setError('Failed to load orders.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    // Add logic to refresh on focus
    const unsubscribe = navigation?.addListener?.('focus', () => {
      fetchOrders();
    });
    return unsubscribe;
  }, [effectiveUserRole, filterType]);


  const getStatusColor = (status) => {
    if (!status) return '#f3f4f6';
    const s = status.toLowerCase();
    if (s === 'in_progress' || s === 'content_creation') return '#dbeafe'; // blue
    if (s === 'completed' || s === 'awaiting_approval') return '#d1fae5'; // green
    if (s === 'cancelled' || s === 'rejected') return '#fee2e2'; // red
    if (s === 'pending') return '#fef3c7'; // yellow
    if (s === 'revisions') return '#e0f2fe'; // light blue
    return '#f3f4f6';
  };

  const calculateProgress = (status) => {
    if (!status) return 0;
    const s = status.toLowerCase();
    if (s === 'pending') return 10;
    if (s === 'in_progress' || s === 'content_creation') return 40;
    if (s === 'revisions') return 70;
    if (s === 'awaiting_approval') return 85;
    if (s === 'completed') return 100;
    if (s === 'cancelled' || s === 'rejected') return 0;
    return 0;
  };

  const mapOrderToUI = (order) => {
    // Determine other party name and avatar based on current user role
    let otherName = 'User';
    let otherAvatar = null;
    let companyName = 'Company';

    if (effectiveUserRole === 'Brand') {
      // Identify Creator
      const creator = order.creatorId || order.creator;
      if (creator) {
        otherName = creator.name || creator.username || 'Creator';
        otherAvatar = creator.profileImage || creator.avatar;
      }
      companyName = order.brandId?.companyName || user?.companyName || 'My Company';
    } else {
      // Identify Brand
      const brand = order.brandId || order.brand;
      if (brand) {
        otherName = brand.name || brand.companyName || 'Brand';
        otherAvatar = brand.profileImage || brand.logo || brand.avatar;
        companyName = brand.companyName || 'Brand Company';
      }
    }

    return {
      id: order._id || order.id,
      _original: order,
      title: order.campaignId?.name || order.campaignId?.title || order.campaign?.name || order.campaign?.title || order.title || 'Order #' + (order._id || order.id).substr(-6),
      company: companyName,
      status: order.status ? (order.status.charAt(0).toUpperCase() + order.status.slice(1).replace('_', ' ')) : 'Unknown',
      statusColor: getStatusColor(order.status),
      progress: (typeof order.progress === 'number' && order.progress > 0) ? order.progress : calculateProgress(order.status),
      dueDate: (order.dueDate || order.timeline?.dueDate)
        ? new Date(order.dueDate || order.timeline?.dueDate).toLocaleDateString(undefined, { dateStyle: 'short' })
        : (order.createdAt ? new Date(order.createdAt).toLocaleDateString(undefined, { dateStyle: 'short' }) + ' (created)' : '—'),
      participants: [
        { name: otherName, avatar: otherAvatar }
      ],
      actionText: order.status === 'completed'
        ? (effectiveUserRole === 'Brand' ? 'Review' : 'View')
        : 'View Details'
    };
  };

  const mappedOrders = orders.map(mapOrderToUI);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: 16 + Math.max(insets.bottom, 0) }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              if (showBackButton) {
                navigation?.goBack();
              } else {
                navigation?.openDrawer?.();
              }
            }}
          >
            <MaterialIcons name={showBackButton ? "arrow-back" : "menu"} size={24} color="#2d3748" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Orders</Text>
          <TouchableOpacity
            style={styles.notificationButton}
            onPress={() => navigation?.navigate('Notifications', { returnScreen: 'ActiveOrders' })}
          >
            <MaterialIcons name="notifications" size={24} color="#2d3748" />
          </TouchableOpacity>
        </View>

        <View style={styles.filterContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
            {['all','pending','in_progress','awaiting_approval','completed'].map(key => (
              <TouchableOpacity
                key={key}
                style={[styles.filterTab, filterType === key && styles.filterTabActive]}
                onPress={() => setFilterType(key)}
              >
                <Text style={[styles.filterText, filterType === key && styles.filterTextActive]}>
                  {key === 'all' ? 'All Orders' :
                   key === 'in_progress' ? 'In Progress' :
                   key === 'awaiting_approval' ? 'Awaiting Approval' :
                   key.charAt(0).toUpperCase() + key.slice(1).replace('_', ' ')}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Loading State */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#337DEB" />
            <Text style={styles.loadingText}>Loading orders...</Text>
          </View>
        )}

        {/* Error State */}
        {error && !loading && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Orders List */}
        {!loading && !error && (
          <View style={styles.ordersContainer}>
            {mappedOrders.length > 0 ? (
              mappedOrders.map((order) => (
                <TouchableOpacity
                  key={order.id}
                  style={styles.orderCard}
                  onPress={() => navigation?.navigate('OrderDetails', { order: order._original || order })}
                  activeOpacity={0.7}
                >
                  {/* Order Title, Company and Status in Same Row */}
                  <View style={styles.orderHeaderRow}>
                    <View style={styles.orderInfo}>
                      <Text style={styles.orderTitle}>{order.title}</Text>
                      <Text style={styles.companyName}>{order.company}</Text>
                    </View>
                    <View style={[styles.statusTag, { backgroundColor: order.statusColor }]}>
                      <Text style={styles.statusText}>{order.status}</Text>
                    </View>
                  </View>

                  {/* Timeline */}
                  <View style={styles.timelineContainer}>
                    <Text style={styles.timelineLabel}>Timeline</Text>
                    <View style={styles.timelineBar}>
                      <View style={[
                        styles.timelineProgress,
                        {
                          width: `${order.progress}%`,
                          backgroundColor: order.progress === 100 ? '#10b981' : '#337DEB'
                        }
                      ]} />
                    </View>
                    <Text style={styles.dueDate}>{order.dueDate}</Text>
                  </View>

                  {/* Participants and Action Button in Same Row */}
                  <View style={styles.participantsActionRow}>
                    <View style={styles.participantsSection}>
                      <Text style={styles.participantsLabel}>Participants</Text>
                      <View style={styles.participantsRow}>
                        <View style={styles.avatarContainer}>
                          {order.participants.map((participant, index) => (
                            <View key={index} style={[styles.avatar, { marginLeft: index > 0 ? -8 : 0 }]}>
                              {participant.avatar && typeof participant.avatar === 'string' && participant.avatar.startsWith('http') ? (
                                <Image source={{ uri: participant.avatar }} style={styles.avatarImage} />
                              ) : (
                                <Text style={styles.avatarText}>
                                  {participant.avatar || participant.name?.charAt(0)?.toUpperCase() || '?'}
                                </Text>
                              )}
                            </View>
                          ))}
                        </View>
                        <Text style={styles.participantsText}>
                          {order.participants.length > 0 ? `You & ${order.participants[0].name}` : 'Participants'}
                        </Text>
                      </View>
                    </View>

                    {(order.status === 'completed' || order.status === 'Completed') ? (
                      (userRole === 'Brand') ? (
                        <TouchableOpacity
                          style={styles.reviewButton}
                          onPress={(e) => {
                            e.stopPropagation();
                            // Merge mapped order with original order data to ensure all fields are available
                            const orderForReview = {
                              ...(order._original || {}),
                              ...order,
                              _original: order._original || order,
                            };
                            navigation?.navigate('LeaveReview', { order: orderForReview });
                          }}
                        >
                          <Text style={styles.reviewButtonText}>Leave Review</Text>
                          <MaterialIcons name="star" size={16} color="#fbbf24" />
                        </TouchableOpacity>
                      ) : null
                    ) : (
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          if (order.actionText === 'Chat') {
                            navigation?.navigate('Messages');
                          } else if (order.actionText === 'Review') {
                            navigation?.navigate('LeaveReview', { order });
                          } else if (order.actionText === 'View Brief' || order.actionText === 'View Details') {
                            // Navigate to OrderDetails with the order data
                            navigation?.navigate('OrderDetails', { order: order._original || order });
                          } else {
                            // Fallback to OrderDetails
                            navigation?.navigate('OrderDetails', { order: order._original || order });
                          }
                        }}
                      >
                        <Text style={styles.actionButtonText}>{order.actionText}</Text>
                        <MaterialIcons name="arrow-forward" size={16} color="#337DEB" />
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              ))
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>{filterType === 'all' ? 'No orders' : 'No orders in this filter'}</Text>
                <Text style={styles.emptySubtext}>Your orders will appear here</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Internal Bottom Tab Navigation removed */}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  scrollView: {
    flex: 1,
    paddingBottom: 80, // Add padding to prevent content from being hidden behind tabs
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
  filterContainer: {
    paddingHorizontal: 20,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  filterScroll: {
    flexDirection: 'row',
  },
  filterTab: {
    paddingVertical: 12,
    marginRight: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  filterTabActive: {
    borderBottomColor: '#337DEB',
  },
  filterText: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#337DEB',
    fontWeight: '600',
  },
  ordersContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  orderCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  orderHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  orderInfo: {
    flex: 1,
    marginRight: 12,
  },
  orderTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2d3748',
    marginBottom: 4,
  },
  companyName: {
    fontSize: 14,
    color: '#6b7280',
  },
  statusTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    minWidth: 90,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#2d3748',
    textAlign: 'center',
  },
  timelineContainer: {
    marginBottom: 16,
  },
  timelineLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: 8,
  },
  timelineBar: {
    height: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 3,
    marginBottom: 8,
  },
  timelineProgress: {
    height: '100%',
    backgroundColor: '#337DEB',
    borderRadius: 3,
  },
  dueDate: {
    fontSize: 14,
    color: '#2d3748',
    textAlign: 'right',
  },
  participantsActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  participantsSection: {
    flex: 1,
    marginRight: 20,
  },
  participantsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: 8,
  },
  participantsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    flexDirection: 'row',
    marginRight: 12,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  avatarText: {
    fontSize: 16,
  },
  participantsText: {
    fontSize: 14,
    color: '#2d3748',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#dbeafe',
    minWidth: 60,
  },
  actionButtonText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#337DEB',
    marginRight: 4,
  },
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d1fae5',
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#10b981',
    minWidth: 100,
  },
  completeButtonText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#10b981',
    marginRight: 4,
  },
  reviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fef3c7',
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#fbbf24',
    minWidth: 100,
  },
  reviewButtonText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#f59e0b',
    marginRight: 4,
  },
  navTextActive: {
    color: '#337DEB',
    fontWeight: '600',
  },
});

export default ActiveOrders;
