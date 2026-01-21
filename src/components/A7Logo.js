import React from 'react';
import '../styles/A7Logo.css';

const A7Logo = () => {
    return (
        <div className="a7-logo-container">
            <div className="a7-logo-symbol">
                {/* A shape - left diagonal (from bottom-left to apex) */}
                <div className="a7-diagonal a7-diagonal-left"></div>
                {/* A shape - right diagonal (from apex to bottom-center) - also serves as left side of 7 */}
                <div className="a7-diagonal a7-diagonal-right"></div>
                {/* A shape - short horizontal crossbar (high up, connects the two diagonals) */}
                <div className="a7-horizontal a7-crossbar"></div>
                {/* 7 shape - horizontal top bar (extends right from crossbar, aligns with it) */}
                <div className="a7-horizontal a7-topbar"></div>
                {/* 7 shape - diagonal stroke (down and slightly left from right end of top bar) */}
                <div className="a7-diagonal a7-diagonal-seven"></div>
            </div>
        </div>
    );
};

export default A7Logo;
