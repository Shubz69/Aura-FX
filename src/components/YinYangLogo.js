import React, { useState, useEffect } from 'react';

const YinYangLogo = ({ size = 60, showGlitch = false, className = '' }) => {
    const [isGlitching, setIsGlitching] = useState(false);

    useEffect(() => {
        if (showGlitch) {
            const glitchInterval = setInterval(() => {
                setIsGlitching(true);
                setTimeout(() => setIsGlitching(false), 200);
            }, 3000);

            return () => clearInterval(glitchInterval);
        }
    }, [showGlitch]);

    const logoStyle = {
        width: `${size}px`,
        height: `${size}px`,
    };

    const innerSize = size * 0.6;
    const cornerSize = size * 0.15;

    return (
        <div 
            className={`tech-logo ${isGlitching ? 'glitch' : ''} ${className}`}
            style={logoStyle}
        >
            {/* Main hexagon shape */}
            <div 
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: `${innerSize}px`,
                    height: `${innerSize}px`,
                    background: '#1E90FF',
                    borderRadius: '50%',
                    transform: 'translate(-50%, -50%)',
                    boxShadow: `
                        0 0 ${size * 0.1}px #1E90FF,
                        0 0 ${size * 0.2}px #1E90FF
                    `
                }}
            />
            
            {/* Corner elements - creating a tech/glitch feel */}
            <div 
                style={{
                    position: 'absolute',
                    top: `${size * 0.1}px`,
                    left: `${size * 0.1}px`,
                    width: `${cornerSize}px`,
                    height: `${cornerSize}px`,
                    background: '#1E90FF',
                    borderRadius: '2px',
                    transform: 'rotate(45deg)',
                    boxShadow: `0 0 ${size * 0.05}px #1E90FF`
                }}
            />
            
            <div 
                style={{
                    position: 'absolute',
                    top: `${size * 0.1}px`,
                    right: `${size * 0.1}px`,
                    width: `${cornerSize}px`,
                    height: `${cornerSize}px`,
                    background: '#1E90FF',
                    borderRadius: '2px',
                    transform: 'rotate(45deg)',
                    boxShadow: `0 0 ${size * 0.05}px #1E90FF`
                }}
            />
            
            <div 
                style={{
                    position: 'absolute',
                    bottom: `${size * 0.1}px`,
                    left: `${size * 0.1}px`,
                    width: `${cornerSize}px`,
                    height: `${cornerSize}px`,
                    background: '#1E90FF',
                    borderRadius: '2px',
                    transform: 'rotate(45deg)',
                    boxShadow: `0 0 ${size * 0.05}px #1E90FF`
                }}
            />
            
            <div 
                style={{
                    position: 'absolute',
                    bottom: `${size * 0.1}px`,
                    right: `${size * 0.1}px`,
                    width: `${cornerSize}px`,
                    height: `${cornerSize}px`,
                    background: '#B8860B',
                    borderRadius: '2px',
                    transform: 'rotate(45deg)',
                    boxShadow: `0 0 ${size * 0.05}px #B8860B`
                }}
            />
            
            {/* Center tech symbol */}
            <div 
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: `${size * 0.2}px`,
                    height: `${size * 0.2}px`,
                    background: '#2A2A2A',
                    borderRadius: '50%',
                    transform: 'translate(-50%, -50%)',
                    border: `2px solid #D4AF37`,
                    boxShadow: `inset 0 0 ${size * 0.05}px #D4AF37`
                }}
            />
            
            {/* Glitch lines */}
            <div 
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: `${size * 0.8}px`,
                    height: '2px',
                    background: '#B8860B',
                    transform: 'translate(-50%, -50%)',
                    opacity: 0.7,
                    boxShadow: `0 0 ${size * 0.05}px #B8860B`
                }}
            />
            
            <div 
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: '2px',
                    height: `${size * 0.8}px`,
                    background: '#B8860B',
                    transform: 'translate(-50%, -50%)',
                    opacity: 0.7,
                    boxShadow: `0 0 ${size * 0.05}px #B8860B`
                }}
            />
        </div>
    );
};

export default YinYangLogo;
