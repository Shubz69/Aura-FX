import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { FaEnvelope, FaMapMarkerAlt, FaGlobe } from 'react-icons/fa';
import { IoSend } from 'react-icons/io5';
import '../styles/ContactUs.css';
import CosmicBackground from '../components/CosmicBackground';
import Api from '../services/Api';

const ContactUs = () => {
    const location = useLocation();
    const form = useRef();
    const sectionRef = useRef();
    const [formData, setFormData] = useState({ name: '', email: '', message: '' });
    const [submitting, setSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState(null);
    const [fromMfa, setFromMfa] = useState(false);
    const [visible, setVisible] = useState(false);
    const [activeField, setActiveField] = useState(null);
    const [charCount, setCharCount] = useState(0);

    useEffect(() => {
        const searchParams = new URLSearchParams(location.search);
        const fromMfaParam = searchParams.get('fromMfa');
        const email = searchParams.get('email');
        if (fromMfaParam === 'true') {
            setFromMfa(true);
            setFormData(prev => ({
                ...prev,
                email: email || '',
                message: 'I am having issues with MFA verification. Please help.'
            }));
        }
    }, [location]);

    useEffect(() => {
        const timer = setTimeout(() => setVisible(true), 100);
        return () => clearTimeout(timer);
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (name === 'message') setCharCount(value.length);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setSubmitStatus(null);
        try {
            await Api.submitContactForm({ name: formData.name, email: formData.email, message: formData.message });
            setSubmitStatus({ type: 'success', message: 'Message transmitted successfully. Our team will respond shortly.' });
            setFormData({ name: '', email: '', message: '' });
            setCharCount(0);
        } catch (error) {
            setSubmitStatus({ type: 'error', message: 'Transmission failed. Please try again or contact us directly.' });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className={`contact-container ${visible ? 'contact-visible' : ''}`}>
            <CosmicBackground />

            {/* Ambient glow orbs */}
            <div className="contact-orb contact-orb--1" />
            <div className="contact-orb contact-orb--2" />

            <div className="contact-content">

                {/* ── HERO HEADER ── */}
                <div className="contact-header">
                    <div className="contact-eyebrow">
                        <span className="contact-eyebrow__dot" />
                        <span>{fromMfa ? 'Support Center' : 'Get In Touch'}</span>
                        <span className="contact-eyebrow__dot" />
                    </div>
                    <h1 className="contact-title">
                        {fromMfa ? 'MFA\u00A0Support' : 'Contact\u00A0Us'}
                    </h1>
                    <p className="contact-subtitle">
                        {fromMfa
                            ? 'Having trouble with Multi-Factor Authentication? Our team resolves issues fast.'
                            : 'Questions, proposals, or just want to say hello — we\u2019re always here.'}
                    </p>

                    {/* Decorative line */}
                    <div className="contact-header__rule">
                        <span /><span /><span />
                    </div>
                </div>

                {/* ── MAIN GRID ── */}
                <div className="contact-grid">

                    {/* LEFT — FORM */}
                    <div className="contact-form-container">
                        <div className="contact-form-header">
                            <h2>Send a Message</h2>
                            <p>We typically respond within 2 hours</p>
                        </div>

                        <form className="contact-form" ref={form} onSubmit={handleSubmit}>
                            <div className={`form-group ${activeField === 'name' ? 'form-group--active' : ''}`}>
                                <label htmlFor="name">
                                    <span className="label-text">Full Name</span>
                                    <span className="label-required">*</span>
                                </label>
                                <div className="input-wrapper">
                                    <input
                                        type="text"
                                        id="name"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleChange}
                                        onFocus={() => setActiveField('name')}
                                        onBlur={() => setActiveField(null)}
                                        className="form-control"
                                        required
                                        placeholder="Your full name"
                                        autoComplete="name"
                                    />
                                    <div className="input-glow" />
                                </div>
                            </div>

                            <div className={`form-group ${activeField === 'email' ? 'form-group--active' : ''}`}>
                                <label htmlFor="email">
                                    <span className="label-text">Email Address</span>
                                    <span className="label-required">*</span>
                                </label>
                                <div className="input-wrapper">
                                    <input
                                        type="email"
                                        id="email"
                                        name="email"
                                        value={formData.email}
                                        onChange={handleChange}
                                        onFocus={() => setActiveField('email')}
                                        onBlur={() => setActiveField(null)}
                                        className="form-control"
                                        required
                                        placeholder="your@email.com"
                                        autoComplete="email"
                                    />
                                    <div className="input-glow" />
                                </div>
                            </div>

                            <div className={`form-group form-group--textarea ${activeField === 'message' ? 'form-group--active' : ''}`}>
                                <label htmlFor="message">
                                    <span className="label-text">Message</span>
                                    <span className="label-char-count">{charCount}/1000</span>
                                </label>
                                <div className="input-wrapper">
                                    <textarea
                                        id="message"
                                        name="message"
                                        value={formData.message}
                                        onChange={handleChange}
                                        onFocus={() => setActiveField('message')}
                                        onBlur={() => setActiveField(null)}
                                        className="form-control"
                                        required
                                        placeholder="How can we help you today?"
                                        rows={5}
                                        maxLength={1000}
                                    />
                                    <div className="input-glow" />
                                </div>
                            </div>

                            <button
                                type="submit"
                                className={`submit-btn ${submitting ? 'submit-btn--sending' : ''}`}
                                disabled={submitting}
                            >
                                <span className="submit-btn__text">
                                    {submitting ? 'Transmitting...' : 'Send Message'}
                                </span>
                                <span className="submit-btn__icon">
                                    <IoSend />
                                </span>
                                <span className="submit-btn__shimmer" />
                            </button>

                            {submitStatus && (
                                <div className={`status-message status-message--${submitStatus.type}`}>
                                    <span className="status-message__icon">
                                        {submitStatus.type === 'success' ? '✓' : '✕'}
                                    </span>
                                    <span>{submitStatus.message}</span>
                                </div>
                            )}

                            <div className="direct-email-option">
                                <span className="direct-email-option__line" />
                                <p>Or reach us at <a href="mailto:Support@auraxfx.com">Support@auraxfx.com</a></p>
                                <span className="direct-email-option__line" />
                            </div>
                        </form>
                    </div>

                    {/* RIGHT — INFO + MAP */}
                    <div className="contact-info-container">

                        {/* Info Cards */}
                        <div className="contact-info-cards">
                            {[
                                {
                                    icon: <FaEnvelope />,
                                    label: 'Email',
                                    value: 'Support@auraxfx.com',
                                    href: 'mailto:Support@auraxfx.com',
                                    tag: 'Primary'
                                },
                                {
                                    icon: <FaMapMarkerAlt />,
                                    label: 'Location',
                                    value: 'London, United Kingdom',
                                    href: null,
                                    tag: 'HQ'
                                },
                                {
                                    icon: <FaGlobe />,
                                    label: 'Availability',
                                    value: '24 / 7 — Always On',
                                    href: null,
                                    tag: 'Live'
                                }
                            ].map((item, i) => (
                                <div className="info-card" key={i} style={{ animationDelay: `${i * 0.12}s` }}>
                                    <div className="info-card__icon-wrap">
                                        {item.icon}
                                    </div>
                                    <div className="info-card__body">
                                        <span className="info-card__label">{item.label}</span>
                                        {item.href
                                            ? <a className="info-card__value" href={item.href}>{item.value}</a>
                                            : <span className="info-card__value">{item.value}</span>
                                        }
                                    </div>
                                    <span className="info-card__tag">{item.tag}</span>
                                </div>
                            ))}
                        </div>

                        {/* Interactive Map */}
                        <div className="contact-map">
                            <div className="contact-map__header">
                                <FaMapMarkerAlt className="contact-map__pin" />
                                <span>London, United Kingdom</span>
                            </div>
                            <div className="contact-map__frame">
                                <iframe
                                    title="AURA FX London Office"
                                    src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d158857.83989158905!2d-0.24168154759218046!3d51.52877184051532!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x47d8a00baf21de75%3A0x52963a5addd52a99!2sLondon%2C%20UK!5e0!3m2!1sen!2s!4v1710000000000!5m2!1sen!2s&style=feature:all|element:labels.text.fill|color:0xffffff&style=feature:all|element:labels.text.stroke|color:0x000000"
                                    width="100%"
                                    height="100%"
                                    style={{ border: 0, filter: 'invert(90%) hue-rotate(180deg) saturate(0.3) brightness(0.85)' }}
                                    allowFullScreen=""
                                    loading="lazy"
                                    referrerPolicy="no-referrer-when-downgrade"
                                />
                                <div className="contact-map__overlay" />
                            </div>
                        </div>

                        {/* Response time indicator */}
                        <div className="response-indicator">
                            <span className="response-indicator__pulse" />
                            <span>Average response time: <strong>under 2 hours</strong></span>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};

export default ContactUs;