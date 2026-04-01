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
    FaChartLine, FaGlobe, FaArrowRight, FaBolt,
    FaCompass, FaCalculator, FaBrain, FaPlayCircle,
    FaFlask, FaTimes, FaInfoCircle,
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
        <div className={`stat-item${visible ? ' stat-visible' : ''}`} ref={ref} style={{ '--fill': fill }}>
            <div className="stat-number">{visible ? animated : '0'}</div>
            <div className="stat-label">{label}</div>
            <span className="stat-trend"><span className="stat-trend-fill" /></span>
        </div>
    );
};

/* ══════════════════════════════════════════════════════════
   iPad slideshow
══════════════════════════════════════════════════════════ */
const IPAD_SLIDE_BASE = `${process.env.PUBLIC_URL || ''}/images/ipad-slides`;

const SLIDES = [
    { image: `${IPAD_SLIDE_BASE}/journal.png`,      tag: '📓 Trading Journal',    title: 'Your Daily Trading Discipline',  subtitle: 'Streaks, checklists, and session notes—built to keep execution consistent.',                           statBadge: 'Streaks & tasks', chartColor: '#F8C37D' },
    { image: `${IPAD_SLIDE_BASE}/traderdesk.png`,  tag: '📊 Market Intelligence', title: 'Briefs, Bias & Macro Context',   subtitle: 'Session-ready views of structure, drivers, and what matters before London & New York.',              statBadge: 'Live context',    chartColor: '#EAA960' },
    { image: `${IPAD_SLIDE_BASE}/auraAI.png`,      tag: '🤖 Aura AI',             title: 'Premium Trading Copilot',        subtitle: 'Ask for analysis, risk framing, and ideas—grounded in live data when available.',                    statBadge: 'Aura AI',         chartColor: '#FDE8C4' },
    { image: `${IPAD_SLIDE_BASE}/community.png`,    tag: '🏆 Community',           title: 'Elite Trading Community',        subtitle: 'Structured channels, real moderators, and traders who take the craft seriously.',                    statBadge: '1,200+ Members',  chartColor: '#D48D44' },
    { image: `${IPAD_SLIDE_BASE}/courses.png`,    tag: '🎓 Education',           title: 'Courses & Mentorship',           subtitle: 'Progressive curriculum plus optional 1-to-1 mentorship for committed traders.',                     statBadge: 'C & S',           chartColor: '#EABB80' },
];

const MiniSparkline = ({ color = '#EAA960' }) => {
    const pts = [0.30,0.42,0.38,0.55,0.50,0.66,0.60,0.74,0.70,0.84,0.80,0.92,0.88,0.96];
    const W = 90, H = 34;
    const coords = pts.map((p,i) => `${(i/(pts.length-1))*W},${H-p*(H-6)-3}`).join(' ');
    return (
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{display:'block'}}>
            <defs>
                <linearGradient id={`sg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity=".30"/>
                    <stop offset="100%" stopColor={color} stopOpacity="0"/>
                </linearGradient>
            </defs>
            <polyline points={coords} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" opacity=".90"/>
        </svg>
    );
};

/* ══════════════════════════════════════════════════════════
   3D FLOATING iPAD
══════════════════════════════════════════════════════════ */
const FloatingIPad = () => {
    const sceneRef  = useRef(null);
    const wrapRef   = useRef(null);
    const bodyRef   = useRef(null);
    const cursorRef = useRef(null);
    const [activeSlide, setActiveSlide] = useState(0);
    const slideTimerRef = useRef(null);

    const advanceTo = (idx) => {
        setActiveSlide(idx);
        clearInterval(slideTimerRef.current);
        slideTimerRef.current = setInterval(() => setActiveSlide(p => (p+1) % SLIDES.length), 4000);
    };

    useEffect(() => {
        slideTimerRef.current = setInterval(() => setActiveSlide(p => (p+1) % SLIDES.length), 4000);
        return () => clearInterval(slideTimerRef.current);
    }, []);

    useEffect(() => {
        const scene  = sceneRef.current;
        const wrap   = wrapRef.current;
        const body   = bodyRef.current;
        const cursor = cursorRef.current;
        if (!scene || !wrap) return;

        /* ── Config ── */
        const BASE_X         =  7,  BASE_Y         = -13;
        const MOBILE_BASE_X  =  5,  MOBILE_BASE_Y  = -8;
        const MAX_TILT       =  20, MAX_TOUCH_TILT =  22;
        const LERP = 0.08, FLOAT_AMP = 4.0, FLOAT_SPD = 0.00065;

        /* ── Touch detection ──────────────────────────────────────────────────
           Media queries can lie on some Android WebViews / iOS Chrome.
           Instead: set a flag when the FIRST touchstart fires on the window,
           and clear it when a real mousemove fires (desktop pointer).
           This is the most reliable cross-browser approach.
        ──────────────────────────────────────────────────────────────────── */
        let _touchMode = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        const setTouchMode  = () => { _touchMode = true;  };
        const setMouseMode  = () => { _touchMode = false; };
        window.addEventListener('touchstart', setTouchMode, { passive: true });
        window.addEventListener('mousemove',  setMouseMode, { passive: true });
        const inTouchMode = () => _touchMode;

        /* ── Desktop state ── */
        let targetX = BASE_X, targetY = BASE_Y;
        let currentX = BASE_X, currentY = BASE_Y;
        let phase = 0, lastTime = performance.now();
        let rafId = null;
        const lerp = (a, b, t) => a + (b-a)*t;

        /* ── Touch state ── */
        let touchStartX = 0, touchStartY = 0;
        let touchRafId  = null;
        let isTouching  = false;

        /* ── Mouse handlers ── */
        const onEnter = () => { if (!inTouchMode() && cursor) cursor.style.opacity = '1'; };
        const onLeave = () => {
            if (inTouchMode()) return;
            targetX = BASE_X; targetY = BASE_Y;
            if (cursor) cursor.style.opacity = '0';
            if (body)   body.style.boxShadow = '';
        };
        const onMove = (e) => {
            if (inTouchMode()) return;
            const r  = scene.getBoundingClientRect();
            const nx = (e.clientX - r.left - r.width/2)  / (r.width/2);
            const ny = (e.clientY - r.top  - r.height/2) / (r.height/2);
            targetX = BASE_X - ny * MAX_TILT;
            targetY = BASE_Y + nx * MAX_TILT;
            if (cursor) { cursor.style.left = (e.clientX-r.left)+'px'; cursor.style.top = (e.clientY-r.top)+'px'; }
            if (body) {
                const sx = nx*16, sy = ny*9;
                body.style.boxShadow = `${sx}px ${30+sy}px 60px rgba(0,0,0,.96),${sx*.6}px ${60+sy}px 100px rgba(0,0,0,.70),inset ${-14+nx*5}px 0 32px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.20)`;
            }
        };
        const onDown = () => { if (inTouchMode()) return; wrap.dataset.punch='true'; if(cursor){cursor.style.width='12px';cursor.style.height='12px';} };
        const onUp   = () => { if (inTouchMode()) return; wrap.dataset.punch='';    if(cursor){cursor.style.width='8px'; cursor.style.height='8px';} };

        /* Desktop float loop */
        const tick = (ts) => {
            if (!isTouching) {
                const dt = ts - lastTime;
                lastTime = ts;
                phase += FLOAT_SPD * Math.min(dt, 50);
                currentX = lerp(currentX, targetX, LERP);
                currentY = lerp(currentY, targetY, LERP);
                const punch = wrap.dataset.punch === 'true' ? ' scale(0.976)' : '';
                wrap.style.transform = `translateY(${(Math.sin(phase)*FLOAT_AMP).toFixed(2)}px) rotateX(${currentX.toFixed(2)}deg) rotateY(${currentY.toFixed(2)}deg)${punch}`;
            }
            rafId = requestAnimationFrame(tick);
        };

        /* ── Touch handlers ── */
        const spawnRipple = (cx, cy) => {
            const r = scene.getBoundingClientRect();
            const el = document.createElement('div');
            el.className = 'ipad-touch-ripple';
            el.style.left = (cx - r.left) + 'px';
            el.style.top  = (cy - r.top)  + 'px';
            scene.appendChild(el);
            el.addEventListener('animationend', () => el.remove());
        };

        const onTouchStart = (e) => {
            if (e.touches.length !== 1) return;
            e.preventDefault();         // ← blocks page scroll on the iPad card
            isTouching  = true;
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            wrap.classList.add('is-dragging');
            wrap.classList.remove('is-resting');
            spawnRipple(e.touches[0].clientX, e.touches[0].clientY);
        };

        const onTouchMove = (e) => {
            if (!isTouching || e.touches.length !== 1) return;
            e.preventDefault();
            const dx = e.touches[0].clientX - touchStartX;
            const dy = e.touches[0].clientY - touchStartY;
            const rx = MOBILE_BASE_X + Math.max(-MAX_TOUCH_TILT, Math.min(MAX_TOUCH_TILT, -dy * 0.30));
            const ry = MOBILE_BASE_Y + Math.max(-MAX_TOUCH_TILT, Math.min(MAX_TOUCH_TILT,  dx * 0.30));
            if (touchRafId) cancelAnimationFrame(touchRafId);
            touchRafId = requestAnimationFrame(() => {
                wrap.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
            });
        };

        const onTouchEnd = () => {
            if (!isTouching) return;
            isTouching = false;
            if (touchRafId) { cancelAnimationFrame(touchRafId); touchRafId = null; }
            wrap.classList.remove('is-dragging');
            wrap.classList.add('is-resting');
            wrap.style.transform = `rotateX(${MOBILE_BASE_X}deg) rotateY(${MOBILE_BASE_Y}deg)`;
            setTimeout(() => wrap.classList.remove('is-resting'), 700);
        };

        /* ── Register ── */
        scene.addEventListener('mousemove',   onMove);
        scene.addEventListener('mouseenter',  onEnter);
        scene.addEventListener('mouseleave',  onLeave);
        scene.addEventListener('mousedown',   onDown);
        scene.addEventListener('mouseup',     onUp);
        scene.addEventListener('touchstart',  onTouchStart,  { passive: false });
        scene.addEventListener('touchmove',   onTouchMove,   { passive: false });
        scene.addEventListener('touchend',    onTouchEnd,    { passive: true  });
        scene.addEventListener('touchcancel', onTouchEnd,    { passive: true  });

        rafId = requestAnimationFrame((ts) => { lastTime = ts; rafId = requestAnimationFrame(tick); });

        /* ── Cleanup ── */
        return () => {
            cancelAnimationFrame(rafId);
            if (touchRafId) cancelAnimationFrame(touchRafId);
            window.removeEventListener('touchstart', setTouchMode);
            window.removeEventListener('mousemove',  setMouseMode);
            scene.removeEventListener('mousemove',   onMove);
            scene.removeEventListener('mouseenter',  onEnter);
            scene.removeEventListener('mouseleave',  onLeave);
            scene.removeEventListener('mousedown',   onDown);
            scene.removeEventListener('mouseup',     onUp);
            scene.removeEventListener('touchstart',  onTouchStart);
            scene.removeEventListener('touchmove',   onTouchMove);
            scene.removeEventListener('touchend',    onTouchEnd);
            scene.removeEventListener('touchcancel', onTouchEnd);
        };
    }, []);
/* ══════════════════════════════════════════════
   iPAD TOUCH 3D ROTATION — COMPANION JS SNIPPET
   ──────────────────────────────────────────────
   Add this script to your page (or component).
   It handles both desktop mouse-tilt AND mobile
   touch-drag 3D rotation of .ipad-wrap.
══════════════════════════════════════════════*/



(function initIpadTilt() {
  const scene   = document.querySelector('.ipad-scene');
  const wrap    = document.querySelector('.ipad-wrap');
  const cursor  = document.querySelector('.ipad-cursor');
  if (!scene || !wrap) return;

  // Base resting rotation
  const REST_RX = 7;   // rotateX degrees at rest (desktop)
  const REST_RY = -13; // rotateY degrees at rest (desktop)
  const MOBILE_REST_RX = 5;
  const MOBILE_REST_RY = -8;
  const MAX_TILT = 22; // maximum tilt from drag, degrees

  const isMobile = () => window.matchMedia('(hover:none) and (pointer:coarse)').matches;

  // ── Desktop mouse tilt ──────────────────────
  scene.addEventListener('mousemove', (e) => {
    if (isMobile()) return;
    const r   = scene.getBoundingClientRect();
    const nx  = (e.clientX - r.left)  / r.width  - 0.5; // -0.5 to 0.5
    const ny  = (e.clientY - r.top)   / r.height - 0.5;
    const rx  = REST_RX  - ny * 18;
    const ry  = REST_RY  + nx * 22;
    wrap.style.transform = `translateY(0px) rotateX(${rx}deg) rotateY(${ry}deg)`;
    if (cursor) {
      cursor.style.left    = (e.clientX - r.left)  + 'px';
      cursor.style.top     = (e.clientY - r.top)   + 'px';
      cursor.style.opacity = '1';
    }
  });

  scene.addEventListener('mouseleave', () => {
    if (isMobile()) return;
    wrap.classList.remove('is-dragging');
    wrap.classList.add('is-resting');
    wrap.style.transform = `translateY(0px) rotateX(${REST_RX}deg) rotateY(${REST_RY}deg)`;
    if (cursor) cursor.style.opacity = '0';
    setTimeout(() => wrap.classList.remove('is-resting'), 700);
  });

  // ── Mobile / touch tilt ─────────────────────
  let touchStartX = 0;
  let touchStartY = 0;
  let currentRx   = MOBILE_REST_RX;
  let currentRy   = MOBILE_REST_RY;
  let rafId       = null;

  scene.addEventListener('touchstart', (e) => {
    if (!isMobile()) return;
    if (e.touches.length !== 1) return;
    e.preventDefault(); // prevent scroll while dragging the iPad
    wrap.classList.add('is-dragging');
    wrap.classList.remove('is-resting');
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    currentRx   = MOBILE_REST_RX;
    currentRy   = MOBILE_REST_RY;

    // Spawn gold ripple
    spawnRipple(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });

  scene.addEventListener('touchmove', (e) => {
    if (!isMobile()) return;
    if (e.touches.length !== 1) return;
    e.preventDefault();

    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;

    // Map drag delta to rotation (clamp to MAX_TILT)
    const drx = Math.max(-MAX_TILT, Math.min(MAX_TILT, -dy * 0.28));
    const dry = Math.max(-MAX_TILT, Math.min(MAX_TILT,  dx * 0.28));

    currentRx = MOBILE_REST_RX + drx;
    currentRy = MOBILE_REST_RY + dry;

    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      wrap.style.transform = `rotateX(${currentRx}deg) rotateY(${currentRy}deg)`;
    });
  }, { passive: false });

  scene.addEventListener('touchend', () => {
    if (!isMobile()) return;
    wrap.classList.remove('is-dragging');
    wrap.classList.add('is-resting');
    wrap.style.transform = `rotateX(${MOBILE_REST_RX}deg) rotateY(${MOBILE_REST_RY}deg)`;
    setTimeout(() => wrap.classList.remove('is-resting'), 700);
  });

  scene.addEventListener('touchcancel', () => {
    wrap.classList.remove('is-dragging');
    wrap.classList.add('is-resting');
    wrap.style.transform = `rotateX(${MOBILE_REST_RX}deg) rotateY(${MOBILE_REST_RY}deg)`;
    setTimeout(() => wrap.classList.remove('is-resting'), 700);
  });

  // ── Gold ripple helper ───────────────────────
  function spawnRipple(clientX, clientY) {
    const r    = scene.getBoundingClientRect();
    const el   = document.createElement('div');
    el.className = 'ipad-touch-ripple';
    el.style.left = (clientX - r.left)  + 'px';
    el.style.top  = (clientY - r.top)   + 'px';
    scene.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
})();



    return (
        <div className="ipad-scene" ref={sceneRef} style={{ cursor: 'none' }}>
            <div ref={cursorRef} className="ipad-cursor" style={{ width:'8px', height:'8px', transition:'opacity .22s ease, width .15s ease, height .15s ease' }} />
            <div className="ipad-drag-hint"><span className="ipad-drag-hint-icon">✦</span> Drag to rotate</div>

            <div className="ipad-wrap" ref={wrapRef} style={{ position:'relative', width:'100%', transformStyle:'preserve-3d', transform:'translateY(0px) rotateX(7deg) rotateY(-13deg)', willChange:'transform' }}>
                <div className="ipad-body" ref={bodyRef}>
                    <div className="ipad-topbar">
                        <div className="ipad-camera" />
                        <div className="ipad-speaker" />
                        <div style={{ marginLeft:'auto', fontSize:'.52rem', fontWeight:600, color:'rgba(255,255,255,.28)', letterSpacing:'.12em' }}>AURA</div>
                    </div>

                    {/* ── SCREEN ── */}
                    <div className="ipad-screen">
                        {SLIDES.map((slide, i) => (
                            <div key={i} className={`ipad-slide${i === activeSlide ? ' active' : ''}`}>

                                {/* Image — uses <img> so object-fit: contain works properly */}
                                {slide.image && (
                                    <img
                                        src={slide.image}
                                        alt={slide.title}
                                        className="ipad-slide-img"
                                        draggable={false}
                                    />
                                )}

                                {slide.statBadge && <div className="slide-stat-badge">{slide.statBadge}</div>}
                                <div className="slide-chart-wrap"><MiniSparkline color={slide.chartColor} /></div>

                                {/* Grid lines */}
                                <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', opacity:.06, pointerEvents:'none' }} viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
                                    {[0.2,0.4,0.6,0.8].map((f,j) => <line key={j}    x1="0"    y1={300*f} x2="400" y2={300*f} stroke="rgba(255,255,255,.8)" strokeWidth=".5" strokeDasharray="3,9"/>)}
                                    {[0.2,0.4,0.6,0.8].map((f,j) => <line key={`v${j}`} x1={400*f} y1="0"    x2={400*f} y2="300" stroke="rgba(255,255,255,.8)" strokeWidth=".5" strokeDasharray="3,9"/>)}
                                </svg>

                                <div className="slide-overlay">
                                    <div className="slide-tag">{slide.tag}</div>
                                    <div className="slide-title">{slide.title}</div>
                                    <div className="slide-subtitle">{slide.subtitle}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="ipad-dots">
                        {SLIDES.map((_,i) => (
                            <div key={i} className={`ipad-dot${i===activeSlide?' active':''}`} onClick={()=>advanceTo(i)} />
                        ))}
                    </div>
                    <div className="ipad-home-btn"><div className="ipad-home-circle" /></div>
                </div>
            </div>

            <div className="ipad-reflection" />
        </div>
    );
};

const TutorialCoachmark = ({
    title,
    text,
    step,
    total,
    onNext,
    onPrev,
    onClose,
    canPrev = true,
    isLast = false,
}) => (
    <div className="dashboard-home-coachmark" role="dialog" aria-live="polite">
        <div className="dashboard-home-coachmark__meta">Tutorial {step} / {total}</div>
        <h3>{title}</h3>
        <p>{text}</p>
        <div className="dashboard-home-coachmark__actions">
            <button type="button" className="dashboard-home-coachmark__ghost" onClick={onClose}>
                Skip
            </button>
            <div className="dashboard-home-coachmark__nav">
                <button type="button" className="dashboard-home-coachmark__ghost" onClick={onPrev} disabled={!canPrev}>
                    Back
                </button>
                <button type="button" className="dashboard-home-coachmark__primary" onClick={onNext}>
                    {isLast ? 'Finish' : 'Next'}
                </button>
            </div>
        </div>
    </div>
);

/* ══════════════════════════════════════════════════════════
   HOME PAGE
══════════════════════════════════════════════════════════ */
const Home = () => {
    const navigate = useNavigate();
    const { isAuthenticated, user } = useAuth();
    const [showContent, setShowContent] = useState(false);
    const [isLoading,   setIsLoading]   = useState(true);
    const [tutorialOpen, setTutorialOpen] = useState(true);
    const [tutorialStep, setTutorialStep] = useState(0);
    const [activeHint, setActiveHint] = useState('hero');

    useEffect(() => {
        const t = setTimeout(() => { setIsLoading(false); setShowContent(true); }, 3000);
        return () => clearTimeout(t);
    }, []);

    const handleStart = () => navigate(isAuthenticated ? '/community' : '/register');
    const displayName = (user?.name || user?.username || '').trim();
    const greeting = displayName ? `Welcome back, ${displayName}` : 'Welcome';
    const tutorialSteps = [
        {
            target: 'hero',
            title: 'Start from the welcome area',
            text: 'This top section is your daily starting point. Use it to understand where to begin, then jump into the tool that matches your next move.',
        },
        {
            target: 'desk',
            title: 'Trader Desk shows your market picture',
            text: 'Use Trader Desk first when you need context, structure, and session awareness before planning a trade.',
        },
        {
            target: 'lab',
            title: 'Trader Lab helps you think through the trade',
            text: 'This is the active workspace for session prep, setup validation, live thinking, and post-trade review.',
        },
        {
            target: 'analysis',
            title: 'Aura Analysis helps you review performance',
            text: 'Use it to connect data, review patterns, and turn your performance into clear next-step feedback.',
        },
        {
            target: 'community',
            title: 'Community keeps you accountable',
            text: 'When you need conversation, support, and shared standards, this is where you stay connected to the environment.',
        },
    ];

    const previewCards = [
        {
            key: 'desk',
            icon: <FaCompass />,
            title: 'Trader Desk',
            description: 'See the market picture, session tone, and what matters before you act.',
            path: '/trader-deck',
            cta: 'Open Trader Desk',
            accent: 'Command Center',
            bullets: ['Session bias', 'Market context', 'Execution clarity'],
            previewClass: 'dashboard-home-preview--desk',
            previewStats: ['Bias: Bullish', 'London: Open', 'Focus: Pullbacks'],
            hint: 'Best first click before planning anything else.',
        },
        {
            key: 'lab',
            icon: <FaFlask />,
            title: 'Trader Lab',
            description: 'Prepare the session, pressure-test the setup, and review behavior in one flow.',
            path: '/trader-lab',
            cta: 'Open Trader Lab',
            accent: 'Active Thinking',
            bullets: ['Session prep', 'Trade thinking', 'Behavior review'],
            previewClass: 'dashboard-home-preview--lab',
            previewStats: ['Confidence: 74%', 'R:R: 1:2.5', 'Status: Validating'],
            hint: 'Use this when you want a more guided decision process.',
        },
        {
            key: 'calculator',
            icon: <FaCalculator />,
            title: 'Trade Calculator',
            description: 'Size risk, reward, and position details before execution.',
            path: '/trader-deck/trade-validator/calculator',
            cta: 'Open Calculator',
            accent: 'Risk Precision',
            bullets: ['Position sizing', 'Risk %, R:R', 'Fast planning'],
            previewClass: 'dashboard-home-preview--calculator',
            previewStats: ['Risk: 0.50%', 'Lot: 1.25', 'Target: 2.0R'],
            hint: 'Use this anytime you need numbers before clicking buy or sell.',
        },
        {
            key: 'analysis',
            icon: <FaBrain />,
            title: 'Aura Analysis',
            description: 'Review performance, patterns, and growth opportunities using your data.',
            path: '/aura-analysis',
            cta: 'Open Aura Analysis',
            accent: 'Performance Intelligence',
            bullets: ['Performance review', 'Pattern spotting', 'Growth engine'],
            previewClass: 'dashboard-home-preview--analysis',
            previewStats: ['Win Rate: 62%', 'Risk Score: Stable', 'Edge: Improving'],
            hint: 'Use this after sessions to understand what is improving and what needs work.',
        },
        {
            key: 'community',
            icon: <FaUsers />,
            title: 'Community',
            description: 'Stay connected to traders, updates, and accountability throughout the week.',
            path: '/community',
            cta: 'Open Community',
            accent: 'Accountability',
            bullets: ['Live channels', 'Shared feedback', 'Trading environment'],
            previewClass: 'dashboard-home-preview--community',
            previewStats: ['Welcome room', 'Mentor updates', 'Daily check-ins'],
            hint: 'Go here when you want interaction, ideas, or support from the network.',
        },
    ];

    const currentTutorial = tutorialSteps[tutorialStep];
    const highlightedTarget = tutorialOpen ? currentTutorial?.target : null;
    const setTutorialRef = () => () => {};
    const showHint = (key) => activeHint === key;
    const nextTutorialStep = () => {
        if (tutorialStep >= tutorialSteps.length - 1) {
            setTutorialOpen(false);
            return;
        }
        setTutorialStep((prev) => prev + 1);
        setActiveHint(tutorialSteps[tutorialStep + 1].target);
    };
    const prevTutorialStep = () => {
        if (tutorialStep === 0) return;
        setTutorialStep((prev) => prev - 1);
        setActiveHint(tutorialSteps[tutorialStep - 1].target);
    };
    const closeTutorial = () => setTutorialOpen(false);

    return (
        <>
            {isLoading && (
                <div className="loading-screen">
                    <CosmicBackground />
                    <div className="loading-content">
                        <span className="loading-brand-text">Aura Terminal</span>
                        <div className="loading-subtitle">Initializing System...</div>
                        <div className="loading-dots-container">
                            <span className="loading-dot"/><span className="loading-dot"/><span className="loading-dot"/>
                        </div>
                    </div>
                </div>
            )}

            <div className="home-container">
                <CosmicBackground />
                {showContent && (
                    isAuthenticated ? (
                        <div className="home-content home-content--dashboard">
                            <div className="dashboard-home-shell">
                                <section
                                    ref={setTutorialRef('hero')}
                                    className={`dashboard-home-hero glass-card${highlightedTarget === 'hero' ? ' dashboard-home-focus' : ''}`}
                                >
                                    <div className="dashboard-home-hero__content">
                                        <div className="dashboard-home-kicker">
                                            <span className="dashboard-home-kicker__dot" />
                                            Logged-In Home
                                        </div>
                                        <h1 className="dashboard-home-title">{greeting}</h1>
                                        <p className="dashboard-home-subtitle">
                                            This is your Aura Terminal overview. Instead of dropping straight into Community, this page now walks you through the platform, shows what each area looks like, and helps you choose the right next step.
                                        </p>
                                        <div className="dashboard-home-actions">
                                            <button
                                                className="home-cta-button"
                                                onClick={() => navigate('/trader-deck')}
                                            >
                                                Start In Trader Desk
                                            </button>
                                            <button
                                                className="home-secondary-button"
                                                onClick={() => {
                                                    setTutorialOpen(true);
                                                    setTutorialStep(0);
                                                    setActiveHint('hero');
                                                }}
                                            >
                                                Start Tutorial
                                            </button>
                                        </div>
                                        <div className="dashboard-home-highlights">
                                            {[
                                                { label: 'Workflow', value: 'See The Platform First' },
                                                { label: 'Goal', value: 'Know Where To Click Next' },
                                                { label: 'Focus', value: 'Learn, Plan, Execute, Review' },
                                            ].map((item) => (
                                                <div className="dashboard-home-pill" key={item.label}>
                                                    <span>{item.label}</span>
                                                    <strong>{item.value}</strong>
                                                </div>
                                            ))}
                                        </div>
                                        {tutorialOpen && highlightedTarget === 'hero' && (
                                            <TutorialCoachmark
                                                title={currentTutorial.title}
                                                text={currentTutorial.text}
                                                step={tutorialStep + 1}
                                                total={tutorialSteps.length}
                                                onNext={nextTutorialStep}
                                                onPrev={prevTutorialStep}
                                                onClose={closeTutorial}
                                                canPrev={tutorialStep > 0}
                                                isLast={tutorialStep === tutorialSteps.length - 1}
                                            />
                                        )}
                                    </div>

                                    <div className="dashboard-home-hero__panel">
                                        <div className="dashboard-home-panel glass-card">
                                            <div className="dashboard-home-panel__header">
                                                <span className="dashboard-home-panel__eyebrow">Quick Start</span>
                                                <span className="dashboard-home-panel__badge">
                                                    <FaBolt /> Guided Tour
                                                </span>
                                            </div>
                                            <div className="dashboard-home-panel__steps">
                                                {tutorialSteps.map((step, index) => (
                                                    <div className="dashboard-home-step" key={step.title}>
                                                        <div className="dashboard-home-step__number">0{index + 1}</div>
                                                        <div className="dashboard-home-step__body">
                                                            <h3>{step.title}</h3>
                                                            <p>{step.text}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            <button
                                                className="dashboard-home-panel__link"
                                                onClick={() => {
                                                    setTutorialOpen(true);
                                                    setTutorialStep(0);
                                                    setActiveHint('hero');
                                                }}
                                            >
                                                Replay Tutorial <FaArrowRight />
                                            </button>
                                        </div>
                                    </div>
                                </section>

                                <section className="dashboard-home-ticker glass-card">
                                    <div className="dashboard-home-section-head">
                                        <div>
                                            <p className="dashboard-home-section-label">Live Context</p>
                                            <h2>Market awareness at a glance</h2>
                                        </div>
                                        <button
                                            className="dashboard-home-inline-button"
                                            onClick={() => navigate('/trader-deck')}
                                        >
                                            Open Desk <FaArrowRight />
                                        </button>
                                    </div>
                                    <MarketTicker compact={true} showTabs={false} showViewAll={true} autoScroll={true} />
                                </section>

                                <section className="dashboard-home-overview">
                                    <div className="dashboard-home-section-head">
                                        <div>
                                            <p className="dashboard-home-section-label">Platform Overview</p>
                                            <h2>See what the other pages actually do</h2>
                                        </div>
                                        <p className="dashboard-home-section-copy">
                                            These are visual previews, not just boxes. Use the tutorial popups and examples below to understand how each major area of Aura Terminal helps you.
                                        </p>
                                    </div>

                                    <div className="dashboard-home-grid">
                                        {previewCards.map((item) => (
                                            <article
                                                ref={setTutorialRef(item.key)}
                                                className={`dashboard-home-card glass-card${highlightedTarget === item.key ? ' dashboard-home-focus' : ''}`}
                                                key={item.title}
                                            >
                                                <div className="dashboard-home-card__top">
                                                    <div className="dashboard-home-card__meta">
                                                        <div className="dashboard-home-card__icon">{item.icon}</div>
                                                        <div className="dashboard-home-card__meta-copy">
                                                            <span className="dashboard-home-card__accent">{item.accent}</span>
                                                            <button
                                                                type="button"
                                                                className="dashboard-home-card__hint"
                                                                onClick={() => setActiveHint(showHint(item.key) ? null : item.key)}
                                                            >
                                                                <FaInfoCircle /> How it works
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className={`dashboard-home-preview ${item.previewClass}`}>
                                                        <div className="dashboard-home-preview__screen">
                                                            <div className="dashboard-home-preview__topbar">
                                                                <span />
                                                                <span />
                                                                <span />
                                                            </div>
                                                            <div className="dashboard-home-preview__hero" />
                                                            <div className="dashboard-home-preview__tiles">
                                                                {item.previewStats.map((stat) => (
                                                                    <div className="dashboard-home-preview__tile" key={stat}>{stat}</div>
                                                                ))}
                                                            </div>
                                                            <div className="dashboard-home-preview__footer" />
                                                        </div>
                                                    </div>
                                                </div>
                                                <h3>{item.title}</h3>
                                                <p>{item.description}</p>
                                                <div className="dashboard-home-card__bullets">
                                                    {item.bullets.map((bullet) => (
                                                        <span key={bullet}>{bullet}</span>
                                                    ))}
                                                </div>
                                                {showHint(item.key) && (
                                                    <div className="dashboard-home-inline-tip">
                                                        <div className="dashboard-home-inline-tip__header">
                                                            <strong>{item.title}</strong>
                                                            <button type="button" onClick={() => setActiveHint(null)}>
                                                                <FaTimes />
                                                            </button>
                                                        </div>
                                                        <p>{item.hint}</p>
                                                    </div>
                                                )}
                                                {tutorialOpen && highlightedTarget === item.key && (
                                                    <TutorialCoachmark
                                                        title={currentTutorial.title}
                                                        text={currentTutorial.text}
                                                        step={tutorialStep + 1}
                                                        total={tutorialSteps.length}
                                                        onNext={nextTutorialStep}
                                                        onPrev={prevTutorialStep}
                                                        onClose={closeTutorial}
                                                        canPrev={tutorialStep > 0}
                                                        isLast={tutorialStep === tutorialSteps.length - 1}
                                                    />
                                                )}
                                                <button
                                                    className="dashboard-home-card__button"
                                                    onClick={() => navigate(item.path)}
                                                >
                                                    {item.cta} <FaArrowRight />
                                                </button>
                                            </article>
                                        ))}
                                    </div>
                                </section>

                                <section className="dashboard-home-bottom">
                                    <div className="dashboard-home-bottom__left glass-card">
                                        <div className="dashboard-home-section-head">
                                            <div>
                                                <p className="dashboard-home-section-label">How To Use Aura</p>
                                                <h2>A simple flow for new and returning users</h2>
                                            </div>
                                        </div>
                                        <div className="dashboard-home-flow">
                                            {[
                                                'Start with Trader Desk when you need context and a clean picture of the market.',
                                                'Move into Trader Lab or Trade Calculator when you need to think through execution and risk.',
                                                'Use Aura Analysis after the session, then Community when you want accountability or updates.',
                                            ].map((item, index) => (
                                                <div className="dashboard-home-flow__item" key={item}>
                                                    <span className="dashboard-home-flow__index">{index + 1}</span>
                                                    <p>{item}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="dashboard-home-bottom__right glass-card">
                                        <div className="dashboard-home-section-head">
                                            <div>
                                                <p className="dashboard-home-section-label">Why It Matters</p>
                                                <h2>This page is your launchpad</h2>
                                            </div>
                                        </div>
                                        <div className="dashboard-home-reasons">
                                            {[
                                                { icon: <FaShieldAlt />, title: 'Stay structured', text: 'Move through the platform in an order that supports discipline instead of random clicking.' },
                                                { icon: <FaClock />, title: 'Save time', text: 'Get to the right tool quickly without guessing where everything lives.' },
                                                { icon: <FaPlayCircle />, title: 'Build momentum', text: 'Use the home page as a clean daily starting point before your session begins.' },
                                            ].map((item) => (
                                                <div className="dashboard-home-reason" key={item.title}>
                                                    <div className="dashboard-home-reason__icon">{item.icon}</div>
                                                    <div>
                                                        <h3>{item.title}</h3>
                                                        <p>{item.text}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </section>
                            </div>
                        </div>
                    ) : (
                        <div className="home-content">
                            <div className="home-logo-section">
                                <div className="hero-left">
                                    <div className="a7-logo-wrap" style={{ marginBottom:'1.4rem' }}><A7Logo /></div>
                                    <div className="hero-eyebrow">
                                        <span className="hero-eyebrow-dot" />
                                        <span className="hero-eyebrow-text">AI-Powered Trading Platform</span>
                                    </div>
                                    <div className="brand-name-container">
                                        <h1 className="brand-name">
                                            <span className="brand-name-line">Trade Smarter</span>
                                            <span className="brand-name-line">With Aura Terminal</span>
                                        </h1>
                                        <p className="powered-by-glitch">powered by <strong>The Glitch</strong></p>
                                    </div>
                                    <div className="content-intro hero-intro">
                                        <p className="intro-text">AI-Powered Trading Tools for Precision, Discipline and Consistent Performance</p>
                                    </div>
                                    <div className="home-cta-section hero-cta">
                                        <button className="home-cta-button"      onClick={handleStart}>Get Started</button>
                                        <button className="home-secondary-button" onClick={() => navigate('/explore')}>Explore Features</button>
                                    </div>
                                    <div className="hero-trust-badges">
                                        {[{icon:'✓',label:'Real Time Data'},{icon:'🔒',label:'Secure & Private'},{icon:'⊙',label:'24/7 Support'}].map(b=>(
                                            <div className="trust-badge" key={b.label}><div className="trust-badge-icon">{b.icon}</div>{b.label}</div>
                                        ))}
                                    </div>
                                    <div className="partner-logos-row">
                                        {[{icon:'📊',name:'TradingView'},{icon:'◈',name:'Binance'},{icon:'©',name:'Coinbase'},{icon:'◉',name:'Bloomberg'},{icon:'◎',name:'Reuters'}].map(p=>(
                                            <div className="partner-logo" key={p.name}><span className="partner-logo-icon">{p.icon}</span>{p.name}</div>
                                        ))}
                                    </div>
                                </div>
                                <div className="hero-right"><FloatingIPad /></div>
                            </div>

                            <div className="home-main-content">
                                <div className="market-ticker-wrapper">
                                    <MarketTicker compact={true} showTabs={false} showViewAll={true} autoScroll={true} />
                                </div>
                                <div className="cosmic-divider" />

                                <div className="feature-cards-grid">
                                    {[
                                        {icon:'📈',title:'Forex Trading',   desc:'Dominate currency markets with institutional-grade strategies and live market analysis'},
                                        {icon:'💹',title:'Stock Trading',   desc:'Master equity markets with advanced analysis techniques and professional trading strategies'},
                                        {icon:'₿', title:'Crypto Trading',  desc:'Capitalize on digital asset opportunities with cutting-edge strategies and market insights'},
                                        {icon:'🎯',title:'1-to-1 Mentorship',desc:'Accelerate your success with personalized coaching from industry-leading trading experts'},
                                    ].map(c=>(
                                        <div className="feature-card" key={c.title}>
                                            <div className="feature-icon">{c.icon}</div>
                                            <h3 className="feature-title">{c.title}</h3>
                                            <p className="feature-description">{c.desc}</p>
                                        </div>
                                    ))}
                                </div>

                                <div className="stats-section">
                                    <div className="stats-grid">
                                        <StatItem number="24.7%" label="Average ROI"     fill="82%"/>
                                        <StatItem number="1,200+" label="Active Traders" fill="90%"/>
                                        <StatItem number="85%"    label="Success Rate"   fill="85%"/>
                                        <StatItem number="50+"    label="Expert Courses" fill="60%"/>
                                    </div>
                                </div>
                                <div className="cosmic-divider" />

                                <div className="why-choose-section">
                                    <h2 className="section-title">Why Choose AURA TERMINAL</h2>
                                    <div className="why-grid">
                                        {[
                                            {title:'Elite Education',        text:'Learn from world-class professionals with decades of combined trading expertise'},
                                            {title:'Proven Strategies',      text:'Access battle-tested trading methodologies that generate consistent profits'},
                                            {title:'24/7 Support',           text:'Receive instant assistance from our thriving community and dedicated expert mentors'},
                                            {title:'Comprehensive Resources',text:'Unlock unlimited access to our extensive library of premium courses, advanced tools, and exclusive trading materials'},
                                        ].map(w=>(
                                            <div className="why-item" key={w.title}>
                                                <div className="why-icon">✓</div>
                                                <h3 className="why-title">{w.title}</h3>
                                                <p className="why-text">{w.text}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="trade-markets-section">
                                    <h2 className="trade-markets-section__title">Trade Multiple Markets</h2>
                                    <div className="trade-markets-section__grid">
                                        {[
                                            {icon:<FaChartLine/>,title:'Forex',      desc:'Major, minor, and exotic currency pairs'},
                                            {icon:<FaGlobe/>,    title:'Futures',    desc:'Master futures contracts and commodity trading'},
                                            {icon:<FaRocket/>,   title:'Crypto',     desc:'Bitcoin, Ethereum, and altcoins'},
                                            {icon:<FaTrophy/>,   title:'Stocks',     desc:'US and international equity markets'},
                                            {icon:<FaChartBar/>, title:'Indices',    desc:'S&P 500, NASDAQ, and more'},
                                            {icon:<FaCoins/>,    title:'Commodities',desc:'Trade gold, oil, and valuable resources'},
                                        ].map(m=>(
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

                                <div className="key-features-section">
                                    <h2 className="section-title">What Sets Us Apart</h2>
                                    <div className="features-list">
                                        {[
                                            {icon:<FaShieldAlt/>,    title:'Bank-Level Security',  text:'Your data and privacy are safeguarded with military-grade encryption and enterprise security protocols'},
                                            {icon:<FaClock/>,        title:'24/7 Premium Support', text:'Access round-the-clock assistance from our expert support team, available whenever you need guidance'},
                                            {icon:<FaUsers/>,        title:'Thriving Community',   text:'Join over 1,200+ active traders sharing exclusive insights, strategies, and real-time market analysis'},
                                            {icon:<FaGraduationCap/>,title:'Elite Mentors',        text:'Learn directly from industry legends with verified track records of consistent profitability and market success'},
                                        ].map(f=>(
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
                    )
                )}
            </div>
        </>
    );
};

export default Home;