import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';

/**
 * Loading Spinner Component
 * 
 * Reusable loading indicator component with optional message
 * 
 * @param {string} message - Optional loading message
 * @param {string} size - Size of spinner ('small' or 'large')
 * @param {string} color - Color of spinner
 */
const LoadingSpinner = ({ 
  message, 
  size = 'large', 
  color = '#337DEB',
  style,
  fullScreen = false 
}) => {
  const containerStyle = fullScreen 
    ? [styles.fullScreenContainer, style]
    : [styles.container, style];

  return (
    <View style={containerStyle}>
      <ActivityIndicator size={size} color={color} />
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullScreenContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  message: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});

export default LoadingSpinner;

