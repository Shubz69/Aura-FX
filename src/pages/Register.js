import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import "../styles/Register.css";
import CosmicBackground from '../components/CosmicBackground';
import Api from '../services/Api';
import { useAuth } from '../context/AuthContext';
import { savePostAuthRedirect, loadPostAuthRedirect } from '../utils/postAuthRedirect';
import { toE164 } from '../utils/countryCodes.js';
import PhoneCountrySelect from '../components/PhoneCountrySelect';
import LanguageSelector from '../components/LanguageSelector';
import { getPreferredSiteLanguage } from '../utils/siteLanguage';

const Register = () => {
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: '',
        name: '',
        referralCode: '',
    });
    const [emailCode, setEmailCode] = useState('');
    const [phoneCode, setPhoneCode] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [codesSent, setCodesSent] = useState(false);
    const [phoneCountryCode, setPhoneCountryCode] = useState('+44');
    const [phoneNational, setPhoneNational] = useState('');
    const { t } = useTranslation();
    const [siteLanguage, setSiteLanguage] = useState(getPreferredSiteLanguage());
    const { register: registerUser } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        setFormData(prev => ({ ...prev, phone: toE164(phoneCountryCode, phoneNational) }));
    }, [phoneCountryCode, phoneNational]);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const nextParam = params.get('next');
        const planParam = params.get('plan');
        if (!nextParam) return;
        const existing = loadPostAuthRedirect();
        if (!existing || existing.next !== nextParam || (existing.plan || null) !== (planParam ? planParam.toLowerCase() : null)) {
            savePostAuthRedirect({ next: nextParam, plan: planParam, from: `${location.pathname}${location.search}` });
        }
    }, [location.pathname, location.search]);

    useEffect(() => {
        const ref = new URLSearchParams(location.search).get('ref');
        if (ref && ref.trim()) {
            setFormData((prev) => ({ ...prev, referralCode: ref.trim() }));
        }
    }, [location.search]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSendVerificationCodes = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        if (formData.username.length < 3) {
            setError(t('register.errors.usernameMinLength'));
            return;
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(formData.username)) {
            setError(t('register.errors.usernameCharset'));
            return;
        }
        if (!formData.email || !formData.phone || !formData.password || !formData.confirmPassword) {
            setError(t('register.errors.requiredFields'));
            return;
        }
        if (!phoneCountryCode || !phoneCountryCode.startsWith('+')) {
            setError(t('register.errors.countryCodeRequired'));
            return;
        }
        const phoneDigits = (phoneNational || '').replace(/\D/g, '');
        if (!phoneDigits.trim() || phoneDigits.length < 10) {
            setError(t('register.errors.phoneInvalid'));
            return;
        }
        if (formData.password !== formData.confirmPassword) {
            setError(t('register.errors.passwordMismatch'));
            return;
        }
        if (formData.password.length < 6) {
            setError(t('register.errors.passwordMinLength'));
            return;
        }
        if (!acceptedTerms) {
            setError(t('register.errors.acceptTerms'));
            return;
        }
        setIsLoading(true);
        let emailStepOk = false;
        try {
            // Email + username + phone uniqueness are checked here before any SMS is sent.
            const result = await Api.sendSignupVerificationEmail(formData.email, formData.username, formData.phone);
            if (result !== true && result !== undefined) {
                setError(t('register.errors.sendVerificationEmailFailed'));
                setIsLoading(false);
                return;
            }
            emailStepOk = true;
            const sendRes = await Api.sendPhoneVerificationCode(formData.phone);
            if (!sendRes?.success) {
                setError(
                    sendRes?.message ||
                        t('register.errors.phoneCodeSendFailedWithRecovery')
                );
                setIsLoading(false);
                return;
            }
            setCodesSent(true);
            setSuccess(t('register.success.codesSent'));
        } catch (err) {
            const serverMsg = err.response?.data?.message || err.message || t('register.errors.sendVerificationFailed');
            let errorMsg = serverMsg;
            if (serverMsg.includes("not configured") || serverMsg.includes("temporarily unavailable")) {
                errorMsg = t('register.errors.emailServiceUnavailable');
            } else if (emailStepOk) {
                errorMsg = `${serverMsg} If an email code was already sent, check your inbox—you can fix your mobile number and tap Send verification codes again.`;
            }
            setError(errorMsg);
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerifyAndSignUp = async (e) => {
        e.preventDefault();
        if (emailCode.length !== 6) {
            setError(t('register.errors.emailCodeRequired'));
            return;
        }
        if (phoneCode.length !== 6) {
            setError(t('register.errors.phoneCodeRequired'));
            return;
        }
        const emailNorm = formData.email.trim().toLowerCase();
        setIsLoading(true);
        setError("");
        setSuccess("");
        try {
            const emailResult = await Api.verifySignupCode(emailNorm, emailCode);
            if (!emailResult?.verified) {
                setError(emailResult?.message || t('register.errors.emailCodeInvalid'));
                return;
            }
            const phoneResult = await Api.verifyPhoneCode(formData.phone.trim(), phoneCode);
            if (!phoneResult?.verified) {
                setError(phoneResult?.message || t('register.errors.phoneCodeInvalid'));
                return;
            }
            const refParam = new URLSearchParams(location.search).get('ref');
            const refManual = (formData.referralCode || '').trim();
            const referralMerged = refManual || (refParam && refParam.trim()) || '';
            const submitData = {
                username: formData.username.trim(),
                email: emailNorm,
                phone: formData.phone.trim(),
                password: formData.password,
                name: (formData.name || '').trim(),
                avatar: null,
                preferredLanguage: siteLanguage,
                ...(referralMerged ? { referralCode: referralMerged } : {})
            };
            localStorage.setItem('newSignup', 'true');
            localStorage.setItem('pendingSubscription', 'true');
            const response = await registerUser(submitData);
            toast.success(t('register.toast.accountCreated'), {
                position: "top-center",
                autoClose: 1500,
                hideProgressBar: false,
                closeOnClick: true,
                pauseOnHover: true,
                draggable: true,
            });
            if (response && response.status !== "MFA_REQUIRED") {
                navigate("/choose-plan");
            }
        } catch (err) {
            setSuccess("");
            const serverMsg = err.response?.data?.message || err.message || "";
            let errorMsg = serverMsg || t('register.errors.completeSignupFailed');
            const dup =
                serverMsg.includes("already in use") ||
                serverMsg.includes("already taken") ||
                serverMsg.includes("already exists");
            if (dup) {
                setCodesSent(false);
                setEmailCode('');
                setPhoneCode('');
            }
            setError(errorMsg);
        } finally {
            setIsLoading(false);
        }
    };

    const handleResendPhoneCode = async () => {
        setError("");
        setIsLoading(true);
        try {
            await Api.sendPhoneVerificationCode(formData.phone);
            setSuccess(t('register.success.phoneCodeResent'));
        } catch (err) {
            setError(err.message || t('register.errors.resendCodeFailed'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleResendEmailCode = async () => {
        setError("");
        setIsLoading(true);
        try {
            await Api.sendSignupVerificationEmail(formData.email, formData.username, formData.phone);
            setSuccess(t('register.success.emailCodeResent'));
        } catch (err) {
            setError(err.message || t('register.errors.resendCodeFailed'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="register-container">
            <CosmicBackground />
            <div className="register-form-container">
                <div className="form-header">
                    <h2 className="register-title">{t('register.signUp')}</h2>
                    <p className="register-subtitle">{t('auth.createAccountVerify')}</p>
                </div>
                <LanguageSelector value={siteLanguage} onChange={setSiteLanguage} />
                {error ? <div className="error-message">{error}</div> : null}
                {success ? <div className="success-message">{success}</div> : null}

                {!codesSent && (
                    <form onSubmit={handleSendVerificationCodes}>
                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="username" className="form-label">{t('register.form.username')}</label>
                                <input type="text" id="username" name="username" value={formData.username} onChange={handleInputChange}
                                    required placeholder={t('register.form.enterUsername')} className="form-input" disabled={isLoading} />
                            </div>
                            <div className="form-group">
                                <label htmlFor="email" className="form-label">{t('register.form.email')}</label>
                                <input type="email" id="email" name="email" value={formData.email} onChange={handleInputChange}
                                    required placeholder={t('register.form.enterEmail')} className="form-input" disabled={isLoading} />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="name" className="form-label">{t('register.form.fullName')}</label>
                                <input type="text" id="name" name="name" value={formData.name} onChange={handleInputChange}
                                    required placeholder={t('register.form.enterFullName')} className="form-input" disabled={isLoading} />
                            </div>
                            <div className="form-group form-group-phone">
                                <label htmlFor="phone-national" className="form-label">{t('register.form.phoneNumberAnyCountry')}</label>
                                <div className="phone-input-row">
                                    <PhoneCountrySelect id="phone-country" value={phoneCountryCode} onChange={setPhoneCountryCode} disabled={isLoading} />
                                    <input type="tel" id="phone-national" name="phoneNational" value={phoneNational}
                                        onChange={(e) => { const v = e.target.value.replace(/[^\d\s]/g, ''); setPhoneNational(v); }}
                                        required placeholder={t('register.form.phoneExample')} className="form-input phone-national-input" disabled={isLoading}
                                        autoComplete="tel-national" maxLength={20} />
                                </div>
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="password" className="form-label">{t('register.form.password')}</label>
                                <input type="password" id="password" name="password" value={formData.password} onChange={handleInputChange}
                                    required placeholder={t('register.form.enterPassword')} className="form-input" disabled={isLoading} />
                            </div>
                            <div className="form-group">
                                <label htmlFor="confirmPassword" className="form-label">{t('register.form.confirmPassword')}</label>
                                <input type="password" id="confirmPassword" name="confirmPassword" value={formData.confirmPassword} onChange={handleInputChange}
                                    required placeholder={t('register.form.confirmPasswordPlaceholder')} className="form-input" disabled={isLoading} />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group" style={{ flex: 1 }}>
                                <label htmlFor="referralCode" className="form-label">{t('register.form.referralCode')} <span style={{ opacity: 0.6, fontWeight: 400 }}>({t('register.form.optional')})</span></label>
                                <input
                                    type="text"
                                    id="referralCode"
                                    name="referralCode"
                                    value={formData.referralCode}
                                    onChange={handleInputChange}
                                    placeholder={t('register.form.referralExample')}
                                    className="form-input"
                                    disabled={isLoading}
                                    autoComplete="off"
                                />
                            </div>
                        </div>
                        <label className="terms-checkbox" htmlFor="terms">
                            <input type="checkbox" id="terms" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} required disabled={isLoading} />
                            <span className="terms-checkbox-text">
                                {t('register.legal.iAgreeToThe')} <Link to="/terms" target="_blank" onClick={(e) => e.stopPropagation()}>{t('register.legal.terms')}</Link> {t('register.legal.and')} <Link to="/privacy" target="_blank" onClick={(e) => e.stopPropagation()}>{t('register.legal.privacyPolicy')}</Link>
                            </span>
                        </label>
                        <button type="submit" className="register-button" disabled={isLoading}>
                            {isLoading ? t('auth.sendingCodes') : t('auth.sendVerificationCodes')}
                        </button>
                    </form>
                )}

                {codesSent && (
                    <>
                        <hr style={{ margin: '1.25rem 0', borderColor: 'rgba(255,255,255,0.2)' }} />
                        <p className="register-subtitle" style={{ marginBottom: '1rem' }}>{t('register.verification.enterSixDigitCodes')}</p>
                        <form onSubmit={handleVerifyAndSignUp}>
                            <div className="verification-code-group">
                                <label htmlFor="email-code-register" className="form-label">{t('register.verification.emailCodeSentTo', { email: formData.email })}</label>
                                <input type="text" id="email-code-register" value={emailCode}
                                    onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').substring(0, 6))} maxLength={6} placeholder={t('register.verification.sixDigitCode')}
                                    className="verification-code-input" disabled={isLoading} />
                                <p><button type="button" onClick={handleResendEmailCode} className="link-button" disabled={isLoading} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', textDecoration: 'underline' }}>{t('register.verification.resendEmailCode')}</button></p>
                            </div>
                            <div className="verification-code-group">
                                <label htmlFor="phone-code-register" className="form-label">{t('register.verification.phoneCodeSentTo', { phone: formData.phone })}</label>
                                <input type="text" id="phone-code-register" value={phoneCode}
                                    onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, '').substring(0, 6))} maxLength={6} placeholder={t('register.verification.sixDigitCode')}
                                    className="verification-code-input" disabled={isLoading} />
                                <p><button type="button" onClick={handleResendPhoneCode} className="link-button" disabled={isLoading} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', textDecoration: 'underline' }}>{t('register.verification.resendPhoneCode')}</button></p>
                            </div>
                            <button type="submit" className="register-button" disabled={isLoading || emailCode.length !== 6 || phoneCode.length !== 6} style={{ marginTop: '0.5rem' }}>
                                {isLoading ? t('auth.verifying') : t('auth.verifyAndSignUp')}
                            </button>
                        </form>
                        <p style={{ marginTop: '1rem' }}>
                            <button type="button" onClick={() => { setCodesSent(false); setEmailCode(''); setPhoneCode(''); setPhoneCountryCode('+44'); setPhoneNational(''); setError(''); setSuccess(''); }} className="link-button" style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', textDecoration: 'underline' }}>{t('auth.startOver')}</button>
                        </p>
                    </>
                )}

                <div className="login-link" style={{ marginTop: '1.25rem' }}>
                    <p>{t('auth.alreadyHaveAccount')} <Link to="/login">{t('auth.signIn')}</Link></p>
                </div>
            </div>
        </div>
    );
};

export default Register;
