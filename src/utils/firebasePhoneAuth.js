/**
 * Firebase Phone Auth for signup - free OTP verification (no Twilio).
 * Only active when REACT_APP_FIREBASE_API_KEY is set.
 * Uses compat API for CRA/webpack compatibility.
 */
const isFirebasePhoneEnabled = () =>
  !!(process.env.REACT_APP_FIREBASE_API_KEY && process.env.REACT_APP_FIREBASE_AUTH_DOMAIN && process.env.REACT_APP_FIREBASE_PROJECT_ID);

let auth = null;
let app = null;
let firebase = null;

const getFirebase = () => {
  if (!isFirebasePhoneEnabled()) return null;
  if (firebase) return firebase;
  try {
    firebase = require('firebase/compat/app');
    require('firebase/compat/auth');
  } catch (e) {
    console.warn('Firebase init error:', e.message);
    return null;
  }
  return firebase;
};

const getAuth = () => {
  if (!isFirebasePhoneEnabled()) return null;
  if (auth) return auth;
  try {
    const fb = getFirebase();
    if (!fb) return null;
    const config = {
      apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
      authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
      appId: process.env.REACT_APP_FIREBASE_APP_ID || undefined
    };
    app = fb.initializeApp(config);
    auth = fb.auth();
    return auth;
  } catch (e) {
    console.warn('Firebase init error:', e.message);
    return null;
  }
};

/**
 * Create RecaptchaVerifier for phone auth. Container must exist in DOM with min 78px height.
 * Uses 'normal' size (visible checkbox) - invisible mode can fail with appVerificationDisabledForTesting errors.
 * @param {string} containerId - id of the div that will hold reCAPTCHA
 * @param {Function} [onVerified] - called when user completes reCAPTCHA (before any codes sent)
 * @returns {object|null} RecaptchaVerifier or null
 */
const setupRecaptcha = (containerId, onVerified) => {
  const a = getAuth();
  if (!a) return null;
  const container = typeof document !== 'undefined' ? document.getElementById(containerId) : null;
  if (!container) {
    console.warn('RecaptchaVerifier: container not found:', containerId);
    return null;
  }
  try {
    const fb = getFirebase();
    if (!fb) return null;
    return new fb.auth.RecaptchaVerifier(container, {
      size: 'normal',
      callback: (response) => {
        if (typeof onVerified === 'function') onVerified(response);
      },
      'expired-callback': () => {}
    });
  } catch (e) {
    console.warn('RecaptchaVerifier error:', e.message);
    return null;
  }
};

/** Normalize phone to E.164 for Firebase (e.g. +44...) */
const toE164 = (phone) => {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 10) return '';
  if (digits.length === 10 && !(phone || '').startsWith('+')) return `+1${digits}`;
  return `+${digits}`;
};

/**
 * Send OTP to phone using Firebase Phone Auth.
 * @param {string} phoneNumber - E.164 or 10-digit
 * @param {object} recaptchaVerifier - from setupRecaptcha()
 * @returns {Promise<{ confirmationResult: object }>}
 */
const sendPhoneOtp = async (phoneNumber, recaptchaVerifier) => {
  const a = getAuth();
  if (!a) throw new Error('Firebase is not configured');
  const e164 = toE164(phoneNumber);
  if (!e164) throw new Error('Invalid phone number');
  const confirmationResult = await a.signInWithPhoneNumber(e164, recaptchaVerifier);
  return { confirmationResult };
};

/**
 * Confirm OTP and get ID token for backend verification.
 * @param {object} confirmationResult - from sendPhoneOtp
 * @param {string} code - 6-digit code
 * @returns {Promise<{ idToken: string, phoneNumber: string }>}
 */
const confirmPhoneOtp = async (confirmationResult, code) => {
  const result = await confirmationResult.confirm(code);
  const user = result.user;
  const idToken = await user.getIdToken();
  const phoneNumber = user.phoneNumber || '';
  return { idToken, phoneNumber };
};

export { isFirebasePhoneEnabled, getAuth, setupRecaptcha, toE164, sendPhoneOtp, confirmPhoneOtp };
