import React from "react";
import "../styles/GDPRModal.css";

const GDPRModal = ({ onAgree }) => {
    return (
        <div className="gdpr-backdrop">
            <div className="gdpr-modal">
                <h2>🔒 GDPR Privacy Notice</h2>
                <p>
                    THE GLITCH values your privacy. We collect and store your email,
                    chat messages, course progress, and usage patterns only for platform functionality.
                    Your data is stored securely and never shared with third parties.
                </p>
                <p>
                    By clicking "I Agree", you confirm that you understand and accept our data processing policy
                    in compliance with GDPR regulations.
                </p>
                <button onClick={onAgree}>I Agree</button>
            </div>
        </div>
    );
};

export default GDPRModal;
