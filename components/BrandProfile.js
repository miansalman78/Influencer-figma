import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, Linking, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCurrencySymbol } from '../utils/currency';

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

const BrandProfile = ({ navigation, route }) => {
    const [activeTab, setActiveTab] = useState('Brand');
    const [profile, setProfile] = useState(null);
    const [paymentMethodsList, setPaymentMethodsList] = useState([]);
    const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false);

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const response = await import('../services/user').then(m => m.getMyProfile());
                if (response && response.data) {
                    // Normalize profile data to ensure all fields are available
                    const profileData = response.data;
                    const normalizedProfile = {
                        ...profileData,
                        // Ensure profileImage is set (check both profileImage and avatar fields)
                        profileImage: profileData.profileImage || profileData.avatar || null,
                        avatar: profileData.avatar || profileData.profileImage || null,
                        // Ensure all basic fields are present
                        name: profileData.name || profileData.companyName || '',
                        companyName: profileData.companyName || profileData.name || '',
                        email: profileData.email || '',
                        phone: profileData.phone || '',
                        location: profileData.location || null,
                        industry: profileData.industry || '',
                        website: profileData.website || '',
                    };
                    setProfile(normalizedProfile);
                }
            } catch (error) {
                console.error("Failed to fetch brand profile", error);
            }
        };

        fetchProfile();

        const unsubscribe = navigation?.addListener?.('focus', () => {
            fetchProfile();
        });
        return unsubscribe;
    }, [navigation]);

    // Fetch brand payment methods from payment API when Payment tab is active
    const fetchPaymentMethods = useCallback(async () => {
        if (profile?.role !== 'brand') return;
        setLoadingPaymentMethods(true);
        try {
            const paymentService = await import('../services/payment');
            const response = await paymentService.getBrandPaymentMethods();
            const list = Array.isArray(response?.data?.paymentMethods) ? response.data.paymentMethods : (Array.isArray(response?.data) ? response.data : (Array.isArray(response) ? response : []));
            setPaymentMethodsList(list);
        } catch (e) {
            setPaymentMethodsList([]);
        } finally {
            setLoadingPaymentMethods(false);
        }
    }, [profile?.role]);

    useEffect(() => {
        if (activeTab === 'Payment') fetchPaymentMethods();
    }, [activeTab, fetchPaymentMethods]);

    const handleEditProfile = () => {
        navigation?.navigate('EditProfile', { role: 'Brand' });
    };

    const handleDrawer = () => {
        if (navigation?.openDrawer) {
            navigation.openDrawer();
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                {/* Header with Background Image (Same as CreatorProfile) */}
                <View style={styles.headerSection}>
                    {(() => {
                        const bannerUrl = profile?.bannerImage;
                        const isValid = bannerUrl && typeof bannerUrl === 'string' && (bannerUrl.startsWith('http://') || bannerUrl.startsWith('https://'));
                        return isValid ? (
                            <Image
                                source={{ uri: bannerUrl }}
                                style={styles.backgroundImage}
                                resizeMode="cover"
                            />
                        ) : (
                            <View style={[styles.backgroundImage, { backgroundColor: '#337DEB' }]} />
                        );
                    })()}

                    {/* Navigation Icons Overlay */}
                    <View style={styles.navIcons}>
                        <TouchableOpacity style={styles.backButton} onPress={handleDrawer}>
                            <MaterialIcons name="menu" size={24} color="#ffffff" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.menuButton} onPress={handleEditProfile}>
                            <MaterialIcons name="edit" size={24} color="#ffffff" />
                        </TouchableOpacity>
                    </View>

                    {/* Dark Overlay for Profile Info */}
                    <View style={styles.darkOverlay}>
                        {/* Profile Card (Aligned like CreatorProfile) */}
                        <View style={styles.profileCard}>
                            {(() => {
                                const profileImageUrl = profile?.profileImage || profile?.avatar;
                                const isValidUrl = profileImageUrl && typeof profileImageUrl === 'string' && (profileImageUrl.startsWith('http://') || profileImageUrl.startsWith('https://'));

                                return isValidUrl ? (
                                    <View style={styles.profileImageContainer}>
                                        <Image
                                            source={{ uri: profileImageUrl }}
                                            style={styles.profileImage}
                                            onError={(error) => console.error('[BrandProfile] Profile image load error:', error.nativeEvent.error)}
                                        />
                                    </View>
                                ) : (
                                    <View style={[styles.profileImage, { backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center', marginRight: 16 }]}>
                                        <MaterialIcons name="business" size={40} color="#9CA3AF" />
                                    </View>
                                );
                            })()}
                            <View style={styles.profileInfo}>
                                <Text style={styles.profileName}>{profile?.companyName || profile?.name || 'Brand Name'}</Text>
                                <View style={styles.emailContainer}>
                                    <MaterialIcons name="email" size={16} color="#ffffff" />
                                    <Text style={styles.emailText}>{profile?.email || 'N/A'}</Text>
                                </View>
                                {profile?.brandTagline ? (
                                    <Text style={styles.brandTaglineOverlay}>"{profile.brandTagline}"</Text>
                                ) : null}
                            </View>
                        </View>
                    </View>
                </View>

                {/* Metrics/Tags Section below header */}
                <View style={styles.metricsSection}>
                    <View style={styles.industryBadge}>
                        <MaterialIcons name="business" size={16} color="#7c3aed" />
                        <Text style={styles.industryText}>{profile?.industry || 'Industry'}</Text>
                    </View>
                </View>



                {/* Tabs */}
                <View style={styles.tabsContainer}>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'Brand' && styles.activeTab]}
                        onPress={() => setActiveTab('Brand')}
                    >
                        <Text style={[styles.tabText, activeTab === 'Brand' && styles.activeTabText]}>
                            Brand
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'Payment' && styles.activeTab]}
                        onPress={() => setActiveTab('Payment')}
                    >
                        <Text style={[styles.tabText, activeTab === 'Payment' && styles.activeTabText]}>
                            Payment
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Brand Details Tab */}
                {activeTab === 'Brand' && (
                    <View style={styles.contentSection}>
                        <View style={styles.infoCard}>
                            <View style={styles.infoRow}>
                                <MaterialIcons name="business" size={20} color="#6b7280" />
                                <View style={styles.infoContent}>
                                    <Text style={styles.infoLabel}>Company Name</Text>
                                    <Text style={styles.infoValue}>{profile?.companyName || profile?.name || 'N/A'}</Text>
                                </View>
                            </View>
                        </View>

                        <View style={styles.infoCard}>
                            <View style={styles.infoRow}>
                                <MaterialIcons name="email" size={20} color="#6b7280" />
                                <View style={styles.infoContent}>
                                    <Text style={styles.infoLabel}>Business Email</Text>
                                    <Text style={styles.infoValue}>{profile?.email || 'N/A'}</Text>
                                </View>
                            </View>
                        </View>

                        <View style={styles.infoCard}>
                            <View style={styles.infoRow}>
                                <MaterialIcons name="phone" size={20} color="#6b7280" />
                                <View style={styles.infoContent}>
                                    <Text style={styles.infoLabel}>Phone Number</Text>
                                    <Text style={styles.infoValue}>{profile?.phone || 'N/A'}</Text>
                                </View>
                            </View>
                        </View>

                        <View style={styles.infoCard}>
                            <View style={styles.infoRow}>
                                <MaterialIcons name="language" size={20} color="#6b7280" />
                                <View style={styles.infoContent}>
                                    <Text style={styles.infoLabel}>Website</Text>
                                    {profile?.website ? (
                                        <TouchableOpacity onPress={() => {
                                            let url = profile.website;
                                            if (!url.startsWith('http')) {
                                                url = 'https://' + url;
                                            }
                                            Linking.openURL(url).catch(err => {
                                                console.error("Failed to open URL:", err);
                                                Alert.alert("Error", "Could not open website link");
                                            });
                                        }}>
                                            <Text style={[styles.infoValue, { color: '#337DEB', textDecorationLine: 'underline' }]}>{profile.website}</Text>
                                        </TouchableOpacity>
                                    ) : (
                                        <Text style={styles.infoValue}>N/A</Text>
                                    )}
                                </View>
                            </View>
                        </View>

                        <View style={styles.infoCard}>
                            <View style={styles.infoRow}>
                                <MaterialIcons name="category" size={20} color="#6b7280" />
                                <View style={styles.infoContent}>
                                    <Text style={styles.infoLabel}>Industry</Text>
                                    <Text style={styles.infoValue}>{profile?.industry || 'N/A'}</Text>
                                </View>
                            </View>
                        </View>

                        <View style={styles.infoCard}>
                            <View style={styles.infoRow}>
                                <MaterialIcons name="location-on" size={20} color="#6b7280" />
                                <View style={styles.infoContent}>
                                    <Text style={styles.infoLabel}>Location</Text>
                                    <Text style={styles.infoValue}>
                                        {(() => {
                                            const loc = profile?.location || {};
                                            if (typeof loc === 'string') return loc;
                                            const city = loc.city && loc.city !== 'N/A' && loc.city !== 'n/a' ? loc.city : '';
                                            const state = loc.state && loc.state !== 'N/A' && loc.state !== 'n/a' ? loc.state : '';
                                            const country = loc.country && loc.country !== 'N/A' && loc.country !== 'n/a' ? loc.country : '';

                                            if (city && state) return `${city}, ${state}`;
                                            if (city && country) return `${city}, ${country}`;
                                            return city || state || country || 'Remote';
                                        })()}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {profile?.campaignBudget ? (
                            <View style={styles.infoCard}>
                                <View style={styles.infoRow}>
                                    <MaterialIcons name="monetization-on" size={20} color="#6b7280" />
                                    <View style={styles.infoContent}>
                                        <Text style={styles.infoLabel}>Typical Campaign Budget</Text>
                                        <Text style={styles.infoValue}>{profile.campaignBudget}</Text>
                                    </View>
                                </View>
                            </View>
                        ) : null}
                    </View>
                )}

                {/* Payment Info Tab - uses payment methods API, not profile.paymentMethods */}
                {activeTab === 'Payment' && (
                    <View style={styles.contentSection}>
                        {loadingPaymentMethods ? (
                            <View style={[styles.infoCard, { alignItems: 'center', paddingVertical: 24 }]}>
                                <ActivityIndicator size="small" color="#337DEB" />
                                <Text style={[styles.infoValue, { marginTop: 8 }]}>Loading payment methods…</Text>
                            </View>
                        ) : paymentMethodsList.length > 0 ? (
                            paymentMethodsList.map((method, index) => (
                                <TouchableOpacity
                                    key={method.id || method._id || index}
                                    style={[styles.infoCard, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                                    onPress={() => navigation?.navigate('PaymentMethods', { role: 'Brand' })}
                                    activeOpacity={0.75}
                                >
                                    <View style={styles.infoRow}>
                                        <MaterialIcons name="credit-card" size={20} color="#337DEB" />
                                        <View style={styles.infoContent}>
                                            <Text style={styles.infoLabel}>Payment Method</Text>
                                            <Text style={styles.infoValue}>
                                                {method.maskedNumber || method.cardDetails?.last4
                                                    ? `•••• •••• •••• ${(method.cardDetails?.last4 || method.maskedNumber || '').toString().slice(-4)}`
                                                    : method.accountNumber
                                                        ? `•••• ${(method.accountNumber || '').slice(-4)}`
                                                        : (() => {
                                                            const t = (method.type || method.gatewayProvider || '').toLowerCase();
                                                            if (t === 'paypal') return 'PayPal account';
                                                            if (t === 'paystack') return 'Paystack';
                                                            if (t === 'stripe') return 'Stripe card';
                                                            if (t) return t.charAt(0).toUpperCase() + t.slice(1);
                                                            return 'Card';
                                                        })()}
                                            </Text>
                                            {(method.type || method.gatewayProvider) && (
                                                <Text style={styles.infoSubtext}>{method.type || method.gatewayProvider}</Text>
                                            )}
                                        </View>
                                    </View>
                                    <MaterialIcons name="chevron-right" size={20} color="#9ca3af" />
                                </TouchableOpacity>
                            ))
                        ) : (
                            <TouchableOpacity
                                style={styles.infoCard}
                                onPress={() => navigation?.navigate('PaymentMethods', { role: 'Brand' })}
                                activeOpacity={0.75}
                            >
                                <View style={styles.infoRow}>
                                    <MaterialIcons name="credit-card" size={20} color="#6b7280" />
                                    <View style={styles.infoContent}>
                                        <Text style={styles.infoLabel}>Payment Methods</Text>
                                        <Text style={styles.infoValue}>No payment methods added</Text>
                                        <Text style={styles.infoSubtext}>Tap to add a card or PayPal</Text>
                                    </View>
                                </View>
                                <MaterialIcons name="chevron-right" size={20} color="#9ca3af" />
                            </TouchableOpacity>
                        )}

                        {/* Add / Manage Payment Methods */}
                        <TouchableOpacity
                            style={styles.addPaymentButton}
                            onPress={() => navigation?.navigate('PaymentMethods', { role: 'Brand' })}
                            activeOpacity={0.8}
                        >
                            <MaterialIcons name="add-circle-outline" size={18} color="#ffffff" />
                            <Text style={styles.addPaymentButtonText}>Add / Manage Payment Methods</Text>
                        </TouchableOpacity>

                        {profile?.billingAddress && (
                            <View style={styles.infoCard}>
                                <View style={styles.infoRow}>
                                    <MaterialIcons name="account-balance" size={20} color="#6b7280" />
                                    <View style={styles.infoContent}>
                                        <Text style={styles.infoLabel}>Billing Address</Text>
                                        <Text style={styles.infoValue}>
                                            {profile.billingAddress.street || 'N/A'}
                                        </Text>
                                        <Text style={styles.infoSubtext}>
                                            {profile.billingAddress.city || ''}, {profile.billingAddress.state || ''} {profile.billingAddress.zipCode || ''}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        )}

                        {profile?.taxInfo && (
                            <View style={styles.infoCard}>
                                <View style={styles.infoRow}>
                                    <MaterialIcons name="receipt" size={20} color="#6b7280" />
                                    <View style={styles.infoContent}>
                                        <Text style={styles.infoLabel}>Tax Information</Text>
                                        <Text style={styles.infoValue}>
                                            {profile.taxInfo.ein ? `EIN: ${profile.taxInfo.ein}` :
                                                profile.taxInfo.taxId ? `Tax ID: ${profile.taxInfo.taxId}` : 'N/A'}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        )}

                        {profile?.subscription && (
                            <View style={styles.infoCard}>
                                <View style={styles.infoRow}>
                                    <MaterialIcons name="star" size={20} color="#6b7280" />
                                    <View style={styles.infoContent}>
                                        <Text style={styles.infoLabel}>Subscription Plan</Text>
                                        <Text style={styles.infoValue}>
                                            {profile.subscription.plan || 'N/A'}
                                        </Text>
                                        {profile.subscription.renewalDate && (
                                            <Text style={styles.infoSubtext}>
                                                ${profile.subscription.amount || 0}/month • Renews on {new Date(profile.subscription.renewalDate).toLocaleDateString()}
                                            </Text>
                                        )}
                                    </View>
                                </View>
                            </View>
                        )}

                        {profile?.totalSpent !== undefined && (
                            <View style={styles.infoCard}>
                                <View style={styles.infoRow}>
                                    <MaterialIcons name="attach-money" size={20} color="#6b7280" />
                                    <View style={styles.infoContent}>
                                        <Text style={styles.infoLabel}>Total Spent</Text>
                                        <Text style={styles.infoValue}>
                                            {getCurrencySymbol('USD')}{profile.totalSpent.toLocaleString()}
                                        </Text>
                                        <Text style={styles.infoSubtext}>Lifetime spending</Text>
                                    </View>
                                </View>
                            </View>
                        )}
                    </View>
                )}

                {/* Action Buttons */}
                <View style={styles.actionSection}>
                    <TouchableOpacity style={styles.primaryButton} onPress={handleEditProfile}>
                        <MaterialIcons name="edit" size={20} color="#ffffff" />
                        <Text style={styles.primaryButtonText}>Edit Profile</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.secondaryButton}
                        onPress={() => navigation?.navigate('Settings')}
                    >
                        <MaterialIcons name="settings" size={20} color="#337DEB" />
                        <Text style={styles.secondaryButtonText}>Account Settings</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f9fafb',
    },
    scrollView: {
        flex: 1,
    },
    headerSection: {
        height: 380,
        position: 'relative',
    },
    navIcons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 16,
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 2,
    },
    backButton: {
        padding: 8,
    },
    menuButton: {
        padding: 8,
    },
    darkOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        padding: 16,
        paddingBottom: 20,
        zIndex: 3,
    },
    profileCard: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    backgroundImage: {
        width: '100%',
        height: '100%',
        position: 'absolute',
    },
    profileImageContainer: {
        marginRight: 16,
    },
    profileImage: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 2,
        borderColor: '#ffffff',
    },
    profileInfo: {
        flex: 1,
    },
    profileName: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#ffffff',
        marginBottom: 4,
    },
    emailContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    emailText: {
        fontSize: 14,
        color: '#ffffff',
        marginLeft: 6,
    },
    brandTaglineOverlay: {
        fontSize: 14,
        color: '#e5e7eb',
        fontStyle: 'italic',
        marginTop: 4,
    },
    metricsSection: {
        backgroundColor: '#ffffff',
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        marginTop: -20,
        zIndex: 4,
    },
    industryBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ede9fe',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        alignSelf: 'flex-start',
    },
    industryText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#7c3aed',
        marginLeft: 6,
    },
    tabsContainer: {
        flexDirection: 'row',
        backgroundColor: '#ffffff',
        paddingHorizontal: 16,
        paddingTop: 16,
        marginBottom: 16,
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    activeTab: {
        borderBottomColor: '#337DEB',
    },
    tabText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#6b7280',
    },
    activeTabText: {
        color: '#337DEB',
    },
    contentSection: {
        paddingHorizontal: 16,
        paddingBottom: 24,
    },
    infoCard: {
        backgroundColor: '#ffffff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    infoContent: {
        marginLeft: 12,
        flex: 1,
    },
    infoLabel: {
        fontSize: 12,
        color: '#6b7280',
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    infoValue: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1f2937',
    },
    infoSubtext: {
        fontSize: 14,
        color: '#9ca3af',
        marginTop: 2,
    },
    actionSection: {
        paddingHorizontal: 16,
        paddingBottom: 32,
    },
    primaryButton: {
        flexDirection: 'row',
        backgroundColor: '#337DEB',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    primaryButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#ffffff',
        marginLeft: 8,
    },
    secondaryButton: {
        flexDirection: 'row',
        backgroundColor: '#ffffff',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#337DEB',
    },
    secondaryButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#337DEB',
        marginLeft: 8,
    },
    addPaymentButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#337DEB',
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 20,
        marginBottom: 12,
        gap: 8,
    },
    addPaymentButtonText: {
        color: '#ffffff',
        fontWeight: '700',
        fontSize: 15,
    },
});

export default BrandProfile;
