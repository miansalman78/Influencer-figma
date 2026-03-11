/**
 * Animated Splash Screen Component
 * 
 * This screen:
 * - Shows Adpartnr logo with beautiful animations for 5-6 seconds
 * - Features fade-in, scale, pulse, and glow effects
 * - Has an attractive gradient background
 * - Then checks authentication status
 * - Navigates to Home if token is valid
 * - Navigates to Onboarding if token is invalid or doesn't exist
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../hooks/useAuth';
import LinearGradient from 'react-native-linear-gradient';

const { width, height } = Dimensions.get('window');

const SplashScreen = ({ onAuthCheckComplete }) => {
  const { restoreSession } = useAuth();

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.3)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const textFadeAnim = useRef(new Animated.Value(0)).current;
  const taglineFadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Start animations sequence
    Animated.parallel([
      // Fade in animation
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      }),
      // Scale animation with bounce
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // After initial animations, start pulse and glow
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Glow animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    });

    // Text fade in after logo appears
    Animated.timing(textFadeAnim, {
      toValue: 1,
      duration: 1000,
      delay: 1000,
      useNativeDriver: true,
    }).start();

    // Tagline fade in
    Animated.timing(taglineFadeAnim, {
      toValue: 1,
      duration: 1000,
      delay: 1500,
      useNativeDriver: true,
    }).start();

    // Check authentication after 5 seconds
    const authTimer = setTimeout(async () => {
      try {
        const result = await restoreSession();
        const isAuthenticated = result?.restored === true;
        const user = result?.user || null;
        if (onAuthCheckComplete) {
          onAuthCheckComplete(isAuthenticated, user);
        }
      } catch (error) {
        console.error('[Splash] Auth check error:', error);
        if (onAuthCheckComplete) {
          onAuthCheckComplete(false, null);
        }
      }
    }, 5000);

    return () => {
      clearTimeout(authTimer);
    };
  }, [restoreSession]);

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });

  return (
    <LinearGradient
      colors={['#FFFFFF', '#F8FAFC', '#EFF6FF']}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          {/* Central Logo - Clean & Focused */}
          <Animated.View
            style={[
              styles.logoContainer,
              {
                opacity: fadeAnim,
                transform: [
                  { scale: Animated.multiply(scaleAnim, pulseAnim) },
                ],
              },
            ]}
          >
            <Image
              source={require('../assets/splash-logo.png')}
              style={styles.logo}
              resizeMode="contain"
              tintColor="#1E40AF"
            />
          </Animated.View>

          {/* Bottom Branding Section */}
          <Animated.View
            style={[
              styles.footer,
              {
                opacity: textFadeAnim,
                transform: [{
                  translateY: textFadeAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [40, 0]
                  })
                }]
              }
            ]}
          >
            <Text style={styles.footerBrandName}>ADPARTNR</Text>
            <Text style={styles.footerTagline}>Connect • Promote • Grow</Text>

            {/* Loading Dots */}
            <View style={styles.loadingDotsContainer}>
              <View style={[styles.miniDot, styles.dot1]} />
              <View style={[styles.miniDot, styles.dot2]} />
              <View style={[styles.miniDot, styles.dot3]} />
            </View>
          </Animated.View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  logoContainer: {
    width: width * 0.75,
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    // Subtle shadow only – no circle, professional lift
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 6,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  footer: {
    position: 'absolute',
    bottom: 60,
    alignItems: 'center',
    width: '100%',
  },
  footerBrandName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  footerTagline: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
    letterSpacing: 1.5,
    marginBottom: 24,
  },
  loadingDotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#337DEB',
  },
  dot1: { opacity: 0.4 },
  dot2: { opacity: 0.7 },
  dot3: { opacity: 1 },
});

export default SplashScreen;


