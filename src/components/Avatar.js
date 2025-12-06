import React, { useState, useEffect, useRef } from 'react';
import './Avatar.css';

const Avatar = ({ type, selected = false, onClick }) => {
    const avatarRef = useRef(null);
    const [eyeDirection, setEyeDirection] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (avatarRef.current && type === 'ai') {
                const rect = avatarRef.current.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                
                const deltaX = (e.clientX - centerX) / (rect.width / 2);
                const deltaY = (e.clientY - centerY) / (rect.height / 2);
                
                setEyeDirection({
                    x: Math.max(-1, Math.min(1, deltaX * 0.5)),
                    y: Math.max(-1, Math.min(1, deltaY * 0.5))
                });
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, [type]);
    const renderAvatar = () => {
        switch (type) {
            case 'ai':
                return (
                    <div className="avatar-container ai-avatar">
                        <div className="avatar-head">
                            <div className="ai-eyes">
                                <div 
                                    className="eye left-eye"
                                    style={{
                                        '--eye-x': `${eyeDirection.x * 3}px`,
                                        '--eye-y': `${eyeDirection.y * 3}px`
                                    }}
                                >
                                    <div 
                                        className="eye-pupil"
                                        style={{
                                            transform: `translate(${eyeDirection.x * 3}px, ${eyeDirection.y * 3}px)`
                                        }}
                                    ></div>
                                </div>
                                <div 
                                    className="eye right-eye"
                                    style={{
                                        '--eye-x': `${eyeDirection.x * 3}px`,
                                        '--eye-y': `${eyeDirection.y * 3}px`
                                    }}
                                >
                                    <div 
                                        className="eye-pupil"
                                        style={{
                                            transform: `translate(${eyeDirection.x * 3}px, ${eyeDirection.y * 3}px)`
                                        }}
                                    ></div>
                                </div>
                            </div>
                            <div className="ai-circuits">
                                <div className="circuit circuit-1"></div>
                                <div className="circuit circuit-2"></div>
                                <div className="circuit circuit-3"></div>
                            </div>
                        </div>
                        <div className="avatar-body">
                            <div className="ai-core"></div>
                        </div>
                    </div>
                );
            
            case 'money':
                return (
                    <div className="avatar-container money-avatar">
                        <div className="avatar-head">
                            <div className="money-eyes">
                                <div className="eye left-eye"></div>
                                <div className="eye right-eye"></div>
                            </div>
                            <div className="money-symbol">$</div>
                        </div>
                        <div className="avatar-body">
                            <div className="coins">
                                <div className="coin coin-1"></div>
                                <div className="coin coin-2"></div>
                                <div className="coin coin-3"></div>
                            </div>
                        </div>
                    </div>
                );
            
            case 'tech':
                return (
                    <div className="avatar-container tech-avatar">
                        <div className="avatar-head">
                            <div className="tech-eyes">
                                <div className="eye left-eye"></div>
                                <div className="eye right-eye"></div>
                            </div>
                            <div className="tech-glasses">
                                <div className="glass left-glass"></div>
                                <div className="glass right-glass"></div>
                            </div>
                        </div>
                        <div className="avatar-body">
                            <div className="tech-pattern">
                                <div className="pattern-line line-1"></div>
                                <div className="pattern-line line-2"></div>
                                <div className="pattern-line line-3"></div>
                            </div>
                        </div>
                    </div>
                );
            
            case 'trading':
                return (
                    <div className="avatar-container trading-avatar">
                        <div className="avatar-head">
                            <div className="trading-eyes">
                                <div className="eye left-eye"></div>
                                <div className="eye right-eye"></div>
                            </div>
                            <div className="trading-chart">
                                <div className="chart-line"></div>
                                <div className="chart-points">
                                    <div className="point point-1"></div>
                                    <div className="point point-2"></div>
                                    <div className="point point-3"></div>
                                    <div className="point point-4"></div>
                                </div>
                            </div>
                        </div>
                        <div className="avatar-body">
                            <div className="trading-symbols">
                                <div className="trend-up">↗</div>
                                <div className="trend-down">↘</div>
                            </div>
                        </div>
                    </div>
                );
            
            default:
                return null;
        }
    };

    return (
        <div 
            ref={avatarRef}
            className={`avatar-option ${selected ? 'selected' : ''}`}
            onClick={onClick}
        >
            {renderAvatar()}
        </div>
    );
};

export default Avatar;