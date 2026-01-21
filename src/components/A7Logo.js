import React from 'react';
import '../styles/A7Logo.css';

const A7Logo = () => {
    return (
        <div className="a7-logo-container">
            <div className="a7-logo-symbol">
                {/* Flat top - Continuous horizontal bar spanning both A and 7 */}
                <div className="a7-horizontal a7-flat-top"></div>
                {/* A shape - left diagonal (from bottom-left up to flat top) */}
                <div className="a7-diagonal a7-diagonal-left"></div>
                {/* A shape - right diagonal (from bottom-center up to flat top) */}
                <div className="a7-diagonal a7-diagonal-right"></div>
                {/* A shape - horizontal crossbar (2/3 down from flat top, connects the two diagonals) */}
                <div className="a7-horizontal a7-crossbar"></div>
                {/* 7 shape - diagonal stroke (from right end of flat top, down-left, parallel to A's right diagonal) */}
                <div className="a7-diagonal a7-diagonal-seven"></div>
            </div>
        </div>
    );
};

export default A7Logo;
