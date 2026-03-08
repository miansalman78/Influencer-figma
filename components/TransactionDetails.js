import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getTransactionById } from '../services/transactions';
import { getCurrencySymbol } from '../utils/currency';

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

const TransactionDetails = ({ navigation, route }) => {
  const { transaction: initialTransaction } = route.params || {};
  const [transaction, setTransaction] = useState(initialTransaction || null);
  const [loading, setLoading] = useState(!initialTransaction);

  useEffect(() => {
    if (!initialTransaction && route.params?.transactionId) {
      loadTransaction();
    }
  }, []);

  const loadTransaction = async () => {
    try {
      setLoading(true);
      const transactionId = route.params?.transactionId;
      if (transactionId) {
        const response = await getTransactionById(transactionId);
        if (response && response.data) {
          setTransaction(response.data);
        }
      }
    } catch (error) {
      console.error('Error loading transaction:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation?.goBack()}
          >
            <MaterialIcons name="arrow-back" size={24} color="#2d3748" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Transaction Details</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#337DEB" />
          <Text style={styles.loadingText}>Loading transaction...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!transaction) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation?.goBack()}
          >
            <MaterialIcons name="arrow-back" size={24} color="#2d3748" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Transaction Details</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Transaction not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isEarning = transaction.type === 'earning' || transaction.type === 'credit' || transaction.type === 'deposit';
  const amount = transaction.amount || 0;
  const currency = transaction.currency || 'USD';
  const currencySymbol = getCurrencySymbol(currency);
  const formattedAmount = isEarning
    ? `+${currencySymbol}${Math.abs(amount).toFixed(2)}`
    : `-${currencySymbol}${Math.abs(amount).toFixed(2)}`;

  const status = transaction.status || 'completed';
  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':
      case 'success':
        return '#10b981';
      case 'pending':
        return '#f59e0b';
      case 'failed':
      case 'cancelled':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation?.goBack()}
          >
            <MaterialIcons name="arrow-back" size={24} color="#2d3748" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Transaction Details</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.content}>
          <View style={styles.amountCard}>
            <Text style={styles.amountLabel}>Amount</Text>
            <Text style={[styles.amountValue, { color: isEarning ? '#10b981' : '#ef4444' }]}>
              {formattedAmount}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(status) }]}>
              <Text style={styles.statusText}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Transaction Information</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Description</Text>
              <Text style={styles.infoValue}>
                {transaction.description || transaction.title || 'Transaction'}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Type</Text>
              <Text style={styles.infoValue}>
                {transaction.type ? transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1) : 'N/A'}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Date</Text>
              <Text style={styles.infoValue}>
                {transaction.createdAt
                  ? new Date(transaction.createdAt).toLocaleString()
                  : transaction.date || 'N/A'}
              </Text>
            </View>
            {transaction.reference && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Reference</Text>
                <Text style={styles.infoValue}>{transaction.reference}</Text>
              </View>
            )}
            {transaction.transactionId && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Transaction ID</Text>
                <Text style={styles.infoValue}>{transaction.transactionId}</Text>
              </View>
            )}
          </View>

          {transaction.payment && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Payment Details</Text>
              {transaction.payment.gatewayProvider && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Payment Gateway</Text>
                  <Text style={styles.infoValue}>
                    {transaction.payment.gatewayProvider.charAt(0).toUpperCase() + transaction.payment.gatewayProvider.slice(1)}
                  </Text>
                </View>
              )}
              {transaction.payment.paymentMethod && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Payment Method</Text>
                  <Text style={styles.infoValue}>{transaction.payment.paymentMethod}</Text>
                </View>
              )}
            </View>
          )}

          {transaction.orderId && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Related Order</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Order ID</Text>
                <Text style={styles.infoValue}>{transaction.orderId}</Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: '#fff',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2d3748',
  },
  placeholder: {
    width: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  content: {
    padding: 20,
  },
  amountCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  amountLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  amountValue: {
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2d3748',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  infoLabel: {
    fontSize: 14,
    color: '#6b7280',
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2d3748',
    flex: 2,
    textAlign: 'right',
  },
});

export default TransactionDetails;



