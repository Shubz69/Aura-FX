import React from 'react';
import '../styles/A7Logo.css';

const A7Logo = () => {
    return (
        <div className="a7-logo-container">
            <div className="a7-logo-symbol">
                {/* A shape - left diagonal */}
                <div className="a7-diagonal a7-diagonal-left"></div>
                {/* A shape - right diagonal */}
                <div className="a7-diagonal a7-diagonal-right"></div>
                {/* A shape - horizontal crossbar (shared with 7) */}
                <div className="a7-horizontal a7-crossbar"></div>
                {/* 7 shape - diagonal stroke (down-right) */}
                <div className="a7-diagonal a7-diagonal-seven"></div>
            </div>
        </div>
    );
};

export default A7Logo;
