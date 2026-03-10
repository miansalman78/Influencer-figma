import React, { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Image, Dimensions, Platform, AppState, InteractionManager } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Toast from "./Toast";
import { useAuth } from "../hooks/useAuth";
import logger from "../utils/logger";

// Import Google Sign-In once at module level
let GoogleSignin;
let GoogleSigninConfigured = false;
try {
  const GoogleSigninModule = require('@react-native-google-signin/google-signin');
  GoogleSignin = GoogleSigninModule.default || GoogleSigninModule.GoogleSignin || GoogleSigninModule;
} catch (err) {
  logger.warn('[Login] Google Sign-In package not installed', err);
  GoogleSignin = null;
}

const { width } = Dimensions.get("window");

// Import Ionicons - handle both ES6 and CommonJS
let Ionicons;
try {
  const IoniconsModule = require('react-native-vector-icons/Ionicons');
  Ionicons = IoniconsModule.default || IoniconsModule;
  if (typeof Ionicons !== 'function') {
    logger.warn('Ionicons is not a function, creating fallback');
    Ionicons = ({ name, size, color, style }) => (
      <Text style={[{ fontSize: size || 20, color: color || '#000' }, style]}>?</Text>
    );
  }
} catch (error) {
  logger.error('Error importing Ionicons', error);
  Ionicons = ({ name, size, color, style }) => (
    <Text style={[{ fontSize: size || 20, color: color || '#000' }, style]}>?</Text>
  );
}

const Login = ({ navigation, route }) => {
  // Get signIn, googleOAuth, and appleOAuth functions from AuthContext
  // This will handle API call, save token/user to AsyncStorage, and update context
  const { signIn, googleOAuth, loading: authLoading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: "", type: "error" });

  const role = route?.params?.role || navigation?.getParam?.('role');

  // Configure Google Sign-In once when component mounts
  useEffect(() => {
    if (GoogleSignin && GoogleSignin.configure && !GoogleSigninConfigured) {
      try {
        GoogleSignin.configure({
          // Web Client ID from Google Cloud Console (required for Android to get ID token)
          webClientId: '1033505323802-oss0vn3072go8b0kio986uop1u35vq3m.apps.googleusercontent.com',
          offlineAccess: false,
          scopes: ['profile', 'email'],
        });
        GoogleSigninConfigured = true;
        logger.debug('[Login] Google Sign-In configured successfully');
      } catch (error) {
        logger.error('[Login] Failed to configure Google Sign-In', error);
      }
    }
  }, []);

  const showToast = (message, type = "error") => {
    setToast({ visible: true, message, type });
  };

  // Handle Google OAuth Login
  const handleGoogleLogin = async () => {
    try {
      setIsSubmitting(true);

      // Check if Google Sign-In is available
      if (!GoogleSignin) {
        showToast('Google Sign-In is not available. Please install @react-native-google-signin/google-signin package.', 'error');
        setIsSubmitting(false);
        return;
      }

      // Ensure configuration is done
      if (!GoogleSigninConfigured && GoogleSignin.configure) {
        try {
          GoogleSignin.configure({
            // Web Client ID from Google Cloud Console (required for Android to get ID token)
            webClientId: '1033505323802-oss0vn3072go8b0kio986uop1u35vq3m.apps.googleusercontent.com',
            offlineAccess: false,
            scopes: ['profile', 'email'],
          });
          GoogleSigninConfigured = true;
          logger.debug('[Login] Google Sign-In configured successfully');
        } catch (configError) {
          logger.error('[Login] Failed to configure Google Sign-In', configError);
          showToast('Failed to initialize Google Sign-In', 'error');
          setIsSubmitting(false);
          return;
        }
      }

      // IMPORTANT: On Android, we skip hasPlayServices() check entirely
      // The signIn() method will handle Play Services check internally
      // Calling hasPlayServices() causes NULL_PRESENTER error when Activity context isn't ready

      // Wait for Activity context to be ready (Android only)
      // Use InteractionManager to wait for all interactions, then add delay for Activity to be ready
      if (Platform.OS === 'android') {
        // Ensure app is in foreground
        if (AppState.currentState !== 'active') {
          showToast('Please ensure the app is active', 'error');
          setIsSubmitting(false);
          return;
        }

        // Wait for all interactions to complete, then add delay
        await new Promise(resolve => {
          InteractionManager.runAfterInteractions(() => {
            // Additional delay to ensure Activity context is fully ready
            // This gives Android time to prepare the Activity context
            // Increased to 2000ms for better reliability
            setTimeout(resolve, 2000);
          });
        });
      }

      // Perform sign-in directly (will handle Play Services check internally on Android)
      // DO NOT call hasPlayServices() - it causes NULL_PRESENTER error
      await performGoogleSignIn();

    } catch (error) {
      logger.error('[Login] Google OAuth error', error);

      // Handle specific Google Sign-In errors
      if (error.code === 'SIGN_IN_CANCELLED') {
        showToast('Google sign-in was cancelled', 'info');
        setIsSubmitting(false);
        return;
      } else if (error.code === 'IN_PROGRESS') {
        showToast('Google sign-in already in progress', 'info');
        setIsSubmitting(false);
        return;
      } else if (error.code === 'PLAY_SERVICES_NOT_AVAILABLE') {
        showToast('Google Play Services is required. Please install or update Google Play Services.', 'error');
        setIsSubmitting(false);
        return;
      } else if (error.code === '10' || error.code === 'DEVELOPER_ERROR') {
        // DEVELOPER_ERROR: Usually means SHA-1 fingerprint is missing from Firebase
        logger.error('[Login] DEVELOPER_ERROR - SHA-1 fingerprint likely missing from Firebase');
        showToast(
          'Google Sign-In configuration error. Please add SHA-1 fingerprint to Firebase Console.\n\n' +
          'SHA-1: 56:4D:30:1C:CF:61:60:AA:EA:15:AE:BC:60:4C:31:32:58:05:22:B6\n\n' +
          'See SHA1_FINGERPRINT_TO_ADD.txt for instructions.',
          'error'
        );
        setIsSubmitting(false);
        return;
      } else if (error.code === 'NULL_PRESENTER') {
        // Activity context not ready - retry after a longer delay
        logger.warn('[Login] Activity context not ready, retrying in 2 seconds...');
        showToast('Please wait, initializing Google Sign-In...', 'info');

        // Wait for Activity to be ready with longer delay
        setTimeout(async () => {
          try {
            // Wait for interactions and add delay
            if (Platform.OS === 'android') {
              await new Promise(resolve => {
                InteractionManager.runAfterInteractions(() => {
                  setTimeout(resolve, 2000);
                });
              });
            }

            // Retry sign-in
            await performGoogleSignIn();
          } catch (retryError) {
            logger.error('[Login] Retry failed', retryError);
            if (retryError.code === 'NULL_PRESENTER') {
              showToast('Google Sign-In is not ready. Please try again later.', 'error');
            } else {
              showToast('Google sign-in failed. Please try again.', 'error');
            }
            setIsSubmitting(false);
          }
        }, 2000);
        return;
      }

      // Handle API errors
      const errorMessage = error?.isNetworkError
        ? 'Cannot reach server. Please ensure the backend is running and reachable.'
        : error?.message || error?.data?.message || 'Google sign-in failed. Please try again.';

      showToast(errorMessage, 'error');
      setIsSubmitting(false);
    }
  };

  // Helper function to perform Google Sign-In
  const performGoogleSignIn = async () => {
    try {
      // Ensure app is in foreground
      if (AppState.currentState !== 'active') {
        throw new Error('App is not active. Please try again.');
      }

      // Sign in with Google
      // Note: signIn() will handle Play Services check internally on Android
      // No need to call hasPlayServices() separately as it causes NULL_PRESENTER error
      const userInfo = await GoogleSignin.signIn();

      if (!userInfo?.data?.idToken) {
        throw new Error('Failed to get Google ID token');
      }

      // Call OAuth API with idToken
      // For existing users, backend will auto-detect and login
      // For new users, we'll need to get role from user or show modal
      const response = await googleOAuth({
        idToken: userInfo.data.idToken,
        role: role || 'creator', // Use route role if available, default to creator
        creatorRole: 'influencer' // Default creator role
      });

      // Handle navigation based on response
      handleOAuthNavigation(response, role);
      setIsSubmitting(false);
    } catch (error) {
      setIsSubmitting(false);
      throw error;
    }
  };


  // Helper function to handle navigation after OAuth login
  const handleOAuthNavigation = (response, selectedRole) => {
    const apiRole = response?.user?.role;
    const creatorRole = response?.user?.creatorRole;

    // Determine navigation role
    let userRole;
    if (apiRole === 'brand') {
      userRole = 'brand';
    } else if (apiRole === 'creator' || apiRole === 'influencer' || creatorRole === 'influencer' || creatorRole === 'creator') {
      userRole = 'creator';
    } else {
      userRole = apiRole || selectedRole || 'creator';
    }

    // Show appropriate message
    if (response.isNewUser) {
      showToast('Account created successfully!', 'success');
    } else {
      showToast(response?.message || 'Login successful', 'success');
    }

    // Navigate to appropriate screen
    if (userRole === 'brand') {
      navigation?.navigate('DashboardNew', { role: userRole, user: response.user });
    } else {
      // If new user and creator, might need to go through setup
      if (response.isNewUser) {
        navigation?.navigate('ChoosePrimaryRole', { role: userRole, user: response.user });
      } else {
        navigation?.navigate('AppNavigator', { role: userRole, user: response.user, initialTab: 'Home' });
      }
    }
  };

  const handleLogin = async () => {
    if (!email.trim()) {
      showToast("Please enter your email", "error");
      return;
    }
    if (!email.includes("@")) {
      showToast("Please enter a valid email", "error");
      return;
    }
    if (!password.trim()) {
      showToast("Please enter your password", "error");
      return;
    }
    if (password.length < 8) {
      showToast("Password must be at least 8 characters", "error");
      return;
    }

    try {
      setIsSubmitting(true);

      // Call signIn from AuthContext
      // This will:
      // 1. Call POST /auth/login API via axios
      // 2. Save token and user to AsyncStorage
      // 3. Update AuthContext state
      const response = await signIn(email, password);

      // Get user role from response - check both role and creatorRole
      // Backend response structure: { user: { role: "creator", creatorRole: "influencer" }, token, message }
      const apiRole = response?.user?.role;
      const creatorRole = response?.user?.creatorRole;

      logger.debug('[Login] API Role', { apiRole, creatorRole });

      // Determine navigation role based on API response
      // Brand goes to DashboardNew, Creator/Influencer goes to AppNavigator
      let userRole;
      if (apiRole === "brand") {
        userRole = "brand";
      } else if (apiRole === "creator" || apiRole === "influencer" || creatorRole === "influencer" || creatorRole === "creator") {
        userRole = "creator"; // All creators/influencers use AppNavigator
      } else {
        userRole = apiRole || role || "creator"; // Default to creator
      }

      logger.debug('[Login] Determined userRole', { userRole, targetScreen: userRole === "brand" ? "DashboardNew" : "AppNavigator" });

      // Show appropriate message
      if (role && userRole && role !== userRole) {
        showToast(`You selected ${role}, but this account is registered as ${userRole}.`, "info");
      } else {
        showToast(response?.message || "Login successful", "success");
      }

      // Navigate to appropriate screen based on role from API response
      // Token and user are already saved in AsyncStorage by AuthContext
      if (userRole === "brand") {
        navigation?.navigate('DashboardNew', { role: userRole, user: response.user });
      } else {
        // Creator or Influencer - navigate to AppNavigator
        navigation?.navigate('AppNavigator', { role: userRole, user: response.user, initialTab: 'Home' });
      }
    } catch (error) {
      // Handle errors from API
      const errorMessage = error?.isNetworkError
        ? "Cannot reach server. Please ensure the backend is running and reachable."
        : error?.message || error?.data?.message || "Login failed. Please check your credentials.";
      showToast(errorMessage, "error");
      if (error?.hint) {
        console.warn(error.hint);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation?.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
          </TouchableOpacity>
          <View style={styles.headerSpacer} />
        </View>

        {/* Logo/Image Section */}
        <View style={styles.logoContainer}>
          <Image
            source={require("../assets/Storyset _ Freepik.jpeg")}
            style={styles.logoImage}
            resizeMode="cover"
          />
        </View>

        {/* Title Section */}
        <View style={styles.titleSection}>
          <Text style={styles.title}>Welcome back!</Text>
          <Text style={styles.subtitle}>
            Sign in to continue to your account and connect with brands & creators.
          </Text>
        </View>

        {/* Form Section */}
        <View style={styles.formContainer}>
          {/* Email Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color="#8A8A8A" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="Enter your email"
                placeholderTextColor="#8A8A8A"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>

          {/* Password Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color="#8A8A8A" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="Enter your password"
                placeholderTextColor="#8A8A8A"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeIcon}
              >
                <Ionicons
                  name={showPassword ? "eye-outline" : "eye-off-outline"}
                  size={20}
                  color="#8A8A8A"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Forgot Password Link */}
          <TouchableOpacity
            style={styles.forgotPasswordContainer}
            onPress={() => navigation?.navigate('ForgotPassword')}
          >
            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>
        </View>

        {/* Login Button */}
        <TouchableOpacity
          style={[styles.loginButton, isSubmitting && styles.loginButtonDisabled]}
          onPress={handleLogin}
          disabled={isSubmitting}
        >
          <Text style={styles.loginButtonText}>{isSubmitting ? "Logging in..." : "Login"}</Text>
        </TouchableOpacity>

        {/* Divider */}
        <View style={styles.dividerContainer}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Social Login Buttons */}
        <View style={styles.socialContainer}>
          <TouchableOpacity
            style={styles.socialButton}
            onPress={handleGoogleLogin}
            disabled={isSubmitting || authLoading}
          >
            <View style={styles.socialIconContainer}>
              <Ionicons name="logo-google" size={20} color="#4285F4" />
            </View>
            <Text style={styles.socialButtonText}>Continue with Google</Text>
          </TouchableOpacity>

        </View>

        {/* Create Account Link */}
        <View style={styles.signupContainer}>
          <Text style={styles.signupText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => navigation?.navigate('CreateAccount')}>
            <Text style={styles.signupLink}>Create Account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast({ ...toast, visible: false })}
      />
    </SafeAreaView>
  );
};

export default Login;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    width: "100%",
  },
  scrollView: {
    flex: 1,
    width: "100%",
  },
  scrollContent: {
    paddingBottom: 40,
    alignItems: "stretch",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: "#fff",
  },
  headerSpacer: {
    flex: 1,
  },
  logoContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    marginBottom: 30,
  },
  logoImage: {
    width: width * 0.8,
    height: width * 0.8 * 1.1,
    borderRadius: 15,
  },
  titleSection: {
    paddingHorizontal: 20,
    marginBottom: 30,
    alignItems: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: "#8A8A8A",
    lineHeight: 22,
    textAlign: "center",
    paddingHorizontal: 10,
  },
  formContainer: {
    paddingHorizontal: 20,
    width: "100%",
    alignSelf: "stretch",
  },
  inputGroup: {
    marginBottom: 20,
    width: "100%",
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a1a1a",
    marginBottom: 8,
    alignSelf: "flex-start",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 12,
    paddingHorizontal: 15,
    height: 52,
    minHeight: 52,
  },
  inputIcon: {
    marginRight: 12,
    alignSelf: "center",
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: "#1a1a1a",
    paddingVertical: 0,
    paddingTop: 0,
    paddingBottom: 0,
    textAlignVertical: "center",
    includeFontPadding: false,
  },
  eyeIcon: {
    padding: 4,
    alignSelf: "center",
    justifyContent: "center",
    alignItems: "center",
  },
  forgotPasswordContainer: {
    alignItems: "flex-end",
    marginTop: -10,
    marginBottom: 20,
  },
  forgotPasswordText: {
    fontSize: 14,
    color: "#337DEB",
    fontWeight: "600",
  },
  loginButton: {
    backgroundColor: "#337DEB",
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 20,
    marginTop: 10,
    shadowColor: "#337DEB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginTop: 30,
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E0E0E0",
  },
  dividerText: {
    marginHorizontal: 15,
    fontSize: 14,
    color: "#8A8A8A",
    fontWeight: "500",
  },
  socialContainer: {
    paddingHorizontal: 20,
  },
  socialButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  socialIconContainer: {
    marginRight: 12,
    width: 24,
    alignItems: "center",
  },
  socialButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a1a",
  },
  signupContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 30,
    paddingHorizontal: 20,
  },
  signupText: {
    fontSize: 14,
    color: "#8A8A8A",
  },
  signupLink: {
    fontSize: 14,
    color: "#337DEB",
    fontWeight: "600",
  },
});

