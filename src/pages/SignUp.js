import React, { useState, useEffect } from "react";
import { useNavigate, Link, useLocation } from 'react-router-dom';
import "../styles/SignUp.css";
import CosmicBackground from '../components/CosmicBackground';
import { useAuth } from "../context/AuthContext";
import { useTranslation } from 'react-i18next';
import Api from '../services/Api';
import { savePostAuthRedirect, loadPostAuthRedirect } from '../utils/postAuthRedirect';
import LanguageSelector from '../components/LanguageSelector';
import { getPreferredSiteLanguage } from '../utils/siteLanguage';

function SignUp() {
    const [formData, setFormData] = useState({
        username: "",
        fullName: "",
        email: "",
        phone: "",
        password: "",
        confirmPassword: "",
        referralCode: ""
    });
    const [emailCode, setEmailCode] = useState("");
    const [phoneCode, setPhoneCode] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [codesSent, setCodesSent] = useState(false);
    const { t } = useTranslation();
    const [siteLanguage, setSiteLanguage] = useState(getPreferredSiteLanguage());
    const navigate = useNavigate();
    const location = useLocation();
    const { register } = useAuth();

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
        const params = new URLSearchParams(location.search);
        const incomingRef = (params.get('ref') || params.get('referral') || params.get('referralCode') || '').trim();
        if (!incomingRef) return;
        setFormData((prev) => {
            if ((prev.referralCode || '').trim()) return prev;
            return { ...prev, referralCode: incomingRef };
        });
    }, [location.search]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const validateStep1 = () => {
        const { username, fullName, email, phone, password, confirmPassword } = formData;
        if (!username || username.trim().length < 3) {
            setError(t('signUp.errUsernameMin'));
            return false;
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
            setError(t('signUp.errUsernameChars'));
            return false;
        }
        if (!fullName || fullName.trim().length < 2) {
            setError(t('signUp.errFullName'));
            return false;
        }
        if (!email || !email.includes('@')) {
            setError(t('signUp.errEmail'));
            return false;
        }
        if (!phone || phone.replace(/\D/g, '').length < 10) {
            setError(t('signUp.errPhone'));
            return false;
        }
        if (!password || password.length < 6) {
            setError(t('signUp.errPasswordLen'));
            return false;
        }
        if (password !== confirmPassword) {
            setError(t('signUp.errPasswordMatch'));
            return false;
        }
        return true;
    };

    const handleSendVerificationCodes = async (e) => {
        e.preventDefault();
        if (!validateStep1()) return;
        setIsLoading(true);
        setError("");
        setSuccess("");
        let emailStepOk = false;
        try {
            const result = await Api.sendSignupVerificationEmail(formData.email, formData.username, formData.phone);
            if (result !== true && result !== undefined) {
                setError(t('signUp.errSendEmail'));
                setIsLoading(false);
                return;
            }
            emailStepOk = true;
            const sendRes = await Api.sendPhoneVerificationCode(formData.phone);
            if (!sendRes?.success) {
                setError(
                    sendRes?.message ||
                        t('signUp.errPhoneSend')
                );
                setIsLoading(false);
                return;
            }
            setCodesSent(true);
            setSuccess(t('signUp.successCodesSent'));
        } catch (err) {
            const serverMsg = err.response?.data?.message || err.message || t('signUp.errCodesException');
            let msg = serverMsg;
            if (serverMsg.includes("not configured") || serverMsg.includes("temporarily unavailable")) {
                msg = t('signUp.errEmailUnavailable');
            } else if (emailStepOk) {
                msg = `${serverMsg}${t('signUp.errEmailCodeSuffix')}`;
            }
            setError(msg);
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerifyAndSignUp = async (e) => {
        e.preventDefault();
        if (emailCode.length !== 6) {
            setError(t('signUp.errEmailCodeLen'));
            return;
        }
        if (phoneCode.length !== 6) {
            setError(t('signUp.errPhoneCodeLen'));
            return;
        }
        const emailNorm = formData.email.trim().toLowerCase();
        setIsLoading(true);
        setError("");
        setSuccess("");
        try {
            const emailResult = await Api.verifySignupCode(emailNorm, emailCode);
            if (!emailResult?.verified) {
                setError(emailResult?.message || t('signUp.errVerifyEmail'));
                return;
            }
            const phoneResult = await Api.verifyPhoneCode(formData.phone.trim(), phoneCode);
            if (!phoneResult?.verified) {
                setError(phoneResult?.message || t('signUp.errVerifyPhone'));
                return;
            }
            const response = await register({
                username: formData.username.trim(),
                name: formData.fullName.trim(),
                email: emailNorm,
                phone: formData.phone.trim(),
                password: formData.password,
                preferredLanguage: siteLanguage,
                ...(formData.referralCode.trim() ? { referralCode: formData.referralCode.trim() } : {})
            });
            setSuccess(t('signUp.successAccount'));
            if (response && response.status !== "MFA_REQUIRED") {
                localStorage.setItem('pendingSubscription', 'true');
                localStorage.setItem('newSignup', 'true');
                navigate("/choose-plan");
            }
        } catch (err) {
            setSuccess("");
            const serverMsg = err.response?.data?.message || err.message || "";
            let errorMsg =
                serverMsg ||
                t('signUp.errFinishSignup');
            const dup =
                serverMsg.includes("already in use") ||
                serverMsg.includes("already taken") ||
                serverMsg.includes("already exists");
            if (dup) {
                setCodesSent(false);
                setEmailCode("");
                setPhoneCode("");
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
            setSuccess(t('signUp.successResendPhone'));
        } catch (err) {
            setError(err.message || t('signUp.errResend'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleResendEmailCode = async () => {
        setError("");
        setIsLoading(true);
        try {
            await Api.sendSignupVerificationEmail(formData.email, formData.username, formData.phone);
            setSuccess(t('signUp.successResendEmail'));
        } catch (err) {
            setError(err.message || t('signUp.errResend'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="login-container">
            <CosmicBackground />
            <div className="login-form-container">
                <div className="form-header">
                    <h2 className="login-title">{t('auth.signUp')}</h2>
                    <p className="login-subtitle">{t('auth.createAccountVerify')}</p>
                </div>
                <LanguageSelector value={siteLanguage} onChange={setSiteLanguage} />
                {error && <div className="error-message">{error}</div>}
                {success && <div className="success-message">{success}</div>}

                <form onSubmit={handleSendVerificationCodes}>
                    <div className="form-group">
                        <label htmlFor="username" className="form-label">{t('signUp.usernameLabel')}</label>
                        <input type="text" id="username" name="username" value={formData.username} onChange={handleChange}
                            required minLength={3} placeholder={t('signUp.usernamePlaceholder')} className="form-input" disabled={isLoading && !codesSent} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="fullName" className="form-label">{t('signUp.fullNameLabel')}</label>
                        <input type="text" id="fullName" name="fullName" value={formData.fullName} onChange={handleChange}
                            required placeholder={t('signUp.fullNamePlaceholder')} className="form-input" disabled={isLoading && !codesSent} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="email" className="form-label">{t('signUp.emailLabel')}</label>
                        <input type="email" id="email" name="email" value={formData.email} onChange={handleChange}
                            required placeholder={t('signUp.emailPlaceholder')} className="form-input" disabled={isLoading && !codesSent} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="phone" className="form-label">{t('signUp.phoneLabel')}</label>
                        <input type="tel" id="phone" name="phone" value={formData.phone} onChange={handleChange}
                            required placeholder={t('signUp.phonePlaceholder')} className="form-input" disabled={isLoading && !codesSent} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="referralCode" className="form-label">{t('signUp.referralLabel')}</label>
                        <input
                            type="text"
                            id="referralCode"
                            name="referralCode"
                            value={formData.referralCode}
                            onChange={handleChange}
                            placeholder={t('signUp.referralPlaceholder')}
                            className="form-input"
                            disabled={isLoading && !codesSent}
                            autoComplete="off"
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="password" className="form-label">{t('signUp.passwordLabel')}</label>
                        <input type="password" id="password" name="password" value={formData.password} onChange={handleChange}
                            required minLength={6} placeholder={t('signUp.passwordPlaceholder')} className="form-input" disabled={isLoading && !codesSent} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="confirmPassword" className="form-label">{t('signUp.confirmPasswordLabel')}</label>
                        <input type="password" id="confirmPassword" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange}
                            required placeholder={t('signUp.confirmPasswordPlaceholder')} className="form-input" disabled={isLoading && !codesSent} />
                    </div>
                    {!codesSent && (
                        <button type="submit" className="login-button" disabled={isLoading}>
                            {isLoading ? t('auth.sendingCodes') : t('auth.sendVerificationCodes')}
                        </button>
                    )}
                </form>

                {codesSent && (
                    <>
                        <hr style={{ margin: '1.25rem 0', borderColor: 'rgba(255,255,255,0.2)' }} />
                        <p className="login-subtitle" style={{ marginBottom: '1rem' }}>{t('signUp.codesStepHint')}</p>
                        <form onSubmit={handleVerifyAndSignUp}>
                            <div className="form-group">
                                <label htmlFor="email-code" className="form-label">{t('signUp.emailCodeLabel', { email: formData.email })}</label>
                                <input type="text" id="email-code" value={emailCode}
                                    onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').substring(0, 6))}
                                    maxLength={6} placeholder={t('signUp.codePlaceholder')} className="form-input" disabled={isLoading} />
                                <p><button type="button" onClick={handleResendEmailCode} className="link-button" disabled={isLoading}>{t('signUp.resendEmailCode')}</button></p>
                            </div>
                            <div className="form-group">
                                <label htmlFor="phone-code" className="form-label">{t('signUp.phoneCodeLabel', { phone: formData.phone })}</label>
                                <input type="text" id="phone-code" value={phoneCode}
                                    onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, '').substring(0, 6))}
                                    maxLength={6} placeholder={t('signUp.codePlaceholder')} className="form-input" disabled={isLoading} />
                                <p><button type="button" onClick={handleResendPhoneCode} className="link-button" disabled={isLoading}>{t('signUp.resendPhoneCode')}</button></p>
                            </div>
                            <button type="submit" className="login-button" disabled={isLoading || emailCode.length !== 6 || phoneCode.length !== 6}>
                                {isLoading ? t('auth.verifying') : t('auth.verifyAndSignUp')}
                            </button>
                        </form>
                        <p style={{ marginTop: '1rem' }}>
                            <button type="button" onClick={() => { setCodesSent(false); setEmailCode(''); setPhoneCode(''); setError(''); setSuccess(''); }} className="link-button">{t('auth.startOver')}</button>
                        </p>
                    </>
                )}

                <div className="register-link" style={{ marginTop: '1.25rem' }}>
                    <p>{t('auth.alreadyHaveAccount')} <Link to="/login">{t('auth.signIn')}</Link></p>
                </div>
            </div>
        </div>
    );
}

export default SignUp;
