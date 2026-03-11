import React, { useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Text,
} from 'react-native';
import { WebView } from 'react-native-webview';

const logger = { error: (...args) => console.error('[PayPalWebView]', ...args) };

// Import MaterialIcons safely
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
  MaterialIcons = ({ name, size, color, style }) => (
    <Text style={[{ fontSize: size || 20, color: color || '#000' }, style]}>?</Text>
  );
}

const PayPalWebView = ({
  approvalUrl,
  orderId: initialOrderId, 
  onSuccess, 
  onCancel, 
  onError, 
}) => {
  const [loading, setLoading] = useState(true);
  const resultSent = useRef(false);

  const handleNavigationStateChange = (navState) => {
    const { url } = navState;
    console.log('[PayPalWebView] Navigation:', url);

    // Success only when PayPal redirects to OUR return URL (not when loading paypal.com/checkoutnow?token=)
    const isOurSuccessUrl = url.includes('/payments/paypal/success');
    if (isOurSuccessUrl) {
      if (resultSent.current) return;

      try {
        let paypalOrderId = null;
        let orderId = initialOrderId;
        try {
          const urlObj = new URL(url);
          paypalOrderId = urlObj.searchParams.get('token') || urlObj.searchParams.get('PayerID');
          const extOrderId = urlObj.searchParams.get('orderId');
          if (extOrderId) orderId = extOrderId;
        } catch (e) {
          const tokenMatch = url.match(/[?&]token=([^&]+)/);
          if (tokenMatch) paypalOrderId = decodeURIComponent(tokenMatch[1]);
          const orderMatch = url.match(/[?&]orderId=([^&]+)/);
          if (orderMatch) orderId = decodeURIComponent(orderMatch[1]);
        }

        if (paypalOrderId && orderId) {
          resultSent.current = true;
          console.log('[PayPalWebView] Success detected:', { orderId, paypalOrderId });
          if (onSuccess) onSuccess(orderId, paypalOrderId);
          return;
        }
      } catch (error) {
        logger.error('Error parsing success URL', error);
      }
    }

    // Cancel: user returned to our cancel URL (e.g. .../checkout/offerId) — not when still on paypal.com
    const isOurCancelUrl = (url.includes('/checkout/') || url.includes('cancel')) && !url.includes('paypal.com');
    if (isOurCancelUrl) {
      if (resultSent.current) return;
      console.log('[PayPalWebView] Cancel detected');
      resultSent.current = true;
      if (onCancel) onCancel();
    }
  };

  const handleMessage = (event) => {
    // PayPal some SDKs might send postMessage events
    console.log('[PayPalWebView] Message:', event.nativeEvent.data);
  };

  if (!approvalUrl) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error-outline" size={48} color="#ef4444" />
        <Text style={styles.errorText}>Invalid PayPal URL</Text>
        <TouchableOpacity style={styles.closeButton} onPress={onCancel}>
          <Text style={styles.closeButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} style={styles.backButton}>
          <MaterialIcons name="close" size={24} color="#2d3748" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Secure PayPal Payment</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.webviewContainer}>
        {loading && (
          <View style={styles.centerLoader} pointerEvents="none">
            <ActivityIndicator size="large" color="#337DEB" />
            <Text style={styles.loaderText}>Redirecting to PayPal...</Text>
          </View>
        )}
        <WebView
          source={{ uri: approvalUrl }}
          onNavigationStateChange={handleNavigationStateChange}
          onMessage={handleMessage}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            logger.error('WebView error:', nativeEvent);
            if (onError) onError(nativeEvent);
          }}
          startInLoadingState={true}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          scalesPageToFit={true}
          style={styles.webview}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    marginTop: 10,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2d3748',
  },
  placeholder: {
    width: 32,
  },
  webviewContainer: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  centerLoader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    zIndex: 1,
  },
  loaderText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    marginTop: 16,
    marginBottom: 24,
  },
  closeButton: {
    backgroundColor: '#337DEB',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  closeButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
});

export default PayPalWebView;
