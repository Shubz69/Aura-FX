import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { FaEnvelope, FaMapMarkerAlt, FaGlobe } from 'react-icons/fa';
import { IoSend } from 'react-icons/io5';
import '../styles/ContactUs.css';
import Chatbot from "../components/Chatbot";
import BinaryBackground from '../components/BinaryBackground';
import Api from '../services/Api';

// Simple Text Component
const SimpleText = ({ text }) => {
    return (
        <h1 className="contact-title">{text}</h1>
    );
};

const ContactUs = () => {
    const location = useLocation();
    const form = useRef();
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        message: ''
    });
    const [submitting, setSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState(null);
    const [fromMfa, setFromMfa] = useState(false);

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

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setSubmitStatus(null);
        
        try {
            await Api.submitContactForm({
                name: formData.name,
                email: formData.email,
                message: formData.message
            });
            
            setSubmitStatus({
                type: 'success',
                message: 'Your message has been sent successfully. We will contact you soon.'
            });
            // Reset form
            setFormData({ name: '', email: '', message: '' });
        } catch (error) {
            console.error('Error sending message:', error);
            setSubmitStatus({
                type: 'error',
                message: 'There was a problem sending your message. Please try again later.'
            });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="contact-container">
            <BinaryBackground />
            <div className="contact-content">
                <div className="contact-header">
                    <SimpleText text={fromMfa ? 'MFA Support' : 'Contact Us'} />
                    
                    <p className="contact-subtitle">
                        {fromMfa 
                            ? 'Having trouble with your Multi-Factor Authentication? Let us help you resolve it quickly.'
                            : 'Got a question or proposal, or just want to say hello? Feel free to reach out.'}
                    </p>
                </div>
                
                <div className="contact-grid">
                    <div className="contact-form-container">
                        <form className="contact-form" ref={form} onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label htmlFor="name">Full Name</label>
                                <input
                                    type="text"
                                    id="name"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    className="form-control"
                                    required
                                    placeholder="Your full name"
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="email">Email Address</label>
                                <input
                                    type="email"
                                    id="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    className="form-control"
                                    required
                                    placeholder="Your email address"
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="message">Message</label>
                                <textarea
                                    id="message"
                                    name="message"
                                    value={formData.message}
                                    onChange={handleChange}
                                    className="form-control"
                                    required
                                    placeholder="How can we help you?"
                                    rows={6}
                                />
                            </div>
                            
                            <button 
                                type="submit"
                                className="submit-btn"
                                disabled={submitting}
                            >
                                {submitting ? 'Sending...' : 'Send Message'} <IoSend />
                            </button>
                            
                            {submitStatus && (
                                <div className={`success-message ${submitStatus.type}`}>
                                    {submitStatus.message}
                                </div>
                            )}
                            
                            <div className="direct-email-option">
                                <p>Or email us directly at: <a href="mailto:platform@theglitch.online">platform@theglitch.online</a></p>
                            </div>
                        </form>
                    </div>
                    
                    <div className="contact-info-container">
                        <h2 className="contact-info-header">Get In Touch</h2>

                        <div className="contact-info-list">
                            <div className="contact-info-item">
                                <div className="contact-icon">
                                    <FaEnvelope />
                                </div>
                                <div className="contact-text">
                                    <strong>Email</strong>
                                    <span>platform@theglitch.online</span>
                                </div>
                            </div>
                            
                            <div className="contact-info-item">
                                <div className="contact-icon">
                                    <FaMapMarkerAlt />
                                </div>
                                <div className="contact-text">
                                    <strong>Location</strong>
                                    <span>London, United Kingdom</span>
                                </div>
                            </div>
                            
                            <div className="contact-info-item">
                                <div className="contact-icon">
                                    <FaGlobe />
                                </div>
                                <div className="contact-text">
                                    <strong>Working Hours</strong>
                                    <span>Mon - Fri: 9:00 AM - 6:00 PM</span>
                                </div>
                            </div>
                        </div>
                        
                        <div className="contact-map">
                            <div className="map-placeholder">
                                Interactive map will be displayed here
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <Chatbot />
        </div>
    );
};

export default ContactUs;
