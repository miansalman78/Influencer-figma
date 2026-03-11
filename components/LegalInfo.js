import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

const LegalInfo = ({ navigation, route }) => {
  const legalItems = [
    {
      id: 'terms',
      title: 'Terms of Service',
      icon: 'description',
      content: `Last updated: January 2024

Welcome to Influencer App. By using our service, you agree to the following terms:

1. Account Responsibility
You are responsible for maintaining the confidentiality of your account and password.

2. User Content
You retain ownership of content you post but grant us a license to use it.

3. Prohibited Activities
You may not use the service for illegal purposes or to harm others.

4. Payment Terms
Payments are processed securely. Refunds are subject to our refund policy.

5. Termination
We reserve the right to terminate accounts that violate these terms.

For the complete terms, please visit our website.`,
    },
    {
      id: 'privacy',
      title: 'Privacy Policy',
      icon: 'privacy-tip',
      content: `Last updated: January 2024

Your privacy is important to us. This policy explains how we collect and use your information:

1. Information We Collect
- Account information (name, email, phone)
- Profile information and social media connections
- Payment information (processed securely)
- Usage data and analytics

2. How We Use Your Information
- To provide and improve our services
- To process payments
- To communicate with you
- To ensure platform security

3. Data Sharing
We do not sell your personal information. We may share data with:
- Service providers (payment processors, analytics)
- Legal authorities when required

4. Your Rights
You can access, update, or delete your data at any time through Settings.

5. Data Security
We use industry-standard security measures to protect your information.

For questions, contact privacy@influencerapp.com`,
    },
    {
      id: 'about',
      title: 'About the App',
      icon: 'info',
      content: `Influencer App Version 1.0.0

Influencer App connects brands with content creators for authentic marketing collaborations.

Features:
- Campaign creation and management
- Creator discovery and matching
- Secure payment processing
- Real-time messaging
- Performance analytics

Our Mission:
To create a transparent, fair platform where brands and creators can collaborate effectively.

Contact Us:
Email: support@influencerapp.com
Website: www.influencerapp.com

© 2024 Influencer App. All rights reserved.`,
    },
  ];

  const [expandedItem, setExpandedItem] = React.useState(null);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {
          const returnScreen = route?.params?.returnScreen || navigation?.getParam?.('returnScreen');
          if (returnScreen === 'CreatorProfile') {
            navigation?.navigate('AppNavigator', { initialTab: 'Profile' });
          } else if (returnScreen === 'CreateOffer') {
            navigation?.navigate('CreateOffer');
          } else if (returnScreen === 'Inbox') {
            navigation?.navigate('AppNavigator', { initialTab: 'Messages' });
          } else if (returnScreen === 'ActiveOrders') {
            navigation?.navigate('AppNavigator', { initialTab: 'Orders' });
          } else if (navigation?.goBack) {
            navigation.goBack();
          }
        }}>
          <MaterialIcons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Legal / Info</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {legalItems.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.legalCard}
            onPress={() => setExpandedItem(expandedItem === item.id ? null : item.id)}
            activeOpacity={0.7}
          >
            <View style={styles.legalHeader}>
              <View style={styles.legalHeaderLeft}>
                <View style={styles.iconContainer}>
                  <MaterialIcons name={item.icon} size={24} color="#337DEB" />
                </View>
                <Text style={styles.legalTitle}>{item.title}</Text>
              </View>
              <MaterialIcons
                name={expandedItem === item.id ? 'expand-less' : 'expand-more'}
                size={24}
                color="#6B7280"
              />
            </View>
            {expandedItem === item.id && (
              <View style={styles.legalContent}>
                <Text style={styles.legalText}>{item.content}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}

        {/* App Version */}
        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>App Version 1.0.0</Text>
          <Text style={styles.copyrightText}>© 2024 Influencer App</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },
  scrollView: {
    flex: 1,
  },
  legalCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  legalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  legalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F4FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  legalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
  },
  legalContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  legalText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 22,
    marginTop: 12,
  },
  versionContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingBottom: 100,
  },
  versionText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  copyrightText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
});

export default LegalInfo;

