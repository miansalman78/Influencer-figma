import React, { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Image, Dimensions, Platform, AppState, InteractionManager } from "react-native";
import LocationPicker from './LocationPicker';
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
  logger.warn('[CreateAccount] Google Sign-In package not installed', err);
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

const CreateAccount = ({ navigation, route }) => {
  // Get signUp, googleOAuth, and appleOAuth functions from AuthContext
  // This will handle API call, save token/user to AsyncStorage, and update context
  const { signUp, googleOAuth, loading: authLoading } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [brandName, setBrandName] = useState("");
  const [creatorRole, setCreatorRole] = useState("");
  const [location, setLocation] = useState({ country: '', state: '', city: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: "", type: "error" });

  const role = route?.params?.role || navigation?.getParam?.('role') || 'creator';

  const showToast = (message, type = "error") => {
    setToast({ visible: true, message, type });
  };

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
        console.log('[CreateAccount] Google Sign-In configured successfully');
      } catch (error) {
        logger.error('[CreateAccount] Failed to configure Google Sign-In', error);
      }
    }
  }, []);

  // Handle Google OAuth Sign-Up
  const handleGoogleSignUp = async () => {
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
          logger.debug('[CreateAccount] Google Sign-In configured successfully');
        } catch (configError) {
          logger.error('[CreateAccount] Failed to configure Google Sign-In', configError);
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
      await performGoogleSignUp();

    } catch (error) {
      logger.error('[CreateAccount] Google OAuth error', error);

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
        logger.error('[CreateAccount] DEVELOPER_ERROR - SHA-1 fingerprint likely missing from Firebase');
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
        logger.warn('[CreateAccount] Activity context not ready, retrying in 2 seconds...');
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
            await performGoogleSignUp();
          } catch (retryError) {
            logger.error('[CreateAccount] Retry failed', retryError);
            if (retryError.code === 'NULL_PRESENTER') {
              showToast('Google Sign-In is not ready. Please try again later.', 'error');
            } else {
              showToast('Google sign-up failed. Please try again.', 'error');
            }
            setIsSubmitting(false);
          }
        }, 2000);
        return;
      }

      const errorMessage = error?.isNetworkError
        ? 'Cannot reach server. Please ensure the backend is running and reachable.'
        : error?.message || error?.data?.message || 'Google sign-up failed. Please try again.';

      showToast(errorMessage, 'error');
      setIsSubmitting(false);
    }
  };

  // Helper function to perform Google Sign-Up
  const performGoogleSignUp = async () => {
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

      // Determine creator role based on current selection
      const selectedCreatorRole = creatorRole && creatorRole.trim().toLowerCase() === 'service_creator'
        ? 'service_creator'
        : 'influencer';

      // Call OAuth API with idToken and role
      const response = await googleOAuth({
        idToken: userInfo.data.idToken,
        role: role || 'creator',
        creatorRole: role === 'brand' ? undefined : selectedCreatorRole
      });

      // Handle navigation
      handleOAuthNavigation(response);
      setIsSubmitting(false);
    } catch (error) {
      setIsSubmitting(false);
      throw error;
    }
  };


  // Helper function to handle navigation after OAuth sign-up
  const handleOAuthNavigation = (response) => {
    const apiRole = response?.user?.role;
    const normalizedRole = apiRole === 'brand' ? 'brand' : 'creator';

    showToast(response?.message || 'Account created successfully!', 'success');

    // Navigate to appropriate screen
    if (normalizedRole === 'brand') {
      navigation?.navigate('DashboardNew', { role: normalizedRole, user: response.user });
    } else {
      // Creators go through setup flow
      navigation?.navigate('ChoosePrimaryRole', { role: normalizedRole, user: response.user });
    }
  };

  const handleCreateAccount = async () => {
    // Validation
    if (!name.trim()) {
      showToast("Please enter your name", "error");
      return;
    }
    if (!email.trim()) {
      showToast("Please enter your email", "error");
      return;
    }
    if (!email.includes("@")) {
      showToast("Please enter a valid email", "error");
      return;
    }
    if (password.length < 8) {
      showToast("Password must be at least 8 characters", "error");
      return;
    }
    if (password !== confirmPassword) {
      showToast("Passwords do not match", "error");
      return;
    }

    // Determine role (creator or brand)
    const apiRole = role || "creator"; // Backend accepts 'creator' or 'brand'
    const isBrandRole = apiRole === "brand";

    // Build payload matching backend structure
    // Location is optional - only include if user provides at least city
    const signupPayload = {
      name: isBrandRole ? (brandName.trim() || name.trim()) : name.trim(),
      email: email.trim().toLowerCase(),
      password: password,
      role: apiRole,
    };

    // Only include location if user provided at least one field
    const { country, state, city } = location;
    if (country || state || city) {
      signupPayload.location = {};
      if (country) signupPayload.location.country = country;
      if (state) signupPayload.location.state = state;
      if (city) signupPayload.location.city = city;
    }

    // Only add creatorRole for creators (must be 'influencer' or 'service_creator')
    if (!isBrandRole) {
      // Map user input to valid backend values
      const userCreatorRole = creatorRole.trim().toLowerCase();
      if (userCreatorRole === 'service_creator' || userCreatorRole === 'service creator') {
        signupPayload.creatorRole = 'service_creator';
      } else {
        // Default to 'influencer' for any other value
        signupPayload.creatorRole = 'influencer';
      }
    }

    // Log payload for debugging
    logger.debug('[CreateAccount] Signup payload', signupPayload);

    try {
      setIsSubmitting(true);

      // Call signUp from AuthContext
      // This will:
      // 1. Call POST /auth/signup API via axios
      // 2. Save token and user to AsyncStorage
      // 3. Update AuthContext state
      const response = await signUp(signupPayload);

      // Get user role from response
      const apiRole = response?.user?.role;
      const normalizedRole =
        apiRole === "brand"
          ? "brand"
          : apiRole === "creator" || apiRole === "influencer"
            ? "creator"
            : signupPayload.role === "brand"
              ? "brand"
              : "creator";

      // Show success message
      showToast(response?.message || "Account created successfully", "success");

      // Navigate to appropriate screen based on role
      // Token and user are already saved in AsyncStorage by AuthContext
      if (normalizedRole === "brand") {
        // Brands go directly to their dashboard
        navigation?.navigate('DashboardNew', { role: normalizedRole, user: response?.user });
      } else {
        // Creators go through the setup flow first
        navigation?.navigate('ChoosePrimaryRole', { role: normalizedRole, user: response?.user });
      }
    } catch (error) {
      // Handle errors from API
      const validationMessage = error?.data?.errors?.[0]?.message || error?.data?.errors?.[0]?.msg;
      const errorMessage = error?.isNetworkError
        ? "Cannot reach server. Please ensure the backend is running and reachable."
        : validationMessage || error?.message || error?.data?.message || "Unable to create account. Please try again.";
      showToast(errorMessage, "error");
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
            source={require("../assets/undefined.jpeg")}
            style={styles.logoImage}
            resizeMode="cover"
          />
        </View>

        {/* Title Section */}
        <View style={styles.titleSection}>
          <Text style={styles.title}>Let's get started!</Text>
          <Text style={styles.subtitle}>
            Create your account to join our community of brands and creators.
          </Text>
        </View>

        {/* Form Section */}
        <View style={styles.formContainer}>
          {/* Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Name</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={20} color="#8A8A8A" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="e.g. John Doe"
                placeholderTextColor="#8A8A8A"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>
          </View>

          {/* Email */}
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

          {/* Confirm Password Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Confirm Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color="#8A8A8A" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="Confirm your password"
                placeholderTextColor="#8A8A8A"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                style={styles.eyeIcon}
              >
                <Ionicons
                  name={showConfirmPassword ? "eye-outline" : "eye-off-outline"}
                  size={20}
                  color="#8A8A8A"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Brand Name */}
          {role === "brand" && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Brand Name</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="storefront-outline" size={20} color="#8A8A8A" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter your brand name"
                  placeholderTextColor="#8A8A8A"
                  value={brandName}
                  onChangeText={setBrandName}
                  autoCapitalize="words"
                />
              </View>
            </View>
          )}

          {/* Creator Role/Specialization */}
          {role !== "brand" && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Specialization</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="briefcase-outline" size={20} color="#8A8A8A" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. influencer, content creator"
                  placeholderTextColor="#8A8A8A"
                  value={creatorRole}
                  onChangeText={setCreatorRole}
                  autoCapitalize="none"
                />
              </View>
              <Text style={styles.helperText}>
                Leave empty to use default: "influencer"
              </Text>
            </View>
          )}

          {/* Location — using shared LocationPicker (same as Campaign/Offer) */}
          <LocationPicker
            label="Location (Optional)"
            value={location}
            onChange={setLocation}
            required={false}
          />

          {/* Terms and Conditions */}
          <View style={styles.termsContainer}>
            <Text style={styles.termsText}>
              By creating an account, you agree to our{" "}
              <Text style={styles.termsLink}>Terms of Service</Text> and{" "}
              <Text style={styles.termsLink}>Privacy Policy</Text>
            </Text>
          </View>
        </View>

        {/* Social Sign-Up Buttons */}
        <View style={styles.socialContainer}>
          <TouchableOpacity
            style={styles.socialButton}
            onPress={handleGoogleSignUp}
            disabled={isSubmitting || authLoading}
          >
            <View style={styles.socialIconContainer}>
              <Ionicons name="logo-google" size={20} color="#4285F4" />
            </View>
            <Text style={styles.socialButtonText}>Continue with Google</Text>
          </TouchableOpacity>

        </View>

        {/* Divider */}
        <View style={styles.dividerContainer}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Create Account Button */}
        <TouchableOpacity
          style={[styles.createButton, isSubmitting && styles.createButtonDisabled]}
          onPress={handleCreateAccount}
          disabled={isSubmitting}
        >
          <Text style={styles.createButtonText}>
            {isSubmitting ? "Creating..." : "Create Account"}
          </Text>
        </TouchableOpacity>

        {/* Login Link */}
        <View style={styles.loginContainer}>
          <Text style={styles.loginText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation?.goBack()}>
            <Text style={styles.loginLink}>Login</Text>
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

export default CreateAccount;

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
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    width: "100%",
  },
  rowItem: {
    flex: 1,
    minWidth: 0,
  },
  rowItemSpacer: {
    marginRight: 12,
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
  helperText: {
    fontSize: 12,
    color: "#8A8A8A",
    marginTop: 4,
    fontStyle: "italic",
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
  locationDropdownOptions: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 12,
    marginTop: 8,
    maxHeight: 250,
    zIndex: 1000,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    overflow: "hidden",
  },
  dropdownOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  dropdownOptionText: {
    fontSize: 15,
    color: "#1a1a1a",
  },
  termsContainer: {
    marginTop: 10,
    marginBottom: 20,
  },
  termsText: {
    fontSize: 12,
    color: "#8A8A8A",
    lineHeight: 18,
    textAlign: "center",
  },
  termsLink: {
    color: "#337DEB",
    fontWeight: "600",
  },
  createButton: {
    backgroundColor: "#337DEB",
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 20,
    marginTop: 20,
    shadowColor: "#337DEB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  createButtonDisabled: {
    opacity: 0.7,
  },
  createButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  loginContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
    paddingHorizontal: 20,
  },
  loginText: {
    fontSize: 14,
    color: "#8A8A8A",
  },
  loginLink: {
    fontSize: 14,
    color: "#337DEB",
    fontWeight: "600",
  },
  socialContainer: {
    paddingHorizontal: 20,
    marginTop: 20,
    marginBottom: 20,
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
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  socialIconContainer: {
    marginRight: 12,
  },
  socialButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a1a",
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
    paddingHorizontal: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E0E0E0",
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 14,
    color: "#8A8A8A",
    fontWeight: "500",
  },
});
