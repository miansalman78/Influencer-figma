/**
 * Home Screen Component
 * 
 * Example screen showing user information after login
 * This demonstrates how to access user data from AuthContext
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../hooks/useAuth';

const HomeScreen = ({ navigation }) => {
  // Get user and signOut from AuthContext
  // user contains the authenticated user data from backend
  const { user, signOut } = useAuth();

  const handleLogout = async () => {
    try {
      // Call signOut from AuthContext
      // This will clear token and user from AsyncStorage and update context
      await signOut();
      
      // Navigate to Login screen
      navigation?.reset?.('Login') || navigation?.navigate('Login');
    } catch (error) {
      console.error('[Home] Logout error:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Welcome to AdPartnr</Text>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* User Information */}
        <View style={styles.userCard}>
          <Text style={styles.cardTitle}>User Information</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Name:</Text>
            <Text style={styles.infoValue}>{user?.name || 'N/A'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email:</Text>
            <Text style={styles.infoValue}>{user?.email || 'N/A'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Role:</Text>
            <Text style={styles.infoValue}>{user?.role || 'N/A'}</Text>
          </View>
          {user?.creatorRole && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Creator Role:</Text>
              <Text style={styles.infoValue}>{user.creatorRole}</Text>
            </View>
          )}
          {user?.location && (
            <>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>City:</Text>
                <Text style={styles.infoValue}>{user.location.city || 'N/A'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>State:</Text>
                <Text style={styles.infoValue}>{user.location.state || 'N/A'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Country:</Text>
                <Text style={styles.infoValue}>{user.location.country || 'N/A'}</Text>
              </View>
            </>
          )}
        </View>

        {/* API Status */}
        <View style={styles.statusCard}>
          <Text style={styles.cardTitle}>API Status</Text>
          <Text style={styles.statusText}>✅ Connected to backend</Text>
          <Text style={styles.statusText}>✅ Token saved in AsyncStorage</Text>
          <Text style={styles.statusText}>✅ User authenticated</Text>
        </View>

        {/* Navigation Info */}
        <View style={styles.navCard}>
          <Text style={styles.cardTitle}>Navigation</Text>
          <Text style={styles.navText}>
            Based on your role ({user?.role}), you can navigate to:
          </Text>
          {user?.role === 'brand' ? (
            <Text style={styles.navText}>• DashboardNew (Brand Dashboard)</Text>
          ) : (
            <Text style={styles.navText}>• AppNavigator (Creator Dashboard)</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2d3748',
  },
  logoutButton: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  logoutText: {
    color: '#fff',
    fontWeight: '600',
  },
  userCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2d3748',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: '#718096',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 14,
    color: '#2d3748',
    flex: 1,
    textAlign: 'right',
  },
  statusCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusText: {
    fontSize: 14,
    color: '#2d3748',
    marginBottom: 8,
  },
  navCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  navText: {
    fontSize: 14,
    color: '#718096',
    marginBottom: 4,
    lineHeight: 20,
  },
});

export default HomeScreen;

