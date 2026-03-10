import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, Animated, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useAuth from '../hooks/useAuth';
import { getApiBaseUrl } from '../services/api';

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

const { width } = Dimensions.get('window');
const DRAWER_WIDTH = width * 0.85;

// Helper function to get initials from name
const getInitials = (name) => {
  if (!name) return 'U';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

// Helper to resolve image and media URLs
const resolveImageUrl = (url) => {
  if (!url) return null;
  if (typeof url !== 'string') return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('file://') || url.startsWith('content://') || url.startsWith('data:')) return url;

  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const apiBase = (typeof getApiBaseUrl === 'function' ? getApiBaseUrl() : 'https://adpartnr.onrender.com/api').replace(/\/api$/, '');
  return `${apiBase}/${cleanPath}`;
};

const Drawer = ({ isOpen, onClose, navigation, userRole = 'Creator', currentScreen = 'Dashboard' }) => {
  const { signOut, user } = useAuth();
  const slideAnim = React.useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  // User profile data
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch user profile data
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        setLoading(true);
        const userService = await import('../services/user');
        const response = await userService.getMyProfile();

        if (response && response.data) {
          setUserProfile(response.data);
        } else if (!response || !response.data) {
          try {
            const apiClient = await import('../services/apiClient');
            const localUser = await apiClient.getUser();
            if (localUser) setUserProfile(localUser);
          } catch (_) { /* ignore */ }
        }
      } catch (error) {
        console.error('Failed to fetch user profile in drawer:', error);
        try {
          const apiClient = await import('../services/apiClient');
          const localUser = await apiClient.getUser();
          if (localUser) setUserProfile(localUser);
        } catch (_) { /* ignore */ }
      } finally {
        setLoading(false);
      }
    };

    if (isOpen) {
      fetchUserProfile();
    }
  }, [isOpen]);

  React.useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isOpen ? 0 : -DRAWER_WIDTH,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isOpen]);

  const handleMenuItemPress = (screen) => {
    onClose();
    setTimeout(() => {
      // Pass userRole when navigating to Settings or EditProfile
      // Also pass returnScreen so we can navigate back to the screen that opened the drawer
      if (screen === 'Settings' || screen === 'EditProfile') {
        navigation?.navigate(screen, { role: userRole, returnScreen: currentScreen });
      } else if (screen === 'Reviews') {
        navigation?.navigate(screen, { role: userRole, returnScreen: currentScreen });
      } else if (screen === 'Notifications') {
        navigation?.navigate(screen, { role: userRole, returnScreen: currentScreen });
      } else {
        navigation?.navigate(screen, { returnScreen: currentScreen });
      }
    }, 300);
  };


  const handleLogout = async () => {
    try {
      onClose();
      console.log('[Drawer] Logging out...');
      await signOut();
      navigation?.reset('ChooseRole');
    } catch (error) {
      console.error('[Drawer] Logout error:', error);
      alert('Error logging out. Please try again.');
    }
  };

  const isBrand = (userRole || '').toLowerCase() === 'brand';
  const menuItems = [
    ...(!isBrand ? [{
      id: 'wallet',
      title: 'Wallet',
      icon: 'account-balance-wallet',
      screen: 'Wallet',
    }] : []),
    {
      id: 'settings',
      title: 'Settings',
      icon: 'settings',
      screen: 'Settings',
    },
    {
      id: 'help',
      title: 'Help & Support',
      icon: 'help-outline',
      screen: 'HelpSupport',
    },
    {
      id: 'reviews',
      title: 'Reviews',
      icon: 'star-outline',
      screen: 'Reviews',
    },
    {
      id: 'legal',
      title: 'Legal / Info',
      icon: 'info-outline',
      screen: 'LegalInfo',
    },
  ];

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />

      {/* Drawer */}
      <Animated.View
        style={[
          styles.drawer,
          {
            transform: [{ translateX: slideAnim }],
          },
        ]}
      >
        <SafeAreaView style={styles.drawerContent}>
          <ScrollView
            style={styles.drawerScrollView}
            contentContainerStyle={styles.drawerScrollContent}
            showsVerticalScrollIndicator={true}
            bounces={true}
          >
            {/* User Info Card */}
            <View style={styles.userCard}>
              {resolveImageUrl(userProfile?.profileImage || userProfile?.avatar) ? (
                <Image
                  source={{
                    uri: resolveImageUrl(userProfile.profileImage || userProfile.avatar)
                  }}
                  style={styles.userImage}
                />
              ) : (
                <View style={[styles.userImage, styles.userImagePlaceholder]}>
                  <Text style={styles.userImageInitials}>
                    {getInitials(userProfile?.name || 'User')}
                  </Text>
                </View>
              )}
              <Text style={styles.userName}>
                {loading ? 'Loading...' : (userProfile?.name || user?.name || 'User')}
              </Text>
              <View style={styles.roleBadge}>
                {userProfile?.verified && (
                  <MaterialIcons name="verified" size={16} color="#10B981" />
                )}
                <Text style={styles.roleText}>
                  {userRole || (userProfile?.role === 'brand' ? 'Brand' : 'Creator')}
                </Text>
              </View>


              <View style={styles.userActions}>
                <TouchableOpacity
                  style={styles.userActionButton}
                  onPress={() => handleMenuItemPress('Profile')}
                >
                  <MaterialIcons name="person" size={18} color="#337DEB" />
                  <Text style={styles.userActionText}>View Profile</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Menu Items */}
            <View style={styles.menuSection}>
              {menuItems.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.menuItem}
                  onPress={() => handleMenuItemPress(item.screen)}
                  activeOpacity={0.7}
                >
                  <View style={styles.menuItemLeft}>
                    <View style={styles.menuIconContainer}>
                      <MaterialIcons name={item.icon} size={24} color="#337DEB" />
                    </View>
                    <Text style={styles.menuItemText}>{item.title}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={24} color="#CBD5E0" />
                </TouchableOpacity>
              ))}

              {/* Logout Button - Moved to Menu Section */}
              <TouchableOpacity
                style={[styles.menuItem, styles.logoutMenuItem]}
                onPress={handleLogout}
                activeOpacity={0.7}
              >
                <View style={styles.menuItemLeft}>
                  <View style={[styles.menuIconContainer, styles.logoutIconContainer]}>
                    <MaterialIcons name="logout" size={24} color="#EF4444" />
                  </View>
                  <Text style={[styles.menuItemText, styles.logoutText]}>Logout</Text>
                </View>
                <MaterialIcons name="chevron-right" size={24} color="#CBD5E0" />
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Animated.View>
    </>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 998,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: '#FFFFFF',
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
  },
  drawerContent: {
    flex: 1,
  },
  drawerScrollView: {
    flex: 1,
  },
  drawerScrollContent: {
    paddingBottom: 40,
    flexGrow: 1,
  },
  userCard: {
    backgroundColor: '#F0F4FF',
    padding: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  userImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  userImagePlaceholder: {
    backgroundColor: '#337DEB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userImageInitials: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: 'bold',
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 8,
  },
  roleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginLeft: 6,
  },
  userTagline: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 16,
  },
  userActions: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  userActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 6,
  },
  userActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#337DEB',
  },
  menuSection: {
    paddingVertical: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F4FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
  },
  logoutMenuItem: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 16,
  },
  logoutIconContainer: {
    backgroundColor: '#FEE2E2',
  },
  logoutText: {
    color: '#EF4444',
  },
});

export default Drawer;
