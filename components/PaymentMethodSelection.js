/**
 * Payment Method Selection Component
 * 
 * Displays list of saved payment methods and allows selection.
 * Filters payment methods by currency (NGN → Paystack, USD → Stripe + PayPal)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { fetchPaymentMethods } from '../services/paymentMethods.service';

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

const PaymentMethodSelection = ({
  currency, // "NGN" or "USD" - filters payment methods
  onSelect, // Callback: (paymentMethod) => void
  onAddNew, // Callback: () => void
  selectedPaymentMethodId = null, // Pre-selected payment method ID
  navigation,
}) => {
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadPaymentMethods();
  }, [currency]);

  const loadPaymentMethods = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetchPaymentMethods(currency);

      if (response && response.data && response.data.paymentMethods) {
        // Filter by currency and gateway
        const filtered = response.data.paymentMethods.filter(method => {
          if (currency === 'NGN') {
            // NGN → Paystack or Flutterwave
            return method.currency === 'NGN' &&
              (method.cardDetails?.gatewayProvider === 'paystack' ||
                method.cardDetails?.gatewayProvider === 'flutterwave');
          } else if (currency === 'USD') {
            // USD → Stripe or PayPal
            return method.currency === 'USD' && (
              method.cardDetails?.gatewayProvider === 'stripe' ||
              method.type === 'paypal'
            );
          }
          return false;
        });

        setPaymentMethods(filtered);
      } else {
        setPaymentMethods([]);
      }
    } catch (err) {
      console.error('Error loading payment methods:', err);
      setError(err.message || 'Failed to load payment methods');
      setPaymentMethods([]);
    } finally {
      setLoading(false);
    }
  };

  const getPaymentMethodIcon = (method) => {
    if (method.type === 'paypal') {
      return 'account-balance-wallet';
    }
    const provider = method.cardDetails?.gatewayProvider;
    if (provider === 'stripe') {
      return 'credit-card';
    } else if (provider === 'paystack') {
      return 'payment';
    }
    return 'credit-card';
  };

  const getPaymentMethodLabel = (method) => {
    if (method.type === 'paypal') {
      return `PayPal (${method.paypalAccount?.email || 'N/A'})`;
    }

    const cardDetails = method.cardDetails || {};
    const last4 = cardDetails.last4 || '****';
    const brand = cardDetails.brand || 'Card';
    const provider = cardDetails.gatewayProvider || '';

    return `${brand.charAt(0).toUpperCase() + brand.slice(1)} •••• ${last4} (${provider})`;
  };

  const handleSelect = (method) => {
    if (onSelect) {
      onSelect(method);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#337DEB" />
        <Text style={styles.loadingText}>Loading payment methods...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error-outline" size={48} color="#ef4444" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={loadPaymentMethods}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Payment Methods List */}
        {paymentMethods.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="payment" size={64} color="#9ca3af" />
            <Text style={styles.emptyTitle}>No Payment Methods</Text>
            <Text style={styles.emptyText}>
              {currency === 'NGN'
                ? 'Add a Paystack card to pay in NGN'
                : 'Add a Stripe card or PayPal account to pay in USD'}
            </Text>
            {onAddNew && (
              <>
                {currency === 'USD' && (
                  <TouchableOpacity
                    style={styles.addPayPalButtonEmpty}
                    onPress={() => {
                      if (navigation) {
                        navigation.navigate('PaymentMethods', {
                          showAddPayPal: true,
                          onPayPalAdded: (paypalMethod) => {
                            if (onSelect) {
                              onSelect(paypalMethod);
                            }
                            if (navigation?.goBack) {
                              navigation.goBack();
                            }
                          }
                        });
                      } else if (onAddNew) {
                        onAddNew('paypal');
                      }
                    }}
                  >
                    <MaterialIcons name="account-balance-wallet" size={32} color="#337DEB" />
                    <Text style={styles.addPayPalTextEmpty}>Add PayPal Account</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={onAddNew}
                >
                  <MaterialIcons name="add" size={20} color="#ffffff" />
                  <Text style={styles.addButtonText}>
                    {currency === 'USD' ? 'Add Stripe Card' : 'Add Paystack Card'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : (
          <>
            {paymentMethods.map((method) => {
              const isSelected = selectedPaymentMethodId === method._id;
              return (
                <TouchableOpacity
                  key={method._id}
                  style={[
                    styles.paymentMethodCard,
                    isSelected && styles.paymentMethodCardSelected,
                  ]}
                  onPress={() => handleSelect(method)}
                >
                  <View style={styles.paymentMethodContent}>
                    <View
                      style={[
                        styles.iconContainer,
                        isSelected && styles.iconContainerSelected,
                      ]}
                    >
                      <MaterialIcons
                        name={getPaymentMethodIcon(method)}
                        size={24}
                        color={isSelected ? '#ffffff' : '#337DEB'}
                      />
                    </View>
                    <View style={styles.paymentMethodInfo}>
                      <Text style={styles.paymentMethodLabel}>
                        {getPaymentMethodLabel(method)}
                      </Text>
                      {method.isDefault && (
                        <View style={styles.defaultBadge}>
                          <Text style={styles.defaultBadgeText}>Default</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  {isSelected && (
                    <MaterialIcons name="check-circle" size={24} color="#10b981" />
                  )}
                </TouchableOpacity>
              );
            })}

            {onAddNew && (
              <>
                {currency === 'USD' && (
                  <TouchableOpacity
                    style={styles.addPayPalButton}
                    onPress={() => {
                      if (navigation) {
                        navigation.navigate('PaymentMethods', {
                          showAddPayPal: true,
                          onPayPalAdded: (paypalMethod) => {
                            if (onSelect) {
                              onSelect(paypalMethod);
                            }
                            if (navigation?.goBack) {
                              navigation.goBack();
                            }
                          }
                        });
                      } else if (onAddNew) {
                        onAddNew('paypal');
                      }
                    }}
                  >
                    <MaterialIcons name="account-balance-wallet" size={24} color="#337DEB" />
                    <Text style={styles.addPayPalText}>Add PayPal Account</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.addNewCard}
                  onPress={onAddNew}
                >
                  <MaterialIcons name="add-circle-outline" size={24} color="#337DEB" />
                  <Text style={styles.addNewText}>
                    {currency === 'USD' ? 'Add Stripe Card' : 'Add Paystack Card'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#6b7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    marginTop: 16,
    fontSize: 14,
    color: '#ef4444',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#337DEB',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2d3748',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#337DEB',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  paymentMethodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  paymentMethodCardSelected: {
    borderColor: '#337DEB',
    backgroundColor: '#f0f4ff',
  },
  paymentMethodContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e6ecff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconContainerSelected: {
    backgroundColor: '#337DEB',
  },
  paymentMethodInfo: {
    flex: 1,
  },
  paymentMethodLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: 4,
  },
  defaultBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  defaultBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#10b981',
  },
  addNewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  addNewText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#337DEB',
  },
  addPayPalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f9ff',
    borderWidth: 2,
    borderColor: '#0ea5e9',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  addPayPalText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0ea5e9',
  },
  addPayPalButtonEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f9ff',
    borderWidth: 2,
    borderColor: '#0ea5e9',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 24,
    marginHorizontal: 16,
    marginBottom: 16,
    gap: 8,
  },
  addPayPalTextEmpty: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0ea5e9',
    marginTop: 8,
  },
});

export default PaymentMethodSelection;


