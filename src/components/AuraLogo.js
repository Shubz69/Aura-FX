import React from 'react';
import '../styles/AuraLogo.css';

const AuraLogo = () => {
    return (
        <div className="aura-logo-container">
            <div className="aura-logo-symbol">
                {/* Left part - Inverted V (A shape) */}
                <div className="logo-left">
                    <div className="logo-diagonal logo-diagonal-1"></div>
                    <div className="logo-diagonal logo-diagonal-2"></div>
                    <div className="logo-horizontal logo-horizontal-1"></div>
                </div>
                {/* Right part - V shape */}
                <div className="logo-right">
                    <div className="logo-diagonal logo-diagonal-3"></div>
                    <div className="logo-diagonal logo-diagonal-4"></div>
                    <div className="logo-horizontal logo-horizontal-2"></div>
                </div>
            </div>
        </div>
    );
};

export default AuraLogo;
