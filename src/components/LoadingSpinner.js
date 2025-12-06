import React from 'react';
import './LoadingSpinner.css';

const LoadingSpinner = () => {
    return (
        <div className="loading-screen">
            {/* Animated background with binary code */}
            <div className="loading-background">
                {Array.from({ length: 200 }, (_, i) => (
                    <div 
                        key={i} 
                        className="binary-digit"
                        style={{
                            left: `${Math.random() * 100}%`,
                            animationDelay: `${Math.random() * 3}s`,
                            animationDuration: `${2 + Math.random() * 3}s`
                        }}
                    >
                        {Math.random() > 0.5 ? '1' : '0'}
                    </div>
                ))}
            </div>
            
            {/* Main content */}
            <div className="loading-content">
                <div className="loading-title">THE GLITCH</div>
                <div className="loading-subtitle">WEALTH REVOLUTION</div>
                
                {/* Loading progress */}
                <div className="loading-progress">
                    <div className="loading-text">SYSTEM INITIALIZING... <span className="loading-percentage">63%</span></div>
                    <div className="loading-bar">
                        <div className="loading-bar-fill"></div>
                    </div>
                </div>
            </div>
            
            {/* Pulsing rings */}
            <div className="loading-rings">
                <div className="ring ring-1"></div>
                <div className="ring ring-2"></div>
                <div className="ring ring-3"></div>
            </div>
        </div>
    );
};

export default LoadingSpinner;
