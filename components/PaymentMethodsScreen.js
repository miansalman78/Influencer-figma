/**
 * Payment Methods Management Screen
 * 
 * Allows brands to:
 * - View all saved payment methods
 * - Add new payment methods (Stripe, Paystack, PayPal)
 * - Update payment methods (set default, nickname)
 * - Delete payment methods
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
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  fetchPaymentMethods,
  addPayPalAccount,
  updatePaymentMethod,
  deletePaymentMethod,
} from '../services/paymentMethods.service';
import AddCardModal from './AddCardModal';

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

const PaymentMethodsScreen = ({ navigation, route }) => {
  const { showAddPayPal, onPayPalAdded } = route?.params || {};
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMethodType, setAddMethodType] = useState(null); // 'paypal', 'stripe', 'paystack'
  const [paypalEmail, setPaypalEmail] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingMethod, setEditingMethod] = useState(null);
  const [nickname, setNickname] = useState('');
  const [showAddCard, setShowAddCard] = useState(false);
  const [cardCurrency, setCardCurrency] = useState('USD');

  useEffect(() => {
    loadPaymentMethods();
    if (showAddPayPal) {
      setAddMethodType('paypal');
      setShowAddModal(true);
    }
  }, [showAddPayPal]);

  const loadPaymentMethods = async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError(null);

      // Try cache first if not forcing refresh
      if (!forceRefresh) {
        try {
          const cacheUtils = await import('../utils/cache');
          const cached = await cacheUtils.getCache('payment_methods');
          if (cached) {
            setPaymentMethods(cached);
            setLoading(false);
            console.log('[PaymentMethodsScreen] Using cached payment methods');
          }
        } catch (cacheError) {
          console.log('[PaymentMethodsScreen] Cache read failed, fetching fresh data');
        }
      }

      // Fetch fresh data
      const response = await fetchPaymentMethods();

      if (response && response.data && response.data.paymentMethods) {
        const methods = response.data.paymentMethods;
        setPaymentMethods(methods);

        // Cache for 5 minutes (payment methods can change frequently)
        try {
          const cacheUtils = await import('../utils/cache');
          await cacheUtils.setCache('payment_methods', methods, cacheUtils.DEFAULT_TTL.SHORT);
        } catch (cacheError) {
          console.log('[PaymentMethodsScreen] Cache write failed');
        }
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

  const handleSetDefault = async (methodId) => {
    try {
      await updatePaymentMethod(methodId, { isDefault: true });
      Alert.alert('Success', 'Payment method set as default');
      // Clear cache and reload
      try {
        const cacheUtils = await import('../utils/cache');
        await cacheUtils.removeCache('payment_methods');
      } catch (e) {
        // Ignore cache errors
      }
      loadPaymentMethods(true); // Force refresh
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to update payment method');
    }
  };

  const handleDelete = async (methodId) => {
    Alert.alert(
      'Delete Payment Method',
      'Are you sure you want to delete this payment method?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePaymentMethod(methodId);
              Alert.alert('Success', 'Payment method deleted');
              // Clear cache and reload
              try {
                const cacheUtils = await import('../utils/cache');
                await cacheUtils.removeCache('payment_methods');
              } catch (e) {
                // Ignore cache errors
              }
              loadPaymentMethods(true); // Force refresh
            } catch (error) {
              Alert.alert('Error', error.message || 'Failed to delete payment method');
            }
          },
        },
      ]
    );
  };

  const handleEditNickname = (method) => {
    setEditingMethod(method);
    setNickname(method.nickname || '');
  };

  const handleSaveNickname = async () => {
    if (!editingMethod) return;

    try {
      await updatePaymentMethod(editingMethod._id, { nickname });
      Alert.alert('Success', 'Nickname updated');
      setEditingMethod(null);
      setNickname('');
      // Clear cache and reload
      try {
        const cacheUtils = await import('../utils/cache');
        await cacheUtils.removeCache('payment_methods');
      } catch (e) {
        // Ignore cache errors
      }
      loadPaymentMethods(true); // Force refresh
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to update nickname');
    }
  };

  const handleAddPayPal = async () => {
    if (!paypalEmail.trim()) {
      Alert.alert('Error', 'Please enter a PayPal email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(paypalEmail.trim())) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    try {
      setSubmitting(true);
      const response = await addPayPalAccount({
        email: paypalEmail.trim(),
        isDefault: isDefault,
      });

      if (response && response.success) {
        Alert.alert('Success', 'PayPal account added successfully');
        setShowAddModal(false);
        setAddMethodType(null);
        setPaypalEmail('');
        setIsDefault(false);
        // Clear cache and reload
        try {
          const cacheUtils = await import('../utils/cache');
          await cacheUtils.removeCache('payment_methods');
        } catch (e) {
          // Ignore cache errors
        }
        await loadPaymentMethods(true); // Force refresh

        if (onPayPalAdded && response.data) {
          onPayPalAdded(response.data);
        }

        if (showAddPayPal && navigation?.goBack) {
          navigation.goBack();
        }
      } else {
        throw new Error(response?.message || 'Failed to add PayPal account');
      }
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to add PayPal account');
    } finally {
      setSubmitting(false);
    }
  };

  const resetAddForm = () => {
    setAddMethodType(null);
    setPaypalEmail('');
    setIsDefault(false);
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

  const getCurrencyLabel = (currency) => {
    return currency === 'USD' ? 'USD ($)' : 'NGN (₦)';
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#337DEB" />
          <Text style={styles.loadingText}>Loading payment methods...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation?.goBack()}
          >
            <MaterialIcons name="arrow-back" size={24} color="#2d3748" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Payment Methods</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowAddModal(true)}
          >
            <MaterialIcons name="add" size={24} color="#337DEB" />
          </TouchableOpacity>
        </View>

        {error && (
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
        )}

        {!error && paymentMethods.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="payment" size={64} color="#9ca3af" />
            <Text style={styles.emptyTitle}>No Payment Methods</Text>
            <Text style={styles.emptyText}>
              Add a payment method to start making payments.
            </Text>
            <TouchableOpacity
              style={styles.addFirstButton}
              onPress={() => setShowAddModal(true)}
            >
              <MaterialIcons name="add" size={20} color="#ffffff" />
              <Text style={styles.addFirstButtonText}>Add Payment Method</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.methodsList}>
            {paymentMethods.map((method) => (
              <View key={method._id} style={styles.methodCard}>
                <View style={styles.methodContent}>
                  <View
                    style={[
                      styles.iconContainer,
                      method.isDefault && styles.iconContainerDefault,
                    ]}
                  >
                    <MaterialIcons
                      name={getPaymentMethodIcon(method)}
                      size={24}
                      color={method.isDefault ? '#ffffff' : '#337DEB'}
                    />
                  </View>
                  <View style={styles.methodInfo}>
                    <Text style={styles.methodLabel}>
                      {method.nickname || getPaymentMethodLabel(method)}
                    </Text>
                    <Text style={styles.methodDetails}>
                      {getPaymentMethodLabel(method)}
                    </Text>
                    <Text style={styles.methodCurrency}>
                      {getCurrencyLabel(method.currency)}
                    </Text>
                    {method.isDefault && (
                      <View style={styles.defaultBadge}>
                        <Text style={styles.defaultBadgeText}>Default</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.methodActions}>
                  {!method.isDefault && (
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleSetDefault(method._id)}
                    >
                      <MaterialIcons name="star-outline" size={20} color="#337DEB" />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleEditNickname(method)}
                  >
                    <MaterialIcons name="edit" size={20} color="#6b7280" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleDelete(method._id)}
                  >
                    <MaterialIcons name="delete" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Edit Nickname Modal */}
      <Modal
        visible={!!editingMethod}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setEditingMethod(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Nickname</Text>
              <TouchableOpacity onPress={() => setEditingMethod(null)}>
                <MaterialIcons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.modalLabel}>Nickname</Text>
              <TextInput
                style={styles.modalInput}
                value={nickname}
                onChangeText={setNickname}
                placeholder="Enter nickname (e.g., My Business Card)"
                placeholderTextColor="#9CA3AF"
              />
            </View>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setEditingMethod(null);
                  setNickname('');
                }}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={handleSaveNickname}
              >
                <Text style={styles.modalConfirmButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Payment Method Modal */}
      <Modal
        visible={showAddModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowAddModal(false);
          resetAddForm();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Payment Method</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowAddModal(false);
                  resetAddForm();
                }}
              >
                <MaterialIcons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {!addMethodType ? (
                <>
                  <Text style={styles.modalLabel}>Select Payment Method Type</Text>

                  {/* PayPal Option */}
                  <TouchableOpacity
                    style={styles.methodTypeButton}
                    onPress={() => setAddMethodType('paypal')}
                  >
                    <MaterialIcons name="account-balance-wallet" size={24} color="#337DEB" />
                    <View style={styles.methodTypeInfo}>
                      <Text style={styles.methodTypeName}>PayPal</Text>
                      <Text style={styles.methodTypeDescription}>Add PayPal account (USD only)</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={24} color="#9ca3af" />
                  </TouchableOpacity>

                  {/* Stripe Card Option */}
                  <TouchableOpacity
                    style={styles.methodTypeButton}
                    onPress={() => {
                      setAddMethodType(null);
                      setShowAddModal(false);
                      setCardCurrency('USD');
                      setShowAddCard(true);
                    }}
                  >
                    <MaterialIcons name="credit-card" size={24} color="#337DEB" />
                    <View style={styles.methodTypeInfo}>
                      <Text style={styles.methodTypeName}>Stripe Card</Text>
                      <Text style={styles.methodTypeDescription}>Add credit/debit card (USD only)</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={24} color="#9ca3af" />
                  </TouchableOpacity>

                  {/* Paystack/Flutterwave Card Option */}
                  <TouchableOpacity
                    style={styles.methodTypeButton}
                    onPress={() => {
                      setAddMethodType(null);
                      setShowAddModal(false);
                      setCardCurrency('NGN');
                      setShowAddCard(true);
                    }}
                  >
                    <MaterialIcons name="payment" size={24} color="#337DEB" />
                    <View style={styles.methodTypeInfo}>
                      <Text style={styles.methodTypeName}>NGN Card</Text>
                      <Text style={styles.methodTypeDescription}>Add card via Paystack/Flutterwave (NGN)</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={24} color="#9ca3af" />
                  </TouchableOpacity>
                </>
              ) : addMethodType === 'paypal' ? (
                <>
                  <TouchableOpacity
                    style={styles.backButtonInModal}
                    onPress={() => setAddMethodType(null)}
                  >
                    <MaterialIcons name="arrow-back" size={20} color="#337DEB" />
                    <Text style={styles.backButtonText}>Back</Text>
                  </TouchableOpacity>

                  <Text style={styles.modalLabel}>PayPal Email Address *</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={paypalEmail}
                    onChangeText={setPaypalEmail}
                    placeholder="Enter PayPal email"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Text style={styles.modalNote}>
                    This email will be used for PayPal payments. Make sure it's a valid PayPal account.
                  </Text>

                  <TouchableOpacity
                    style={styles.checkboxContainer}
                    onPress={() => setIsDefault(!isDefault)}
                  >
                    <MaterialIcons
                      name={isDefault ? 'check-box' : 'check-box-outline-blank'}
                      size={24}
                      color={isDefault ? '#337DEB' : '#9ca3af'}
                    />
                    <Text style={styles.checkboxLabel}>Set as default payment method</Text>
                  </TouchableOpacity>
                </>
              ) : null}
            </ScrollView>
            {addMethodType === 'paypal' && (
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => {
                    setShowAddModal(false);
                    resetAddForm();
                  }}
                >
                  <Text style={styles.modalCancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalConfirmButton, submitting && styles.modalConfirmButtonDisabled]}
                  onPress={handleAddPayPal}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.modalConfirmButtonText}>Add PayPal</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Add Card Modal Integration */}
      <AddCardModal
        visible={showAddCard}
        onClose={() => setShowAddCard(false)}
        onSuccess={() => {
          setShowAddCard(false);
          loadPaymentMethods(true);
        }}
        currency={cardCurrency}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2d3748',
  },
  addButton: {
    padding: 4,
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
  addFirstButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#337DEB',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  addFirstButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  methodsList: {
    padding: 16,
  },
  methodCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  methodContent: {
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
  iconContainerDefault: {
    backgroundColor: '#337DEB',
  },
  methodInfo: {
    flex: 1,
  },
  methodLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: 4,
  },
  methodDetails: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  methodCurrency: {
    fontSize: 12,
    color: '#9ca3af',
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
  methodActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2d3748',
  },
  modalBody: {
    padding: 16,
    maxHeight: 500,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1f2937',
    backgroundColor: '#ffffff',
    marginBottom: 8,
  },
  modalNote: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 18,
  },
  methodTypeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  methodTypeInfo: {
    flex: 1,
  },
  methodTypeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: 4,
  },
  methodTypeDescription: {
    fontSize: 14,
    color: '#6b7280',
  },
  backButtonInModal: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#337DEB',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#374151',
    marginLeft: 8,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  modalCancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#337DEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});

export default PaymentMethodsScreen;

