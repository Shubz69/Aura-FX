/**
 * Stripe PaymentIntent flow – frontend uses Stripe.js only (no direct api.stripe.com calls).
 * - Uses pk_ (publishable key); backend uses sk_ (secret key) for create-payment-intent.
 * - One click = one Stripe call; errors shown inline; submit disabled until ready and while processing.
 */

import React, { useState, useCallback, useRef } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import Api from '../services/Api';

const PUBLISHABLE_KEY = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || '';

function validatePublishableKey(key) {
  if (!key || typeof key !== 'string') return false;
  if (key.startsWith('pk_test_')) return true;
  if (key.startsWith('pk_live_')) return true;
  return false;
}

if (typeof window !== 'undefined' && PUBLISHABLE_KEY && process.env.NODE_ENV !== 'test') {
  const mode = PUBLISHABLE_KEY.startsWith('pk_test_') ? 'TEST' : 'LIVE';
  console.log(`Stripe frontend mode: ${mode}`);
  if (!validatePublishableKey(PUBLISHABLE_KEY)) {
    console.warn('REACT_APP_STRIPE_PUBLISHABLE_KEY should start with pk_test_ or pk_live_');
  }
}

const stripePromise = PUBLISHABLE_KEY && validatePublishableKey(PUBLISHABLE_KEY)
  ? loadStripe(PUBLISHABLE_KEY)
  : null;

const cardElementOptions = {
  style: {
    base: {
      fontSize: '16px',
      color: '#fff',
      '::placeholder': { color: '#aab7c4' },
      iconColor: '#fff'
    },
    invalid: {
      color: '#fa755a',
      iconColor: '#fa755a'
    }
  },
  hidePostalCode: false
};

function PaymentFormInner({ amountCents, currency, onSuccess, onError, submitLabel = 'Pay' }) {
  const stripe = useStripe();
  const elements = useElements();
  const [errorMessage, setErrorMessage] = useState('');
  const [processing, setProcessing] = useState(false);
  const submittedRef = useRef(false);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (processing || submittedRef.current) return;
    if (!stripe || !elements) {
      setErrorMessage('Payment form is not ready. Please wait.');
      return;
    }

    const card = elements.getElement(CardElement);
    if (!card) {
      setErrorMessage('Card input not ready. Please refresh and try again.');
      return;
    }

    setErrorMessage('');
    setProcessing(true);
    submittedRef.current = true;

    try {
      const { createPaymentIntent } = Api;
      const res = await createPaymentIntent(amountCents, currency);
      if (!res || !res.success || !res.clientSecret) {
        const msg = res?.message || 'Could not start payment. Please try again.';
        setErrorMessage(msg);
        if (onError) onError(new Error(msg));
        setProcessing(false);
        submittedRef.current = false;
        return;
      }

      const { error, paymentIntent } = await stripe.confirmCardPayment(res.clientSecret, {
        payment_method: {
          card,
          billing_details: { name: undefined }
        }
      });

      if (error) {
        console.error('Stripe confirmCardPayment error:', error);
        const msg = error.message || 'Payment failed. Please try again.';
        setErrorMessage(msg);
        if (onError) onError(error);
        setProcessing(false);
        submittedRef.current = false;
        return;
      }

      setErrorMessage('');
      if (onSuccess) onSuccess(paymentIntent);
    } catch (err) {
      console.error('Payment error:', err);
      const msg = err.response?.data?.message || err.message || 'Something went wrong. Please try again.';
      setErrorMessage(msg);
      if (onError) onError(err);
    } finally {
      setProcessing(false);
      submittedRef.current = false;
    }
  }, [stripe, elements, amountCents, currency, processing, onSuccess, onError]);

  const ready = Boolean(stripe && elements);
  const disabled = !ready || processing;

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 400, margin: '0 auto' }}>
      <div style={{ marginBottom: 16, padding: 12, background: 'rgba(255,255,255,0.06)', borderRadius: 8 }}>
        <CardElement options={cardElementOptions} onChange={() => setErrorMessage('')} />
      </div>
      {errorMessage && (
        <div role="alert" style={{ color: '#fa755a', marginBottom: 12, fontSize: 14 }}>
          {errorMessage}
        </div>
      )}
      <button type="submit" disabled={disabled} style={{ width: '100%', padding: 12, cursor: disabled ? 'not-allowed' : 'pointer' }}>
        {!ready ? 'Loading...' : processing ? 'Processing...' : submitLabel}
      </button>
    </form>
  );
}

export function StripePaymentForm({ amountCents, currency = 'gbp', onSuccess, onError, submitLabel }) {
  if (!stripePromise) {
    return (
      <div role="alert" style={{ color: '#fa755a', padding: 12 }}>
        Payment is not configured. Set REACT_APP_STRIPE_PUBLISHABLE_KEY (pk_test_... or pk_live_...).
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise}>
      <PaymentFormInner
        amountCents={amountCents}
        currency={currency}
        onSuccess={onSuccess}
        onError={onError}
        submitLabel={submitLabel}
      />
    </Elements>
  );
}

export default StripePaymentForm;
