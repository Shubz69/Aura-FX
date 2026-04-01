import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Home.css";
import { useAuth } from "../context/AuthContext";
import CosmicBackground from "../components/CosmicBackground";
import A7Logo from "../components/A7Logo";
import MarketTicker from "../components/MarketTicker";
import Api from "../services/Api";
import {
    FaUsers, FaTrophy, FaGraduationCap, FaRocket,
    FaShieldAlt, FaClock, FaCoins, FaChartBar,
    FaChartLine, FaGlobe, FaArrowRight, FaBolt,
    FaCompass, FaCalculator, FaBrain, FaPlayCircle,
    FaFlask, FaFileAlt, FaSignal, FaBullseye,
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
        resultR: latest.resultR ?? null,
        validPct: Math.round((validCount / persistedSessions.length) * 100),
    };
};

const getLeaderboardPosition = (leaderboard = [], userId) => {
    if (!userId || !Array.isArray(leaderboard)) return null;
    const index = leaderboard.findIndex((entry) => String(entry.id || entry.userId) === String(userId));
    if (index === -1) return null;
    return {
        rank: index + 1,
        xp: leaderboard[index].xp ?? null,
        level: leaderboard[index].level ?? null,
    };
};

const LoggedInDashboardHome = ({ user, token, navigate }) => {
    const [dashboardLoading, setDashboardLoading] = useState(true);
    const [dashboardData, setDashboardData] = useState({
        auraTrades: [],
        auraPnl: {},
        journalTasks: [],
        journalDaily: null,
        leaderboard: [],
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
            Api.getLeaderboard('all-time').then((response) => response.data?.leaderboard ?? response.data?.users ?? response.data ?? []),
            Api.getTraderLabSessions().then((response) => response.data?.sessions ?? []),
            reportsPromise,
        ]).then((results) => {
            if (!mounted) return;
            setDashboardData({
                auraTrades: results[0].status === 'fulfilled' && Array.isArray(results[0].value) ? results[0].value : [],
                auraPnl: results[1].status === 'fulfilled' ? results[1].value || {} : {},
                journalTasks: results[2].status === 'fulfilled' && Array.isArray(results[2].value) ? results[2].value : [],
                journalDaily: results[3].status === 'fulfilled' ? results[3].value : null,
                leaderboard: results[4].status === 'fulfilled' && Array.isArray(results[4].value) ? results[4].value : [],
                labSessions: results[5].status === 'fulfilled' && Array.isArray(results[5].value) ? results[5].value : [],
                reportsEligibility: results[6].status === 'fulfilled' ? results[6].value : null,
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
    const leaderboardPosition = useMemo(
        () => getLeaderboardPosition(dashboardData.leaderboard, user?.id),
        [dashboardData.leaderboard, user?.id]
    );

    const displayName = (user?.name || user?.username || '').trim();
    const greeting = displayName ? `Welcome back, ${displayName}` : 'Welcome';
    const level = user?.level ?? leaderboardPosition?.level ?? '—';
    const xp = user?.xp ?? leaderboardPosition?.xp ?? '—';
    const reportStatus = dashboardData.reportsEligibility?.isEligible ? 'Report-ready' : 'Building report readiness';

    const heroMetrics = [
        { label: 'Win Rate', value: formatPercent(analytics.winRate), source: 'Source: Aura Analysis' },
        { label: 'Average R', value: formatNumber(analytics.averageR), source: 'Source: Aura Analysis' },
        { label: 'Journal Streak', value: user?.login_streak ? `${user.login_streak} days` : '—', source: 'Source: Journal' },
        { label: 'Trader Level', value: level, source: 'Source: User XP / Leaderboard' },
    ];

    const commandCards = [
        { icon: <FaCompass />, title: 'Trader Desk', description: 'Read the market with context, structure, and timing before planning the trade.', action: 'Open Trader Desk', path: '/trader-deck', source: 'Source: Trader Desk workflow' },
        { icon: <FaFlask />, title: 'Trader Lab', description: lab ? `Latest setup: ${lab.latestSetup} with ${lab.validPct}% valid workflow alignment.` : 'No saved lab sessions yet. Build your first active workspace and validate your process.', action: 'Open Trader Lab', path: '/trader-lab', source: lab ? 'Source: Trader Lab sessions' : 'Source: Trader Lab' },
        { icon: <FaCalculator />, title: 'Trade Calculator', description: 'Move from idea to executable numbers with controlled position sizing and risk.', action: 'Open Calculator', path: '/trader-deck/trade-validator/calculator', source: 'Source: Trade Validator tools' },
        { icon: <FaBrain />, title: 'Aura Analysis', description: analytics.totalTrades > 0 ? `Tracking ${analytics.totalTrades} validated trades with ${formatPercent(analytics.avgChecklistPct ?? 0)} average checklist quality.` : 'Connect more trade data to unlock deeper analysis, edge review, and consistency scoring.', action: 'Open Aura Analysis', path: '/aura-analysis', source: 'Source: Aura Analysis' },
        { icon: <FaUsers />, title: 'Community', description: leaderboardPosition ? `You are currently ranked #${leaderboardPosition.rank} with ${xp} XP across the community.` : 'Join the environment, standards, and trader network that keeps performance accountability high.', action: 'Open Community', path: '/community', source: 'Source: Community leaderboard' },
    ];

    if (dashboardLoading) {
        return (
            <div className="institution-home">
                <div className="institution-home__loading glass-card">
                    <span className="institution-home__loading-kicker">Loading Dashboard</span>
                    <h2>Preparing your trading command center...</h2>
                    <p>Pulling live metrics from Aura Analysis, Journal, Reports, Leaderboard, and Trader Lab.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="institution-home">
            <section className="institution-home__hero glass-card">
                <div className="institution-home__hero-main">
                    <div className="institution-home__eyebrow">Trader Operating Environment</div>
                    <h1>{greeting}</h1>
                    <p className="institution-home__hero-copy">
                        This dashboard is built for serious retail and institutional-minded traders. It surfaces real performance, discipline, progression, and readiness data so you know exactly where you stand before you move.
                    </p>
                    <div className="institution-home__hero-actions">
                        <button className="home-cta-button" onClick={() => navigate('/trader-deck')}>Open Trader Desk</button>
                        <button className="home-secondary-button" onClick={() => navigate('/trader-lab')}>Open Trader Lab</button>
                        <button className="home-secondary-button" onClick={() => navigate('/aura-analysis')}>Open Aura Analysis</button>
                    </div>
                </div>
                <div className="institution-home__hero-rail">
                    <div className="institution-home__status-card">
                        <span className="institution-home__status-label">Profile Standing</span>
                        <strong>{user?.role || 'Trader'}</strong>
                        <p>Designed for traders who want structure, discipline, and measurable growth.</p>
                    </div>
                    <div className="institution-home__status-card">
                        <span className="institution-home__status-label">Performance & DNA</span>
                        <strong>{reportStatus}</strong>
                        <p>{dashboardData.reportsEligibility?.isEligible ? 'Reports can be generated from your current data footprint.' : 'Keep logging activity to unlock full report generation.'}</p>
                    </div>
                </div>
            </section>

            <section className="institution-home__kpi-row">
                {heroMetrics.map((item) => (
                    <article className="institution-home__kpi glass-card" key={item.label}>
                        <span className="institution-home__kpi-label">{item.label}</span>
                        <strong className="institution-home__kpi-value">{item.value}</strong>
                        <span className="institution-home__kpi-source">{item.source}</span>
                    </article>
                ))}
            </section>

            <section className="institution-home__main-grid">
                <article className="institution-home__panel glass-card institution-home__panel--performance">
                    <div className="institution-home__panel-head">
                        <div>
                            <span className="institution-home__panel-label">Performance Command</span>
                            <h2>Validated trading performance</h2>
                        </div>
                        <span className="institution-home__source">Source: Aura Analysis</span>
                    </div>
                    <div className="institution-home__stats-grid">
                        <div className="institution-home__stat">
                            <span>Total PnL</span>
                            <strong className={analytics.totalPnL >= 0 ? 'is-positive' : 'is-negative'}>{formatSignedCurrency(analytics.totalPnL)}</strong>
                        </div>
                        <div className="institution-home__stat">
                            <span>Profit Factor</span>
                            <strong>{analytics.profitFactor > 0 ? formatNumber(analytics.profitFactor) : '—'}</strong>
                        </div>
                        <div className="institution-home__stat">
                            <span>Consistency Score</span>
                            <strong>{analytics.consistencyScore || '—'}</strong>
                        </div>
                        <div className="institution-home__stat">
                            <span>Max Drawdown</span>
                            <strong className="is-negative">{formatSignedCurrency(-analytics.maxDrawdown)}</strong>
                        </div>
                    </div>
                    <div className="institution-home__subgrid">
                        <div className="institution-home__mini-panel">
                            <span>Best Pair</span>
                            <strong>{analytics.bestPair}</strong>
                            <p>Worst pair: {analytics.worstPair}</p>
                        </div>
                        <div className="institution-home__mini-panel">
                            <span>Streak Profile</span>
                            <strong>{analytics.longestWin}W / {analytics.longestLoss}L</strong>
                            <p>Longest win and loss streaks from validated trade history.</p>
                        </div>
                    </div>
                </article>

                <article className="institution-home__panel glass-card">
                    <div className="institution-home__panel-head">
                        <div>
                            <span className="institution-home__panel-label">Discipline Layer</span>
                            <h2>Journal execution discipline</h2>
                        </div>
                        <span className="institution-home__source">Source: Journal</span>
                    </div>
                    <div className="institution-home__discipline-list">
                        <div className="institution-home__discipline-item">
                            <span>Today</span>
                            <strong>{journal.dayPct != null ? `${journal.dayPct}%` : 'No tasks yet'}</strong>
                            <p>{journal.dayCompleted} / {journal.dayTotal} completed today</p>
                        </div>
                        <div className="institution-home__discipline-item">
                            <span>This week</span>
                            <strong>{journal.weekPct != null ? `${journal.weekPct}%` : 'No tasks yet'}</strong>
                            <p>{journal.weekCompleted} / {journal.weekTotal} completed this week</p>
                        </div>
                        <div className="institution-home__discipline-item">
                            <span>This month</span>
                            <strong>{journal.monthPct != null ? `${journal.monthPct}%` : 'No tasks yet'}</strong>
                            <p>{journal.monthCompleted} / {journal.monthTotal} completed this month</p>
                        </div>
                        <div className="institution-home__discipline-item">
                            <span>Reflection status</span>
                            <strong>{journal.noteLength > 0 ? 'Logged today' : 'No daily note yet'}</strong>
                            <p>{journal.mood ? `Mood captured: ${journal.mood}` : 'Add today’s note to strengthen report quality.'}</p>
                        </div>
                    </div>
                </article>

                <article className="institution-home__panel glass-card">
                    <div className="institution-home__panel-head">
                        <div>
                            <span className="institution-home__panel-label">Trader Identity</span>
                            <h2>Position, XP, and report readiness</h2>
                        </div>
                        <span className="institution-home__source">Source: Leaderboard / Reports</span>
                    </div>
                    <div className="institution-home__identity-grid">
                        <div className="institution-home__identity-card">
                            <span>Community rank</span>
                            <strong>{leaderboardPosition?.rank ? `#${leaderboardPosition.rank}` : 'Unranked'}</strong>
                            <p>{leaderboardPosition ? 'Your current all-time leaderboard position.' : 'Trade and engage to appear on the leaderboard.'}</p>
                        </div>
                        <div className="institution-home__identity-card">
                            <span>XP & Level</span>
                            <strong>{xp} XP / L{level}</strong>
                            <p>Current progression signal from your user profile and leaderboard state.</p>
                        </div>
                        <div className="institution-home__identity-card">
                            <span>Report data days</span>
                            <strong>{dashboardData.reportsEligibility?.dataDays ?? '—'}</strong>
                            <p>{dashboardData.reportsEligibility?.isEligible ? 'Enough data to generate reports.' : `Need ${dashboardData.reportsEligibility?.minDataDays ?? 'more'} days for full readiness.`}</p>
                        </div>
                        <div className="institution-home__identity-card">
                            <span>Trades logged</span>
                            <strong>{dashboardData.reportsEligibility?.tradeCount ?? analytics.totalTrades}</strong>
                            <p>Used by your report and oversight systems to measure trading activity.</p>
                        </div>
                    </div>
                </article>
            </section>

            <section className="institution-home__secondary-grid">
                <article className="institution-home__panel glass-card institution-home__panel--wide">
                    <div className="institution-home__panel-head">
                        <div>
                            <span className="institution-home__panel-label">Action Center</span>
                            <h2>Move through the platform like a serious operator</h2>
                        </div>
                    </div>
                    <div className="institution-home__command-grid">
                        {commandCards.map((item) => (
                            <div className="institution-home__command-card" key={item.title}>
                                <div className="institution-home__command-icon">{item.icon}</div>
                                <div className="institution-home__command-body">
                                    <div className="institution-home__command-top">
                                        <h3>{item.title}</h3>
                                        <span>{item.source}</span>
                                    </div>
                                    <p>{item.description}</p>
                                    <button className="institution-home__command-button" onClick={() => navigate(item.path)}>
                                        {item.action} <FaArrowRight />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </article>

                <article className="institution-home__panel glass-card">
                    <div className="institution-home__panel-head">
                        <div>
                            <span className="institution-home__panel-label">Trader Lab Status</span>
                            <h2>Active thinking environment</h2>
                        </div>
                        <span className="institution-home__source">Source: Trader Lab sessions</span>
                    </div>
                    {lab ? (
                        <div className="institution-home__lab-state">
                            <div className="institution-home__mini-panel">
                                <span>Saved sessions</span>
                                <strong>{lab.sessionCount}</strong>
                            </div>
                            <div className="institution-home__mini-panel">
                                <span>Latest setup</span>
                                <strong>{lab.latestSetup}</strong>
                            </div>
                            <div className="institution-home__mini-panel">
                                <span>Confidence</span>
                                <strong>{lab.confidence != null ? `${lab.confidence}%` : '—'}</strong>
                            </div>
                            <div className="institution-home__mini-panel">
                                <span>Workflow validity</span>
                                <strong>{lab.validPct}%</strong>
                            </div>
                        </div>
                    ) : (
                        <div className="institution-home__empty-state">
                            <FaFlask />
                            <h3>No saved Trader Lab sessions yet</h3>
                            <p>Build your first session to unlock real lab metrics on the home dashboard.</p>
                            <button className="institution-home__command-button" onClick={() => navigate('/trader-lab')}>
                                Open Trader Lab <FaArrowRight />
                            </button>
                        </div>
                    )}
                </article>
            </section>

            <section className="institution-home__ticker glass-card">
                <div className="institution-home__panel-head">
                    <div>
                        <span className="institution-home__panel-label">Market Context</span>
                        <h2>External context for today’s trading environment</h2>
                    </div>
                    <span className="institution-home__source">Source: Market ticker</span>
                </div>
                <MarketTicker compact={true} showTabs={false} showViewAll={true} autoScroll={true} />
            </section>
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