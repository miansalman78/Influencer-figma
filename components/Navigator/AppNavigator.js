import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Dashboard from '../Dashboard';
import DashboardNew from '../DashboardNew';
import ExploreOffers from '../ExploreOffers';
import Messages from '../Messages';
import Inbox from '../Inbox';
import ActiveOrders from '../ActiveOrders';
import CreatorProfile from '../CreatorProfile';
import BrandProfile from '../BrandProfile';
import Campaigns from '../Campaigns';
import ExploreCampaigns from '../ExploreCampaigns';
import Proposals from '../Proposals';
import MyProposals from '../MyProposals';
import CampaignDetails from '../CampaignDetails';
import SubmitProposal from '../SubmitProposal';
import CreateCampaign from '../CreateCampaign';
import ProposalDetails from '../ProposalDetails';
import OrderDetails from '../OrderDetails';
import OfferDetails from '../OfferDetails';
import Wallet from '../Wallet';
import PaymentMethodsScreen from '../PaymentMethodsScreen';
import Drawer from '../Drawer';
import CreateOffer from '../CreateOffer';
import EditOffer from '../EditOffer';

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

const AppNavigator = ({ navigation, route, onTabChange, onUpdateParams }) => {
  const insets = useSafeAreaInsets();
  // Get initial tab from route params or default to 'Home'
  const initialTab = route?.params?.initialTab || navigation?.getParam?.('initialTab') || 'Home';
  const [activeTab, setActiveTab] = useState(route?.params?.initialTab || 'Home');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [userRole, setUserRole] = useState(route?.params?.role || 'Creator');
  const [internalHistory, setInternalHistory] = useState([]);
  const [screenParams, setScreenParams] = useState(route?.params || {});
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const unreadUnsubRef = useRef(null);

  // Single unread-count subscription; cleanup calls ref so previous listener is removed when effect re-runs
  useEffect(() => {
    const userData = screenParams?.user || route?.params?.user;
    const userId = userData?._id || userData?.id;
    const role = userData?.role || route?.params?.role || userRole;

    if (!userId || !role) return;

    let cancelled = false;
    if (unreadUnsubRef.current) {
      unreadUnsubRef.current();
      unreadUnsubRef.current = null;
    }
    import('../../services/chat').then(({ subscribeToTotalUnreadCount }) => {
      if (cancelled) return;
      unreadUnsubRef.current = subscribeToTotalUnreadCount(userId, role, (count) => {
        if (!cancelled) setUnreadChatCount(count);
      });
    }).catch(err => console.error('Failed to subscribe to unread count:', err));

    return () => {
      cancelled = true;
      if (unreadUnsubRef.current) {
        unreadUnsubRef.current();
        unreadUnsubRef.current = null;
      }
    };
  }, [screenParams?.user, route?.params?.user, userRole, route?.params?.role]);

  // Sync internal params with parent to persist state across unmounts
  useEffect(() => {
    if (onUpdateParams) {
      onUpdateParams(screenParams);
    }
  }, [screenParams, onUpdateParams]);

  // Update activeTab when route params change (when returning from another screen)
  useEffect(() => {
    const newInitialTab = route?.params?.initialTab;
    if (newInitialTab !== undefined && newInitialTab !== activeTab) {
      setActiveTab(newInitialTab);
    }
  }, [route?.params?.initialTab, activeTab]);

  // Restore internal history when returning from Checkout (only when empty after remount)
  useEffect(() => {
    const preserved = route?.params?.preservedInternalHistory;
    if (Array.isArray(preserved) && preserved.length > 0) {
      setInternalHistory(prev => (prev.length === 0 ? preserved : prev));
    }
  }, [route?.params?.preservedInternalHistory]);

  useEffect(() => {
    const preservedTab = route?.params?.preservedTab;
    if (preservedTab === 'Profile') {
      setScreenParams(prev => {
        if (prev?.userId) {
          const next = { ...prev };
          delete next.userId;
          return next;
        }
        return prev;
      });
    }
  }, [route?.params?.preservedTab]);
  useEffect(() => {
    const incomingRole = route?.params?.role || navigation?.getParam?.('role');
    if (incomingRole) {
      const normalizedRole = incomingRole.charAt(0).toUpperCase() + incomingRole.slice(1);
      console.log('AppNavigator - Setting userRole to:', normalizedRole);
      setUserRole(normalizedRole);
    }
  }, [route?.params?.role, navigation]);

  const handleTabPress = (tabName) => {
    // When clicking main tabs, we usually want to clear internal sub-screen history
    setInternalHistory([]);
    setActiveTab(tabName);
    // When tapping Profile tab, clear userId so we show own profile (BrandProfile for brand, CreatorProfile for creator)
    if (tabName === 'Profile') {
      setScreenParams(prev => {
        const next = { ...prev };
        delete next.userId;
        return next;
      });
    }
    // Notify parent component of tab change to preserve state
    if (onTabChange) {
      onTabChange(tabName);
    }
  };

  // Create enhanced navigation that includes tab switching and drawer control
  const enhancedNavigation = {
    ...navigation,
    navigate: (screen, params) => {
      // Screens that are part of the shell (Tabs and Sub-screens)
      const shellScreens = [
        'Home', 'Dashboard', 'DashboardNew',
        'Campaigns', 'ExploreCampaigns', 'CampaignDetails',
        'Offers', 'ExploreOffers', 'OfferDetails',
        'Messages', 'Inbox', 'Chat',
        'Orders', 'ActiveOrders', 'OrderDetails',
        'Profile', 'CreatorProfile', 'BrandProfile',
        'Proposals', 'MyProposals', 'ProposalDetails',
        'SubmitProposal', 'CreateCampaign', 'CreateOffer'
      ];

      // Mapping screen names to internal activeTab names if they differ
      const tabMap = {
        'Dashboard': 'Home',
        'DashboardNew': 'Home',
        'ExploreOffers': 'Offers',
        'Inbox': 'Messages',
        // 'Chat': 'Messages', // Removed so Chat is its own activeTab
        'ActiveOrders': 'Orders',
        'CreatorProfile': 'Profile',
        'BrandProfile': 'Profile'
      };

      const targetTab = tabMap[screen] || screen;

      if (shellScreens.includes(screen)) {
        const replaceParamsScreens = ['OfferDetails', 'CampaignDetails', 'OrderDetails', 'ProposalDetails'];
        const shouldReplaceParams = replaceParamsScreens.includes(screen);
        const shouldReplace = params?.replace === true;

        if (targetTab !== activeTab) {
          if (!shouldReplace) {
            setInternalHistory(prev => [...prev, activeTab]);
          }
          setActiveTab(targetTab);
          const cleanParams = params ? { ...params } : {};
          delete cleanParams.replace;
          setScreenParams(() => ({ ...cleanParams }));
          if (onTabChange) onTabChange(targetTab);
        } else {
          if (params) {
            setScreenParams(shouldReplaceParams
              ? () => ({ ...(params || {}) })
              : (prev) => ({ ...prev, ...params }));
          }
        }
        return;
      }

      // For external screens (Login, Settings, etc.), use parent navigation
      if (onTabChange) {
        onTabChange(activeTab);
      }
      navigation?.navigate(screen, {
        ...params,
        role: userRole,
        preservedTab: activeTab,
        preservedInternalHistory: [...internalHistory],
      });
    },
    goBack: () => {
      if (internalHistory.length > 0) {
        const previousTab = internalHistory[internalHistory.length - 1];
        setInternalHistory(prev => prev.slice(0, -1));
        setActiveTab(previousTab);
        if (onTabChange) onTabChange(previousTab);
      } else if (navigation?.canGoBack && navigation.canGoBack()) {
        navigation.goBack();
      } else {
        console.log('[AppNavigator] Cannot go back further');
      }
    },
    openDrawer: () => setIsDrawerOpen(true),
    closeDrawer: () => setIsDrawerOpen(false),
  };

  const isBrand = (userRole || '').toLowerCase() === 'brand';

  const renderScreen = () => {
    const detailScreens = ['OfferDetails', 'CampaignDetails', 'OrderDetails', 'ProposalDetails'];
    const isDetailScreen = detailScreens.includes(activeTab);
    let params = isDetailScreen
      ? { ...route?.params, ...screenParams }
      : { ...screenParams, ...route?.params };
    if (activeTab === 'CreateCampaign') {
      params = { ...screenParams };
      if (!params.isEdit) {
        const { campaign, campaignId, isEdit, ...rest } = params;
        params = rest;
      }
    }
    if (activeTab === 'Profile') {
      params = { ...screenParams };
    }
    const offerId = params?.offerId || params?.offer?._id || params?.offer?.id;

    // Check if we navigated to Chat specifically
    // Since Chat maps to Messages tab, we need to distinguish if we want Inbox or Chat component
    // We can use a separate state or check screenParams.
    // However, simplest way with this custom router is to add a case for Chat if activeTab logic supports it.
    // But activeTab is 'Messages' for both.

    // Better approach: Let's NOT map Chat to Messages tab in tabMap if we want to render a different component.
    // But we want the bottom tab 'Messages' to be active.

    // Alternative: Use a sub-route state or just check if params has conversation data? 
    // No, that's flaky.

    // Let's modify tabMap logic locally for render.
    // If activeTab is 'Messages', check if we have a specific 'subScreen' param or if we use a different activeTab name internally for Chat but map it to Messages for BottomNav highlighting.

    // Let's rely on the passed 'screen' being stored somewhere? 
    // The current implementation sets 'activeTab' to targetTab. 
    // If we want Chat to be a distinct screen but highlight Messages tab, we should separate them.
    // Let's use 'Chat' as the activeTab value, but highlight Messages tab if activeTab is 'Chat'.

    // So I will remove 'Chat': 'Messages' from tabMap above and handle the highlighting in the BottomNav.

    // Role-based Access Control (RBAC)
    // Prevent users from accessing screens their role is not authorized for
    // This is critical because App.tsx delegates these screens to AppNavigator without checking role first

    // Screens restricted to Brand only
    const brandOnlyScreens = ['CreateCampaign', 'Proposals'];

    // Screens restricted to Creator/Influencer only
    // Note: ExploreCampaigns is for finding work. ExploreOffers is for everyone (Brands browse, Creators view own)
    const creatorOnlyScreens = ['SubmitProposal', 'MyProposals', 'ExploreCampaigns'];

    if (activeTab !== 'Home') {
      if (isBrand && creatorOnlyScreens.includes(activeTab)) {
        console.warn(`[AppNavigator] Access Denied: Brand tried to access ${activeTab}`);
        // Fallback to Home (DashboardNew)
        return <DashboardNew navigation={enhancedNavigation} route={{ params }} />;
      }

      if (!isBrand && brandOnlyScreens.includes(activeTab)) {
        console.warn(`[AppNavigator] Access Denied: Creator tried to access ${activeTab}`);
        // Fallback to Home (Dashboard)
        return <Dashboard navigation={enhancedNavigation} route={{ params }} />;
      }
    }

    switch (activeTab) {
      case 'Home':
        return isBrand ? (
          <DashboardNew navigation={enhancedNavigation} route={{ params }} />
        ) : (
          <Dashboard navigation={enhancedNavigation} route={{ params }} />
        );
      case 'Campaigns':
        return <Campaigns navigation={enhancedNavigation} insideAppNavigator={true} route={{ params }} canGoBack={internalHistory.length > 0} />;
      case 'Offers':
        return <ExploreOffers navigation={enhancedNavigation} insideAppNavigator={true} route={{ params }} canGoBack={internalHistory.length > 0} />;
      case 'Messages':
        return <Inbox navigation={enhancedNavigation} insideAppNavigator={true} route={{ params }} canGoBack={internalHistory.length > 0} />;
      case 'Chat':
        return <Messages navigation={enhancedNavigation} route={{ params }} />;
      case 'Orders':
        return <ActiveOrders navigation={enhancedNavigation} insideAppNavigator={true} route={{ params }} userRole={userRole} canGoBack={internalHistory.length > 0} />;
      case 'Proposals':
        return <Proposals navigation={enhancedNavigation} route={{ params }} userRole={userRole} canGoBack={internalHistory.length > 0} />;
      case 'MyProposals':
        return <MyProposals navigation={enhancedNavigation} route={{ params }} canGoBack={internalHistory.length > 0} />;
      case 'ExploreCampaigns':
        return <ExploreCampaigns navigation={enhancedNavigation} insideAppNavigator={true} route={{ params }} canGoBack={internalHistory.length > 0} />;
      case 'CampaignDetails':
        return <CampaignDetails navigation={enhancedNavigation} route={{ params }} />;
      case 'SubmitProposal':
        return <SubmitProposal navigation={enhancedNavigation} route={{ params }} />;
      case 'CreateCampaign':
        return <CreateCampaign navigation={enhancedNavigation} route={{ params }} />;
      case 'ProposalDetails':
        return <ProposalDetails navigation={enhancedNavigation} route={{ params }} />;
      case 'OrderDetails':
        return <OrderDetails navigation={enhancedNavigation} route={{ params }} />;
      case 'OfferDetails':
        return <OfferDetails key={`offer-${offerId != null ? offerId : 'none'}`} navigation={enhancedNavigation} route={{ params }} />;
      case 'CreateOffer':
        return <CreateOffer navigation={enhancedNavigation} route={{ params }} />;
      case 'EditOffer':
        return <EditOffer navigation={enhancedNavigation} route={{ params }} />;
      case 'Profile':
        // If we have a userId, we're viewing someone else's profile (always CreatorProfile for now)
        if (params?.userId) {
          return <CreatorProfile navigation={enhancedNavigation} route={{ params }} insideAppNavigator={true} />;
        }
        // Otherwise show self profile based on role
        return isBrand ? (
          <BrandProfile navigation={enhancedNavigation} route={{ params }} />
        ) : (
          <CreatorProfile navigation={enhancedNavigation} route={{ params }} insideAppNavigator={true} />
        );
      case 'Wallet':
        if (isBrand) return <DashboardNew navigation={enhancedNavigation} route={{ params }} />;
        return <Wallet navigation={enhancedNavigation} route={{ params }} />;
      case 'PaymentMethodsScreen':
        return <PaymentMethodsScreen navigation={enhancedNavigation} route={{ params }} />;
      case 'ActiveOrders':
        return <ActiveOrders navigation={enhancedNavigation} insideAppNavigator={true} route={{ params }} userRole={userRole} canGoBack={internalHistory.length > 0} />;
      default:
        return isBrand ? (
          <DashboardNew navigation={enhancedNavigation} route={route} />
        ) : (
          <Dashboard navigation={enhancedNavigation} route={route} />
        );
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.screenContainer, { paddingBottom: 80 + Math.max(insets.bottom, 0) }]}>
        {renderScreen()}
      </View>

      {/* Drawer */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        navigation={enhancedNavigation}
        userRole={userRole}
        currentScreen={activeTab === 'Messages' ? 'Inbox' : activeTab === 'Home' ? 'Dashboard' : activeTab === 'Orders' ? 'ActiveOrders' : activeTab === 'Profile' ? (isBrand ? 'BrandProfile' : 'CreatorProfile') : 'AppNavigator'}
      />

      {/* Bottom Tab Navigation - Role-based tabs */}
      <View style={[styles.bottomNav, { paddingBottom: 12 + Math.max(insets.bottom, 0) }]}>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => handleTabPress('Home')}
        >
          <MaterialIcons
            name="home"
            size={24}
            color={(activeTab === 'Home' || activeTab === 'ExploreCampaigns') ? '#337DEB' : '#64748b'}
          />
          <Text style={[
            styles.navText,
            (activeTab === 'Home' || activeTab === 'ExploreCampaigns') && styles.navTextActive
          ]}>
            Home
          </Text>
        </TouchableOpacity>

        {/* Conditional tab based on role */}
        {userRole?.toLowerCase() === 'brand' ? (
          <TouchableOpacity
            style={styles.navItem}
            onPress={() => {
              // Brands manage their own campaigns
              handleTabPress('Campaigns');
            }}
          >
            <MaterialIcons
              name="campaign"
              size={24}
              color={(activeTab === 'Campaigns' || activeTab === 'Proposals') ? '#337DEB' : '#64748b'}
            />
            <Text style={[
              styles.navText,
              (activeTab === 'Campaigns' || activeTab === 'Proposals') && styles.navTextActive
            ]}>
              Campaigns
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.navItem}
            onPress={() => {
              // Creators manage their own offers
              handleTabPress('Offers');
            }}
          >
            <MaterialIcons
              name="local-offer"
              size={24}
              color={(activeTab === 'Offers' || activeTab === 'MyProposals') ? '#337DEB' : '#64748b'}
            />
            <Text style={[
              styles.navText,
              (activeTab === 'Offers' || activeTab === 'MyProposals') && styles.navTextActive
            ]}>
              Offers
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => handleTabPress('Messages')}
        >
          <View>
            <MaterialIcons
              name="chat-bubble"
              size={24}
              color={(activeTab === 'Messages' || activeTab === 'Chat') ? '#337DEB' : '#64748b'}
            />
            {unreadChatCount > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{unreadChatCount > 9 ? '9+' : unreadChatCount}</Text>
              </View>
            )}
          </View>
          <Text style={[
            styles.navText,
            (activeTab === 'Messages' || activeTab === 'Chat') && styles.navTextActive
          ]}>
            Messages
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => handleTabPress('Orders')}
        >
          <MaterialIcons
            name="shopping-bag"
            size={24}
            color={activeTab === 'Orders' ? '#337DEB' : '#64748b'}
          />
          <Text style={[
            styles.navText,
            activeTab === 'Orders' && styles.navTextActive
          ]}>
            Orders
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => handleTabPress('Profile')}
        >
          <MaterialIcons
            name="person"
            size={24}
            color={activeTab === 'Profile' ? '#337DEB' : '#64748b'}
          />
          <Text style={[
            styles.navText,
            activeTab === 'Profile' && styles.navTextActive
          ]}>
            Profile
          </Text>
        </TouchableOpacity>

      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  screenContainer: {
    flex: 1,
    paddingBottom: 80, // Add padding to prevent content from being hidden behind tabs
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
  navText: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 4,
  },
  navTextActive: {
    color: '#337DEB',
    fontWeight: '600',
  },
  tabBadge: {
    position: 'absolute',
    top: -4,
    right: -6,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  tabBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: 'bold',
  },
});

export default AppNavigator;
