import React from 'react';
import '../styles/RuleModal.css';

const RuleModal = ({ onAccept }) => {
    return (
        <div className="modal-backdrop">
            <div className="modal-content">
                <h2>📜 Community Rules</h2>
                <ul>
                    <li>✅ Be respectful to others</li>
                    <li>🚫 No spam, scams or self-promo</li>
                    <li>💬 Keep conversations in the right channels</li>
                    <li>🔒 Your chats are encrypted & secure</li>
                </ul>
                <p>By clicking "Accept", you agree to our community rules and privacy terms.</p>
                <button onClick={onAccept}>Accept & Continue</button>
            </div>
        </div>
    );
};

export default RuleModal;
