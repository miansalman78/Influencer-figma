/**
 * Creator Wallet Payment Methods Screen
 * 
 * For creators/influencers to manage bank accounts for receiving payments:
 * - View all bank accounts
 * - Add new bank account
 * - Update bank account (set default)
 * - Delete bank account
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
  getWallet,
  getPaymentMethods,
  addPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
} from '../services/wallet';

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

const CreatorWalletPaymentMethodsScreen = ({ navigation }) => {
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [walletCurrency, setWalletCurrency] = useState('USD');

  const [submitting, setSubmitting] = useState(false);

  // Add bank account form state
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState('savings');
  const [selectedCurrency, setSelectedCurrency] = useState('NGN');
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    loadWalletData();
    loadPaymentMethods();
  }, []);

  const loadWalletData = async () => {
    try {
      const response = await getWallet();
      if (response && response.data && response.data.currency) {
        setWalletCurrency(response.data.currency);
      }
    } catch (err) {
      console.error('Error loading wallet data:', err);
    }
  };

  const loadPaymentMethods = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getPaymentMethods();

      if (response && response.data && response.data.paymentMethods) {
        setPaymentMethods(response.data.paymentMethods);
      } else {
        setPaymentMethods([]);
      }
    } catch (err) {
      console.error('Error loading payment methods:', err);
      setError(err.message || 'Failed to load bank accounts');
      setPaymentMethods([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddBankAccount = async () => {
    // Validate form
    if (!bankName.trim()) {
      Alert.alert('Error', 'Please enter bank name');
      return;
    }
    if (!accountNumber.trim()) {
      Alert.alert('Error', 'Please enter account number');
      return;
    }
    if (!accountName.trim()) {
      Alert.alert('Error', 'Please enter account name');
      return;
    }

    try {
      setSubmitting(true);
      await addPaymentMethod({
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        accountName: accountName.trim(),
        accountType: accountType,
        currency: selectedCurrency,
        isDefault: isDefault,
      });

      Alert.alert('Success', 'Bank account added successfully');
      setShowAddModal(false);
      resetForm();
      loadPaymentMethods();
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to add bank account');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetDefault = async (methodId) => {
    try {
      await updatePaymentMethod(methodId, { isDefault: true });
      Alert.alert('Success', 'Bank account set as default');
      loadPaymentMethods();
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to update bank account');
    }
  };

  // Bank accounts cannot be deleted for security and compliance reasons
  // Users can only set a different account as default
  const handleDeleteAttempt = () => {
    Alert.alert(
      'Cannot Delete Account',
      'Bank accounts cannot be deleted for security and compliance reasons. You can set a different account as default instead.',
      [{ text: 'OK' }]
    );
  };

  const resetForm = () => {
    setBankName('');
    setAccountNumber('');
    setAccountName('');
    setAccountType('savings');
    setSelectedCurrency(walletCurrency || 'NGN');
    setIsDefault(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#337DEB" />
          <Text style={styles.loadingText}>Loading bank accounts...</Text>
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
          <Text style={styles.headerTitle}>
            {walletCurrency === 'USD' ? 'Payment Methods' : 'Bank Accounts'}
          </Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => {
              resetForm();
              setShowAddModal(true);
            }}
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
            <MaterialIcons
              name={walletCurrency === 'USD' ? 'account-balance-wallet' : 'account-balance'}
              size={64}
              color="#9ca3af"
            />
            <Text style={styles.emptyTitle}>
              {walletCurrency === 'USD' ? 'No Payment Methods' : 'No Bank Accounts'}
            </Text>
            <Text style={styles.emptyText}>
              {walletCurrency === 'USD'
                ? 'Add a USD bank account to receive payments from brands.'
                : 'Add a bank account to receive payments from brands.'}
            </Text>
            {walletCurrency === 'USD' ? (
              <View style={styles.usdInfoContainer}>
                <Text style={styles.usdInfoText}>
                  For USD withdrawals, you can add bank accounts that support USD transfers.
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.addFirstButton}
                onPress={() => {
                  resetForm();
                  setShowAddModal(true);
                }}
              >
                <MaterialIcons name="add" size={20} color="#ffffff" />
                <Text style={styles.addFirstButtonText}>Add Bank Account</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.methodsList}>
            {paymentMethods.map((method, index) => (
              <View key={method.id || index} style={styles.methodCard}>
                <View style={styles.methodContent}>
                  <View
                    style={[
                      styles.iconContainer,
                      method.isDefault && styles.iconContainerDefault,
                    ]}
                  >
                    <MaterialIcons
                      name={
                        method.type === 'paypal' || method.paypalAccount
                          ? 'account-balance-wallet'
                          : method.cardDetails
                            ? 'credit-card'
                            : 'account-balance'
                      }
                      size={24}
                      color={method.isDefault ? '#ffffff' : '#337DEB'}
                    />
                  </View>
                  <View style={styles.methodInfo}>
                    <Text style={styles.methodLabel}>
                      {method.bankName || method.paypalAccount?.email || method.cardDetails?.brand || 'Payment Method'}
                    </Text>
                    <Text style={styles.methodDetails}>
                      {method.accountName || method.paypalAccount?.email || 'N/A'}
                    </Text>
                    <Text style={styles.methodAccount}>
                      {method.accountNumber
                        ? `****${method.accountNumber.slice(-4)}`
                        : method.paypalAccount?.email
                          ? method.paypalAccount.email
                          : method.cardDetails?.last4
                            ? `****${method.cardDetails.last4}`
                            : 'N/A'}
                    </Text>
                    {method.currency && (
                      <View style={styles.currencyBadge}>
                        <Text style={styles.currencyBadgeText}>{method.currency}</Text>
                      </View>
                    )}
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
                      onPress={() => handleSetDefault(method.id)}
                    >
                      <MaterialIcons name="star-outline" size={20} color="#337DEB" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Add Bank Account Modal */}
      <Modal
        visible={showAddModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowAddModal(false);
          resetForm();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {walletCurrency === 'USD' ? 'Add Payment Method' : 'Add Bank Account'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
              >
                <MaterialIcons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {walletCurrency === 'USD' && (
                <View style={styles.currencyNote}>
                  <MaterialIcons name="info-outline" size={20} color="#0284c7" />
                  <Text style={styles.currencyNoteText}>
                    For USD withdrawals, you can add bank accounts that support USD transfers.
                  </Text>
                </View>
              )}

              <Text style={styles.modalLabel}>Currency *</Text>
              <View style={styles.accountTypeButtons}>
                <TouchableOpacity
                  style={[
                    styles.accountTypeButton,
                    selectedCurrency === 'NGN' && styles.accountTypeButtonSelected,
                  ]}
                  onPress={() => setSelectedCurrency('NGN')}
                >
                  <Text
                    style={[
                      styles.accountTypeButtonText,
                      selectedCurrency === 'NGN' && styles.accountTypeButtonTextSelected,
                    ]}
                  >
                    NGN (Naira)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.accountTypeButton,
                    selectedCurrency === 'USD' && styles.accountTypeButtonSelected,
                  ]}
                  onPress={() => setSelectedCurrency('USD')}
                >
                  <Text
                    style={[
                      styles.accountTypeButtonText,
                      selectedCurrency === 'USD' && styles.accountTypeButtonTextSelected,
                    ]}
                  >
                    USD (Dollar)
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.modalLabel}>Bank Name *</Text>
              <TextInput
                style={styles.modalInput}
                value={bankName}
                onChangeText={setBankName}
                placeholder="Enter bank name"
                placeholderTextColor="#9CA3AF"
              />

              <Text style={styles.modalLabel}>Account Number *</Text>
              <TextInput
                style={styles.modalInput}
                value={accountNumber}
                onChangeText={setAccountNumber}
                placeholder="Enter account number"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
              />

              <Text style={styles.modalLabel}>Account Name *</Text>
              <TextInput
                style={styles.modalInput}
                value={accountName}
                onChangeText={setAccountName}
                placeholder="Enter account holder name"
                placeholderTextColor="#9CA3AF"
              />

              <Text style={styles.modalLabel}>Account Type</Text>
              <View style={styles.accountTypeButtons}>
                <TouchableOpacity
                  style={[
                    styles.accountTypeButton,
                    accountType === 'savings' && styles.accountTypeButtonSelected,
                  ]}
                  onPress={() => setAccountType('savings')}
                >
                  <Text
                    style={[
                      styles.accountTypeButtonText,
                      accountType === 'savings' && styles.accountTypeButtonTextSelected,
                    ]}
                  >
                    Savings
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.accountTypeButton,
                    accountType === 'current' && styles.accountTypeButtonSelected,
                  ]}
                  onPress={() => setAccountType('current')}
                >
                  <Text
                    style={[
                      styles.accountTypeButtonText,
                      accountType === 'current' && styles.accountTypeButtonTextSelected,
                    ]}
                  >
                    Current
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.checkboxContainer}
                onPress={() => setIsDefault(!isDefault)}
              >
                <MaterialIcons
                  name={isDefault ? 'check-box' : 'check-box-outline-blank'}
                  size={24}
                  color={isDefault ? '#337DEB' : '#9ca3af'}
                />
                <Text style={styles.checkboxLabel}>Set as default</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalConfirmButton, submitting && styles.modalConfirmButtonDisabled]}
                onPress={handleAddBankAccount}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.modalConfirmButtonText}>Add Account</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
  methodAccount: {
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
  currencyBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  currencyBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#0284c7',
  },
  usdInfoContainer: {
    backgroundColor: '#f0f9ff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bae6fd',
    marginTop: 16,
    width: '100%',
  },
  usdInfoText: {
    fontSize: 14,
    color: '#0284c7',
    textAlign: 'center',
    lineHeight: 20,
  },
  currencyNote: {
    flexDirection: 'row',
    backgroundColor: '#f0f9ff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bae6fd',
    marginBottom: 16,
    gap: 8,
  },
  currencyNoteText: {
    flex: 1,
    fontSize: 13,
    color: '#0284c7',
    lineHeight: 18,
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
    marginTop: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1f2937',
    backgroundColor: '#ffffff',
    marginBottom: 4,
  },
  accountTypeButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  accountTypeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  accountTypeButtonSelected: {
    borderColor: '#337DEB',
    backgroundColor: '#f0f4ff',
  },
  accountTypeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  accountTypeButtonTextSelected: {
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
  modalConfirmButtonDisabled: {
    opacity: 0.6,
  },
  modalConfirmButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  typeSelector: {
    paddingVertical: 8,
  },
  typeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 12,
    backgroundColor: '#ffffff',
  },
  typeInfo: {
    flex: 1,
    marginLeft: 16,
  },
  typeName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
  },
  typeDesc: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  modalBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 4,
  },
  modalBackButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
});

export default CreatorWalletPaymentMethodsScreen;




