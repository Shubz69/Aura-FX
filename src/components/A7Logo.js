import React from 'react';
import '../styles/A7Logo.css';

const A7Logo = () => {
    return (
        <div className="a7-logo-container">
            <div className="a7-logo-symbol">
                {/* A shape - left diagonal (meets at bottom, open at top) */}
                <div className="a7-diagonal a7-diagonal-left"></div>
                {/* A shape - right diagonal (meets at bottom, open at top) */}
                <div className="a7-diagonal a7-diagonal-right"></div>
                {/* 7 shape - horizontal bar at top (to the right of A) */}
                <div className="a7-horizontal a7-crossbar"></div>
                {/* 7 shape - diagonal stroke (down-left from horizontal bar, connecting to A) */}
                <div className="a7-diagonal a7-diagonal-seven"></div>
            </div>
        </div>
    );
};

export default A7Logo;
