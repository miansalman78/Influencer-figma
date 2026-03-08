import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getInfluencerServices, getServiceCreatorServices, getAllServices, getUserServices, updateUserServices } from '../services/services';
import { useAuth } from '../hooks/useAuth';

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

const ServicesManagement = ({ navigation, route }) => {
  const { user } = useAuth();
  const userRole = user?.role?.toLowerCase() || route?.params?.role?.toLowerCase();
  const isCreator = userRole === 'creator' || userRole === 'influencer';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [availableServices, setAvailableServices] = useState([]);
  const [userServices, setUserServices] = useState([]);
  const [selectedServices, setSelectedServices] = useState([]);

  useEffect(() => {
    if (!isCreator) {
      Alert.alert('Access Denied', 'This page is only available for creators.', [
        { text: 'OK', onPress: () => navigation?.goBack() }
      ]);
    }
  }, [isCreator]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [userServicesResponse, allServicesResponse] = await Promise.all([
        getUserServices().catch(() => null),
        getAllServices().catch(() => null),
      ]);

      if (userServicesResponse && userServicesResponse.data) {
        let services = userServicesResponse.data.services || userServicesResponse.data || [];
        if (!Array.isArray(services)) services = [];
        setUserServices(services);
        setSelectedServices(services.map(s => s._id || s.id || s));

        if (services.length > 0) {
          const firstService = services[0];
          const role = firstService.role || firstService.type || 'influencer';
          setSelectedRole(role);
        }
      }

      if (allServicesResponse && allServicesResponse.data) {
        let services = allServicesResponse.data.services || allServicesResponse.data || [];
        if (!Array.isArray(services)) services = [];
        setAvailableServices(services);
      }
    } catch (error) {
      console.error('Error loading services:', error);
      Alert.alert('Error', 'Failed to load services. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleSelect = async (role) => {
    setSelectedRole(role);
    try {
      setLoading(true);
      const response = role === 'influencer'
        ? await getInfluencerServices()
        : await getServiceCreatorServices();

      if (response && response.data) {
        let services = response.data.services || response.data || [];
        if (!Array.isArray(services)) services = [];
        setAvailableServices(services);
      }
    } catch (error) {
      console.error('Error loading role services:', error);
      Alert.alert('Error', 'Failed to load services for this role.');
    } finally {
      setLoading(false);
    }
  };

  const toggleService = (serviceId) => {
    setSelectedServices(prev => {
      if (prev.includes(serviceId)) {
        return prev.filter(id => id !== serviceId);
      } else {
        return [...prev, serviceId];
      }
    });
  };

  const handleSave = async () => {
    if (selectedServices.length === 0) {
      Alert.alert('Error', 'Please select at least one service.');
      return;
    }

    try {
      setSaving(true);
      await updateUserServices(selectedServices);
      Alert.alert('Success', 'Services updated successfully.', [
        { text: 'OK', onPress: () => navigation?.goBack() }
      ]);
    } catch (error) {
      console.error('Error updating services:', error);
      Alert.alert('Error', 'Failed to update services. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading && availableServices.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation?.goBack()}
          >
            <MaterialIcons name="arrow-back" size={24} color="#2d3748" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Services</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#337DEB" />
          <Text style={styles.loadingText}>Loading services...</Text>
        </View>
      </SafeAreaView>
    );
  }

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
          <Text style={styles.headerTitle}>Services</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.content}>
          <Text style={styles.sectionTitle}>Select Your Role</Text>
          <View style={styles.roleContainer}>
            <TouchableOpacity
              style={[
                styles.roleButton,
                selectedRole === 'influencer' && styles.roleButtonSelected
              ]}
              onPress={() => handleRoleSelect('influencer')}
            >
              <Text style={[
                styles.roleButtonText,
                selectedRole === 'influencer' && styles.roleButtonTextSelected
              ]}>
                Influencer
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.roleButton,
                selectedRole === 'service_creator' && styles.roleButtonSelected
              ]}
              onPress={() => handleRoleSelect('service_creator')}
            >
              <Text style={[
                styles.roleButtonText,
                selectedRole === 'service_creator' && styles.roleButtonTextSelected
              ]}>
                Service Creator
              </Text>
            </TouchableOpacity>
          </View>

          {selectedRole && (
            <>
              <Text style={styles.sectionTitle}>Available Services</Text>
              {availableServices.length === 0 ? (
                <Text style={styles.emptyText}>No services available for this role.</Text>
              ) : (
                <View style={styles.servicesList}>
                  {Array.isArray(availableServices) && availableServices.map((service) => {
                    const serviceId = service._id || service.id || service;
                    const serviceName = service.name || service.title || service;
                    const isSelected = selectedServices.includes(serviceId);

                    return (
                      <TouchableOpacity
                        key={serviceId}
                        style={[
                          styles.serviceCard,
                          isSelected && styles.serviceCardSelected
                        ]}
                        onPress={() => toggleService(serviceId)}
                      >
                        <View style={styles.serviceCardContent}>
                          <View style={[
                            styles.checkbox,
                            isSelected && styles.checkboxSelected
                          ]}>
                            {isSelected && (
                              <MaterialIcons name="check" size={16} color="#ffffff" />
                            )}
                          </View>
                          <View style={styles.serviceInfo}>
                            <Text style={[
                              styles.serviceName,
                              isSelected && styles.serviceNameSelected
                            ]}>
                              {serviceName}
                            </Text>
                            {service.description && (
                              <Text style={styles.serviceDescription}>
                                {service.description}
                              </Text>
                            )}
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </>
          )}

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving || selectedServices.length === 0}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.saveButtonText}>Save Services</Text>
            )}
          </TouchableOpacity>
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
  content: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2d3748',
    marginBottom: 16,
    marginTop: 8,
  },
  roleContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  roleButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  roleButtonSelected: {
    borderColor: '#337DEB',
    backgroundColor: '#e6ecff',
  },
  roleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  roleButtonTextSelected: {
    color: '#337DEB',
  },
  servicesList: {
    gap: 12,
    marginBottom: 24,
  },
  serviceCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  serviceCardSelected: {
    borderColor: '#337DEB',
    backgroundColor: '#e6ecff',
  },
  serviceCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#d1d5db',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#337DEB',
    borderColor: '#337DEB',
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: 4,
  },
  serviceNameSelected: {
    color: '#337DEB',
  },
  serviceDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    padding: 20,
  },
  saveButton: {
    backgroundColor: '#337DEB',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});

export default ServicesManagement;

