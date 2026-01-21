import React from 'react';
import '../styles/A7Logo.css';

const A7Logo = () => {
    return (
        <div className="a7-logo-container">
            <div className="a7-logo-symbol">
                {/* A shape - flat top (horizontal line connecting left and right diagonals) */}
                <div className="a7-horizontal a7-flat-top"></div>
                {/* A shape - left diagonal (from bottom-left up to top-left) */}
                <div className="a7-diagonal a7-diagonal-left"></div>
                {/* A shape - right diagonal (from bottom-center up to top-right) - SHARED with 7's left side */}
                <div className="a7-diagonal a7-diagonal-right"></div>
                {/* A shape - horizontal crossbar (about 2/3 up from bottom, connects the two diagonals) */}
                <div className="a7-horizontal a7-crossbar"></div>
                {/* 7 shape - horizontal top bar (extends right from flat top's right end) */}
                <div className="a7-horizontal a7-topbar"></div>
                {/* 7 shape - diagonal stroke (down-left from right end of top bar, integrates with A's right diagonal) */}
                <div className="a7-diagonal a7-diagonal-seven"></div>
            </div>
        </div>
    );
};

export default A7Logo;
