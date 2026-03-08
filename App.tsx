import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StatusBar, StyleSheet, View, Text, useColorScheme, Alert, Linking } from 'react-native';
import logger from './utils/logger';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StripeProvider } from '@stripe/stripe-react-native';
import { AuthProvider } from './context/AuthContext';
import { MetadataProvider } from './context/MetadataContext';
import { PAYMENT_KEYS } from './config/payment.config';
import ErrorBoundary from './components/ErrorBoundary';
import SplashScreen from './components/SplashScreen';
import OnboardingScreen from './components/OnboardingScreen';
import ChooseRoleScreen from './components/ChooseRole';
import AppNavigator from './components/Navigator/AppNavigator';
import Dashboard from './components/Dashboard';
import CampaignDetails from './components/CampaignDetails';
import CreateCampaign from './components/CreateCampaign';
import CreateOffer from './components/CreateOffer';
import EditOffer from './components/EditOffer';
import ActiveOrders from './components/ActiveOrders';
import Proposals from './components/Proposals';
import ExploreOffers from './components/ExploreOffers';
import Wallet from './components/Wallet';
import Messages from './components/Messages';
import LeaveReview from './components/LeaveReview';
import CreatorProfile from './components/CreatorProfile';
import Campaigns from './components/Campaigns';
import ExploreCampaigns from './components/ExploreCampaigns';
import DashboardNew from './components/DashboardNew';
import CreatorsList from './components/CreatorsList';
import CreateAccount from './components/CreateAccount';
import Login from './components/Login';
import ForgotPassword from './components/ForgotPassword';
import Notifications from './components/Notifications';
import Settings from './components/Settings';
import HelpSupport from './components/HelpSupport';
import Reviews from './components/Reviews';
import LegalInfo from './components/LegalInfo';
import EditProfile from './components/EditProfile';
import Drawer from './components/Drawer';
import OfferConfirmation from './components/OfferConfirmation';
import Inbox from './components/Inbox';
import OfferDetails from './components/OfferDetails';
import OrderDetails from './components/OrderDetails';
import ProposalDetails from './components/ProposalDetails';
import ChoosePrimaryRole from './components/ChoosePrimaryRole';
import CreatorDetailsSetup from './components/CreatorDetailsSetup';
import CreateFirstOffer from './components/CreateFirstOffer';
import SubmitProposal from './components/SubmitProposal';
import CheckoutScreen from './components/CheckoutScreen';
import PaymentMethodsScreen from './components/PaymentMethodsScreen';
import CreatorWalletPaymentMethodsScreen from './components/CreatorWalletPaymentMethodsScreen';
import ServicesManagement from './components/ServicesManagement';
import MyProposals from './components/MyProposals';
import TransactionDetails from './components/TransactionDetails';
import BrandProfile from './components/BrandProfile';

import { useAuth } from './hooks/useAuth';
import Toast from './components/Toast';
import { useUIStore } from './store/useStore';

type Screen =
  | 'SplashScreen'
  | 'Onboarding'
  | 'ChooseRole'
  | 'AppNavigator'
  | 'Dashboard'
  | 'Campaigns'
  | 'ExploreCampaigns'
  | 'CampaignDetails'
  | 'CreateCampaign'
  | 'CreateOffer'
  | 'EditOffer'
  | 'ActiveOrders'
  | 'Proposals'
  | 'ExploreOffers'
  | 'Wallet'
  | 'Messages'
  | 'Inbox'
  | 'LeaveReview'
  | 'CreatorProfile'
  | 'DashboardNew'
  | 'CreatorsList'
  | 'CreateAccount'
  | 'Login'
  | 'ForgotPassword'
  | 'Notifications'
  | 'Settings'
  | 'HelpSupport'
  | 'Reviews'
  | 'LegalInfo'
  | 'EditProfile'
  | 'OfferConfirmation'
  | 'OfferDetails'
  | 'OrderDetails'
  | 'ProposalDetails'
  | 'ChoosePrimaryRole'
  | 'CreatorDetailsSetup'
  | 'CreateFirstOffer'
  | 'SubmitProposal'
  | 'Checkout'
  | 'PaymentMethods'
  | 'CreatorWalletPaymentMethods'
  | 'ServicesManagement'
  | 'MyProposals'
  | 'TransactionDetails'
  | 'BrandProfile';

const App: React.FC = () => {
  const isDarkMode = useColorScheme() === 'dark';
  const auth: any = useAuth();
  const { token, user, loading: authLoading } = auth;
  const { toast, hideToast } = (useUIStore && typeof useUIStore === 'function') ? useUIStore() : { toast: null, hideToast: () => {} };

  const [currentScreen, setCurrentScreen] = useState<Screen>('SplashScreen');
  const [screenHistory, setScreenHistory] = useState<Screen[]>(['SplashScreen']);
  const [screenParams, setScreenParams] = useState<Record<string, any>>({});
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [appNavigatorActiveTab, setAppNavigatorActiveTab] = useState<string>('Home');
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Sync with AuthContext: token, and derive role from user so we always land on correct dashboard
  useEffect(() => {
    if (token && user) {
      setAuthToken(token);
      const role = user?.role?.toLowerCase();
      const creatorRole = user?.creatorRole?.toLowerCase();
      const normalized = role === 'brand' ? 'brand' : (role === 'creator' || role === 'influencer' || creatorRole === 'creator' || creatorRole === 'influencer') ? 'creator' : null;
      if (normalized) {
        setUserRole(normalized);
      }
    } else if (!authLoading && authToken) {
      // User was logged in but token is now gone (e.g. logout) – reset everything
      setAuthToken(null);
      setUserRole(null);
      setScreenParams({});
      setAppNavigatorActiveTab('Home');
      setCurrentScreen('ChooseRole');
      setScreenHistory(['ChooseRole']);
    }
  }, [token, user, authLoading]);

  const navigationRef = useRef<any>(null);

  // Helper to check if screen is public
  const isPublicScreen = (screen: Screen) => {
    return ['SplashScreen', 'Onboarding', 'ChooseRole', 'CreateAccount', 'Login', 'ForgotPassword'].includes(screen);
  };

  // Stable callback to update AppNavigator params and avoid infinite loops.
  // When newParams contains detail-screen data (offer, order, proposal, campaign), replace entirely
  // so opening a second item never shows the first (no stale merge at index level).
  const handleUpdateAppNavigatorParams = useCallback((newParams: any) => {
    setScreenParams(prev => {
      const currentAppNavParams = prev['AppNavigator'] || {};

      if (!newParams) return prev;

      const detailKeys = ['offer', 'offerId', 'order', 'orderId', 'proposal', 'proposalId', 'campaign', 'campaignId'];
      const isDetailUpdate = detailKeys.some(k => Object.prototype.hasOwnProperty.call(newParams, k));

      if (isDetailUpdate) {
        return {
          ...prev,
          ['AppNavigator']: {
            role: currentAppNavParams.role || newParams.role,
            initialTab: currentAppNavParams.initialTab || newParams.initialTab,
            ...newParams,
          },
        };
      }

      const keys = Object.keys(newParams);
      const currentKeys = Object.keys(currentAppNavParams);
      let hasChanges = keys.length !== currentKeys.length;
      if (!hasChanges) {
        hasChanges = keys.some(key => newParams[key] !== currentAppNavParams[key]);
      }
      if (!hasChanges) return prev;

      return {
        ...prev,
        ['AppNavigator']: { ...currentAppNavParams, ...newParams }
      };
    });
  }, []);

  // Helper function to check user role
  const getCurrentRole = (params?: any): string | null => {
    return userRole?.toLowerCase() || params?.role?.toLowerCase() || null;
  };

  // Helper function to check if user has required role
  const checkRoleAccess = (requiredRole: 'brand' | 'creator', params?: any): boolean => {
    const currentRole = getCurrentRole(params);
    if (!currentRole) return false;
    if (requiredRole === 'brand') {
      return currentRole === 'brand';
    } else {
      return currentRole === 'creator' || currentRole === 'influencer';
    }
  };

  const navigation = {
    navigate: (screen: Screen, params?: any) => {
      // Update role and token immediately if provided in params
      if (params?.role) {
        setUserRole(params.role);
      }
      if (params && Object.prototype.hasOwnProperty.call(params, 'token')) {
        setAuthToken(params.token || null);
      }

      // Screens that should be rendered inside AppNavigator
      const appNavigatorScreens: Record<string, string> = {
        'Campaigns': 'Campaigns',
        'ExploreCampaigns': 'ExploreCampaigns',
        'CampaignDetails': 'CampaignDetails',
        'Proposals': 'Proposals',
        'MyProposals': 'MyProposals',
        'SubmitProposal': 'SubmitProposal',
        'Dashboard': 'Home',
        'DashboardNew': 'Home',
        'Inbox': 'Messages',
        'ActiveOrders': 'Orders',
        'CreatorProfile': 'Profile',
        'ExploreOffers': 'Offers',
        'ProposalDetails': 'ProposalDetails',
        'OrderDetails': 'OrderDetails',
        'OfferDetails': 'OfferDetails',
        'CreateCampaign': 'CreateCampaign',
        'Chat': 'Chat',
        'CreateOffer': 'CreateOffer'
      };

      if (appNavigatorScreens[screen]) {
        const targetTab = appNavigatorScreens[screen];
        setAppNavigatorActiveTab(targetTab);
        setScreenParams(prev => ({ ...prev, ['AppNavigator']: params }));
        setCurrentScreen('AppNavigator');
        return;
      }

      // When navigating to AppNavigator (e.g. after login), sync tab so we land on dashboard not a stale tab
      if (screen === 'AppNavigator' && params?.initialTab !== undefined) {
        setAppNavigatorActiveTab(params.initialTab);
      }

      setScreenHistory(prev => [...prev, currentScreen]);
      // Checkout must use fresh params - never merge with previous (offer vs proposal are different flows)
      const isCheckout = screen === 'Checkout';
      setScreenParams(prev => ({
        ...prev,
        [screen]: isCheckout ? (params || {}) : { ...(prev[screen] || {}), ...params }
      }));
      setCurrentScreen(screen);
    },
    goBack: () => {
      if (screenHistory.length > 0) {
        const previousScreen = screenHistory[screenHistory.length - 1];
        // Never go back to SplashScreen when user is authenticated - avoids unwanted re-login flow
        if (previousScreen === 'SplashScreen' && (authToken || userRole)) {
          return;
        }
        if (previousScreen === 'AppNavigator') {
          // Restore tab and internal history from the screen we're leaving (e.g. Checkout)
          const leavingParams = screenParams[currentScreen] || {};
          const preservedTab = leavingParams.preservedTab || screenParams['AppNavigator']?.preservedTab;
          const preservedInternalHistory = leavingParams.preservedInternalHistory;
          if (preservedTab) {
            setAppNavigatorActiveTab(preservedTab);
          }
          if (preservedInternalHistory?.length) {
            setScreenParams(prev => ({
              ...prev,
              AppNavigator: {
                ...(prev.AppNavigator || {}),
                preservedInternalHistory,
              },
            }));
          }
        }
        const newHistory = screenHistory.slice(0, -1);
        setScreenHistory(newHistory);
        setCurrentScreen(previousScreen);
      }
    },
    canGoBack: () => {
      return screenHistory.length > 0;
    },
    reset: (screen: Screen) => {
      setScreenHistory([screen]);
      setCurrentScreen(screen);
      if (screen === 'Onboarding' || screen === 'ChooseRole' || screen === 'Login') {
        setUserRole(null);
        setAuthToken(null);
      }
    },
    getParam: (key: string) => {
      return screenParams[currentScreen]?.[key];
    },
    openDrawer: () => setIsDrawerOpen(true),
    closeDrawer: () => setIsDrawerOpen(false),
  };

  // Keep navigationRef updated so effects can use the latest navigation state
  useEffect(() => {
    navigationRef.current = navigation;
  }, [navigation]);

  // Role is now synced from AuthContext (token + user) in the effect above

  // Handle deep links for OAuth callbacks
  useEffect(() => {
    const handleDeepLink = async (url: string | null) => {
      if (!url) return;
      try {
        logger.debug('[App] Deep link received', { url });

        // Check if it's a PayPal payment callback
        if (url.includes('/payments/paypal/success') || url.includes('token=')) {
          logger.info('[App] PayPal payment callback received');

          try {
            // Extract query parameters with regex (safer than URL constructor in RN)
            let orderId = '';
            let paypalOrderId = '';

            const orderIdMatch = url.match(/[?&]orderId=([^&]+)/);
            const tokenMatch = url.match(/[?&]token=([^&]+)/);

            if (orderIdMatch) orderId = decodeURIComponent(orderIdMatch[1]);
            if (tokenMatch) paypalOrderId = decodeURIComponent(tokenMatch[1]);

            if (orderId && paypalOrderId) {
              // Capture payment
              const { capturePayPalPayment } = await import('./services/payments.service');
              const response: any = await capturePayPalPayment(orderId, paypalOrderId);

              if (response) {
                Alert.alert(
                  'Payment Successful',
                  'Your PayPal payment has been processed successfully!',
                  [
                    {
                      text: 'View Orders',
                      onPress: () => navigationRef.current?.navigate('ActiveOrders')
                    }
                  ]
                );
              }
            }
          } catch (error) {
            logger.error('[App] Error capturing PayPal payment from deep link', error);
            Alert.alert('Payment Error', 'Failed to complete PayPal payment. Please check your orders.');
          }
        } else if (url.includes('/payments/paypal/cancel')) {
          Alert.alert('Payment Cancelled', 'You cancelled the PayPal payment.');
        } else if (url.includes('/social/callback')) {
          // Extract query parameters
          let platform = '';
          let success = false;
          let username = '';

          try {
            const queryString = url.split('?')[1];
            if (queryString) {
              const params = queryString.split('&');
              params.forEach(param => {
                const [key, value] = param.split('=');
                if (key === 'platform') platform = value || '';
                if (key === 'success') success = value === 'true';
                if (key === 'username') username = decodeURIComponent(value || '');
              });
            }
          } catch (parseError) {
            logger.error('[App] Error parsing OAuth callback URL', parseError);
          }

          if (platform) {
            logger.info(`[App] OAuth callback for ${platform}`, { success, username: username?.substring(0, 20) || '' });

            // Backend handles the callback automatically via redirect URL
            // Just refresh user profile to get updated social connections
            try {
              const userService = await import('./services/user');
              const profile = await userService.getMyProfile();
              logger.debug('[App] Profile refreshed after OAuth callback');

              // Settings component will handle showing success/failure alert
              // App.tsx just ensures profile is refreshed globally
            } catch (error) {
              logger.error('[App] Error refreshing profile after OAuth', error);
            }
          }
        }
      } catch (error) {
        logger.error('[App] Error handling deep link', error);
      }
    };

    // Handle deep link if app was opened via deep link
    Linking.getInitialURL().then((url: string | null) => {
      if (url) {
        handleDeepLink(url);
      }
    }).catch((err: any) => {
      logger.error('[App] Error getting initial URL', err);
    });

    // Listen for deep links while app is running
    const subscription = Linking.addEventListener('url', (event: { url: string }) => {
      handleDeepLink(event.url);
    });

    return () => {
      subscription?.remove();
    };
  }, []);



  const renderScreen = () => {
    // SECURITY GUARD: If not authenticated and not on a public screen, force ChooseRole
    // This handles cases like manual navigation attempts or state persistence after logout
    if (!authLoading && !token && !isPublicScreen(currentScreen)) {
      return <ChooseRoleScreen navigation={navigation} />;
    }

    try {
      switch (currentScreen) {
        case 'SplashScreen': {
          return (
            <SplashScreen
              onAuthCheckComplete={async (isAuthenticated: boolean, userFromRestore: any) => {
                if (isAuthenticated && userFromRestore) {
                  const role = userFromRestore?.role?.toLowerCase();
                  const isBrand = role === 'brand';
                  const navRole = isBrand ? 'Brand' : 'Creator';
                  navigation.navigate('AppNavigator', { role: navRole, user: userFromRestore });
                } else if (isAuthenticated) {
                  try {
                    const { getUser } = await import('./services/apiClient');
                    const u = await getUser();
                    const r = u?.role?.toLowerCase();
                    const navRole = r === 'brand' ? 'Brand' : 'Creator';
                    navigation.navigate('AppNavigator', { role: navRole, user: u, initialTab: 'Home' });
                  } catch (error) {
                    console.error('[App] Error getting user after auth:', error);
                    navigation.navigate('AppNavigator', { role: 'Creator', initialTab: 'Home' });
                  }
                } else {
                  navigation.navigate('Onboarding');
                }
              }}
            />
          );
        }
        case 'Onboarding':
          return <OnboardingScreen navigation={navigation} />;
        case 'ChooseRole':
          return <ChooseRoleScreen navigation={navigation} />;
        case 'AppNavigator':
          const appNavigatorParams = screenParams['AppNavigator'] || {};
          // Role from params (login/splash/signup), then App state, then AuthContext user - so we always land on correct dashboard
          const roleFromUser = user?.role?.toLowerCase();
          const creatorRoleFromUser = user?.creatorRole?.toLowerCase();
          const derivedRole = roleFromUser === 'brand' ? 'Brand' : (roleFromUser === 'creator' || roleFromUser === 'influencer' || creatorRoleFromUser === 'creator' || creatorRoleFromUser === 'influencer') ? 'Creator' : null;
          const effectiveRole = appNavigatorParams.role || (userRole ? (userRole.charAt(0).toUpperCase() + userRole.slice(1)) : null) || derivedRole || 'Creator';
          return <AppNavigator
            navigation={navigation}
            route={{ params: { ...appNavigatorParams, role: effectiveRole, initialTab: appNavigatorActiveTab } }}
            onTabChange={setAppNavigatorActiveTab}
            onUpdateParams={handleUpdateAppNavigatorParams}
          />;
        case 'Dashboard': {
          // Creator/Influencer-only page (Stats/Earnings)
          const params = screenParams['Dashboard'] || {};
          const currentRole = userRole?.toLowerCase() || params?.role?.toLowerCase();
          if (currentRole === 'brand') {
            // Redirect brand to their dashboard (DashboardNew)
            navigation.navigate('AppNavigator', { role: 'Brand', initialTab: 'Home' });
            return null;
          }
          return <AppNavigator
            navigation={navigation}
            route={{ params: { ...params, role: 'Creator', initialTab: 'Home' } }}
            onTabChange={setAppNavigatorActiveTab}
            onUpdateParams={handleUpdateAppNavigatorParams}
          />;
        }
        case 'Campaigns': {
          const params = screenParams['Campaigns'] || {};
          return <AppNavigator
            navigation={navigation}
            route={{ params: { ...params, role: 'Brand', initialTab: 'Campaigns' } }}
            onTabChange={setAppNavigatorActiveTab}
            onUpdateParams={handleUpdateAppNavigatorParams}
          />;
        }
        case 'ExploreCampaigns': {
          // Creator-only page (browse campaigns)
          const params = screenParams['ExploreCampaigns'] || {};
          const currentRole = userRole?.toLowerCase() || params?.role?.toLowerCase();
          if (currentRole === 'brand') {
            // Redirect brand to their dashboard
            navigation.navigate('DashboardNew', { role: 'Brand' });
            return null;
          }
          return <AppNavigator
            navigation={navigation}
            route={{ params: { ...params, role: 'Creator', initialTab: 'ExploreCampaigns' } }}
            onTabChange={setAppNavigatorActiveTab}
            onUpdateParams={handleUpdateAppNavigatorParams}
          />;
        }
        case 'CampaignDetails': {
          // Accessible to both - no role check needed
          const params = screenParams['CampaignDetails'] || {};
          return <CampaignDetails navigation={navigation} route={{ params }} />;
        }
        case 'CreateCampaign': {
          // Brand-only page - check role
          const params = screenParams['CreateCampaign'] || {};
          const currentRole = userRole?.toLowerCase() || params?.role?.toLowerCase();
          if (currentRole !== 'brand') {
            // Redirect creator/influencer to their dashboard
            navigation.navigate('AppNavigator', { role: 'Creator' });
            return null;
          }
          return <CreateCampaign navigation={navigation} route={{ params }} />;
        }
        case 'CreateOffer': {
          // Creator-only page - check role
          const params = screenParams['CreateOffer'] || {};
          const currentRole = userRole?.toLowerCase() || params?.role?.toLowerCase();
          if (currentRole === 'brand') {
            // Redirect brand to their dashboard
            navigation.navigate('DashboardNew', { role: 'Brand' });
            return null;
          }
          return (
            <>
              <CreateOffer navigation={navigation} route={{ params }} />
              <Drawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                navigation={navigation}
                userRole={currentRole || 'Creator'}
                currentScreen="CreateOffer"
              />
            </>
          );
        }
        case 'EditOffer': {
          // Creator-only page - check role
          const params = screenParams['EditOffer'] || {};
          const currentRole = userRole?.toLowerCase() || params?.role?.toLowerCase();
          if (currentRole === 'brand') {
            // Redirect brand to their dashboard
            navigation.navigate('DashboardNew', { role: 'Brand' });
            return null;
          }
          return (
            <>
              <EditOffer navigation={navigation} route={{ params }} />
              <Drawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                navigation={navigation}
                userRole={currentRole || 'Creator'}
                currentScreen="EditOffer"
              />
            </>
          );
        }
        case 'ActiveOrders': {
          // Accessible to both - no role check needed
          const params = screenParams['ActiveOrders'] || {};
          const currentRole = getCurrentRole(params);
          return (
            <>
              <ActiveOrders navigation={navigation} route={{ params }} userRole={currentRole} />
              <Drawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                navigation={navigation}
                userRole={currentRole || 'Creator'}
                currentScreen="ActiveOrders"
              />
            </>
          );
        }
        case 'Proposals': {
          // Brand-only page - check role
          const params = screenParams['Proposals'] || {};
          const currentRole = userRole?.toLowerCase() || params?.role?.toLowerCase() || 'brand';
          if (currentRole !== 'brand') {
            // Redirect creator/influencer to their dashboard
            navigation.navigate('AppNavigator', { role: 'Creator' });
            return null;
          }
          return <AppNavigator
            navigation={navigation}
            route={{ params: { ...params, role: 'Brand', initialTab: 'Proposals' } }}
            onTabChange={setAppNavigatorActiveTab}
            onUpdateParams={handleUpdateAppNavigatorParams}
          />;
        }
        case 'ExploreOffers': {
          // Accessible to both brands and creators - brands can browse influencer offers
          const params = screenParams['ExploreOffers'] || {};
          return <ExploreOffers navigation={navigation} />;
        }
        case 'Wallet':
          return <Wallet navigation={navigation} route={{ params: screenParams['Wallet'] || {} }} />;
        case 'Messages':
          return <Messages navigation={navigation} route={{ params: screenParams['Messages'] }} />;
        case 'Inbox':
          return <Inbox navigation={navigation} />;
        case 'LeaveReview':
          return <LeaveReview navigation={navigation} route={{ params: screenParams['LeaveReview'] }} />;
        case 'CreatorProfile': {
          // Allow brands to view creator profiles when userId is provided (viewing another creator)
          // Only redirect if brand is trying to view their own profile (no userId)
          const params = screenParams['CreatorProfile'] || {};
          const currentRole = getCurrentRole(params);
          const hasUserId = params?.userId; // If userId is provided, brand is viewing another creator

          if (currentRole === 'brand' && !hasUserId) {
            // Brand trying to view their own profile - redirect to dashboard
            navigation.navigate('DashboardNew', { role: 'Brand' });
            return null;
          }
          // Allow access if:
          // 1. User is creator/influencer (viewing own or other profile)
          // 2. User is brand but has userId (viewing another creator's profile)
          return (
            <>
              <CreatorProfile navigation={navigation} route={{ params }} />
              <Drawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                navigation={navigation}
                userRole={currentRole || 'Creator'}
                currentScreen="CreatorProfile"
              />
            </>
          );
        }
        case 'DashboardNew': {
          // Brand/Discovery page
          const params = screenParams['DashboardNew'] || {};
          const currentRole = userRole?.toLowerCase() || params?.role?.toLowerCase();
          if (currentRole !== 'brand') {
            // Redirect creator/influencer to their analytics dashboard
            navigation.navigate('AppNavigator', { role: 'Creator', initialTab: 'Home' });
            return null;
          }
          return <AppNavigator
            navigation={navigation}
            route={{ params: { ...params, role: 'Brand', initialTab: 'Home' } }}
            onTabChange={setAppNavigatorActiveTab}
            onUpdateParams={handleUpdateAppNavigatorParams}
          />;
        }
        case 'CreatorsList': {
          // Brand-only page - check role
          const params = screenParams['CreatorsList'] || {};
          const currentRole = getCurrentRole(params);
          if (currentRole !== 'brand') {
            // Redirect creator/influencer to their dashboard
            navigation.navigate('AppNavigator', { role: 'Creator' });
            return null;
          }
          return <CreatorsList navigation={navigation} route={{ params }} />;
        }
        case 'CreateAccount':
          return <CreateAccount navigation={navigation} route={{ params: screenParams['CreateAccount'] }} />;
        case 'Login':
          return <Login navigation={navigation} route={{ params: screenParams['Login'] }} />;
        case 'ForgotPassword':
          return <ForgotPassword navigation={navigation} />;
        case 'Notifications':
          return <Notifications navigation={navigation} route={{ params: screenParams['Notifications'] }} />;
        case 'Settings':
          return <Settings navigation={navigation} route={{ params: screenParams['Settings'] }} />;
        case 'HelpSupport':
          return <HelpSupport navigation={navigation} route={{ params: screenParams['HelpSupport'] }} />;
        case 'Reviews':
          return <Reviews navigation={navigation} route={{ params: screenParams['Reviews'] }} />;
        case 'LegalInfo':
          return <LegalInfo navigation={navigation} route={{ params: screenParams['LegalInfo'] }} />;
        case 'EditProfile':
          return <EditProfile navigation={navigation} route={{ params: screenParams['EditProfile'] }} />;
        case 'OfferConfirmation':
          return <OfferConfirmation navigation={navigation} route={{ params: screenParams['OfferConfirmation'] }} />;
        case 'OfferDetails': {
          // Accessible to both - no role check needed (though creators can create/edit their own)
          const params = screenParams['OfferDetails'] || {};
          return <OfferDetails navigation={navigation} route={{ params }} />;
        }
        case 'OrderDetails': {
          // Accessible to both - no role check needed (actions differ by role, handled in component)
          const params = screenParams['OrderDetails'] || {};
          return <OrderDetails navigation={navigation} route={{ params }} />;
        }
        case 'ProposalDetails': {
          // Accessible to both - no role check needed
          const params = screenParams['ProposalDetails'] || {};
          return <ProposalDetails navigation={navigation} route={{ params }} />;
        }
        case 'ChoosePrimaryRole': {
          // Creator-only page - check role
          const params = screenParams['ChoosePrimaryRole'] || {};
          const currentRole = getCurrentRole(params);
          if (currentRole === 'brand') {
            // Redirect brand to their dashboard
            navigation.navigate('DashboardNew', { role: 'Brand' });
            return null;
          }
          return <ChoosePrimaryRole navigation={navigation} route={{ params }} />;
        }
        case 'CreatorDetailsSetup': {
          // Creator-only page - check role
          const params = screenParams['CreatorDetailsSetup'] || {};
          const currentRole = getCurrentRole(params);
          if (currentRole === 'brand') {
            // Redirect brand to their dashboard
            navigation.navigate('DashboardNew', { role: 'Brand' });
            return null;
          }
          return <CreatorDetailsSetup navigation={navigation} route={{ params }} />;
        }
        case 'CreateFirstOffer': {
          // Creator-only page - check role
          const params = screenParams['CreateFirstOffer'] || {};
          const currentRole = getCurrentRole(params);
          if (currentRole === 'brand') {
            // Redirect brand to their dashboard
            navigation.navigate('DashboardNew', { role: 'Brand' });
            return null;
          }
          return <CreateFirstOffer navigation={navigation} route={{ params }} />;
        }
        case 'SubmitProposal': {
          // Creator-only page - check role
          const params = screenParams['SubmitProposal'] || {};
          const currentRole = userRole?.toLowerCase() || params?.role?.toLowerCase();
          if (currentRole === 'brand') {
            // Redirect brand to their dashboard
            navigation.navigate('DashboardNew', { role: 'Brand' });
            return null;
          }
          return <SubmitProposal navigation={navigation} route={{ params }} />;
        }
        case 'Checkout': {
          // Brand-only page - check role (only brands can make payments)
          const params = screenParams['Checkout'] || {};
          const currentRole = userRole?.toLowerCase() || params?.role?.toLowerCase();
          if (currentRole !== 'brand') {
            // Redirect creator/influencer to their dashboard
            navigation.navigate('AppNavigator', { role: 'Creator' });
            return null;
          }
          return <CheckoutScreen navigation={navigation} route={{ params }} />;
        }
        case 'PaymentMethods': {
          // Brand-only page - check role (only brands have payment methods for paying)
          const params = screenParams['PaymentMethods'] || {};
          const currentRole = userRole?.toLowerCase() || params?.role?.toLowerCase();
          if (currentRole !== 'brand') {
            // Redirect creator/influencer to their dashboard
            navigation.navigate('AppNavigator', { role: 'Creator' });
            return null;
          }
          return <PaymentMethodsScreen navigation={navigation} route={{ params }} />;
        }
        case 'CreatorWalletPaymentMethods': {
          // Creator-only page - check role (only creators have wallet payment methods for receiving)
          const params = screenParams['CreatorWalletPaymentMethods'] || {};
          const currentRole = userRole?.toLowerCase() || params?.role?.toLowerCase();
          if (currentRole === 'brand') {
            // Redirect brand to their dashboard
            navigation.navigate('DashboardNew', { role: 'Brand' });
            return null;
          }
          return <CreatorWalletPaymentMethodsScreen navigation={navigation} />;
        }
        case 'ServicesManagement': {
          const params = screenParams['ServicesManagement'] || {};
          const currentRole = userRole?.toLowerCase() || params?.role?.toLowerCase();
          if (currentRole === 'brand') {
            navigation.navigate('DashboardNew', { role: 'Brand' });
            return null;
          }
          return <ServicesManagement navigation={navigation} route={{ params }} />;
        }
        case 'MyProposals': {
          const params = screenParams['MyProposals'] || {};
          const currentRole = userRole?.toLowerCase() || params?.role?.toLowerCase();
          if (currentRole === 'brand') {
            navigation.navigate('DashboardNew', { role: 'Brand' });
            return null;
          }
          return <AppNavigator
            navigation={navigation}
            route={{ params: { ...params, role: 'Creator', initialTab: 'MyProposals' } }}
            onTabChange={setAppNavigatorActiveTab}
            onUpdateParams={handleUpdateAppNavigatorParams}
          />;
        }
        case 'TransactionDetails': {
          const params = screenParams['TransactionDetails'] || {};
          return <TransactionDetails navigation={navigation} route={{ params }} />;
        }
        case 'BrandProfile': {
          const params = screenParams['BrandProfile'] || {};
          return <BrandProfile navigation={navigation} route={{ params }} />;
        }
        default:
          return <OnboardingScreen navigation={navigation} />;
      }
    } catch (error) {
      console.error('Error rendering screen:', error);
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text>Error loading screen. Check console for details.</Text>
        </View>
      );
    }
  };

  return (
    <ErrorBoundary>
      <StripeProvider publishableKey={PAYMENT_KEYS.STRIPE_PUBLIC_KEY}>
        <SafeAreaProvider>
          <SafeAreaView edges={['top','bottom']} style={styles.container}>
            <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
            {renderScreen()}
            {toast && (
              <Toast
                visible={!!toast}
                message={toast?.message}
                type={toast?.type || 'info'}
                onHide={hideToast}
                duration={toast?.duration || 3000}
              />
            )}
          </SafeAreaView>
        </SafeAreaProvider>
      </StripeProvider>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});

const AppWithAuth: React.FC = () => {
  return (
    <AuthProvider>
      <MetadataProvider>
        <App />
      </MetadataProvider>
    </AuthProvider>
  );
};

export default AppWithAuth;
