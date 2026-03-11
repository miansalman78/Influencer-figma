/**
 * Add Card Modal Component
 * 
 * Provides UI for adding Stripe cards during checkout
 * Handles card tokenization and saving to backend
 * 
 * Handles Stripe, Paystack, and Flutterwave card saving
 */

import React, { useState, useContext } from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert,
    Platform,
    TextInput,
    ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PAYMENT_KEYS } from '../config/payment.config';
import { addStripeCard } from '../services/paymentMethods.service';
import { initializePaystackTransaction, verifyPaystackTransaction, tokenizeFlutterwaveCard, createPaymentMethod } from '../services/payment';
import { AuthContext } from '../context/AuthContext';

// Stripe SDK initialization
let CardField, useStripe;
let stripeAvailable = false;

try {
    const StripeModule = require('@stripe/stripe-react-native');
    CardField = StripeModule.CardField;
    useStripe = StripeModule.useStripe;
    stripeAvailable = true;
    console.log('[AddCardModal] Stripe SDK loaded successfully');
} catch (error) {
    console.warn('[AddCardModal] Stripe SDK not available:', error.message);
    useStripe = () => ({ createPaymentMethod: null });
    CardField = () => null;
}

// NGN Payment WebView for Paystack/Flutterwave
import NGNPaymentWebView from './NGNPaymentWebView';

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

const AddCardModal = ({
    visible,
    onClose,
    onSuccess,
    currency = 'USD',
}) => {
    const { user } = useContext(AuthContext);
    const stripe = useStripe();
    const stripeCreatePaymentMethod = stripe?.createPaymentMethod;
    const [loading, setLoading] = useState(false);
    const [cardComplete, setCardComplete] = useState(false);

    // Billing address state
    const [billingAddress, setBillingAddress] = useState({
        street: '',
        city: '',
        state: '',
        zipCode: '',
        country: 'US',
    });
    const [focusedInput, setFocusedInput] = useState(null);

    // NGN payment gateway selection
    const [selectedGateway, setSelectedGateway] = useState('paystack'); // Default to Paystack
    const [showNGNWebView, setShowNGNWebView] = useState(false);
    const [ngnWebViewUrl, setNGNWebViewUrl] = useState('');
    const [paystackRef, setPaystackRef] = useState(null); // Reference from initialize (for 3DS/close detection)

    // Currency checks
    const isStripe = currency === 'USD';
    const isNGN = currency === 'NGN';

    // Handle Stripe card tokenization and save
    const handleStripeCardSave = async () => {
        try {
            setLoading(true);
            console.log('[AddCardModal] Starting Stripe card save');

            if (!stripeCreatePaymentMethod) {
                throw new Error('Stripe SDK not available');
            }

            // Create payment method with Stripe
            // Include billing details to prevent backend errors
            const { paymentMethod, error } = await stripeCreatePaymentMethod({
                paymentMethodType: 'Card',
                billingDetails: {
                    address: {
                        line1: '',
                        city: '',
                        state: '',
                        postalCode: '',
                        country: 'US',
                    },
                },
            });

            if (error) {
                throw new Error(error.message);
            }

            if (!paymentMethod) {
                throw new Error('Failed to create payment method');
            }

            console.log('[AddCardModal] Stripe payment method created:', paymentMethod.id);
            console.log('[AddCardModal] Payment method structure:', JSON.stringify(paymentMethod, null, 2));

            // Validate billing address
            if (!billingAddress.street.trim()) {
                Alert.alert('Required Field', 'Please enter your street address');
                return;
            }
            if (!billingAddress.city.trim()) {
                Alert.alert('Required Field', 'Please enter your city');
                return;
            }
            if (!billingAddress.zipCode.trim()) {
                Alert.alert('Required Field', 'Please enter your ZIP code');
                return;
            }

            // Use addStripeCard which handles tokenization and saving
            const response = await addStripeCard({
                paymentMethodId: paymentMethod.id,
                billingDetails: {
                    street: billingAddress.street.trim(),
                    city: billingAddress.city.trim(),
                    state: billingAddress.state.trim() || '',
                    country: billingAddress.country || 'US',
                    zipCode: billingAddress.zipCode.trim(),
                },
                isDefault: false,
            });

            if (response && response.success) {
                Alert.alert('Success', 'Card added successfully!');
                onSuccess(response.data);
                onClose();
            } else {
                throw new Error(response?.message || 'Failed to save card');
            }
        } catch (error) {
            console.error('[AddCardModal] Stripe card save error:', error);
            Alert.alert('Error', error.message || 'Failed to add card');
        } finally {
            setLoading(false);
        }
    };

    // Handle Paystack card tokenization and save
    const handlePaystackSuccess = async (response) => {
        try {
            setLoading(true);
            console.log('[AddCardModal] Paystack success:', response);

            const verifyResponse = await verifyPaystackTransaction(response.reference);
            const authData = verifyResponse.data.authorization;

            await createPaymentMethod({
                type: 'card',
                currency: 'NGN',
                cardDetails: {
                    last4: authData.last4,
                    brand: authData.brand || 'card',
                    expiryMonth: parseInt(authData.exp_month),
                    expiryYear: parseInt(authData.exp_year),
                    cardholderName: authData.card_name || user?.name || 'Cardholder',
                    gatewayToken: authData.authorization_code,
                    gatewayProvider: 'paystack',
                },
                isDefault: false,
            });

            Alert.alert('Success', 'Paystack card added successfully!');
            onSuccess();
            onClose();
        } catch (error) {
            console.error('[AddCardModal] Paystack error:', error);
            Alert.alert('Error', error.message || 'Failed to save Paystack card');
        } finally {
            setLoading(false);
        }
    };

    // Handle Flutterwave card tokenization and save
    const handleFlutterwaveRedirect = async (response) => {
        try {
            setLoading(true);
            console.log('[AddCardModal] Flutterwave redirect:', response);

            if (response.status !== 'successful') {
                throw new Error('Flutterwave transaction was not successful');
            }

            const tokenResponse = await tokenizeFlutterwaveCard({
                transactionId: response.transaction_id,
                txRef: response.tx_ref,
            });

            const cardData = tokenResponse.data.card;
            const expiryParts = cardData.expiry.split('/');

            await createPaymentMethod({
                type: 'card',
                currency: 'NGN',
                cardDetails: {
                    last4: cardData.last4,
                    brand: cardData.type || 'card',
                    expiryMonth: parseInt(expiryParts[0]),
                    expiryYear: parseInt('20' + expiryParts[1]),
                    cardholderName: user?.name || 'Cardholder',
                    gatewayToken: tokenResponse.data.token,
                    gatewayProvider: 'flutterwave',
                },
                isDefault: false,
            });

            Alert.alert('Success', 'Flutterwave card added successfully!');
            onSuccess();
            onClose();
        } catch (error) {
            console.error('[AddCardModal] Flutterwave error:', error);
            Alert.alert('Error', error.message || 'Failed to save Flutterwave card');
        } finally {
            setLoading(false);
        }
    };

    const handleAddCard = async () => {
        console.log('[AddCardModal] Add Card clicked', {
            currency,
            isStripe,
            stripeAvailable,
        });

        // Check if Stripe is available
        if (!stripeAvailable) {
            console.log('[AddCardModal] Stripe not available');
            Alert.alert(
                'SDK Not Ready',
                'Stripe SDK is being loaded. Please rebuild the app.',
                [{ text: 'OK', onPress: onClose }]
            );
            return;
        }

        if (isStripe) {
            console.log('[AddCardModal] Starting Stripe flow');
            handleStripeCardSave();
        } else if (isNGN) {
            if (!selectedGateway) {
                Alert.alert('Selection Required', 'Please select a payment gateway');
                return;
            }

            let url = '';
            let html = '';
            const txRef = `txref-${Date.now()}`;

            if (selectedGateway === 'paystack') {
                // Use Paystack Initialize API - recommended for WebView (avoids blank page from inline.js)
                try {
                    setLoading(true);
                    const initRes = await initializePaystackTransaction({
                        email: user?.email || 'user@example.com',
                        amount: 10000, // 100 NGN in kobo
                    });
                    const data = initRes?.data || initRes;
                    const authUrl = data.authorization_url;
                    const ref = data.reference;
                    if (!authUrl) {
                        throw new Error('No authorization URL returned');
                    }
                    setPaystackRef(ref);
                    setNGNWebViewUrl(authUrl);
                    setShowNGNWebView(true);
                } catch (err) {
                    console.error('[AddCardModal] Paystack init error:', err);
                    Alert.alert('Error', err?.message || err?.data?.message || 'Failed to start Paystack payment');
                } finally {
                    setLoading(false);
                }
                return; // Don't fall through to url/html logic
            } else if (selectedGateway === 'flutterwave') {
                if (!PAYMENT_KEYS.FLUTTERWAVE_PUBLIC_KEY) {
                    Alert.alert('Configuration Error', 'Flutterwave Public Key is missing');
                    return;
                }
                url = `https://checkout.flutterwave.com/v3/hosted/pay?public_key=${PAYMENT_KEYS.FLUTTERWAVE_PUBLIC_KEY}&amount=100&currency=NGN&tx_ref=${txRef}&customer[email]=${user?.email || 'user@example.com'}&customer[name]=${user?.name || 'User'}&redirect_url=https://standard.flutterwave.com/close`;
            }

            if (url || html) {
                setNGNWebViewUrl(url || html); // We will handle this in render
                setShowNGNWebView(true);
            }
        }
    };

    // NGN currency - show gateway selection
    if (isNGN) {
        return (
            <Modal
                visible={visible}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={onClose}
            >
                <SafeAreaView style={styles.container}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Add Card (NGN)</Text>
                        <TouchableOpacity onPress={onClose}>
                            <MaterialIcons name="close" size={24} color="#64748b" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                        {/* Gateway Options */}
                        <TouchableOpacity
                            style={[
                                styles.gatewayButton,
                                selectedGateway === 'paystack' && styles.gatewayButtonSelected
                            ]}
                            onPress={() => setSelectedGateway('paystack')}
                        >
                            <View style={styles.gatewayInfo}>
                                <Text style={styles.gatewayName}>Paystack</Text>
                                <Text style={styles.gatewayDescription}>Nigerian payment gateway (Recommended)</Text>
                            </View>
                            {selectedGateway === 'paystack' && (
                                <MaterialIcons name="check-circle" size={24} color="#337DEB" />
                            )}
                        </TouchableOpacity>

                        {/* Only show Flutterwave if configured */}
                        {!!PAYMENT_KEYS.FLUTTERWAVE_PUBLIC_KEY && (
                            <TouchableOpacity
                                style={[
                                    styles.gatewayButton,
                                    selectedGateway === 'flutterwave' && styles.gatewayButtonSelected
                                ]}
                                onPress={() => setSelectedGateway('flutterwave')}
                            >
                                <View style={styles.gatewayInfo}>
                                    <Text style={styles.gatewayName}>Flutterwave</Text>
                                    <Text style={styles.gatewayDescription}>Pan-African payment gateway</Text>
                                </View>
                                {selectedGateway === 'flutterwave' && (
                                    <MaterialIcons name="check-circle" size={24} color="#337DEB" />
                                )}
                            </TouchableOpacity>
                        )}

                        <Text style={styles.helperText}>
                            You will be redirected to the secure payment page to authorize this card for future payments. A small amount (₦100) will be charged to verify your card.
                        </Text>
                    </ScrollView>

                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={onClose}
                        >
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.addButton, (loading || !selectedGateway) && styles.addButtonDisabled]}
                            onPress={handleAddCard}
                            disabled={loading || !selectedGateway}
                        >
                            <Text style={styles.addButtonText}>
                                {loading ? 'Processing...' : 'Proceed to Payment'}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* NGN WebView Modal */}
                    <Modal
                        visible={showNGNWebView}
                        animationType="slide"
                        onRequestClose={() => setShowNGNWebView(false)}
                    >
                        <NGNPaymentWebView
                            url={!ngnWebViewUrl.startsWith('<!DOCTYPE') ? ngnWebViewUrl : undefined}
                            htmlContent={ngnWebViewUrl.startsWith('<!DOCTYPE') ? ngnWebViewUrl : undefined}
                            provider={selectedGateway}
                            paystackRef={selectedGateway === 'paystack' ? paystackRef : undefined}
                            onSuccess={(response) => {
                                setShowNGNWebView(false);
                                setPaystackRef(null);
                                if (selectedGateway === 'paystack') {
                                    handlePaystackSuccess(response);
                                } else {
                                    handleFlutterwaveRedirect(response);
                                }
                            }}
                            onCancel={() => {
                                setShowNGNWebView(false);
                                setPaystackRef(null);
                            }}
                            onError={(err) => {
                                setShowNGNWebView(false);
                                Alert.alert('Payment Error', 'Failed to complete payment. Please try again.');
                            }}
                        />
                    </Modal>
                </SafeAreaView>
            </Modal>
        );
    }


    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={onClose}
        >
            <SafeAreaView style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.title}>Add Card</Text>
                    <TouchableOpacity onPress={onClose} disabled={loading}>
                        <MaterialIcons name="close" size={24} color="#64748b" />
                    </TouchableOpacity>
                </View>

                {/* Content */}
                <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                    <Text style={styles.subtitle}>
                        Add a credit or debit card (USD)
                    </Text>

                    {/* Stripe Card Field */}
                    {stripeAvailable && CardField ? (
                        <>
                            <View style={styles.cardFieldContainer}>
                                <CardField
                                    postalCodeEnabled={false}
                                    placeholders={{
                                        number: '4242 4242 4242 4242',
                                    }}
                                    cardStyle={{
                                        backgroundColor: '#FFFFFF',
                                        textColor: '#000000',
                                        borderColor: '#E5E7EB',
                                        borderWidth: 1,
                                        cornerRadius: 8,
                                        fontSize: 16,
                                        placeholderColor: '#9CA3AF',
                                    }}
                                    style={styles.cardFieldWrapper}
                                    onCardChange={(cardDetails) => {
                                        setCardComplete(cardDetails.complete);
                                    }}
                                />
                            </View>

                            {/* Billing Address Section */}
                            <View style={styles.billingSection}>
                                <Text style={styles.sectionTitle}>Billing Address</Text>

                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>Street Address *</Text>
                                    <TextInput
                                        style={[styles.input, focusedInput === 'street' && styles.inputFocused]}
                                        placeholder="123 Main Street"
                                        placeholderTextColor="#9ca3af"
                                        value={billingAddress.street}
                                        onChangeText={(text) => setBillingAddress({ ...billingAddress, street: text })}
                                        onFocus={() => setFocusedInput('street')}
                                        onBlur={() => setFocusedInput(null)}
                                        autoCapitalize="words"
                                    />
                                </View>

                                <View style={styles.inputRow}>
                                    <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                                        <Text style={styles.inputLabel}>City *</Text>
                                        <TextInput
                                            style={[styles.input, focusedInput === 'city' && styles.inputFocused]}
                                            placeholder="New York"
                                            placeholderTextColor="#9ca3af"
                                            value={billingAddress.city}
                                            onChangeText={(text) => setBillingAddress({ ...billingAddress, city: text })}
                                            onFocus={() => setFocusedInput('city')}
                                            onBlur={() => setFocusedInput(null)}
                                            autoCapitalize="words"
                                        />
                                    </View>

                                    <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                                        <Text style={styles.inputLabel}>State</Text>
                                        <TextInput
                                            style={[styles.input, focusedInput === 'state' && styles.inputFocused]}
                                            placeholder="NY"
                                            placeholderTextColor="#9ca3af"
                                            value={billingAddress.state}
                                            onChangeText={(text) => setBillingAddress({ ...billingAddress, state: text })}
                                            onFocus={() => setFocusedInput('state')}
                                            onBlur={() => setFocusedInput(null)}
                                            autoCapitalize="characters"
                                            maxLength={2}
                                        />
                                    </View>
                                </View>

                                <View style={styles.inputRow}>
                                    <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                                        <Text style={styles.inputLabel}>ZIP Code *</Text>
                                        <TextInput
                                            style={[styles.input, focusedInput === 'zipCode' && styles.inputFocused]}
                                            placeholder="10001"
                                            placeholderTextColor="#9ca3af"
                                            value={billingAddress.zipCode}
                                            onChangeText={(text) => setBillingAddress({ ...billingAddress, zipCode: text })}
                                            onFocus={() => setFocusedInput('zipCode')}
                                            onBlur={() => setFocusedInput(null)}
                                            keyboardType="numeric"
                                            maxLength={10}
                                        />
                                    </View>

                                    <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                                        <Text style={styles.inputLabel}>Country</Text>
                                        <TextInput
                                            style={[styles.input, focusedInput === 'country' && styles.inputFocused]}
                                            placeholder="US"
                                            placeholderTextColor="#9ca3af"
                                            value={billingAddress.country}
                                            onChangeText={(text) => setBillingAddress({ ...billingAddress, country: text })}
                                            onFocus={() => setFocusedInput('country')}
                                            onBlur={() => setFocusedInput(null)}
                                            autoCapitalize="characters"
                                            maxLength={2}
                                        />
                                    </View>
                                </View>
                            </View>

                            <Text style={styles.helperText}>
                                Your card will be securely saved for future payments
                            </Text>
                        </>
                    ) : (
                        <View style={styles.sdkNotReady}>
                            <MaterialIcons name="warning" size={48} color="#f59e0b" />
                            <Text style={styles.sdkNotReadyTitle}>SDK Not Ready</Text>
                            <Text style={styles.sdkNotReadyText}>
                                Please rebuild the app to enable card payments
                            </Text>
                        </View>
                    )}
                </ScrollView>

                {/* Footer */}
                <View style={styles.footer}>
                    <TouchableOpacity
                        style={styles.cancelButton}
                        onPress={onClose}
                        disabled={loading}
                    >
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[
                            styles.addButton,
                            (loading || !cardComplete || !billingAddress.street.trim() || !billingAddress.city.trim() || !billingAddress.zipCode.trim()) && styles.addButtonDisabled,
                        ]}
                        onPress={handleAddCard}
                        disabled={loading || !cardComplete || !billingAddress.street.trim() || !billingAddress.city.trim() || !billingAddress.zipCode.trim()}
                    >
                        {loading ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                            <Text style={styles.addButtonText}>Add Card</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#ffffff',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#2d3748',
    },
    content: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 24,
    },
    billingSection: {
        marginTop: 24,
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1f2937',
        marginBottom: 16,
    },
    inputGroup: {
        marginBottom: 16,
    },
    inputRow: {
        flexDirection: 'row',
        marginBottom: 16,
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 8,
    },
    input: {
        height: 48,
        borderWidth: 1.5,
        borderColor: '#e5e7eb',
        borderRadius: 10,
        paddingHorizontal: 16,
        fontSize: 16,
        color: '#1f2937',
        backgroundColor: '#ffffff',
    },
    inputFocused: {
        borderColor: '#337DEB',
        backgroundColor: '#f8fafc',
    },
    subtitle: {
        fontSize: 16,
        color: '#6b7280',
        marginBottom: 24,
    },
    cardFieldContainer: {
        marginBottom: 16,
    },
    cardFieldWrapper: {
        height: 50,
    },
    cardField: {
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 8,
        textColor: '#1f2937',
        placeholderColor: '#9ca3af',
    },
    helperText: {
        fontSize: 14,
        color: '#9ca3af',
        marginTop: 8,
    },
    sdkNotReady: {
        alignItems: 'center',
        padding: 40,
    },
    sdkNotReadyTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#2d3748',
        marginTop: 16,
    },
    sdkNotReadyText: {
        fontSize: 14,
        color: '#6b7280',
        marginTop: 8,
        textAlign: 'center',
    },
    notSupported: {
        alignItems: 'center',
        padding: 40,
        flex: 1,
        justifyContent: 'center',
    },
    notSupportedTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#2d3748',
        marginTop: 24,
    },
    notSupportedText: {
        fontSize: 16,
        color: '#6b7280',
        marginTop: 16,
        textAlign: 'center',
        lineHeight: 24,
    },
    footer: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
        gap: 12,
    },
    cancelButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        alignItems: 'center',
    },
    cancelButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#6b7280',
    },
    addButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 8,
        backgroundColor: '#337DEB',
        alignItems: 'center',
    },
    addButtonDisabled: {
        backgroundColor: '#9ca3af',
    },
    addButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#ffffff',
    },
    // NGN Gateway Selection Styles
    gatewayButton: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 8,
        marginBottom: 12,
        backgroundColor: '#ffffff',
    },
    gatewayButtonSelected: {
        borderColor: '#337DEB',
        backgroundColor: '#f0f4ff',
        borderWidth: 2,
    },
    gatewayInfo: {
        flex: 1,
    },
    gatewayName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#2d3748',
        marginBottom: 4,
    },
    gatewayDescription: {
        fontSize: 14,
        color: '#6b7280',
    },
    paystackContainer: {
        marginTop: 20,
    },
    flutterwaveContainer: {
        marginTop: 20,
    },
});

export default AddCardModal;
