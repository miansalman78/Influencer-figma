import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Import MaterialIcons - handle both ES6 and CommonJS
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

const OfferConfirmation = ({ navigation, route }) => {
  const offer = route?.params?.offer || route?.params?.offerData || {};
  const isCustomOffer = route?.params?.isCustomOffer === true;

  const handleViewOffers = () => {
    navigation?.navigate('AppNavigator', { initialTab: 'Offers', screen: 'ExploreOffers', params: { refresh: true } });
  };

  const handleGoToDashboard = () => {
    navigation?.navigate('AppNavigator', { initialTab: 'Home' });
  };

  const statusLabel = isCustomOffer ? 'Pending review' : 'Live';
  const successMessage = isCustomOffer
    ? 'Your offer has been sent to the brand and is pending their review. You will be notified when they respond.'
    : 'Your offer is now live and visible to brands. You can view and manage it in My Offers.';
  const infoText = isCustomOffer
    ? 'You will be notified once the brand reviews your offer.'
    : 'Brands can discover and purchase your offer from the marketplace.';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation?.goBack()}>
            <MaterialIcons name="arrow-back" size={24} color="#2d3748" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Offer Confirmation</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.successContainer}>
          <View style={styles.successIconContainer}>
            <MaterialIcons name="check-circle" size={80} color="#10b981" />
          </View>
          <Text style={styles.successTitle}>Offer Created Successfully!</Text>
          <Text style={styles.successMessage}>{successMessage}</Text>
        </View>

        <View style={styles.detailsCard}>
          <Text style={styles.detailsTitle}>Offer Details</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Status</Text>
            <View style={[styles.statusBadge, !isCustomOffer && styles.statusBadgeLive]}>
              <Text style={[styles.statusText, !isCustomOffer && styles.statusTextLive]}>{statusLabel}</Text>
            </View>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Submitted</Text>
            <Text style={styles.detailValue}>{new Date().toLocaleDateString()}</Text>
          </View>
          <View style={styles.divider} />
          <Text style={styles.infoText}>{infoText}</Text>
        </View>

        <View style={styles.actionButtonsContainer}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleViewOffers}>
            <Text style={styles.primaryButtonText}>View My Offers</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleGoToDashboard}>
            <Text style={styles.secondaryButtonText}>Go to Dashboard</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2d3748',
  },
  placeholder: {
    width: 32,
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  successIconContainer: {
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2d3748',
    marginBottom: 12,
    textAlign: 'center',
  },
  successMessage: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  detailsCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  detailsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2d3748',
  },
  statusBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeLive: {
    backgroundColor: '#dcfce7',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#f59e0b',
  },
  statusTextLive: {
    color: '#16a34a',
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 16,
  },
  infoText: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  actionButtonsContainer: {
    paddingHorizontal: 20,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#337DEB',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#337DEB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#337DEB',
  },
});

export default OfferConfirmation;

