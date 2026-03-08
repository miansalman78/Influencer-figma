/**
 * Direct Pay Modal Component
 * 
 * Provides UI for one-time payments without saving payment methods
 * Uses Stripe SDK to tokenize cards for USD
 * Uses NGNPaymentWebView for Paystack/Flutterwave for NGN
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
    ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { directPay } from '../services/payments.service';
import { handlePaymentError } from '../services/error';
import { PAYMENT_KEYS } from '../config/payment.config';
import { AuthContext } from '../context/AuthContext';
import NGNPaymentWebView from './NGNPaymentWebView';

// Safe imports for Stripe
let CardField, useStripe;
let stripeAvailable = false;

try {
    const StripeModule = require('@stripe/stripe-react-native');
    CardField = StripeModule.CardField;
    useStripe = StripeModule.useStripe;
    stripeAvailable = true;
} catch (error) {
    console.warn('[DirectPayModal] Stripe SDK not available:', error.message);
    useStripe = () => ({ createPaymentMethod: null });
    CardField = () => null;
}

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
    MaterialIcons = ({ name, size, color, style }) => (
        <Text style={[{ fontSize: size || 20, color: color || '#000' }, style]}>?</Text>
    );
}

const DirectPayModal = ({
    visible,
    onClose,
    onSuccess,
    offerId,
    proposalId,
    currency = 'USD',
    quantity = 1,
    amount = 0, // Required for NGN - total amount to charge (from offer rate * quantity or proposal amount)
}) => {
    const { user } = useContext(AuthContext);
    const stripe = useStripe();
    const createPaymentMethod = stripe?.createPaymentMethod;

    const [loading, setLoading] = useState(false);
    const [cardComplete, setCardComplete] = useState(false);
    const [selectedGateway, setSelectedGateway] = useState('paystack'); // Default to Paystack
    const [showNGNWebView, setShowNGNWebView] = useState(false);
    const [ngnWebViewUrl, setNGNWebViewUrl] = useState('');

    const isStripe = currency === 'USD';
    const isNGN = false; // NGN Direct Pay removed per requirement

    const handleDirectPay = async () => {
        try {
            setLoading(true);

            if (isStripe) {
                if (!stripeAvailable || !createPaymentMethod) {
                    throw new Error('Stripe SDK not available. Please rebuild the app.');
                }
                if (!cardComplete) {
                    Alert.alert('Invalid Card', 'Please enter a valid card number');
                    setLoading(false);
                    return;
                }

                const { paymentMethod, error } = await createPaymentMethod({
                    paymentMethodType: 'Card',
                });

                if (error) throw new Error(error.message);
                if (!paymentMethod) throw new Error('Failed to create payment method');

                const paymentData = {
                    paymentToken: paymentMethod.id,
                    gatewayProvider: 'stripe',
                    ...(offerId && { offerId }),
                    ...(proposalId && { proposalId }),
                    ...(offerId && { quantity }),
                    ...(currency && { currency }),
                };

                const response = await directPay(paymentData);
                if (response && response.data) {
                    Alert.alert('Success', 'Payment processed successfully!');
                    onSuccess(response.data);
                    onClose();
                } else {
                    throw new Error(response?.message || 'Payment failed');
                }
            } else if (isNGN) {
                if (!selectedGateway) {
                    Alert.alert('Selection Required', 'Please select a payment gateway');
                    setLoading(false);
                    return;
                }
                if (!amount || amount <= 0) {
                    Alert.alert('Error', 'Payment amount is required. Please go back and try again.');
                    setLoading(false);
                    return;
                }

                const totalAmount = amount;
                const txRef = `direct-${Date.now()}`;
                let url = '';
                let html = '';

                if (selectedGateway === 'paystack') {
                    // Paystack Inline HTML
                    const amountInKobo = Math.round(totalAmount * 100);
                    const email = user?.email || 'user@example.com';

                    html = `
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Paystack Checkout</title>
                        <script src="https://js.paystack.co/v1/inline.js"></script>
                        <style>body { background-color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; font-family: sans-serif; }</style>
                    </head>
                    <body>
                        <div id="status" style="text-align: center;">
                            <h3 id="status-title">Initializing Payment...</h3>
                            <p id="status-desc">Please wait while we load the secure payment page.</p>
                        </div>
                        <script>
                            window.onerror = function(msg, url, line) {
                               var errorMsg = "Error: " + msg + " line " + line;
                               document.getElementById('status-title').innerText = 'Error';
                               document.getElementById('status-desc').innerText = errorMsg;
                               window.ReactNativeWebView.postMessage(JSON.stringify({status: 'failed', error: errorMsg}));
                               return true;
                            };

                            function payWithPaystack() {
                                try {
                                    if (typeof PaystackPop === 'undefined') {
                                        throw new Error('Paystack SDK failed to load');
                                    }
                                    var handler = PaystackPop.setup({
                                        key: '${PAYMENT_KEYS.PAYSTACK_PUBLIC_KEY}',
                                        email: '${email}',
                                        amount: ${amountInKobo},
                                        currency: 'NGN',
                                        ref: '${txRef}',
                                        callback: function(response){
                                            var resp = {status: 'success', reference: response.reference};
                                            window.ReactNativeWebView.postMessage(JSON.stringify(resp));
                                        },
                                        onClose: function(){
                                            var resp = {status: 'cancelled'};
                                            window.ReactNativeWebView.postMessage(JSON.stringify(resp));
                                        }
                                    });
                                    handler.openIframe();
                                } catch (e) {
                                    document.getElementById('status-title').innerText = 'Payment Error';
                                    document.getElementById('status-desc').innerText = e.message;
                                    window.ReactNativeWebView.postMessage(JSON.stringify({status: 'failed', error: e.message}));
                                }
                            }
                            // Slight delay to ensure SDK load
                            setTimeout(payWithPaystack, 1000);
                        </script>
                    </body>
                    </html>
                    `;
                } else if (selectedGateway === 'flutterwave') {
                    url = `https://checkout.flutterwave.com/v3/hosted/pay?public_key=${PAYMENT_KEYS.FLUTTERWAVE_PUBLIC_KEY}&amount=${totalAmount}&currency=NGN&tx_ref=${txRef}&customer[email]=${user?.email || 'user@example.com'}&redirect_url=https://standard.flutterwave.com/close`;
                }

                if (url || html) {
                    setNGNWebViewUrl(url || html);
                    setShowNGNWebView(true);
                }
            } else {
                Alert.alert('Error', `Currency ${currency} is not supported for direct pay.`);
            }
        } catch (error) {
            handlePaymentError(error, 'Payment Error');
        } finally {
            setLoading(false);
        }
    };

    const handleNGNSuccess = async (response) => {
        try {
            setLoading(true);
            const token = response.reference || response.tx_ref;

            const paymentData = {
                paymentToken: token,
                gatewayProvider: selectedGateway,
                ...(offerId && { offerId }),
                ...(proposalId && { proposalId }),
                ...(offerId && { quantity }),
                currency: 'NGN',
            };

            const result = await directPay(paymentData);
            if (result && result.data) {
                Alert.alert('Success', 'Payment processed successfully!');
                onSuccess(result.data);
                onClose();
            } else {
                throw new Error(result?.message || 'Payment verification failed');
            }
        } catch (error) {
            handlePaymentError(error, 'Payment Error');
        } finally {
            setLoading(false);
        }
    };

    if (!isStripe && !isNGN) {
        return (
            <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
                <SafeAreaView style={styles.container}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Direct Payment</Text>
                        <TouchableOpacity onPress={onClose}><MaterialIcons name="close" size={24} color="#64748b" /></TouchableOpacity>
                    </View>
                    <View style={styles.content}>
                        <View style={styles.notSupported}>
                            <MaterialIcons name="info-outline" size={64} color="#337DEB" />
                            <Text style={styles.notSupportedTitle}>Currency Not Supported</Text>
                            <Text style={styles.notSupportedText}>Direct pay is currently only supported for USD payments. For NGN, please use a saved payment method or select USD if available.</Text>
                        </View>
                    </View>
                    <View style={styles.footer}>
                        <TouchableOpacity style={styles.closeButton} onPress={onClose}><Text style={styles.closeButtonText}>Close</Text></TouchableOpacity>
                    </View>
                </SafeAreaView>
            </Modal>
        );
    }

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>Direct Payment</Text>
                    <TouchableOpacity onPress={onClose} disabled={loading}><MaterialIcons name="close" size={24} color="#64748b" /></TouchableOpacity>
                </View>

                <ScrollView style={styles.content}>
                    {isNGN ? (
                        <>
                            <Text style={styles.sectionTitle}>Select Payment Gateway</Text>
                            <TouchableOpacity
                                style={[styles.gatewayButton, selectedGateway === 'paystack' && styles.gatewayButtonSelected]}
                                onPress={() => setSelectedGateway('paystack')}
                            >
                                <View style={styles.gatewayInfo}>
                                    <Text style={styles.gatewayName}>Paystack</Text>
                                    <Text style={styles.gatewayDescription}>Nigerian payment gateway (Recommended)</Text>
                                </View>
                                {selectedGateway === 'paystack' && <MaterialIcons name="check-circle" size={24} color="#337DEB" />}
                            </TouchableOpacity>

                            {!!PAYMENT_KEYS.FLUTTERWAVE_PUBLIC_KEY && (
                                <TouchableOpacity
                                    style={[styles.gatewayButton, selectedGateway === 'flutterwave' && styles.gatewayButtonSelected]}
                                    onPress={() => setSelectedGateway('flutterwave')}
                                >
                                    <View style={styles.gatewayInfo}>
                                        <Text style={styles.gatewayName}>Flutterwave</Text>
                                        <Text style={styles.gatewayDescription}>Pan-African payment gateway</Text>
                                    </View>
                                    {selectedGateway === 'flutterwave' && <MaterialIcons name="check-circle" size={24} color="#337DEB" />}
                                </TouchableOpacity>
                            )}
                        </>
                    ) : (
                        <>
                            <Text style={styles.subtitle}>Enter your card details for a one-time USD payment.</Text>
                            {stripeAvailable && CardField ? (
                                <View style={styles.cardFieldContainer}>
                                    <CardField
                                        postalCodeEnabled={false}
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
                                        onCardChange={(cardDetails) => setCardComplete(cardDetails.complete)}
                                    />
                                </View>
                            ) : (
                                <View style={styles.sdkNotReady}><Text>Stripe SDK not available.</Text></View>
                            )}
                        </>
                    )}
                </ScrollView>

                <View style={styles.footer}>
                    <TouchableOpacity
                        style={[styles.payButton, (loading || (isStripe && !cardComplete) || (isNGN && !selectedGateway)) && styles.payButtonDisabled]}
                        onPress={handleDirectPay}
                        disabled={loading || (isStripe && !cardComplete) || (isNGN && !selectedGateway)}
                    >
                        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.payButtonText}>{isNGN ? 'Proceed to Payment' : 'Pay Now'}</Text>}
                    </TouchableOpacity>
                </View>

                <Modal visible={showNGNWebView} animationType="slide" onRequestClose={() => setShowNGNWebView(false)}>
                    <NGNPaymentWebView
                        url={!ngnWebViewUrl.startsWith('<!DOCTYPE') ? ngnWebViewUrl : undefined}
                        htmlContent={ngnWebViewUrl.startsWith('<!DOCTYPE') ? ngnWebViewUrl : undefined}
                        provider={selectedGateway}
                        onSuccess={(resp) => { setShowNGNWebView(false); handleNGNSuccess(resp); }}
                        onCancel={() => setShowNGNWebView(false)}
                        onError={() => { setShowNGNWebView(false); Alert.alert('Error', 'Payment failed'); }}
                    />
                </Modal>
            </SafeAreaView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
    title: { fontSize: 18, fontWeight: 'bold' },
    content: { flex: 1, padding: 20 },
    subtitle: { fontSize: 14, color: '#666', marginBottom: 20 },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 16 },
    cardFieldContainer: { marginBottom: 20 },
    cardFieldWrapper: { height: 50 },
    cardField: { backgroundColor: '#fff', textColor: '#000', borderRadius: 8 },
    gatewayButton: { flexDirection: 'row', alignItems: 'center', padding: 16, borderWidth: 1, borderColor: '#eee', borderRadius: 10, marginBottom: 12 },
    gatewayButtonSelected: { borderColor: '#337DEB', backgroundColor: '#f0f4ff' },
    gatewayInfo: { flex: 1 },
    gatewayName: { fontWeight: 'bold', marginBottom: 4 },
    gatewayDescription: { fontSize: 12, color: '#666' },
    footer: { padding: 20, borderTopWidth: 1, borderTopColor: '#eee' },
    payButton: { backgroundColor: '#337DEB', padding: 16, borderRadius: 10, alignItems: 'center' },
    payButtonDisabled: { backgroundColor: '#ccc' },
    payButtonText: { color: '#fff', fontWeight: 'bold' },
    notSupported: { alignItems: 'center', justifyContent: 'center', flex: 1 },
    notSupportedTitle: { fontSize: 18, fontWeight: 'bold', marginTop: 16 },
    notSupportedText: { textAlign: 'center', color: '#666', marginTop: 8 },
    closeButton: { padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#eee', borderRadius: 10 },
    closeButtonText: { fontWeight: 'bold' },
    sdkNotReady: { padding: 20, alignItems: 'center' },
});

export default DirectPayModal;
