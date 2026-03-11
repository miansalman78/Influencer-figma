/**
 * NGN Payment WebView Component
 * 
 * A stable, WebView-based implementation for NGN payments (Paystack and Flutterwave)
 * Bypasses buggy native SDKs by using direct WebView integration.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

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

const NGNPaymentWebView = ({
  url,
  htmlContent, // Raw HTML (legacy - prefer URL for Paystack)
  onSuccess,
  onCancel,
  onError,
  provider = 'paystack', // 'paystack' or 'flutterwave'
  paystackRef, // Reference from initialize - used when 3DS redirects to standard.paystack.co/close
}) => {
  const [loading, setLoading] = useState(true);
  const resultSent = React.useRef(false); // Flag to prevent double-firing onSuccess/onCancel
  const isHtmlContent = !!htmlContent;

  // Hide loader after delay - onLoadEnd often doesn't fire on Android for URLs/redirects
  useEffect(() => {
    const delay = isHtmlContent ? 3000 : 4000;
    const t = setTimeout(() => setLoading(false), delay);
    return () => clearTimeout(t);
  }, [isHtmlContent, url, htmlContent]);

  const handleNavigationStateChange = (navState) => {
    const { url: currentUrl } = navState;
    console.log(`[NGNPaymentWebView] Navigated to: ${currentUrl}`);

    // Check for Paystack success
    if (provider === 'paystack') {
      // Paystack success: callback URL with reference, or 3DS redirect to standard.paystack.co/close
      if (currentUrl.includes('trxref=') || currentUrl.includes('reference=')) {
        if (resultSent.current) return;
        const reference = currentUrl.split('reference=')[1]?.split('&')[0] ||
          currentUrl.split('trxref=')[1]?.split('&')[0];
        if (reference && onSuccess) {
          resultSent.current = true;
          onSuccess({ reference, provider: 'paystack' });
        }
      } else if (currentUrl.includes('standard.paystack.co/close')) {
        // 3DS completion - use stored reference from initialize
        if (resultSent.current) return;
        if (paystackRef && onSuccess) {
          resultSent.current = true;
          onSuccess({ reference: paystackRef, provider: 'paystack' });
        } else if (onCancel) {
          resultSent.current = true;
          onCancel();
        }
      } else if (currentUrl.includes('cancel') || (currentUrl.includes('close') && !currentUrl.includes('paystack.co'))) {
        if (resultSent.current) return;
        if (onCancel) {
          resultSent.current = true;
          onCancel();
        }
      }
    }

    // Check for Flutterwave success
    if (provider === 'flutterwave') {
      // Flutterwave success often has status=successful
      if (currentUrl.includes('status=successful') || currentUrl.includes('tx_ref=')) {
        if (resultSent.current) return;
        const tx_ref = currentUrl.split('tx_ref=')[1]?.split('&')[0];
        const transaction_id = currentUrl.split('transaction_id=')[1]?.split('&')[0];

        if (onSuccess) {
          resultSent.current = true;
          onSuccess({ tx_ref, transaction_id, status: 'successful', provider: 'flutterwave' });
        }
      } else if (currentUrl.includes('status=cancelled') || currentUrl.includes('cancelled')) {
        if (resultSent.current) return;
        if (onCancel) {
          resultSent.current = true;
          onCancel();
        }
      }
    }
  };

  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.event === 'ready') {
        setLoading(false);
        return;
      }
      if (data.status === 'success' || data.event === 'charge:success' || data.status === 'successful') {
        if (resultSent.current) return;
        if (onSuccess) {
          resultSent.current = true;
          onSuccess(data);
        }
      } else if (data.status === 'cancelled' || data.event === 'closed') {
        if (resultSent.current) return;
        if (onCancel) {
          resultSent.current = true;
          onCancel();
        }
      } else if (data.status === 'failed' && onError) {
        if (resultSent.current) return;
        resultSent.current = true;
        onError(new Error(data.error || 'Payment failed'));
      }
    } catch (e) {
      // ignore non-JSON messages
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} style={styles.backButton}>
          <MaterialIcons name="close" size={24} color="#2d3748" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {provider.charAt(0).toUpperCase() + provider.slice(1)} Payment
        </Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.webviewContainer}>
        {loading && (
          <View style={styles.centerLoader} pointerEvents="none">
            <ActivityIndicator size="large" color="#337DEB" />
            <Text style={styles.loaderText}>Loading secure payment...</Text>
          </View>
        )}
        <WebView
          source={htmlContent ? { html: htmlContent, baseUrl: 'https://js.paystack.co' } : { uri: url || 'about:blank' }}
          originWhitelist={['*']}
          mixedContentMode="compatibility"
          // Removed hardcoded outdated User-Agent to allow device default (better for Cloudflare)
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
          cacheEnabled={true}
          onNavigationStateChange={handleNavigationStateChange}
          onMessage={handleMessage}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.warn('[NGNPaymentWebView] Error:', nativeEvent);
            setLoading(false);
            if (onError) onError(nativeEvent);
          }}
          startInLoadingState={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowFileAccess={true}
          scalesPageToFit={true}
          style={styles.webview}
        />
      </View>
    </SafeAreaView>
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
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2d3748',
  },
  placeholder: {
    width: 32,
  },
  webviewContainer: {
    flex: 1,
    minHeight: 400,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
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
});

export default NGNPaymentWebView;
