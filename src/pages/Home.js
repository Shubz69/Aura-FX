import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Home.css";
import { useAuth } from "../context/AuthContext";
import CosmicBackground from "../components/CosmicBackground";
import A7Logo from "../components/A7Logo";
import MarketTicker from "../components/MarketTicker";
import {
    FaUsers, FaTrophy, FaGraduationCap, FaRocket,
    FaShieldAlt, FaClock, FaCoins, FaChartBar,
    FaChartLine, FaGlobe,
} from 'react-icons/fa';

/* ══════════════════════════════════════════════════════════
   ANIMATED COUNTER
══════════════════════════════════════════════════════════ */
const useCountUp = (target, duration = 2000, start = false) => {
    const [count, setCount] = useState(0);
    useEffect(() => {
        if (!start) return;
        let startTime = null;
        const isFloat  = String(target).includes('.');
        const numeric  = parseFloat(String(target).replace(/[^0-9.]/g, ''));
        const suffix   = String(target).replace(/[0-9.]/g, '');
        const animate  = (ts) => {
            if (!startTime) startTime = ts;
            const progress = Math.min((ts - startTime) / duration, 1);
            const eased    = 1 - Math.pow(1 - progress, 3);
            setCount(isFloat
                ? (eased * numeric).toFixed(1) + suffix
                : Math.floor(eased * numeric) + suffix);
            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }, [start, target, duration]);
    return count;
};

const StatItem = ({ number, label, fill = '75%' }) => {
    const ref      = useRef(null);
    const [visible, setVisible] = useState(false);
    const animated = useCountUp(number, 1900, visible);
    useEffect(() => {
        const obs = new IntersectionObserver(
            ([e]) => { if (e.isIntersecting) setVisible(true); },
            { threshold: 0.25 }
        );
        if (ref.current) obs.observe(ref.current);
        return () => obs.disconnect();
    }, []);
    return (
        <div
            className={`stat-item${visible ? ' stat-visible' : ''}`}
            ref={ref}
            style={{ '--fill': fill }}
        >
            <div className="stat-number">{visible ? animated : '0'}</div>
            <div className="stat-label">{label}</div>
            <span className="stat-trend">
                <span className="stat-trend-fill" />
            </span>
        </div>
    );
};

/* ══════════════════════════════════════════════════════════
   SLIDE DATA
   Replace backgroundImage URLs with your real image URLs.
   Each slide has: backgroundImage, tag, title, subtitle,
   statBadge (optional), chartColor (for the mini sparkline)
══════════════════════════════════════════════════════════ */
const SLIDES = [
    {
        tag:             '📈 Live Markets',
        title:           'Real-Time Market Intelligence',
        subtitle:        'Institutional-grade data, streamed directly to your dashboard',
        statBadge:       '+2.4% Today',
        chartColor:      '#0FD98A',
        backgroundImage: null, // replace with: 'url("/images/slide1.jpg")'
        bgGradient:      'linear-gradient(135deg, #071530 0%, #0D2248 45%, #112B5C 100%)',
    },
    {
        tag:             '🎯 AI Signals',
        title:           'AI-Powered Trading Signals',
        subtitle:        'High-probability setups identified before the crowd',
        statBadge:       '78% Win Rate',
        chartColor:      '#EAA960',
        backgroundImage: null,
        bgGradient:      'linear-gradient(135deg, #1A0800 0%, #301200 45%, #4A1E00 100%)',
    },
    {
        tag:             '📊 Analytics',
        title:           'Professional Analytics Suite',
        subtitle:        'Institutional tools built for serious traders',
        statBadge:       '50+ Indicators',
        chartColor:      '#f8c37d',
        backgroundImage: null,
        bgGradient:      'linear-gradient(135deg, #030B1A 0%, #071624 45%, #0B2238 100%)',
    },
    {
        tag:             '🏆 Community',
        title:           'Elite Trading Community',
        subtitle:        'Join 1,200+ traders sharing insights and strategies',
        statBadge:       '1,200+ Members',
        chartColor:      '#B794F4',
        backgroundImage: null,
        bgGradient:      'linear-gradient(135deg, #0E0518 0%, #1A0A2E 45%, #240F42 100%)',
    },
];

/* Mini sparkline SVG */
const MiniSparkline = ({ color = '#0FD98A' }) => {
    const pts = [0.30, 0.42, 0.38, 0.55, 0.50, 0.66, 0.60, 0.74, 0.70, 0.84, 0.80, 0.92, 0.88, 0.96];
    const W = 90; const H = 34;
    const coords = pts.map((p, i) => `${(i/(pts.length-1))*W},${H - p*(H-6) - 3}`).join(' ');
    return (
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{display:'block'}}>
            <defs>
                <linearGradient id={`sg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity=".30"/>
                    <stop offset="100%" stopColor={color} stopOpacity="0"/>
                </linearGradient>
            </defs>
            <polyline
                points={coords}
                fill="none" stroke={color}
                strokeWidth="1.5" strokeLinejoin="round"
                opacity=".90"
            />
        </svg>
    );
};

/* ══════════════════════════════════════════════════════════
   3D FLOATING iPAD WITH SLIDESHOW
══════════════════════════════════════════════════════════ */
const FloatingIPad = () => {
    const sceneRef   = useRef(null);
    const wrapRef    = useRef(null);
    const bodyRef    = useRef(null);
    const cursorRef  = useRef(null);

    const [activeSlide, setActiveSlide]   = useState(0);
    const slideTimerRef = useRef(null);

    /* ── Auto-advance slides ── */
    const advanceTo = (idx) => {
        setActiveSlide(idx);
        clearInterval(slideTimerRef.current);
        slideTimerRef.current = setInterval(() => {
            setActiveSlide(prev => (prev + 1) % SLIDES.length);
        }, 4000);
    };

    useEffect(() => {
        slideTimerRef.current = setInterval(() => {
            setActiveSlide(prev => (prev + 1) % SLIDES.length);
        }, 4000);
        return () => clearInterval(slideTimerRef.current);
    }, []);

    /* ── 3D tilt + float logic (identical architecture to original terminal) ── */
    useEffect(() => {
        const scene  = sceneRef.current;
        const wrap   = wrapRef.current;
        const body   = bodyRef.current;
        const cursor = cursorRef.current;
        if (!scene || !wrap || !body || !cursor) return;

        const BASE_X     =  7;
        const BASE_Y     = -13;
        const MAX_TILT   =  20;
        const LERP       =  0.08;
        const FLOAT_AMP  =  4.0;
        const FLOAT_SPD  =  0.00065;

        let targetX  = BASE_X;
        let targetY  = BASE_Y;
        let currentX = BASE_X;
        let currentY = BASE_Y;
        let phase    = 0;
        let lastTime = performance.now();
        let rafId    = null;
        let inside   = false;

        const lerp = (a, b, t) => a + (b - a) * t;

        const onEnter = () => { inside = true;  cursor.style.opacity = '1'; };
        const onLeave = () => {
            inside = false;
            targetX = BASE_X;
            targetY = BASE_Y;
            cursor.style.opacity = '0';
            body.style.boxShadow = '';
        };

        const onMove = (e) => {
            const r  = scene.getBoundingClientRect();
            const cx = r.left + r.width  / 2;
            const cy = r.top  + r.height / 2;
            const nx = (e.clientX - cx) / (r.width  / 2);
            const ny = (e.clientY - cy) / (r.height / 2);

            targetX = BASE_X - ny * MAX_TILT;
            targetY = BASE_Y + nx * MAX_TILT;

            cursor.style.left = (e.clientX - r.left) + 'px';
            cursor.style.top  = (e.clientY - r.top)  + 'px';

            const sx = nx * 16;
            const sy = ny * 9;
            body.style.boxShadow = `
                ${sx}px ${30 + sy}px 60px rgba(0,0,0,0.96),
                ${sx*0.6}px ${60+sy}px 100px rgba(0,0,0,0.70),
                ${sx*0.3}px ${95+sy}px 160px rgba(0,0,0,0.42),
                ${-10+sx*-0.4}px 22px 62px rgba(245,176,65,0.065),
                inset ${-14+nx*5}px 0 32px rgba(0,0,0,0.55),
                inset 0 ${-12+ny*4}px 28px rgba(0,0,0,0.44),
                inset 0 1px 0 rgba(255,255,255,0.20),
                inset 1px 0 0 rgba(255,255,255,0.08)
            `;
        };

        const onDown = () => {
            wrap.style.transition = 'transform 0.1s ease';
            wrap.dataset.punch = 'true';
            cursor.style.width  = '12px';
            cursor.style.height = '12px';
        };
        const onUp = () => {
            wrap.style.transition = '';
            wrap.dataset.punch = '';
            cursor.style.width  = '8px';
            cursor.style.height = '8px';
        };

        const tick = (ts) => {
            const dt = ts - lastTime;
            lastTime = ts;
            phase += FLOAT_SPD * Math.min(dt, 50);
            const floatY = Math.sin(phase) * FLOAT_AMP;

            currentX = lerp(currentX, targetX, LERP);
            currentY = lerp(currentY, targetY, LERP);

            const punch = wrap.dataset.punch === 'true' ? ' scale(0.976)' : '';
            wrap.style.transform = `
                translateY(${floatY.toFixed(3)}px)
                rotateX(${currentX.toFixed(3)}deg)
                rotateY(${currentY.toFixed(3)}deg)
                ${punch}
            `;
            rafId = requestAnimationFrame(tick);
        };

        scene.addEventListener('mousemove',  onMove);
        scene.addEventListener('mouseenter', onEnter);
        scene.addEventListener('mouseleave', onLeave);
        scene.addEventListener('mousedown',  onDown);
        scene.addEventListener('mouseup',    onUp);

        rafId = requestAnimationFrame((ts) => {
            lastTime = ts;
            rafId = requestAnimationFrame(tick);
        });

        return () => {
            cancelAnimationFrame(rafId);
            scene.removeEventListener('mousemove',  onMove);
            scene.removeEventListener('mouseenter', onEnter);
            scene.removeEventListener('mouseleave', onLeave);
            scene.removeEventListener('mousedown',  onDown);
            scene.removeEventListener('mouseup',    onUp);
        };
    }, []);

    return (
        <div
            className="ipad-scene"
            ref={sceneRef}
            style={{ cursor: 'none' }}
        >
            {/* Gold cursor dot */}
            <div
                ref={cursorRef}
                className="ipad-cursor"
                style={{
                    width:  '8px',
                    height: '8px',
                    transition: 'opacity .22s ease, width .15s ease, height .15s ease',
                }}
            />

            {/* 3D rotating wrapper */}
            <div
                className="ipad-wrap"
                ref={wrapRef}
                style={{
                    position:       'relative',
                    width:          '100%',
                    transformStyle: 'preserve-3d',
                    transform:      'translateY(0px) rotateX(7deg) rotateY(-13deg)',
                    willChange:     'transform',
                }}
            >
                {/* iPad body */}
                <div className="ipad-body" ref={bodyRef}>

                    {/* Top bar: camera + speaker */}
                    <div className="ipad-topbar">
                        <div className="ipad-camera" />
                        <div className="ipad-speaker" />
                        <div style={{
                            marginLeft: 'auto',
                            fontSize: '.52rem', fontWeight: 600,
                            color: 'rgba(255,255,255,.28)',
                            letterSpacing: '.12em',
                        }}>AURA</div>
                    </div>

                    {/* SCREEN */}
                    <div className="ipad-screen">
                        {SLIDES.map((slide, i) => (
                            <div
                                key={i}
                                className={`ipad-slide${i === activeSlide ? ' active' : ''}`}
                                style={{
                                    background: slide.backgroundImage
                                        ? slide.backgroundImage
                                        : slide.bgGradient,
                                }}
                            >
                                {/* Stat badge top-left */}
                                {slide.statBadge && (
                                    <div className="slide-stat-badge">
                                        {slide.statBadge}
                                    </div>
                                )}

                                {/* Mini chart top-right */}
                                <div className="slide-chart-wrap">
                                    <MiniSparkline color={slide.chartColor} />
                                </div>

                                {/* Decorative grid lines */}
                                <svg
                                    style={{
                                        position: 'absolute', inset: 0,
                                        width: '100%', height: '100%',
                                        opacity: .06, pointerEvents: 'none',
                                    }}
                                    viewBox="0 0 400 300"
                                    preserveAspectRatio="xMidYMid slice"
                                >
                                    {[0.2,0.4,0.6,0.8].map((f,j) => (
                                        <line key={j}
                                            x1="0" y1={300*f} x2="400" y2={300*f}
                                            stroke="rgba(255,255,255,.8)"
                                            strokeWidth=".5"
                                            strokeDasharray="3,9"
                                        />
                                    ))}
                                    {[0.2,0.4,0.6,0.8].map((f,j) => (
                                        <line key={`v${j}`}
                                            x1={400*f} y1="0" x2={400*f} y2="300"
                                            stroke="rgba(255,255,255,.8)"
                                            strokeWidth=".5"
                                            strokeDasharray="3,9"
                                        />
                                    ))}
                                </svg>

                                {/* Overlay with text */}
                                <div className="slide-overlay">
                                    <div className="slide-tag">{slide.tag}</div>
                                    <div className="slide-title">{slide.title}</div>
                                    <div className="slide-subtitle">{slide.subtitle}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Slide indicator dots */}
                    <div className="ipad-dots">
                        {SLIDES.map((_, i) => (
                            <div
                                key={i}
                                className={`ipad-dot${i === activeSlide ? ' active' : ''}`}
                                onClick={() => advanceTo(i)}
                            />
                        ))}
                    </div>

                    {/* Home button */}
                    <div className="ipad-home-btn">
                        <div className="ipad-home-circle" />
                    </div>
                </div>
            </div>

            {/* Reflection stripe */}
            <div className="ipad-reflection" />
        </div>
    );
};

/* ══════════════════════════════════════════════════════════
   HOME PAGE
══════════════════════════════════════════════════════════ */
const Home = () => {
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();
    const [showContent, setShowContent] = useState(false);
    const [isLoading,   setIsLoading]   = useState(true);

    useEffect(() => {
        const t = setTimeout(() => { setIsLoading(false); setShowContent(true); }, 3000);
        return () => clearTimeout(t);
    }, []);

    const handleStart = () => navigate(isAuthenticated ? '/community' : '/register');

    return (
        <>
            {/* Loading Screen */}
            {isLoading && (
                <div className="loading-screen">
                    <CosmicBackground />
                    <div className="loading-content">
                        <span className="loading-brand-text">Aura Terminal</span>
                        <div className="loading-subtitle">Initializing System...</div>
                        <div className="loading-dots-container">
                            <span className="loading-dot"/>
                            <span className="loading-dot"/>
                            <span className="loading-dot"/>
                        </div>
                    </div>
                </div>
            )}

            <div className="home-container">
                <CosmicBackground />

                {showContent && (
                    <div className="home-content">

                        {/* ═══ HERO ════════════════════════════════════════ */}
                        <div className="home-logo-section">

                            {/* Left: text + CTAs */}
                            <div className="hero-left">
                                <div className="a7-logo-wrap" style={{ marginBottom: '1.4rem' }}>
                                    <A7Logo />
                                </div>

                                {/* Eyebrow pill */}
                                <div className="hero-eyebrow">
                                    <span className="hero-eyebrow-dot" />
                                    <span className="hero-eyebrow-text">AI-Powered Trading Platform</span>
                                </div>

                                <div className="brand-name-container">
                                    <h1 className="brand-name">
                                        <span className="brand-name-line">Trade Smarter</span>
                                        <span className="brand-name-line">With Aura Terminal</span>
                                    </h1>
                                    <p className="powered-by-glitch">
                                        powered by <strong>The Glitch</strong>
                                    </p>
                                </div>

                                <div className="content-intro hero-intro">
                                    <p className="intro-text">
                                        AI-Powered Trading Tools for Precision,
                                        Discipline and Consistent Performance
                                    </p>
                                </div>

                                <div className="home-cta-section hero-cta">
                                    <button
                                        className="home-cta-button"
                                        onClick={handleStart}
                                    >
                                        Get Started
                                    </button>
                                    <button
                                        className="home-secondary-button"
                                        onClick={() => navigate('/explore')}
                                    >
                                        Explore Features
                                    </button>
                                </div>

                                <div className="hero-trust-badges">
                                    {[
                                        { icon: '✓',  label: 'Real Time Data'   },
                                        { icon: '🔒', label: 'Secure & Private' },
                                        { icon: '⊙',  label: '24/7 Support'     },
                                    ].map(b => (
                                        <div className="trust-badge" key={b.label}>
                                            <div className="trust-badge-icon">{b.icon}</div>
                                            {b.label}
                                        </div>
                                    ))}
                                </div>

                                <div className="partner-logos-row">
                                    {[
                                        { icon: '📊', name: 'TradingView' },
                                        { icon: '◈',  name: 'Binance'     },
                                        { icon: '©',  name: 'Coinbase'    },
                                        { icon: '◉',  name: 'Bloomberg'   },
                                        { icon: '◎',  name: 'Reuters'     },
                                    ].map(p => (
                                        <div className="partner-logo" key={p.name}>
                                            <span className="partner-logo-icon">{p.icon}</span>
                                            {p.name}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Right: 3D floating iPad */}
                            <div className="hero-right">
                                <FloatingIPad />
                            </div>
                        </div>

                        {/* ═══ MAIN CONTENT ════════════════════════════════ */}
                        <div className="home-main-content">

                            {/* Market Ticker */}
                            <div className="market-ticker-wrapper">
                                <MarketTicker
                                    compact={true}
                                    showTabs={false}
                                    showViewAll={true}
                                    autoScroll={true}
                                />
                            </div>

                            <div className="cosmic-divider" />

                            {/* Feature Cards */}
                            <div className="feature-cards-grid">
                                {[
                                    {
                                        icon:  '📈',
                                        title: 'Forex Trading',
                                        desc:  'Dominate currency markets with institutional-grade strategies and live market analysis',
                                    },
                                    {
                                        icon:  '💹',
                                        title: 'Stock Trading',
                                        desc:  'Master equity markets with advanced analysis techniques and professional trading strategies',
                                    },
                                    {
                                        icon:  '₿',
                                        title: 'Crypto Trading',
                                        desc:  'Capitalize on digital asset opportunities with cutting-edge strategies and market insights',
                                    },
                                    {
                                        icon:  '🎯',
                                        title: '1-to-1 Mentorship',
                                        desc:  'Accelerate your success with personalized coaching from industry-leading trading experts',
                                    },
                                ].map(c => (
                                    <div className="feature-card" key={c.title}>
                                        <div className="feature-icon">{c.icon}</div>
                                        <h3 className="feature-title">{c.title}</h3>
                                        <p className="feature-description">{c.desc}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Stats */}
                            <div className="stats-section">
                                <div className="stats-grid">
                                    <StatItem number="24.7%" label="Average ROI"      fill="82%"/>
                                    <StatItem number="1,200+" label="Active Traders"  fill="90%"/>
                                    <StatItem number="85%"    label="Success Rate"    fill="85%"/>
                                    <StatItem number="50+"    label="Expert Courses"  fill="60%"/>
                                </div>
                            </div>

                            <div className="cosmic-divider" />

                            {/* Why Choose */}
                            <div className="why-choose-section">
                                <h2 className="section-title">Why Choose AURA TERMINAL</h2>
                                <div className="why-grid">
                                    {[
                                        {
                                            title: 'Elite Education',
                                            text:  'Learn from world-class professionals with decades of combined trading expertise',
                                        },
                                        {
                                            title: 'Proven Strategies',
                                            text:  'Access battle-tested trading methodologies that generate consistent profits',
                                        },
                                        {
                                            title: '24/7 Support',
                                            text:  'Receive instant assistance from our thriving community and dedicated expert mentors',
                                        },
                                        {
                                            title: 'Comprehensive Resources',
                                            text:  'Unlock unlimited access to our extensive library of premium courses, advanced tools, and exclusive trading materials',
                                        },
                                    ].map(w => (
                                        <div className="why-item" key={w.title}>
                                            <div className="why-icon">✓</div>
                                            <h3 className="why-title">{w.title}</h3>
                                            <p className="why-text">{w.text}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Trade Markets */}
                            <div className="trade-markets-section">
                                <h2 className="trade-markets-section__title">Trade Multiple Markets</h2>
                                <div className="trade-markets-section__grid">
                                    {[
                                        { icon: <FaChartLine/>, title: 'Forex',       desc: 'Major, minor, and exotic currency pairs'          },
                                        { icon: <FaGlobe/>,     title: 'Futures',     desc: 'Master futures contracts and commodity trading'   },
                                        { icon: <FaRocket/>,    title: 'Crypto',      desc: 'Bitcoin, Ethereum, and altcoins'                  },
                                        { icon: <FaTrophy/>,    title: 'Stocks',      desc: 'US and international equity markets'              },
                                        { icon: <FaChartBar/>,  title: 'Indices',     desc: 'S&P 500, NASDAQ, and more'                        },
                                        { icon: <FaCoins/>,     title: 'Commodities', desc: 'Trade gold, oil, and valuable resources'          },
                                    ].map(m => (
                                        <div className="trade-markets-section__card" key={m.title}>
                                            <div className="trade-markets-section__icon">{m.icon}</div>
                                            <div className="trade-markets-section__card-body">
                                                <h3 className="trade-markets-section__card-title">{m.title}</h3>
                                                <p className="trade-markets-section__card-desc">{m.desc}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Key Features */}
                            <div className="key-features-section">
                                <h2 className="section-title">What Sets Us Apart</h2>
                                <div className="features-list">
                                    {[
                                        {
                                            icon:  <FaShieldAlt/>,
                                            title: 'Bank-Level Security',
                                            text:  'Your data and privacy are safeguarded with military-grade encryption and enterprise security protocols',
                                        },
                                        {
                                            icon:  <FaClock/>,
                                            title: '24/7 Premium Support',
                                            text:  'Access round-the-clock assistance from our expert support team, available whenever you need guidance',
                                        },
                                        {
                                            icon:  <FaUsers/>,
                                            title: 'Thriving Community',
                                            text:  'Join over 1,200+ active traders sharing exclusive insights, strategies, and real-time market analysis',
                                        },
                                        {
                                            icon:  <FaGraduationCap/>,
                                            title: 'Elite Mentors',
                                            text:  'Learn directly from industry legends with verified track records of consistent profitability and market success',
                                        },
                                    ].map(f => (
                                        <div className="feature-item" key={f.title}>
                                            <div className="feature-icon">{f.icon}</div>
                                            <div className="feature-content">
                                                <h3 className="feature-item-title">{f.title}</h3>
                                                <p className="feature-item-text">{f.text}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

export default Home;