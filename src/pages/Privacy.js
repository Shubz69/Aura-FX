import React from 'react';
import { Link } from 'react-router-dom';
import CosmicBackground from '../components/CosmicBackground';
import '../styles/Privacy.css';

const Privacy = () => {
    return (
        <div className="privacy-container">
            <CosmicBackground />
            <div className="privacy-content">
                <div className="privacy-header">
                    <h1>PRIVACY POLICY</h1>
                    <p className="privacy-subtitle">Last Updated: January 2025</p>
                </div>

                <div className="privacy-body">
                    <section>
                        <h2>1. INTRODUCTION</h2>
                        <p>
                            AURA FX ("we," "us," or "our") is committed to protecting your privacy. This Privacy Policy explains how we 
                            collect, use, disclose, and safeguard your information when you use our website and services.
                        </p>
                    </section>

                    <section>
                        <h2>2. INFORMATION WE COLLECT</h2>
                        <h3>2.1 Personal Information</h3>
                        <p>We may collect personal information that you provide to us, including:</p>
                        <ul>
                            <li>Name and contact information (email address, phone number)</li>
                            <li>Account credentials (username, password)</li>
                            <li>Payment information (processed securely through third-party payment processors)</li>
                            <li>Profile information and preferences</li>
                        </ul>

                        <h3>2.2 Automatically Collected Information</h3>
                        <p>We may automatically collect certain information when you use our service, including:</p>
                        <ul>
                            <li>Device information (IP address, browser type, operating system)</li>
                            <li>Usage data (pages visited, time spent, features used)</li>
                            <li>Cookies and similar tracking technologies</li>
                        </ul>
                    </section>

                    <section>
                        <h2>3. HOW WE USE YOUR INFORMATION</h2>
                        <p>We use the information we collect to:</p>
                        <ul>
                            <li>Provide, maintain, and improve our services</li>
                            <li>Process transactions and send related information</li>
                            <li>Send you technical notices, updates, and support messages</li>
                            <li>Respond to your comments, questions, and requests</li>
                            <li>Monitor and analyze trends, usage, and activities</li>
                            <li>Detect, prevent, and address technical issues</li>
                            <li>Personalize and improve your experience</li>
                        </ul>
                    </section>

                    <section>
                        <h2>4. INFORMATION SHARING AND DISCLOSURE</h2>
                        <p>We do not sell, trade, or rent your personal information to third parties. We may share your information only in the following circumstances:</p>
                        <ul>
                            <li><strong>Service Providers:</strong> We may share information with third-party service providers who perform services on our behalf</li>
                            <li><strong>Legal Requirements:</strong> We may disclose information if required by law or in response to valid requests by public authorities</li>
                            <li><strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets, your information may be transferred</li>
                            <li><strong>With Your Consent:</strong> We may share your information with your consent or at your direction</li>
                        </ul>
                    </section>

                    <section>
                        <h2>5. DATA SECURITY</h2>
                        <p>
                            We implement appropriate technical and organizational security measures to protect your personal information against 
                            unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the Internet or 
                            electronic storage is 100% secure.
                        </p>
                        <p>
                            We use industry-standard encryption technologies and secure payment processing to protect sensitive information.
                        </p>
                    </section>

                    <section>
                        <h2>6. COOKIES AND TRACKING TECHNOLOGIES</h2>
                        <p>
                            We use cookies and similar tracking technologies to track activity on our service and hold certain information. 
                            You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent.
                        </p>
                        <p>
                            Cookies we use include:
                        </p>
                        <ul>
                            <li><strong>Essential Cookies:</strong> Required for the service to function properly</li>
                            <li><strong>Analytics Cookies:</strong> Help us understand how visitors interact with our website</li>
                            <li><strong>Preference Cookies:</strong> Remember your preferences and settings</li>
                        </ul>
                    </section>

                    <section>
                        <h2>7. YOUR RIGHTS</h2>
                        <p>Depending on your location, you may have the following rights regarding your personal information:</p>
                        <ul>
                            <li><strong>Access:</strong> Request access to your personal information</li>
                            <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information</li>
                            <li><strong>Deletion:</strong> Request deletion of your personal information</li>
                            <li><strong>Objection:</strong> Object to processing of your personal information</li>
                            <li><strong>Data Portability:</strong> Request transfer of your information to another service</li>
                            <li><strong>Withdraw Consent:</strong> Withdraw consent where we rely on consent to process your information</li>
                        </ul>
                        <p>To exercise these rights, please contact us at platform@aurafx.com</p>
                    </section>

                    <section>
                        <h2>8. DATA RETENTION</h2>
                        <p>
                            We retain your personal information for as long as necessary to fulfill the purposes outlined in this Privacy Policy, 
                            unless a longer retention period is required or permitted by law.
                        </p>
                    </section>

                    <section>
                        <h2>9. CHILDREN'S PRIVACY</h2>
                        <p>
                            Our service is not intended for individuals under the age of 18. We do not knowingly collect personal information 
                            from children under 18. If you are a parent or guardian and believe your child has provided us with personal information, 
                            please contact us.
                        </p>
                    </section>

                    <section>
                        <h2>10. INTERNATIONAL DATA TRANSFERS</h2>
                        <p>
                            Your information may be transferred to and maintained on computers located outside of your state, province, country, 
                            or other governmental jurisdiction where data protection laws may differ from those in your jurisdiction.
                        </p>
                    </section>

                    <section>
                        <h2>11. CHANGES TO THIS PRIVACY POLICY</h2>
                        <p>
                            We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy 
                            on this page and updating the "Last Updated" date.
                        </p>
                    </section>

                    <section>
                        <h2>12. CONTACT US</h2>
                        <p>
                            If you have any questions about this Privacy Policy, please contact us at:
                        </p>
                        <p>
                            <strong>Email:</strong> platform@aurafx.com<br />
                            <strong>Website:</strong> www.aurafx.com
                        </p>
                    </section>
                </div>

                <div className="privacy-footer">
                    <Link to="/register" className="back-link">← Back to Sign Up</Link>
                </div>
            </div>
        </div>
    );
};

export default Privacy;




