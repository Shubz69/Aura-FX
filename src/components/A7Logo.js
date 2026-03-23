import React from 'react';
import '../styles/A7Logo.css';

const A7Logo = () => {
    return (
        <div className="a7-logo-container">
            <span
                className="a7-logo-image"
                role="img"
                aria-label="A7 Logo"
                style={{
                    WebkitMaskImage: "url('/logos/a7-logo.png')",
                    maskImage: "url('/logos/a7-logo.png')",
                    WebkitMaskRepeat: 'no-repeat',
                    maskRepeat: 'no-repeat',
                    WebkitMaskPosition: 'center',
                    maskPosition: 'center',
                    WebkitMaskSize: 'contain',
                    maskSize: 'contain',
                }}
            />
        </div>
    );
};

export default A7Logo;
