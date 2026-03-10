/**
 * Checkout Screen Component
 * 
 * Complete checkout flow for offers and proposals:
 * - Payment method selection
 * - Payment processing (two-step flow)
 * - PayPal redirect handling
 * - 3DS authentication (for Stripe)
 */

import React, { useState, useEffect, useRef } from 'react';
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
  Linking,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import logger from '../utils/logger';
import PaymentMethodSelection from './PaymentMethodSelection';
import PayPalWebView from './PayPalWebView';
import AddCardModal from './AddCardModal';
import DirectPayModal from './DirectPayModal';
import NGNPaymentWebView from './NGNPaymentWebView';
import {
  createPaymentIntent,
  confirmCardPayment,
  capturePayPalPayment,
} from '../services/payments.service';
import { fetchPaymentMethods } from '../services/paymentMethods.service';
import { useStripe } from '@stripe/stripe-react-native';
import { handlePaymentError } from '../services/error';
import { getCurrencySymbol, formatPrice } from '../utils/currency';
import ConfirmModal from './common/ConfirmModal';
import { useUIStore } from '../store/useStore';

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
  logger.error('Error importing MaterialIcons', error);
  MaterialIcons = ({ name, size, color, style }) => (
    <Text style={[{ fontSize: size || 20, color: color || '#000' }, style]}>?</Text>
  );
}

const CheckoutScreen = ({
  navigation,
  route,
}) => {
  // Route params - proposal has single currency from campaign; offer can have dual (NGN/USD)
  // Mutually exclusive: proposal flow vs offer flow (never mix - e.g. after opening offer then campaign hire)
  const rawParams = route?.params || {};
  const isProposalFlow = !!rawParams.proposalId;
  const { offerId, proposalId, offer, proposal, campaign, currency: initialCurrency } = isProposalFlow
    ? { ...rawParams, offerId: undefined, offer: undefined }
    : { ...rawParams, proposalId: undefined, proposal: undefined, campaign: undefined };

  // Stripe hook for 3DS authentication (handleNextAction = 3DS / next action)
  const stripe = useStripe();
  const handleNextAction = stripe?.handleNextAction;

  // Compute normalized initial currency to avoid first-render USD flicker
  const initialCurrencyNormalized = (() => {
    // Offer: prefer explicit initialCurrency, else pick available rate (USD then NGN)
    if (offer && !proposal) {
      if (initialCurrency) return String(initialCurrency).toUpperCase();
      if (offer.rate?.usd) return 'USD';
      if (offer.rate?.ngn) return 'NGN';
      return null;
    }
    // Proposal: single currency from campaign/proposal, default NGN
    if (proposal) {
      const c = initialCurrency || proposal?.currency || campaign?.currency || 'NGN';
      return String(c).toUpperCase();
    }
    return initialCurrency ? String(initialCurrency).toUpperCase() : null;
  })();

  // State
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null);
  const [quantity, setQuantity] = useState('1');
  const [currency, setCurrency] = useState(initialCurrencyNormalized || null);
  const [loading, setLoading] = useState(false);
  const [showPaymentMethods, setShowPaymentMethods] = useState(false);
  const [showPayPalWebView, setShowPayPalWebView] = useState(false);
  const [paypalData, setPaypalData] = useState(null);
  const [showAddCard, setShowAddCard] = useState(false);
  const [showDirectPay, setShowDirectPay] = useState(false);
  const [showNGNWebView, setShowNGNWebView] = useState(false);
  const [ngnWebViewData, setNGNWebViewData] = useState(null);
  const ui = (useUIStore && typeof useUIStore === 'function') ? useUIStore() : null;
  const [endCampaignVisible, setEndCampaignVisible] = useState(false);
  const endCampaignPromiseRef = useRef(null);

  // Determine currency on param changes: Offer = dual (NGN/USD), Proposal = single from campaign
  useEffect(() => {
    if (offer && !proposal) {
      if (!currency) {
        if (offer.rate?.usd) setCurrency('USD');
        else if (offer.rate?.ngn) setCurrency('NGN');
      }
    } else if (proposal) {
      const proposalCurrency = (initialCurrency || proposal?.currency || campaign?.currency || 'NGN');
      setCurrency(String(proposalCurrency).toUpperCase());
    }
  }, [offer, proposal, campaign, initialCurrency]);

  // When user switches away from PayPal, clear PayPal state so backend creates a new intent for the selected method
  useEffect(() => {
    if (selectedPaymentMethod && selectedPaymentMethod.type !== 'paypal') {
      setShowPayPalWebView(false);
      setPaypalData(null);
    }
  }, [selectedPaymentMethod?.type]);

  // Handle deep links when app returns from browser
  useEffect(() => {
    const handleDeepLink = (url) => {
      // Check if this is a PayPal success redirect - handle both adpartnr:// and https:// redirects
      if (url && (url.includes('/payments/paypal/success') || url.includes('token=') || url.includes('paypal_id='))) {
        try {
          console.log('[Checkout] Processing deep link URL:', url);
          // Extract query parameters
          let extractedOrderId = paypalData?.orderId;
          let paypalOrderId = paypalData?.paypalOrderId;

          try {
            const urlObj = new URL(url);
            extractedOrderId = urlObj.searchParams.get('orderId') || extractedOrderId;
            paypalOrderId = urlObj.searchParams.get('token') || urlObj.searchParams.get('paypal_id') || paypalOrderId;
          } catch (e) {
            // Manual parsing
            const tokenMatch = url.match(/[?&]token=([^&]+)/) || url.match(/[?&]paypal_id=([^&]+)/);
            if (tokenMatch) paypalOrderId = decodeURIComponent(tokenMatch[1]);

            const orderMatch = url.match(/[?&]orderId=([^&]+)/);
            if (orderMatch) extractedOrderId = decodeURIComponent(orderMatch[1]);
          }

          if (extractedOrderId && paypalOrderId) {
            logger.info('[Checkout] PayPal success from deep link', { extractedOrderId, paypalOrderId });
            // Close PayPal WebView modal
            setShowPayPalWebView(false);
            // Process payment
            handlePayPalSuccess(extractedOrderId, paypalOrderId);
            return;
          }
        } catch (error) {
          logger.error('Error parsing PayPal redirect URL', error);
        }
      }
    };

    // When app returns from browser (e.g. PayPal redirect to website), detect success by checking order status.
    // Retry a few times in case the backend is still processing the webhook.
    const checkOrderPaymentOnReturn = (orderId, attempt = 0) => {
      if (!orderId) return;
      const maxAttempts = 3;
      import('../services/orders').then(({ getOrderDetails }) => getOrderDetails(orderId))
        .then(async (res) => {
          const order = res?.data || res;
          if (order && (order.payment?.status === 'completed' || order.payment?.status === 'succeeded')) {
            setShowPayPalWebView(false);
            setPaypalData(null);
            await promptEndCampaignIfNeeded();
            navigation?.navigate('ActiveOrders', { role: 'Brand' });
          } else if (attempt < maxAttempts - 1) {
            setTimeout(() => checkOrderPaymentOnReturn(orderId, attempt + 1), 2000);
          }
        })
        .catch(() => {
          if (attempt < maxAttempts - 1) {
            setTimeout(() => checkOrderPaymentOnReturn(orderId, attempt + 1), 2000);
          }
        });
    };

    // Listen for deep links when app comes to foreground
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        if (showPayPalWebView && paypalData?.orderId) {
          Linking.getInitialURL().then((url) => {
            if (url && (url.includes('/payments/paypal/success') || url.includes('token='))) {
              handleDeepLink(url);
            } else {
              // No deep link (e.g. user returned from website) – check order status with retries
              setTimeout(() => checkOrderPaymentOnReturn(paypalData?.orderId, 0), 1500);
            }
          });
        }
      }
    });

    // Also listen for URL events
    const urlSubscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    // Check initial URL (in case app was opened via deep link)
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink(url);
      }
    });

    return () => {
      subscription.remove();
      urlSubscription.remove();
    };
  }, [showPayPalWebView, paypalData]);

  // Calculate total amount
  const calculateTotal = () => {
    if (offer) {
      const qty = parseInt(quantity) || 1;
      const rate = currency === 'USD' ? offer.rate?.usd : offer.rate?.ngn;
      return rate ? rate * qty : 0;
    } else if (proposal) {
      return proposal.compensation?.amount || 0;
    }
    return 0;
  };

  const handleSelectPaymentMethod = (method) => {
    setSelectedPaymentMethod(method);
    setShowPaymentMethods(false);

    // Clear stale PayPal data when switching methods
    if (method.type !== 'paypal') {
      setPaypalData(null);
    }

    // Auto-switch currency if needed
    if (method.currency && method.currency !== currency) {
      if (offer && offer.rate?.[method.currency.toLowerCase()]) {
        setCurrency(method.currency);
      }
    }
  };

  const promptEndCampaignIfNeeded = () => {
    const id = campaign?._id || campaign?.id;
    if (!id) return Promise.resolve(false);
    return new Promise((resolve) => {
      endCampaignPromiseRef.current = { resolve, id };
      setEndCampaignVisible(true);
    });
  };

  const handleProceedToPayment = async () => {
    // Safety check: Don't allow paying for a proposal that is already accepted
    if (proposal && proposal.status?.toLowerCase() === 'accepted') {
      Alert.alert('Already Hired', 'This creator has already been hired for this campaign.');
      navigation?.goBack();
      return;
    }

    if (!selectedPaymentMethod) {
      Alert.alert('Error', 'Please select a payment method');
      return;
    }

    if (!selectedPaymentMethod._id) {
      Alert.alert('Error', 'Invalid payment method selected');
      return;
    }

    // Validate currency for PayPal
    if (selectedPaymentMethod.type === 'paypal' && currency !== 'USD') {
      Alert.alert(
        'Invalid Currency',
        'PayPal payments only support USD currency. Please select USD or use a different payment method.'
      );
      return;
    }

    // Validate offer has USD rate for PayPal
    if (selectedPaymentMethod.type === 'paypal' && offer && !offer.rate?.usd) {
      Alert.alert(
        'Invalid Offer',
        'This offer does not have a USD rate. PayPal cannot be used. Please select a different payment method or currency.'
      );
      return;
    }

    try {
      setLoading(true);

      // Step 1: Create payment intent
      // For proposals, use createPaymentIntent with proposalId (same flow as offers)
      // The backend will handle proposal acceptance internally when creating the intent
      let intentResponse;
      if (proposalId) {
        // Use the same two-step flow as offers for proposals
        intentResponse = await createPaymentIntent({
          proposalId,
          paymentMethodId: selectedPaymentMethod._id,
          ...(currency && { currency: String(currency).toUpperCase() }),
          deepLink: 'adpartnr://payments/paypal/success'
        });
      } else {
        intentResponse = await createPaymentIntent({
          offerId,
          paymentMethodId: selectedPaymentMethod._id,
          quantity: parseInt(quantity) || 1,
          ...(currency && { currency: String(currency).toUpperCase() }),
          deepLink: 'adpartnr://payments/paypal/success'
        });
      }

      if (!intentResponse || !intentResponse.data) {
        throw new Error(intentResponse?.message || 'Failed to create payment intent');
      }

      const intentData = intentResponse.data;

      // Debug logging
      logger.debug('[Checkout] Payment intent created', {
        paymentMethodType: intentData.paymentMethodType,
        gatewayProvider: intentData.gatewayProvider,
        selectedPaymentMethodType: selectedPaymentMethod?.type,
        requiresAction: intentData.requiresAction,
      });

      // Step 2: Handle PayPal flow
      // Check both intentData.paymentMethodType and selectedPaymentMethod.type
      const isPayPal = intentData.paymentMethodType === 'paypal' || selectedPaymentMethod.type === 'paypal';

      if (isPayPal) {
        // Store PayPal data and show WebView
        setPaypalData({
          orderId: intentData.orderId,
          paypalOrderId: intentData.intentId,
          approvalUrl: intentData.approvalUrl,
        });
        setShowPayPalWebView(true);
        setLoading(false);
        return;
      }

      // Step 3: Validate this is a card payment
      const isCardPayment = selectedPaymentMethod.type === 'card' ||
        intentData.paymentMethodType === 'card' ||
        intentData.gatewayProvider === 'stripe' ||
        intentData.gatewayProvider === 'paystack';

      if (!isCardPayment) {
        throw new Error('Invalid payment method type. Only card and PayPal payments are supported.');
      }

      // Step 4: Handle card payment flow
      // Check if 3DS is required
      if (intentData.requiresAction) {
        try {
          // Handle 3DS authentication for Stripe (handleNextAction in @stripe/stripe-react-native)
          if (intentData.gatewayProvider === 'stripe') {
            logger.debug('[Checkout] Handling Stripe 3DS authentication');

            if (!handleNextAction || typeof handleNextAction !== 'function') {
              logger.error('[Checkout] handleNextAction is not available from useStripe hook');
              throw new Error('Stripe 3DS authentication is not available. Please try again or use a different payment method.');
            }

            if (!intentData.clientSecret) {
              throw new Error('Payment session is missing. Please try again.');
            }

            const returnUrl = 'adpartnr://payments/stripe-3ds-return';
            const result = await handleNextAction(intentData.clientSecret, returnUrl);
            const error = result?.error;

            if (error) {
              const msg = error.message || '3D Secure authentication failed';
              if (msg.toLowerCase().includes('no such payment_intent')) {
                throw new Error(
                  'Payment could not be verified. Ensure the app and server use Stripe keys from the same account (same Dashboard, test vs live). Try again or use another payment method.'
                );
              }
              throw new Error(msg);
            }

            logger.debug('[Checkout] Stripe 3DS authentication successful');
          } else if (intentData.gatewayProvider === 'paystack' || intentData.gatewayProvider === 'flutterwave') {
            // Paystack and Flutterwave handle 3DS/redirects via WebView
            if (intentData.authorizationUrl || intentData.redirectUrl) {
              logger.debug(`[Checkout] ${intentData.gatewayProvider} redirect required`);
              setNGNWebViewData({
                url: intentData.authorizationUrl || intentData.redirectUrl,
                provider: intentData.gatewayProvider,
                intentId: intentData.intentId
              });
              setShowNGNWebView(true);
              setLoading(false);
              return;
            } else {
              // No URL but requiresAction is true? Should not happen often for NGN
              // Fallback to confirming payment if no URL is provided but 3DS is marked as handled
              logger.debug(`[Checkout] ${intentData.gatewayProvider} requires action but no URL provided`);
              await confirmPayment(intentData.intentId);
              setLoading(false);
              return;
            }
          } else {
            // General fallback for other providers
            await confirmPayment(intentData.intentId);
            setLoading(false);
            return;
          }
        } catch (error) {
          logger.error('[Checkout] 3DS authentication error', error);
          throw error;
        }
        setLoading(false);
        return;
      }

      // Step 5: Confirm payment (no 3DS required)
      await confirmPayment(intentData.intentId);
    } catch (error) {
      handlePaymentError(error, 'Payment Error');
      setLoading(false);
    }
  };

  const confirmPayment = async (intentId, paystackReference = null) => {
    try {
      setLoading(true);

      // Double-check we're not trying to confirm a PayPal payment
      if (selectedPaymentMethod && selectedPaymentMethod.type === 'paypal') {
        throw new Error('PayPal payments must be captured using the PayPal capture endpoint. Please use the PayPal flow.');
      }

      const response = await confirmCardPayment(intentId, paystackReference);

      if (response && response.data) {
        // Paystack 3DS/OTP required - show WebView for user to complete authentication
        if (response.data.requiresAction && response.data.authorizationUrl) {
          setNGNWebViewData({
            url: response.data.authorizationUrl,
            provider: 'paystack',
            intentId: response.data.intentId || intentId,
          });
          setShowNGNWebView(true);
          setLoading(false);
          return;
        }
        await promptEndCampaignIfNeeded();
        navigation?.navigate('ActiveOrders', { role: 'Brand' });
      } else {
        throw new Error(response?.message || 'Payment confirmation failed');
      }
    } catch (error) {
      logger.error('Payment confirmation error', error);

      // Check if error is about PayPal
      // Specific check for PayPal vs Card mismatch
      if (error.message && error.message.toLowerCase().includes('paypal')) {
        Alert.alert(
          'Payment Provider Mismatch',
          'This order was previously initialized with PayPal. If you switched to a card, please try again in a moment or contact support if the problem persists.',
          [
            {
              text: 'OK',
              onPress: () => {
                // No need to clear selected method, just let them try again
                // Stale intentId on backend might be the cause
              },
            },
          ]
        );
      } else {
        handlePaymentError(error, 'Payment Error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePayPalSuccess = async (orderId, paypalOrderId) => {
    try {
      setLoading(true);
      setShowPayPalWebView(false);

      const response = await capturePayPalPayment(orderId, paypalOrderId);

      if (response && response.data) {
        await promptEndCampaignIfNeeded();
        navigation?.navigate('ActiveOrders', { role: 'Brand' });
      } else {
        throw new Error(response?.message || 'PayPal payment capture failed');
      }
    } catch (error) {
      handlePaymentError(error, 'PayPal Error');
    } finally {
      setLoading(false);
    }
  };

  const handlePayPalCancel = () => {
    setShowPayPalWebView(false);
    Alert.alert('Payment Cancelled', 'You cancelled the PayPal payment.');
  };

  const totalAmount = calculateTotal();
  const displayCurrency = currency || 'USD';

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
          <Text style={styles.headerTitle}>Checkout</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Order Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Summary</Text>
          {offer && (
            <>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Offer:</Text>
                <Text style={styles.summaryValue}>{offer.title || 'N/A'}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Quantity:</Text>
                <TextInput
                  style={styles.quantityInput}
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="numeric"
                  editable={!loading}
                />
              </View>
            </>
          )}
              {proposal && (
            <>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Proposal:</Text>
                <Text style={styles.summaryValue}>
                  {campaign?.title || campaign?.name ? `Hire for ${campaign.title || campaign.name}` : 'Hire Creator'}
                </Text>
              </View>
              {proposal.compensation?.amount != null && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Amount:</Text>
                  <Text style={styles.summaryValue}>
                    {formatPrice(proposal.compensation.amount, (displayCurrency || campaign?.currency || 'NGN'))}
                  </Text>
                </View>
              )}
            </>
          )}
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Total:</Text>
            <Text style={styles.totalValue}>
              {formatPrice(totalAmount, displayCurrency)}
            </Text>
          </View>
        </View>

        {/* Payment Method Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Method</Text>
          {selectedPaymentMethod ? (
            <TouchableOpacity
              style={styles.selectedPaymentMethod}
              onPress={() => setShowPaymentMethods(true)}
            >
              <MaterialIcons
                name={selectedPaymentMethod.type === 'paypal' ? 'account-balance-wallet' : 'credit-card'}
                size={24}
                color="#337DEB"
              />
              <View style={styles.selectedPaymentInfo}>
                <Text style={styles.selectedPaymentLabel}>
                  {selectedPaymentMethod.type === 'paypal'
                    ? `PayPal (${selectedPaymentMethod.paypalAccount?.email || 'N/A'})`
                    : `${selectedPaymentMethod.cardDetails?.brand || 'Card'} •••• ${selectedPaymentMethod.cardDetails?.last4 || '****'}`}
                </Text>
                {selectedPaymentMethod.isDefault && (
                  <Text style={styles.defaultBadge}>Default</Text>
                )}
              </View>
              <MaterialIcons name="chevron-right" size={24} color="#6b7280" />
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={styles.selectPaymentButton}
                onPress={() => setShowPaymentMethods(true)}
              >
                <MaterialIcons name="add-circle-outline" size={24} color="#337DEB" />
                <Text style={styles.selectPaymentText}>Select Payment Method</Text>
              </TouchableOpacity>

              {/* Direct Pay Option - for both USD and NGN */}
              {currency === 'USD' && (
                <View style={styles.directPayContainer}>
                  <View style={styles.directPayDivider}>
                    <View style={styles.directPayDividerLine} />
                    <Text style={styles.directPayDividerText}>OR</Text>
                    <View style={styles.directPayDividerLine} />
                  </View>
                  <TouchableOpacity
                    style={styles.directPayButton}
                    onPress={() => setShowDirectPay(true)}
                  >
                    <MaterialIcons name="credit-card" size={20} color="#337DEB" />
                    <Text style={styles.directPayButtonText}>
                      {currency === 'USD'
                        ? 'Pay with card (one-time, won\'t be saved)'
                        : 'Pay with Paystack (one-time)'}
                    </Text>
                  </TouchableOpacity>
                  <Text style={styles.directPayHint}>
                    {currency === 'USD'
                      ? 'Complete payment without saving your card details'
                      : 'Pay instantly via Paystack without saving your card'}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

        <ConfirmModal
          visible={endCampaignVisible}
          title="End Campaign"
          message="Do you want to end this campaign now so creators can no longer send proposals?"
          confirmLabel="End Campaign"
          destructive
          onCancel={() => {
            if (endCampaignPromiseRef.current) {
              endCampaignPromiseRef.current.resolve(false);
              endCampaignPromiseRef.current = null;
            }
            setEndCampaignVisible(false);
          }}
          onConfirm={async () => {
            const ctx = endCampaignPromiseRef.current;
            setEndCampaignVisible(false);
            try {
              if (ctx?.id) {
                const svc = await import('../services/campaigns');
                await svc.updateCampaign(ctx.id, { isPublic: false, status: 'in_progress' });
              }
              ui?.showToast?.('Campaign ended — new proposals disabled.', 'success');
              ctx?.resolve(true);
            } catch (e) {
              ui?.showToast?.('Could not end campaign. Proceeding with payment.', 'warning');
              ctx?.resolve(true);
            } finally {
              endCampaignPromiseRef.current = null;
            }
          }}
        />

        {/* Currency Selection (if offer has both rates) */}
        {offer && offer.rate?.usd && offer.rate?.ngn && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Currency</Text>
            <View style={styles.currencyButtons}>
              <TouchableOpacity
                style={[
                  styles.currencyButton,
                  currency === 'NGN' && styles.currencyButtonSelected,
                ]}
                onPress={() => setCurrency('NGN')}
              >
                <Text
                  style={[
                    styles.currencyButtonText,
                    currency === 'NGN' && styles.currencyButtonTextSelected,
                  ]}
                >
                  NGN (₦{offer.rate.ngn})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.currencyButton,
                  currency === 'USD' && styles.currencyButtonSelected,
                ]}
                onPress={() => setCurrency('USD')}
              >
                <Text
                  style={[
                    styles.currencyButtonText,
                    currency === 'USD' && styles.currencyButtonTextSelected,
                  ]}
                >
                  USD (${offer.rate.usd})
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Proceed Button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.proceedButton,
              (!selectedPaymentMethod || loading) && styles.proceedButtonDisabled,
            ]}
            onPress={handleProceedToPayment}
            disabled={!selectedPaymentMethod || loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <MaterialIcons name="lock" size={20} color="#ffffff" />
                <Text style={styles.proceedButtonText}>
                  Pay {formatPrice(totalAmount, displayCurrency)}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Payment Method Selection Modal */}
      <Modal
        visible={showPaymentMethods}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPaymentMethods(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Payment Method</Text>
            <TouchableOpacity onPress={() => setShowPaymentMethods(false)}>
              <MaterialIcons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>
          <PaymentMethodSelection
            currency={currency || 'USD'}
            onSelect={handleSelectPaymentMethod}
            onAddNew={(methodType) => {
              if (methodType === 'paypal') {
                setShowPaymentMethods(false);
                navigation?.navigate('PaymentMethods', {
                  showAddPayPal: true,
                  onPayPalAdded: (paypalMethod) => {
                    handleSelectPaymentMethod(paypalMethod);
                  }
                });
              } else {
                setShowPaymentMethods(false);
                setShowAddCard(true);
              }
            }}
            selectedPaymentMethodId={selectedPaymentMethod?._id}
            navigation={navigation}
          />
        </SafeAreaView>
      </Modal>

      {/* PayPal WebView Modal */}
      <Modal
        visible={showPayPalWebView}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={handlePayPalCancel}
      >
        {paypalData && (
          <PayPalWebView
            approvalUrl={paypalData.approvalUrl}
            orderId={paypalData.orderId}
            onSuccess={handlePayPalSuccess}
            onCancel={handlePayPalCancel}
            onError={(error) => {
              Alert.alert('Error', error.message || 'PayPal payment failed');
              setShowPayPalWebView(false);
            }}
          />
        )}
      </Modal>

      {/* Direct Pay Modal */}
      <DirectPayModal
        visible={showDirectPay}
        onClose={() => setShowDirectPay(false)}
        onSuccess={async (paymentData) => {
          await promptEndCampaignIfNeeded();
          navigation?.navigate('ActiveOrders', { role: 'Brand' });
        }}
        offerId={offerId}
        proposalId={proposalId}
        currency={currency || 'USD'}
        quantity={parseInt(quantity) || 1}
        amount={totalAmount}
      />

      {/* Add Card Modal */}
      <AddCardModal
        visible={showAddCard}
        onClose={() => setShowAddCard(false)}
        onSuccess={(newCard) => {
          setShowAddCard(false);
          setSelectedPaymentMethod(newCard);
        }}
        currency={currency || 'USD'}
      />

      {/* NGN Payment WebView Modal */}
      <Modal
        visible={showNGNWebView}
        animationType="slide"
        onRequestClose={() => setShowNGNWebView(false)}
      >
        {ngnWebViewData && (
          <NGNPaymentWebView
            url={ngnWebViewData.url}
            provider={ngnWebViewData.provider}
            onSuccess={async (response) => {
              setShowNGNWebView(false);
              // Paystack 3DS: pass reference to verify and complete. Others: just confirm.
              const ref = response?.reference || response?.paystackReference;
              await confirmPayment(ngnWebViewData.intentId, ref);
            }}
            onCancel={() => {
              setShowNGNWebView(false);
              Alert.alert('Payment Cancelled', 'The payment process was cancelled.');
            }}
            onError={(error) => {
              setShowNGNWebView(false);
              Alert.alert('Payment Error', 'An error occurred during payment processing.');
            }}
          />
        )}
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
  placeholder: {
    width: 32,
  },
  section: {
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2d3748',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2d3748',
  },
  quantityInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 8,
    width: 80,
    textAlign: 'center',
    fontSize: 14,
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 12,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2d3748',
  },
  totalValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#10b981',
  },
  selectedPaymentMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderWidth: 2,
    borderColor: '#337DEB',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  selectedPaymentInfo: {
    flex: 1,
  },
  selectedPaymentLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: 4,
  },
  defaultBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 10,
    fontWeight: '600',
    color: '#10b981',
  },
  selectPaymentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  selectPaymentText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#337DEB',
  },
  currencyButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  currencyButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  currencyButtonSelected: {
    borderColor: '#337DEB',
    backgroundColor: '#f0f4ff',
  },
  currencyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  currencyButtonTextSelected: {
    color: '#337DEB',
  },
  footer: {
    padding: 16,
    paddingBottom: 32,
  },
  proceedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#337DEB',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  proceedButtonDisabled: {
    opacity: 0.6,
  },
  proceedButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
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
  directPayContainer: {
    marginTop: 20,
  },
  directPayDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  directPayDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  directPayDividerText: {
    marginHorizontal: 12,
    fontSize: 14,
    fontWeight: '500',
    color: '#9ca3af',
  },
  directPayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#337DEB',
    backgroundColor: '#f8fafc',
  },
  directPayButtonText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '600',
    color: '#337DEB',
  },
  directPayHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
});

export default CheckoutScreen;
