/**
 * Firebase Phone Auth for signup - free OTP verification (no Twilio).
 * Only active when REACT_APP_FIREBASE_API_KEY is set.
 */
const isFirebasePhoneEnabled = () =>
  !!(process.env.REACT_APP_FIREBASE_API_KEY && process.env.REACT_APP_FIREBASE_AUTH_DOMAIN && process.env.REACT_APP_FIREBASE_PROJECT_ID);

let auth = null;
let app = null;

const getAuth = () => {
  if (!isFirebasePhoneEnabled()) return null;
  if (auth) return auth;
  try {
    const { getAuth: getFirebaseAuth } = require('firebase/auth');
    const { initializeApp } = require('firebase/app');
    const config = {
      apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
      authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
      appId: process.env.REACT_APP_FIREBASE_APP_ID || undefined
    };
    app = initializeApp(config);
    auth = getFirebaseAuth(app);
    return auth;
  } catch (e) {
    console.warn('Firebase init error:', e.message);
    return null;
  }
};

/**
 * Create RecaptchaVerifier for phone auth. Pass the button element id (e.g. "firebase-phone-send-btn").
 * @param {string} containerId - id of the button or div that will hold reCAPTCHA
 * @returns {object|null} RecaptchaVerifier or null
 */
const setupRecaptcha = (containerId) => {
  const a = getAuth();
  if (!a) return null;
  try {
    const { RecaptchaVerifier } = require('firebase/auth');
    return new RecaptchaVerifier(containerId, { size: 'invisible', callback: () => {} }, a);
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
  const { signInWithPhoneNumber } = require('firebase/auth');
  const e164 = toE164(phoneNumber);
  if (!e164) throw new Error('Invalid phone number');
  const confirmationResult = await signInWithPhoneNumber(a, e164, recaptchaVerifier);
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
