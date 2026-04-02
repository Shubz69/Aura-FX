import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import "../styles/Home.css";
import { useAuth } from "../context/AuthContext";
import CosmicBackground from "../components/CosmicBackground";
import A7Logo from "../components/A7Logo";
import MarketTicker from "../components/MarketTicker";
import Api from "../services/Api";
import { useLivePrices } from "../hooks/useLivePrices";
import {
    FaUsers, FaTrophy, FaGraduationCap, FaRocket,
    FaShieldAlt, FaClock, FaCoins, FaChartBar,
    FaChartLine, FaGlobe, FaArrowRight, FaBolt,
    FaEnvelope, FaCog, FaHeadset, FaSun, FaBriefcase, FaLock, FaTruck,
    FaArrowUp, FaArrowDown, FaCheck,
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

const formatPercent = (value, digits = 1) => {
    if (value == null || Number.isNaN(Number(value))) return '—';
    return `${Number(value).toFixed(digits)}%`;
};

const formatSignedCurrency = (value) => {
    if (value == null || Number.isNaN(Number(value))) return '—';
    const numeric = Number(value);
    const sign = numeric >= 0 ? '+' : '-';
    return `${sign}$${Math.abs(numeric).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatNumber = (value, digits = 2) => {
    if (value == null || Number.isNaN(Number(value))) return '—';
    return Number(value).toFixed(digits);
};

const toIsoDate = (date) => date.toISOString().slice(0, 10);

const getWeekStartDate = (date) => {
    const next = new Date(date);
    const day = next.getDay();
    const diff = next.getDate() - day + (day === 0 ? -6 : 1);
    next.setDate(diff);
    next.setHours(0, 0, 0, 0);
    return next;
};

const computePerformanceKpis = (trades = [], pnlData = {}) => {
    const totalTrades = trades.length;
    const wins = trades.filter((trade) => (trade.result || '').toLowerCase() === 'win' || (Number(trade.pnl) || 0) > 0).length;
    const losses = trades.filter((trade) => (trade.result || '').toLowerCase() === 'loss' || (Number(trade.pnl) || 0) < 0).length;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const totalPnL = pnlData.totalPnL != null ? pnlData.totalPnL : trades.reduce((sum, trade) => sum + (Number(trade.pnl) || 0), 0);
    const averageR = totalTrades > 0
        ? trades.reduce((sum, trade) => sum + (Number(trade.rMultiple) ?? Number(trade.rr) ?? 0), 0) / totalTrades
        : 0;
    const grossProfit = trades.filter((trade) => (Number(trade.pnl) || 0) > 0).reduce((sum, trade) => sum + Number(trade.pnl), 0);
    const grossLoss = Math.abs(trades.filter((trade) => (Number(trade.pnl) || 0) < 0).reduce((sum, trade) => sum + Number(trade.pnl), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
    const checklistScores = trades
        .map((trade) => trade.checklistPercent != null ? Number(trade.checklistPercent) : null)
        .filter((score) => score != null);
    const avgChecklistPct = checklistScores.length
        ? checklistScores.reduce((sum, score) => sum + score, 0) / checklistScores.length
        : null;

    let runningPnL = 0;
    let peakPnL = 0;
    let maxDrawdown = 0;
    let longestWin = 0;
    let longestLoss = 0;
    let currentWin = 0;
    let currentLoss = 0;
    const sortedTrades = [...trades].sort((a, b) => new Date(a.created_at || a.createdAt || a.date) - new Date(b.created_at || b.createdAt || b.date));

    sortedTrades.forEach((trade) => {
        runningPnL += Number(trade.pnl) || 0;
        if (runningPnL > peakPnL) peakPnL = runningPnL;
        maxDrawdown = Math.max(maxDrawdown, peakPnL - runningPnL);

        const pnl = Number(trade.pnl) || 0;
        if ((trade.result || '').toLowerCase() === 'win' || pnl > 0) {
            currentWin += 1;
            currentLoss = 0;
            longestWin = Math.max(longestWin, currentWin);
        } else if ((trade.result || '').toLowerCase() === 'loss' || pnl < 0) {
            currentLoss += 1;
            currentWin = 0;
            longestLoss = Math.max(longestLoss, currentLoss);
        } else {
            currentWin = 0;
            currentLoss = 0;
        }
    });

    const equityCurve = sortedTrades.reduce((acc, trade) => {
        const prev = acc.length ? acc[acc.length - 1].y : 0;
        const next = prev + (Number(trade.pnl) || 0);
        acc.push({ t: trade.created_at || trade.createdAt || trade.date, y: next });
        return acc;
    }, []);

    const pairTotals = {};
    sortedTrades.forEach((trade) => {
        const pair = trade.pair || '—';
        pairTotals[pair] = (pairTotals[pair] || 0) + (Number(trade.pnl) || 0);
    });
    const pairEntries = Object.entries(pairTotals).map(([pair, pnl]) => ({ pair, pnl })).sort((a, b) => b.pnl - a.pnl);

    return {
        totalTrades,
        wins,
        losses,
        winRate,
        totalPnL,
        averageR,
        profitFactor,
        avgChecklistPct,
        maxDrawdown,
        consistencyScore: totalTrades > 0 ? Math.round(Math.min(100, Math.max(0, 50 + (winRate - 50) * 0.4))) : 0,
        longestWin,
        longestLoss,
        activeWinStreak: currentWin,
        activeLossStreak: currentLoss,
        equityCurve,
        bestPair: pairEntries[0]?.pair || '—',
        worstPair: pairEntries[pairEntries.length - 1]?.pair || '—',
        recentTrades: sortedTrades.slice(-5).reverse(),
    };
};

const computeJournalMetrics = (tasks = [], selectedDate = new Date(), journalDaily = null) => {
    const todayIso = toIsoDate(selectedDate);
    const weekStart = toIsoDate(getWeekStartDate(selectedDate));
    const monthKey = todayIso.slice(0, 7);
    const dayTasks = tasks.filter((task) => String(task.date).slice(0, 10) === todayIso);
    const weekTasks = tasks.filter((task) => String(task.date).slice(0, 10) >= weekStart && String(task.date).slice(0, 10) <= todayIso);
    const monthTasks = tasks.filter((task) => String(task.date).slice(0, 7) === monthKey);
    const countCompleted = (list) => list.filter((task) => task.completed).length;
    const percent = (done, total) => total > 0 ? Math.round((done / total) * 100) : null;

    return {
        dayPct: percent(countCompleted(dayTasks), dayTasks.length),
        weekPct: percent(countCompleted(weekTasks), weekTasks.length),
        monthPct: percent(countCompleted(monthTasks), monthTasks.length),
        dayCompleted: countCompleted(dayTasks),
        dayTotal: dayTasks.length,
        weekCompleted: countCompleted(weekTasks),
        weekTotal: weekTasks.length,
        monthCompleted: countCompleted(monthTasks),
        monthTotal: monthTasks.length,
        noteLength: journalDaily?.notes?.trim()?.length || 0,
        mood: journalDaily?.mood || null,
    };
};

const computeLabMetrics = (sessions = []) => {
    if (!Array.isArray(sessions) || sessions.length === 0) return null;
    const persistedSessions = sessions.filter((session) => session?.id);
    if (persistedSessions.length === 0) return null;
    const latest = [...persistedSessions].sort((a, b) => new Date(b.sessionDate || b.updatedAt || b.createdAt || 0) - new Date(a.sessionDate || a.updatedAt || a.createdAt || 0))[0];
    const validCount = persistedSessions.filter((session) => session.setupValid && session.biasAligned && session.entryConfirmed && session.riskDefined).length;
    return {
        sessionCount: persistedSessions.length,
        latestSetup: latest.setupName || '—',
        confidence: latest.confidence ?? latest.auraConfidence ?? null,
        riskLevel: latest.riskLevel || '—',
        validPct: Math.round((validCount / persistedSessions.length) * 100),
        marketBias: latest.marketBias || '',
        targetPrice: latest.targetPrice,
        stopLoss: latest.stopLoss,
        entryPrice: latest.entryPrice,
        todaysFocus: latest.todaysFocus || '',
        whatDoISee: latest.whatDoISee || '',
        setupValid: Boolean(latest.setupValid),
        rrRatio: latest.rrRatio,
        resultR: latest.resultR !== '' && latest.resultR != null ? Number(latest.resultR) : null,
    };
};

const SentimentGauge = ({ value = 52 }) => {
    const v = Math.min(100, Math.max(0, Number(value) || 0));
    const rot = -180 + (v / 100) * 180;
    return (
        <div className="terminal-gauge">
            <svg viewBox="0 0 220 130" className="terminal-gauge__svg" aria-hidden>
                <defs>
                    <linearGradient id="terminalGaugeArc" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="rgba(240,61,95,0.75)" />
                        <stop offset="50%" stopColor="rgba(234,169,96,0.45)" />
                        <stop offset="100%" stopColor="rgba(15,217,138,0.85)" />
                    </linearGradient>
                </defs>
                <path
                    d="M 30 110 A 80 80 0 0 1 190 110"
                    fill="none"
                    stroke="url(#terminalGaugeArc)"
                    strokeWidth="9"
                    strokeLinecap="round"
                    opacity="0.42"
                />
                <g transform={`translate(110,110) rotate(${rot})`}>
                    <line x1="0" y1="0" x2="0" y2="-68" stroke="var(--eaa-bright)" strokeWidth="2.5" strokeLinecap="round" />
                    <circle cx="0" cy="0" r="5" fill="var(--eaa-core)" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                </g>
            </svg>
            <div className="terminal-gauge__labels">
                <span>Fear</span>
                <span>Neutral</span>
                <span>Greed</span>
            </div>
            <p className="terminal-gauge__readout">Sentiment: {v}</p>
        </div>
    );
};

const TerminalEquityChart = ({ points = [] }) => {
    const W = 560;
    const H = 160;
    const pad = 8;
    const series = !points.length ? [] : points.length === 1 ? [points[0], points[0]] : points;
    const vals = series.map((p) => p.y);
    if (!vals.length) {
        return (
            <div className="terminal-equity">
                <svg viewBox={`0 0 ${W} ${H}`} className="terminal-equity__svg" preserveAspectRatio="none" role="img" aria-label="Equity curve">
                    <text x={W / 2} y={H / 2} textAnchor="middle" fill="var(--text-dim)" fontSize="12" fontFamily="var(--font)">
                        Log trades to see your equity curve
                    </text>
                </svg>
            </div>
        );
    }
    const minY = Math.min(...vals, 0);
    const maxY = Math.max(...vals, 0);
    const span = Math.max(maxY - minY, 1e-6);
    const coords = series.map((p, i) => {
        const x = pad + (i / Math.max(series.length - 1, 1)) * (W - pad * 2);
        const y = pad + (1 - (p.y - minY) / span) * (H - pad * 2);
        return [x, y];
    });
    const d = coords.length
        ? coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
        : '';

    return (
        <div className="terminal-equity">
            <svg viewBox={`0 0 ${W} ${H}`} className="terminal-equity__svg" preserveAspectRatio="none" role="img" aria-label="Equity curve">
                <defs>
                    <linearGradient id="terminalEquityFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(234,169,96,0.35)" />
                        <stop offset="100%" stopColor="rgba(234,169,96,0)" />
                    </linearGradient>
                </defs>
                {[0.25, 0.5, 0.75].map((f) => (
                    <line
                        key={f}
                        x1={pad}
                        y1={pad + f * (H - pad * 2)}
                        x2={W - pad}
                        y2={pad + f * (H - pad * 2)}
                        stroke="rgba(255,255,255,0.06)"
                        strokeWidth="1"
                        strokeDasharray="4 8"
                    />
                ))}
                {coords.length > 1 && (
                    <path
                        d={`${d} L ${coords[coords.length - 1][0].toFixed(1)} ${H - pad} L ${coords[0][0].toFixed(1)} ${H - pad} Z`}
                        fill="url(#terminalEquityFill)"
                        opacity="0.9"
                    />
                )}
                {d && (
                    <path d={d} fill="none" stroke="var(--eaa-core)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                )}
            </svg>
        </div>
    );
};

const TerminalWatchlist = () => {
    const { getPricesArray } = useLivePrices({ beginnerMode: true });
    const rows = getPricesArray().slice(0, 5);

    return (
        <div className="terminal-watchlist">
            <div className="terminal-watchlist__head">
                <span>Market</span>
                <span>Price</span>
                <span>Chg</span>
            </div>
            {rows.map((row) => {
                const pct = row.changePercent != null ? Number(row.changePercent) : null;
                const up = pct != null && !Number.isNaN(pct) ? pct >= 0 : row.isUp !== false;
                const loading = row.loading || !row.price;
                return (
                    <div className="terminal-watchlist__row" key={row.symbol}>
                        <span className="terminal-watchlist__name">{row.displayName || row.symbol}</span>
                        <span className="terminal-watchlist__price">{loading ? '—' : row.price}</span>
                        <span className={`terminal-watchlist__chg ${up ? 'is-up' : 'is-down'}`}>
                            {loading ? '—' : `${up ? '+' : ''}${formatPercent(pct, 2)}`}
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

const LoggedInDashboardHome = ({ user, token, navigate }) => {
    const [dashboardLoading, setDashboardLoading] = useState(true);
    const [dashboardData, setDashboardData] = useState({
        auraTrades: [],
        auraPnl: {},
        journalTasks: [],
        journalDaily: null,
        labSessions: [],
        reportsEligibility: null,
    });

    useEffect(() => {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        let mounted = true;
        setDashboardLoading(true);

        const reportsPromise = token
            ? fetch(`${process.env.REACT_APP_API_URL || ''}/api/reports/eligibility`, {
                headers: { Authorization: `Bearer ${token}` },
            })
                .then((response) => response.json())
                .then((data) => (data?.success ? data : null))
                .catch(() => null)
            : Promise.resolve(null);

        Promise.allSettled([
            Api.getAuraAnalysisTrades().then((response) => response.data?.trades ?? response.data?.data ?? []),
            Api.getAuraAnalysisPnl().then((response) => ({
                totalPnL: response.data?.totalPnL ?? response.data?.monthlyPnl ?? 0,
                monthlyPnl: response.data?.monthlyPnl ?? 0,
            })),
            Api.getJournalTasks({ dateFrom: toIsoDate(monthStart), dateTo: toIsoDate(now) }).then((response) => response.data?.tasks ?? []),
            Api.getJournalDaily(toIsoDate(now)).then((response) => response.data?.note ?? null),
            Api.getTraderLabSessions().then((response) => response.data?.sessions ?? []),
            reportsPromise,
        ]).then((results) => {
            if (!mounted) return;
            setDashboardData({
                auraTrades: results[0].status === 'fulfilled' && Array.isArray(results[0].value) ? results[0].value : [],
                auraPnl: results[1].status === 'fulfilled' ? results[1].value || {} : {},
                journalTasks: results[2].status === 'fulfilled' && Array.isArray(results[2].value) ? results[2].value : [],
                journalDaily: results[3].status === 'fulfilled' ? results[3].value : null,
                labSessions: results[4].status === 'fulfilled' && Array.isArray(results[4].value) ? results[4].value : [],
                reportsEligibility: results[5].status === 'fulfilled' ? results[5].value : null,
            });
            setDashboardLoading(false);
        });

        return () => {
            mounted = false;
        };
    }, [token]);

    const analytics = useMemo(
        () => computePerformanceKpis(dashboardData.auraTrades, dashboardData.auraPnl),
        [dashboardData.auraTrades, dashboardData.auraPnl]
    );
    const journal = useMemo(
        () => computeJournalMetrics(dashboardData.journalTasks, new Date(), dashboardData.journalDaily),
        [dashboardData.journalTasks, dashboardData.journalDaily]
    );
    const lab = useMemo(() => computeLabMetrics(dashboardData.labSessions), [dashboardData.labSessions]);

    const displayName = (user?.name || user?.username || '').trim();
    const firstName = displayName.split(/\s+/)[0] || 'Trader';
    const welcomeShort = `Welcome, ${firstName}.`;

    const sentimentScore = useMemo(() => {
        if (analytics.totalTrades === 0) return 52;
        return Math.round(
            Math.min(100, Math.max(0, 50 + (analytics.winRate - 50) * 0.55 + (analytics.consistencyScore - 50) * 0.35))
        );
    }, [analytics]);

    const reflectionCount = useMemo(
        () => dashboardData.journalTasks.filter((t) => /reflect/i.test(String(t.title || ''))).length,
        [dashboardData.journalTasks]
    );

    const monthlyPnL =
        dashboardData.auraPnl.monthlyPnl != null ? Number(dashboardData.auraPnl.monthlyPnl) : analytics.totalPnL;

    const rewardLabel = useMemo(() => {
        if (!lab) return '—';
        if (lab.resultR == null || Number.isNaN(Number(lab.resultR))) return 'TBD';
        const r = Number(lab.resultR);
        if (r >= 2) return 'High';
        if (r >= 1) return 'Moderate';
        return 'Building';
    }, [lab]);

    const riskLabel = lab?.riskLevel && String(lab.riskLevel).trim() ? lab.riskLevel : 'Moderate';

    const biasDisplay = useMemo(() => {
        if (!lab?.marketBias) {
            if (!lab) return 'Neutral';
            return lab.validPct >= 55 ? 'Bullish' : lab.validPct <= 45 ? 'Bearish' : 'Neutral';
        }
        const b = lab.marketBias.toLowerCase();
        if (b.includes('bull')) return 'Bullish';
        if (b.includes('bear')) return 'Bearish';
        return lab.marketBias;
    }, [lab]);

    const scenarioLines = useMemo(() => {
        const lines = [];
        if (lab?.targetPrice) lines.push(`Target near ${lab.targetPrice}`);
        if (lab?.stopLoss) lines.push(`Risk / stop region ${lab.stopLoss}`);
        if (lab?.todaysFocus) lines.push(lab.todaysFocus.slice(0, 120));
        if (lab?.whatDoISee && lines.length < 3) lines.push(lab.whatDoISee.slice(0, 120));
        if (lines.length === 0) lines.push('Define structure and levels in Trader Lab.');
        return lines.slice(0, 3);
    }, [lab]);

    const disciplineScore = Math.round(
        journal.monthPct != null ? journal.monthPct : analytics.avgChecklistPct ?? analytics.consistencyScore ?? 72
    );
    const behaviourScore = Math.round(
        analytics.consistencyScore != null ? analytics.consistencyScore : disciplineScore
    );

    if (dashboardLoading) {
        return (
            <div className="terminal-dashboard">
                <div className="terminal-dashboard__loading glass-card">
                    <span className="terminal-dashboard__loading-kicker">Loading</span>
                    <h2>Preparing Aura Terminal…</h2>
                    <p>Syncing Aura Analysis, journal, lab sessions, and market snapshot.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="terminal-dashboard">
            <header className="terminal-dashboard__topbar glass-card">
                <div className="terminal-dashboard__brand" aria-label="Aura Terminal">
                    Aura Terminal
                </div>
                <div className="terminal-dashboard__top-actions">
                    <Link to="/messages" className="terminal-dashboard__icon-btn" title="Messages" aria-label="Messages">
                        <FaEnvelope />
                    </Link>
                    <Link to="/settings" className="terminal-dashboard__icon-btn" title="Settings" aria-label="Settings">
                        <FaCog />
                    </Link>
                    <Link to="/contact" className="terminal-dashboard__icon-btn" title="Support" aria-label="Support">
                        <FaHeadset />
                    </Link>
                </div>
            </header>

            <div className="terminal-dashboard__body">
                <nav className="terminal-dashboard__rail glass-card" aria-label="Quick navigation">
                    <Link to="/settings" className="terminal-dashboard__rail-btn" title="Appearance">
                        <FaSun />
                    </Link>
                    <Link to="/trader-deck" className="terminal-dashboard__rail-btn" title="Trader Desk">
                        <FaBriefcase />
                    </Link>
                    <Link to="/profile" className="terminal-dashboard__rail-btn" title="Account">
                        <FaLock />
                    </Link>
                    <Link to="/community" className="terminal-dashboard__rail-btn" title="Community">
                        <FaTruck />
                    </Link>
                </nav>

                <div className="terminal-dashboard__grid">
                    <article className="terminal-card glass-card terminal-card--welcome">
                        <span className="terminal-card__label">Welcome</span>
                        <h2 className="terminal-card__title">{welcomeShort}</h2>
                        <SentimentGauge value={sentimentScore} />
                    </article>

                    <article className="terminal-card glass-card terminal-card--desk">
                        <span className="terminal-card__label">Trader Desk</span>
                        <div className="terminal-desk__bias">
                            <span>Bias</span>
                            <strong
                                className={
                                    biasDisplay === 'Bearish'
                                        ? 'is-bear'
                                        : biasDisplay === 'Bullish'
                                          ? 'is-bull'
                                          : ''
                                }
                            >
                                {biasDisplay}{' '}
                                {biasDisplay === 'Bullish' ? <FaArrowUp aria-hidden /> : null}
                                {biasDisplay === 'Bearish' ? <FaArrowDown aria-hidden /> : null}
                            </strong>
                        </div>
                        <div className="terminal-desk__scenarios">
                            <span className="terminal-desk__scenarios-label">Scenarios</span>
                            <ul>
                                {scenarioLines.map((line) => (
                                    <li key={line}>{line}</li>
                                ))}
                            </ul>
                        </div>
                        <button type="button" className="terminal-card__linkish" onClick={() => navigate('/trader-deck')}>
                            Open desk <FaArrowRight />
                        </button>
                    </article>

                    <article className="terminal-card glass-card terminal-card--watch">
                        <span className="terminal-card__label">Watchlist</span>
                        <TerminalWatchlist />
                    </article>

                    <article className="terminal-card glass-card terminal-card--validator">
                        <span className="terminal-card__label">Trade Validator</span>
                        <ul className="terminal-checklist">
                            <li>
                                <FaCheck aria-hidden /> Setup {lab?.setupValid ? 'Valid' : 'Pending'}
                            </li>
                            <li>
                                <FaCheck aria-hidden /> Risk: {riskLabel}
                            </li>
                            <li>
                                <FaCheck aria-hidden /> Reward: {rewardLabel}
                            </li>
                        </ul>
                        <button
                            type="button"
                            className="terminal-card__linkish"
                            onClick={() => navigate('/trader-deck/trade-validator/calculator')}
                        >
                            Validator <FaArrowRight />
                        </button>
                    </article>

                    <article className="terminal-card glass-card terminal-card--metrics">
                        <span className="terminal-card__label">Live metrics</span>
                        <div className="terminal-metrics">
                            <div>
                                <span>P&amp;L</span>
                                <strong className={monthlyPnL >= 0 ? 'is-positive' : 'is-negative'}>
                                    {formatSignedCurrency(monthlyPnL)}
                                </strong>
                            </div>
                            <div>
                                <span>Win rate</span>
                                <strong>{analytics.totalTrades ? formatPercent(analytics.winRate, 0) : '—'}</strong>
                            </div>
                            <div>
                                <span>Avg. R:R</span>
                                <strong>{analytics.totalTrades ? formatNumber(analytics.averageR, 1) : '—'}</strong>
                            </div>
                        </div>
                    </article>

                    <div className="terminal-mini-grid">
                        <div className="terminal-mini glass-card">
                            <span>Discipline score</span>
                            <strong>{Number.isFinite(disciplineScore) ? disciplineScore : '—'}</strong>
                        </div>
                        <div className="terminal-mini glass-card">
                            <span>Behaviour score</span>
                            <strong>{Number.isFinite(behaviourScore) ? behaviourScore : '—'}</strong>
                        </div>
                        <div className="terminal-mini glass-card">
                            <span>Win streak</span>
                            <strong>{analytics.activeWinStreak ?? 0}</strong>
                        </div>
                        <div className="terminal-mini glass-card">
                            <span>Loss streak</span>
                            <strong>{analytics.activeLossStreak ?? 0}</strong>
                        </div>
                    </div>

                    <article className="terminal-card glass-card terminal-card--journal">
                        <span className="terminal-card__label">Journal summary</span>
                        <div className="terminal-journal-lines">
                            <div>
                                <span>Entries</span>
                                <strong>{dashboardData.journalTasks.length}</strong>
                            </div>
                            <div className="terminal-journal-lines__rule" />
                            <div>
                                <span>Reflections</span>
                                <strong>{reflectionCount}</strong>
                            </div>
                        </div>
                        <button type="button" className="terminal-card__linkish" onClick={() => navigate('/journal')}>
                            Journal <FaArrowRight />
                        </button>
                    </article>

                    <article className="terminal-card glass-card terminal-card--performance">
                        <span className="terminal-card__label">Performance</span>
                        <h3 className="terminal-performance__title">Equity curve</h3>
                        <TerminalEquityChart points={analytics.equityCurve} />
                    </article>
                </div>
            </div>
        </div>
    );
};

/* ══════════════════════════════════════════════════════════
   HOME PAGE
══════════════════════════════════════════════════════════ */
const Home = () => {
    const navigate = useNavigate();
    const { isAuthenticated, user, token } = useAuth();
    const [showContent, setShowContent] = useState(false);
    const [isLoading,   setIsLoading]   = useState(true);

    useEffect(() => {
        const t = setTimeout(() => { setIsLoading(false); setShowContent(true); }, 3000);
        return () => clearTimeout(t);
    }, []);

    const handleStart = () => navigate(isAuthenticated ? '/community' : '/register');

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
                            <LoggedInDashboardHome user={user} token={token} navigate={navigate} />
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