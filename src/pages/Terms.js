import React from 'react';
import { Link } from 'react-router-dom';
import CosmicBackground from '../components/CosmicBackground';
import '../styles/Terms.css';

const Terms = () => {
    return (
        <div className="terms-container">
            <CosmicBackground />
            <div className="terms-content">
                <div className="terms-header">
                    <h1>TERMS AND CONDITIONS</h1>
                    <p className="terms-subtitle">Last Updated: January 2025</p>
                </div>

                <div className="terms-body">
                    <section>
                        <h2>1. AGREEMENT TO TERMS</h2>
                        <p>
                            By accessing or using AURA FX ("we," "us," or "our"), you agree to be bound by these Terms and Conditions. 
                            If you disagree with any part of these terms, you may not access the service.
                        </p>
                    </section>

                    <section>
                        <h2>2. USE LICENSE</h2>
                        <p>
                            Permission is granted to temporarily access the materials on AURA FX's website for personal, non-commercial 
                            transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:
                        </p>
                        <ul>
                            <li>Modify or copy the materials</li>
                            <li>Use the materials for any commercial purpose or for any public display</li>
                            <li>Attempt to reverse engineer any software contained on AURA FX's website</li>
                            <li>Remove any copyright or other proprietary notations from the materials</li>
                            <li>Transfer the materials to another person or "mirror" the materials on any other server</li>
                        </ul>
                    </section>

                    <section>
                        <h2>3. USER ACCOUNTS</h2>
                        <p>
                            When you create an account with us, you must provide information that is accurate, complete, and current at all times. 
                            You are responsible for safeguarding the password and for all activities that occur under your account.
                        </p>
                        <p>
                            You agree not to disclose your password to any third party. You must notify us immediately upon becoming aware of 
                            any breach of security or unauthorized use of your account.
                        </p>
                    </section>

                    <section>
                        <h2>4. SUBSCRIPTION AND PAYMENT</h2>
                        <p>
                            AURA FX offers subscription-based services. By subscribing, you agree to pay the subscription fees as indicated 
                            on the platform. Subscription fees are billed in advance on a monthly basis and are non-refundable.
                        </p>
                        <p>
                            We reserve the right to change our subscription plans and pricing at any time. We will provide notice of any 
                            price changes at least 30 days in advance.
                        </p>
                    </section>

                    <section>
                        <h2>5. TRADING AND FINANCIAL DISCLAIMER</h2>
                        <p>
                            AURA FX provides educational content and trading tools. We do not provide financial advice, and all trading 
                            decisions are your own responsibility. Trading involves substantial risk of loss and is not suitable for all investors.
                        </p>
                        <p>
                            Past performance is not indicative of future results. You should never trade with money you cannot afford to lose.
                        </p>
                    </section>

                    <section>
                        <h2>6. INTELLECTUAL PROPERTY</h2>
                        <p>
                            The service and its original content, features, and functionality are and will remain the exclusive property of 
                            AURA FX and its licensors. The service is protected by copyright, trademark, and other laws.
                        </p>
                    </section>

                    <section>
                        <h2>7. PROHIBITED USES</h2>
                        <p>You may not use our service:</p>
                        <ul>
                            <li>In any way that violates any applicable national or international law or regulation</li>
                            <li>To transmit, or procure the sending of, any advertising or promotional material without our prior written consent</li>
                            <li>To impersonate or attempt to impersonate the company, a company employee, another user, or any other person or entity</li>
                            <li>In any way that infringes upon the rights of others, or in any way is illegal, threatening, fraudulent, or harmful</li>
                            <li>To engage in any other conduct that restricts or inhibits anyone's use or enjoyment of the website</li>
                        </ul>
                    </section>

                    <section>
                        <h2>8. TERMINATION</h2>
                        <p>
                            We may terminate or suspend your account and bar access to the service immediately, without prior notice or liability, 
                            under our sole discretion, for any reason whatsoever and without limitation, including but not limited to a breach of the Terms.
                        </p>
                    </section>

                    <section>
                        <h2>9. LIMITATION OF LIABILITY</h2>
                        <p>
                            In no event shall AURA FX, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for 
                            any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, 
                            use, goodwill, or other intangible losses, resulting from your use of the service.
                        </p>
                    </section>

                    <section>
                        <h2>10. GOVERNING LAW</h2>
                        <p>
                            These Terms shall be interpreted and governed by the laws of the jurisdiction in which AURA FX operates, without 
                            regard to its conflict of law provisions.
                        </p>
                    </section>

                    <section>
                        <h2>11. CHANGES TO TERMS</h2>
                        <p>
                            We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material, 
                            we will provide at least 30 days notice prior to any new terms taking effect.
                        </p>
                    </section>

                    <section>
                        <h2>12. CONTACT INFORMATION</h2>
                        <p>
                            If you have any questions about these Terms and Conditions, please contact us at:
                        </p>
                        <p>
                            <strong>Email:</strong> platform@aurafx.com<br />
                            <strong>Website:</strong> www.aurafx.com
                        </p>
                    </section>
                </div>

                <div className="terms-footer">
                    <Link to="/register" className="back-link">← Back to Sign Up</Link>
                </div>
            </div>
        </div>
    );
};

export default Terms;

