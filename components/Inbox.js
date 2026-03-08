import React, { useState, useEffect, useContext, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthContext } from '../context/AuthContext';
import { subscribeToConversations, markConversationAsRead } from '../services/chat';

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

const Inbox = ({ navigation, insideAppNavigator = false }) => {
  const [searchText, setSearchText] = useState('');
  const [activeTab, setActiveTab] = useState('Messages'); // Track active tab for bottom navigation
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const loadingTimeoutRef = useRef(null);

  const { user } = useContext(AuthContext);

  // Get IDs from user object safely
  const userId = user?._id || user?.id;
  const userRole = user?.role?.toLowerCase() || 'creator';

  useEffect(() => {
    if (!userId) {
      setLoading(false); // No user yet - show empty state, not perpetual spinner
      return;
    }

    // Fallback: stop loader after 2s if Firestore never fires (e.g. no conversations, permission, or slow)
    loadingTimeoutRef.current = setTimeout(() => {
      setLoading(false);
    }, 2000);

    const unsubscribe = subscribeToConversations(
      userId,
      userRole,
      (newConversations) => {
        // Stop loader as soon as we get first snapshot (even if empty)
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current);
          loadingTimeoutRef.current = null;
        }
        setLoading(false);
        // Transform conversations for UI - always show the other user (at least "Creator" / "Brand")
        const formattedConversations = (newConversations || []).map(conv => {
          const isBrand = userRole === 'brand';
          const rawName = isBrand ? conv.influencerName : conv.brandName;
          const otherName = (rawName && String(rawName).trim()) ? rawName : (isBrand ? 'Creator' : 'Brand');
          const otherAvatar = isBrand ? conv.influencerAvatar : conv.brandAvatar;
          const myUnreadCount = isBrand ? (conv.unreadCount?.brand || 0) : (conv.unreadCount?.influencer || 0);

          return {
            id: conv.id,
            name: otherName,
            subtitle: isBrand ? 'Creator' : 'Brand',
            avatar: otherAvatar || (isBrand ? '👩‍🎤' : '🏢'),
            lastMessage: conv.lastMessage || 'No messages yet',
            timestamp: getTimeAgo(conv.lastMessageTime),
            unreadCount: myUnreadCount,
            isUnread: myUnreadCount > 0,
            originalData: conv
          };
        });

        setConversations(formattedConversations);
      },
      (err) => {
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current);
          loadingTimeoutRef.current = null;
        }
        setConversations([]);
        setLoading(false);
      }
    );

    return () => {
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      unsubscribe();
    };
  }, [userId, userRole]);

  // Helper to format time
  const getTimeAgo = (date) => {
    if (!date) return '';
    const now = new Date();
    const msgDate = date instanceof Date ? date : new Date(date);
    const diffInSeconds = Math.floor((now - msgDate) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return msgDate.toLocaleDateString();
  };

  const filteredConversations = conversations.filter(conv => {
    if (!searchText) return true;
    const searchLower = searchText.toLowerCase();
    return conv.name.toLowerCase().includes(searchLower) ||
      conv.lastMessage.toLowerCase().includes(searchLower);
  });

  const handleConversationPress = async (conversation) => {
    // Mark as read locally first (optional, for immediate feedback)
    // Actual update happens in background

    // Pass the correctly structured conversation object expected by Messages.js
    // We construct it from the transformed UI data + original IDs
    const navConversation = {
      id: conversation.id,
      name: conversation.name,
      avatar: conversation.avatar,
      subtitle: conversation.subtitle
      // Add IDs if needed by Messages.js (referencing originalData)
    };

    navigation?.navigate('Chat', { conversation: navConversation });

    // Mark as read in Firestore (conversationId, userRole)
    if (conversation.isUnread) {
      await markConversationAsRead(conversation.id, userRole);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.drawerButton}
          onPress={() => navigation?.openDrawer?.()}
        >
          <MaterialIcons name="menu" size={24} color="#2d3748" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Messages</Text>
        <TouchableOpacity
          style={styles.notificationButton}
          onPress={() => navigation?.navigate('Notifications', { returnScreen: 'Inbox' })}
        >
          <MaterialIcons name="notifications" size={24} color="#2d3748" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={20} color="#9E9E9E" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search brand or creator..."
            placeholderTextColor="#9E9E9E"
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>
      </View>

      {/* Conversation List */}
      {loading ? (
        <ActivityIndicator size="large" color="#337DEB" style={{ marginTop: 20 }} />
      ) : filteredConversations.length > 0 ? (
        <ScrollView style={[styles.conversationList, styles.scrollView]} showsVerticalScrollIndicator={false}>
          {filteredConversations.map((conversation, index) => (
            <TouchableOpacity
              key={conversation.id}
              style={styles.conversationItem}
              onPress={() => handleConversationPress(conversation)}
              activeOpacity={0.7}
            >
              {/* Avatar */}
              <View style={styles.avatarContainer}>
                {conversation.avatar && conversation.avatar.length > 5 && (conversation.avatar.startsWith('http') || conversation.avatar.startsWith('file')) ? (
                  <Image source={{ uri: conversation.avatar }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarText}>
                    {((conversation.name && conversation.name.substring(0, 1)) || (conversation.subtitle === 'Creator' ? 'C' : 'B')).toUpperCase()}
                  </Text>
                )}
              </View>

              {/* Content */}
              <View style={styles.conversationContent}>
                <View style={styles.nameRow}>
                  <View style={styles.nameContainer}>
                    <Text style={styles.conversationName} numberOfLines={1}>
                      {conversation.name}
                    </Text>
                    {conversation.subtitle && (
                      <Text style={styles.subtitle} numberOfLines={1}>
                        {conversation.subtitle}
                      </Text>
                    )}
                  </View>
                  <View style={styles.rightSection}>
                    <Text style={styles.timestamp}>{conversation.timestamp}</Text>
                    {conversation.isUnread && conversation.unreadCount > 0 && (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>{conversation.unreadCount}</Text>
                      </View>
                    )}
                    {conversation.isUnread && conversation.unreadCount === 0 && (
                      <View style={styles.unreadDot} />
                    )}
                  </View>
                </View>
                <Text style={[
                  styles.lastMessage,
                  conversation.isUnread && { color: '#2d3748', fontWeight: '500' }
                ]} numberOfLines={1}>
                  {conversation.lastMessage}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        /* Empty State - clear and visible when no conversations */
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateIcon}>💬</Text>
          <Text style={styles.emptyStateTitle}>No messages yet</Text>
          <Text style={styles.emptyStateSubtitle}>Your conversations will appear here</Text>
          <Text style={styles.emptyStateText}>
            Start by sending a proposal or accepting an offer. When a brand or creator replies, the chat will show up in this list.
          </Text>
        </View>
      )}

      {/* Internal Bottom Tab Navigation removed */}
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
  drawerButton: {
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
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F6F6F6',
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#2d3748',
    marginLeft: 12,
  },
  conversationList: {
    flex: 1,
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EDEDED',
  },
  avatarContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 24,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 25,
  },
  conversationContent: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  nameContainer: {
    flex: 1,
    marginRight: 8,
  },
  conversationName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2d3748',
  },
  subtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  rightSection: {
    alignItems: 'flex-end',
  },
  timestamp: {
    fontSize: 12,
    color: '#9E9E9E',
    marginBottom: 4,
  },
  unreadBadge: {
    backgroundColor: '#337DEB',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#337DEB',
  },
  lastMessage: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
    minHeight: 280,
  },
  emptyStateIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2d3748',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    fontSize: 15,
    color: '#6b7280',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  navTextActive: {
    color: '#337DEB',
    fontWeight: '600',
  },
});

export default Inbox;

