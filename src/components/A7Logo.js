import React from 'react';
import '../styles/A7Logo.css';

const navbarLogoMaskUrl = `${process.env.PUBLIC_URL || ''}/logos/a7-logo.png`;

const A7Logo = ({ variant = 'default' }) => {
    if (variant === 'navbar') {
        return (
            <div className="a7-logo-container a7-logo-container--navbar" aria-hidden="true">
                <div
                    className="a7-logo-gradient"
                    style={{
                        WebkitMaskImage: `url(${navbarLogoMaskUrl})`,
                        maskImage: `url(${navbarLogoMaskUrl})`,
                    }}
                />
            </div>
        );
    }
    return (
        <div className="a7-logo-container">
            <img
                src="/logos/a7-logo.png"
                alt="Aura Terminal"
                className="a7-logo-image"
            />
        </div>
    );
};

export default A7Logo;
