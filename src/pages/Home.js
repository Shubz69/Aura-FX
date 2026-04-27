import React, { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, Link } from "react-router-dom";
import "../styles/Home.css";
import { useAuth } from "../context/AuthContext";
import { useAuraConnection } from "../context/AuraConnectionContext";
import CosmicBackground from "../components/CosmicBackground";
import A7Logo from "../components/A7Logo";
import MarketTicker from "../components/MarketTicker";
import Api from "../services/Api";
import { useLivePrices } from "../hooks/useLivePrices";
import {
    HOME_DASHBOARD_MARKET_POOL,
    HOME_DASHBOARD_WATCHLIST_ROTATE_MS,
    HOME_DASHBOARD_WATCHLIST_VISIBLE,
} from "../constants/homeDashboardMarketPool";
import { formatWelcomeSentence } from "../utils/welcomeUser";
import {
    FaUsers, FaTrophy, FaGraduationCap, FaRocket,
    FaShieldAlt, FaClock, FaCoins, FaChartBar,
    FaChartLine, FaGlobe, FaArrowRight,
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

const SLIDE_IDS = ['journal', 'traderdesk', 'auraAI', 'community', 'courses'];
const SLIDE_IMAGE_FILES = {
    journal: 'journal.png',
    traderdesk: 'traderdesk.png',
    auraAI: 'auraAI.png',
    community: 'community.png',
    courses: 'courses.png',
};
const SLIDE_CHART_COLORS = {
    journal: '#F8C37D',
    traderdesk: '#EAA960',
    auraAI: '#FDE8C4',
    community: '#D48D44',
    courses: '#EABB80',
};

function buildSlides(t) {
    return SLIDE_IDS.map((id) => {
        const s = t(`home.slides.${id}`, { returnObjects: true });
        return {
            image: `${IPAD_SLIDE_BASE}/${SLIDE_IMAGE_FILES[id]}`,
            tag: s.tag,
            title: s.title,
            subtitle: s.subtitle,
            statBadge: s.statBadge,
            chartColor: SLIDE_CHART_COLORS[id],
        };
    });
}

function translateBiasLabel(label, t) {
    const x = String(label || '').toLowerCase();
    if (x === 'bullish') return t('home.desk.biasBullish');
    if (x === 'bearish') return t('home.desk.biasBearish');
    if (x === 'neutral') return t('home.desk.biasNeutral');
    return label;
}

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
const FloatingIPad = ({ slides, dragHint }) => {
    const sceneRef  = useRef(null);
    const wrapRef   = useRef(null);
    const bodyRef   = useRef(null);
    const cursorRef = useRef(null);
    const [activeSlide, setActiveSlide] = useState(0);
    const slideTimerRef = useRef(null);

    const advanceTo = (idx) => {
        setActiveSlide(idx);
        clearInterval(slideTimerRef.current);
        slideTimerRef.current = setInterval(() => setActiveSlide(p => (p+1) % slides.length), 4000);
    };

    useEffect(() => {
        slideTimerRef.current = setInterval(() => setActiveSlide(p => (p+1) % slides.length), 4000);
        return () => clearInterval(slideTimerRef.current);
    }, [slides.length]);

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
            <div className="ipad-drag-hint"><span className="ipad-drag-hint-icon">✦</span> {dragHint}</div>

            <div className="ipad-wrap" ref={wrapRef} style={{ position:'relative', width:'100%', transformStyle:'preserve-3d', transform:'translateY(0px) rotateX(7deg) rotateY(-13deg)', willChange:'transform' }}>
                <div className="ipad-body" ref={bodyRef}>
                    <div className="ipad-topbar">
                        <div className="ipad-camera" />
                        <div className="ipad-speaker" />
                        <div style={{ marginLeft:'auto', fontSize:'.52rem', fontWeight:600, color:'rgba(255,255,255,.28)', letterSpacing:'.12em' }}>AURA</div>
                    </div>

                    {/* ── SCREEN ── */}
                    <div className="ipad-screen">
                        {slides.map((slide, i) => (
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
                        {slides.map((_,i) => (
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

const isSettledTrade = (trade) => {
    const r = String(trade?.result || '').toLowerCase();
    return r === 'win' || r === 'loss' || r === 'breakeven';
};

const computePerformanceKpis = (trades = [], pnlData = {}) => {
    const settled = trades.filter(isSettledTrade);
    const totalTrades = trades.length;
    const wins = settled.filter((trade) => (trade.result || '').toLowerCase() === 'win' || (Number(trade.pnl) || 0) > 0).length;
    const losses = settled.filter((trade) => (trade.result || '').toLowerCase() === 'loss' || (Number(trade.pnl) || 0) < 0).length;
    const winRate = settled.length > 0 ? (wins / settled.length) * 100 : 0;
    const totalPnL = pnlData.totalPnL != null ? pnlData.totalPnL : trades.reduce((sum, trade) => sum + (Number(trade.pnl) || 0), 0);
    const averageR = settled.length > 0
        ? settled.reduce((sum, trade) => sum + (Number(trade.rMultiple) ?? Number(trade.rr) ?? 0), 0) / settled.length
        : 0;
    const grossProfit = settled.filter((trade) => (Number(trade.pnl) || 0) > 0).reduce((sum, trade) => sum + Number(trade.pnl), 0);
    const grossLoss = Math.abs(settled.filter((trade) => (Number(trade.pnl) || 0) < 0).reduce((sum, trade) => sum + Number(trade.pnl), 0));
    let profitFactor = null;
    let profitFactorDisplay = '—';
    if (settled.length) {
        if (grossLoss > 0) {
            profitFactor = grossProfit / grossLoss;
            profitFactorDisplay = Number.isFinite(profitFactor) ? profitFactor.toFixed(2) : '—';
        } else if (grossProfit > 0) {
            profitFactorDisplay = '∞';
        } else {
            profitFactorDisplay = '0.00';
            profitFactor = 0;
        }
    }

    const now = new Date();
    const y = now.getFullYear();
    const mo = now.getMonth();
    const monthToDatePnl = settled.reduce((sum, trade) => {
        const d = new Date(trade.createdAt || trade.created_at || trade.date);
        if (Number.isNaN(d.getTime())) return sum;
        if (d.getFullYear() === y && d.getMonth() === mo) return sum + (Number(trade.pnl) || 0);
        return sum;
    }, 0);
    const checklistScores = settled
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
    sortedTrades.filter(isSettledTrade).forEach((trade) => {
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
        profitFactorDisplay,
        settledTrades: settled.length,
        monthToDatePnl,
        avgChecklistPct,
        maxDrawdown,
        consistencyScore: settled.length > 0 ? Math.round(Math.min(100, Math.max(0, 50 + (winRate - 50) * 0.4))) : 0,
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

/** Single source of truth for desk bias label + gauge position (0–100, bearish left → bullish right). */
const normalizeDeskBias = (lab, analytics) => {
    const raw = lab?.marketBias != null ? String(lab.marketBias).trim() : '';
    const lower = raw.toLowerCase();
    let label = 'Neutral';
    let pct = 50;

    if (/\bbull|long\b|buy side|risk on/i.test(lower)) {
        label = raw.length && !/^bullish$/i.test(raw) && !/^bearish$/i.test(raw) ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Bullish';
        pct = 78;
    } else if (/\bbear|short\b|sell side|risk off/i.test(lower)) {
        label = raw.length && !/^bullish$/i.test(raw) && !/^bearish$/i.test(raw) ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Bearish';
        pct = 22;
    } else if (lab) {
        if (lab.validPct != null && !Number.isNaN(Number(lab.validPct))) {
            const v = Number(lab.validPct);
            pct = Math.round(12 + (v / 100) * 76);
            if (v >= 58) label = 'Bullish';
            else if (v <= 42) label = 'Bearish';
            else label = 'Neutral';
        } else if (raw) {
            label = raw.charAt(0).toUpperCase() + raw.slice(1);
            pct = 50;
        }
    } else if (analytics?.totalTrades > 0 && analytics.winRate != null) {
        const wr = Number(analytics.winRate);
        if (wr >= 56) {
            label = 'Bullish';
            pct = 68;
        } else if (wr <= 44) {
            label = 'Bearish';
            pct = 32;
        }
    }

    pct = Math.max(6, Math.min(94, pct));
    return { label, pct };
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
        biasAligned: Boolean(latest.biasAligned),
        entryConfirmed: Boolean(latest.entryConfirmed),
        riskDefined: Boolean(latest.riskDefined),
        rrRatio: latest.rrRatio,
        resultR: latest.resultR !== '' && latest.resultR != null ? Number(latest.resultR) : null,
    };
};

/** Semi-circular desk pulse: needle sweeps left (bearish) → up (neutral) → right (bullish). */
const DeskPulseGauge = ({ biasReadout, biasLabelInternal = '', pulsePct }) => {
    const { t } = useTranslation();
    let pct =
        typeof pulsePct === 'number' && Number.isFinite(pulsePct) ? pulsePct : null;
    if (pct == null) {
        const b = String(biasLabelInternal || '').toLowerCase();
        if (/\bbull|long\b/i.test(b)) pct = 78;
        else if (/\bbear|short\b/i.test(b)) pct = 22;
        else pct = 50;
    }
    pct = Math.max(0, Math.min(100, pct));
    /* Default needle points up (12 o'clock). -90° → left (bear), 0° → up (neutral), +90° → right (bull). */
    const rot = -90 + (pct / 100) * 180;
    const toneClass = pct >= 58 ? 'is-bull' : pct <= 42 ? 'is-bear' : '';
    return (
        <div className="desk2-pulse">
            <span className="desk2-pulse__kicker">{t('home.desk.marketPulse')}</span>
            <svg viewBox="0 0 200 118" className="desk2-pulse__svg" aria-hidden>
                <defs>
                    <linearGradient id="desk2PulseArc" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="rgba(255,107,129,0.9)" />
                        <stop offset="50%" stopColor="rgba(150,150,160,0.35)" />
                        <stop offset="100%" stopColor="rgba(61,214,140,0.95)" />
                    </linearGradient>
                </defs>
                <path
                    d="M 24 102 A 76 76 0 0 1 176 102"
                    fill="none"
                    stroke="url(#desk2PulseArc)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    opacity="0.5"
                />
                <g transform="translate(100,102)">
                    <g transform={`rotate(${rot})`}>
                        <line x1="0" y1="0" x2="0" y2="-62" stroke="#e8c15a" strokeWidth="2.2" strokeLinecap="round" />
                        <circle cx="0" cy="0" r="4.5" fill="#1a1520" stroke="rgba(232,193,90,0.6)" strokeWidth="1.2" />
                    </g>
                </g>
            </svg>
            <div className="desk2-pulse__labels">
                <span>{t('home.desk.bearishLabel')}</span>
                <span>{t('home.desk.neutralLabel')}</span>
                <span>{t('home.desk.bullishLabel')}</span>
            </div>
            <p className={`desk2-pulse__readout${toneClass ? ` ${toneClass}` : ''}`}>
                {biasReadout}
            </p>
        </div>
    );
};

const headlineTimeAgo = (iso, t) => {
    if (!iso) return '';
    const ts = new Date(iso).getTime();
    if (Number.isNaN(ts)) return '';
    const m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return t('time.headlineJustNow');
    if (m < 60) return t('time.minutesAgo', { count: m });
    const h = Math.floor(m / 60);
    if (h < 48) return t('time.hoursAgo', { count: h });
    return t('time.daysAgo', { count: Math.floor(h / 24) });
};

const WatchlistRowSpark = ({ up }) => {
    const base = up
        ? [0.35, 0.4, 0.38, 0.52, 0.48, 0.62, 0.58, 0.72, 0.68, 0.8]
        : [0.75, 0.7, 0.68, 0.55, 0.52, 0.45, 0.42, 0.38, 0.35, 0.32];
    const W = 72;
    const H = 28;
    const coords = base.map((p, i) => `${(i / (base.length - 1)) * W},${H - p * (H - 6) - 3}`).join(' ');
    const stroke = up ? 'rgba(61,214,140,0.9)' : 'rgba(255,107,129,0.9)';
    return (
        <svg className="desk2-wl-spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden>
            <polyline fill="none" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" points={coords} />
        </svg>
    );
};

const normalizeDeskWatchlistRow = (row, fallbackSymbol) => {
    const symbol = row?.symbol || fallbackSymbol || '—';
    const displayName = row?.displayName || symbol;
    const price = row?.price ?? null;
    const change = row?.change ?? null;
    const changePercent = row?.changePercent ?? null;
    const loading = row?.loading === true || !price;
    const source = row?.source || null;
    const delayed = row?.delayed === true;
    const quoteUnavailable = row?.quoteUnavailable === true;
    const isMissing = !row || row?.missing === true;
    const isUp =
        typeof row?.isUp === 'boolean'
            ? row.isUp
            : (changePercent != null && Number.isFinite(Number(changePercent)) ? Number(changePercent) >= 0 : true);

    return {
        symbol,
        displayName,
        price,
        change,
        changePercent,
        loading,
        source,
        delayed,
        quoteUnavailable,
        isMissing,
        isUp,
        changeSign: row?.changeSign || null,
        lastUpdate: row?.lastUpdate ?? null,
    };
};

const DeskWatchlist = () => {
    const { t } = useTranslation();
    const { getPricesArray, getHealth, stale, loading } = useLivePrices({
        symbols: HOME_DASHBOARD_MARKET_POOL,
    });
    const [sliceStart, setSliceStart] = useState(0);

    useEffect(() => {
        let timer = null;
        const arm = () => {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
            timer = setInterval(() => {
                setSliceStart((s) => (s + HOME_DASHBOARD_WATCHLIST_VISIBLE) % HOME_DASHBOARD_MARKET_POOL.length);
            }, HOME_DASHBOARD_WATCHLIST_ROTATE_MS);
        };
        arm();
        const onVis = () => arm();
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);
        return () => {
            if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis);
            if (timer) clearInterval(timer);
        };
    }, []);

    const full = getPricesArray();
    const poolLen = HOME_DASHBOARD_MARKET_POOL.length;
    const rows = [];
    for (let i = 0; i < HOME_DASHBOARD_WATCHLIST_VISIBLE; i += 1) {
        const symbol = HOME_DASHBOARD_MARKET_POOL[(sliceStart + i) % poolLen];
        const candidate = full[(sliceStart + i) % poolLen];
        rows.push(normalizeDeskWatchlistRow(candidate, symbol));
    }

    const health = getHealth();
    const meta = health.lastSnapshotMeta || {};
    const lastSnapMs = rows.find((r) => r?.lastUpdate != null)?.lastUpdate || null;
    const updatedLabel =
        lastSnapMs != null
            ? new Date(Number(lastSnapMs)).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            : health.lastFetchTime
              ? new Date(health.lastFetchTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              : t('common.dash');
    const statusParts = [];
    if (loading && !health.lastFetchTime) statusParts.push(t('home.desk.watchlistMetaLoading'));
    if (stale || meta.responseStale || meta.staleFallback) statusParts.push(t('home.desk.watchlistMetaStale'));
    if (meta.staleFallback) statusParts.push(t('home.desk.watchlistMetaServing'));
    if (meta.serverRouteCacheHit === false) statusParts.push(t('home.desk.watchlistMetaFresh'));
    if (meta.serverRouteCacheHit === true && !meta.staleFallback) statusParts.push(t('home.desk.watchlistMetaCdn'));
    const sourceHint =
        statusParts.length > 0 ? statusParts.join(' · ') : meta.symbolCount != null ? t('home.desk.watchlistMetaSymbols', { count: meta.symbolCount }) : t('home.desk.watchlistMetaLiveSnapshot');

    return (
        <div className="desk2-wl">
            <div className="desk2-wl__meta" aria-live="polite">
                <span className="desk2-wl__meta-upd">{t('home.desk.watchlistAsOf', { time: updatedLabel })}</span>
                <span className="desk2-wl__meta-hint" title={t('home.desk.watchlistPricesHintTitle')}>
                    {sourceHint}
                </span>
            </div>
            <div className="desk2-wl__head">
                <span>{t('home.desk.tableMarket')}</span>
                <span>{t('home.desk.tablePrice')}</span>
                <span>{t('home.desk.tableChgPct')}</span>
                <span />
            </div>
            {rows.map((row) => {
                const pct = row?.changePercent != null ? Number(row.changePercent) : null;
                const up = pct != null && !Number.isNaN(pct) ? pct >= 0 : row.isUp !== false;
                const loadingRow = row.loading || !row.price;
                const absHint =
                    !loadingRow && row.change != null
                        ? t('home.desk.rowHintSession', {
                              sign: row.changeSign === '-' ? '-' : '',
                              change: row.change,
                              pct: formatPercent(pct, 2),
                          })
                        : undefined;
                const rowStale = row.isMissing || row.source === 'fallback' || row.delayed || row.quoteUnavailable;
                return (
                    <div className={`desk2-wl__row${rowStale ? ' desk2-wl__row--alt' : ''}`} key={row.symbol}>
                        <span className="desk2-wl__sym">
                            {row.displayName || row.symbol}
                            {rowStale ? <span className="desk2-wl__badge">{row.isMissing ? t('home.desk.badgeMissing') : t('home.desk.badgeAlt')}</span> : null}
                        </span>
                        <span className="desk2-wl__px">{loadingRow ? t('common.dash') : row.price}</span>
                        <span className={`desk2-wl__chg ${up ? 'is-up' : 'is-down'}`} title={absHint}>
                            {loadingRow ? t('common.dash') : `${up ? '+' : ''}${formatPercent(pct, 2)}`}
                        </span>
                        <WatchlistRowSpark up={up} />
                    </div>
                );
            })}
        </div>
    );
};

const MiniEquitySpark = ({ points = [] }) => {
    const { t } = useTranslation();
    const series = !points.length ? [] : points.length === 1 ? [points[0], points[0]] : points;
    const W = 280;
    const H = 48;
    const pad = 4;
    if (!series.length) {
        return <div className="desk2-mini-equity desk2-mini-equity--empty">{t('home.desk.noEquitySeries')}</div>;
    }
    const vals = series.map((p) => p.y);
    const minY = Math.min(...vals, 0);
    const maxY = Math.max(...vals, 0);
    const span = Math.max(maxY - minY, 1e-6);
    const coords = series.map((p, i) => {
        const x = pad + (i / Math.max(series.length - 1, 1)) * (W - pad * 2);
        const y = pad + (1 - (p.y - minY) / span) * (H - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return (
        <svg className="desk2-mini-equity" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
            <polyline
                fill="none"
                points={coords.join(' ')}
                stroke="rgba(232,193,90,0.85)"
                strokeWidth="1.8"
                strokeLinejoin="round"
            />
        </svg>
    );
};

const ScoreRing = ({ label, value }) => {
    const v = Math.min(100, Math.max(0, Number(value) || 0));
    return (
        <div className="desk2-ring">
            <div className="desk2-ring__track" style={{ '--ring-pct': v }}>
                <div className="desk2-ring__inner">
                    <strong>{Number.isFinite(Number(value)) ? Math.round(Number(value)) : '—'}</strong>
                </div>
            </div>
            <span className="desk2-ring__lab">{label}</span>
        </div>
    );
};

const TerminalEquityChart = ({ points = [] }) => {
    const { t } = useTranslation();
    const W = 560;
    const H = 160;
    const pad = 8;
    const series = !points.length ? [] : points.length === 1 ? [points[0], points[0]] : points;
    const vals = series.map((p) => p.y);
    if (!vals.length) {
        return (
            <div className="terminal-equity">
                <svg viewBox={`0 0 ${W} ${H}`} className="terminal-equity__svg" preserveAspectRatio="none" role="img" aria-label={t('home.desk.equityEmpty')}>
                    <text x={W / 2} y={H / 2} textAnchor="middle" fill="var(--text-dim)" fontSize="12" fontFamily="var(--font)">
                        {t('home.desk.equityEmpty')}
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
    const startY = series[0]?.y ?? 0;
    const endY = series[series.length - 1]?.y ?? 0;
    const net = endY - startY;
    const toneClass = net >= 0 ? 'is-up' : 'is-down';
    const lastPt = coords[coords.length - 1];

    return (
        <div className="terminal-equity">
            <div className="terminal-equity__meta">
                <span className="terminal-equity__meta-label">{t('home.desk.netCurve')}</span>
                <strong className={toneClass}>{formatSignedCurrency(net)}</strong>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="terminal-equity__svg" preserveAspectRatio="none" role="img" aria-label={t('home.desk.netCurve')}>
                <defs>
                    <linearGradient id="terminalEquityFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(234,169,96,0.35)" />
                        <stop offset="100%" stopColor="rgba(234,169,96,0)" />
                    </linearGradient>
                    <linearGradient id="terminalEquityStroke" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="rgba(131, 167, 255, 0.65)" />
                        <stop offset="55%" stopColor="rgba(234,169,96,0.95)" />
                        <stop offset="100%" stopColor="rgba(255, 226, 164, 0.95)" />
                    </linearGradient>
                    <filter id="terminalEquityGlow" x="-30%" y="-30%" width="160%" height="160%">
                        <feGaussianBlur stdDeviation="2.2" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>
                {[0.16, 0.33, 0.5, 0.66, 0.83].map((f) => (
                    <line
                        key={`v-${f}`}
                        x1={pad + f * (W - pad * 2)}
                        y1={pad}
                        x2={pad + f * (W - pad * 2)}
                        y2={H - pad}
                        stroke="rgba(255,255,255,0.035)"
                        strokeWidth="1"
                    />
                ))}
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
                    <path d={d} fill="none" stroke="url(#terminalEquityStroke)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" filter="url(#terminalEquityGlow)" />
                )}
                {lastPt ? (
                    <>
                        <circle cx={lastPt[0]} cy={lastPt[1]} r="5.2" fill="rgba(234,169,96,0.2)" />
                        <circle cx={lastPt[0]} cy={lastPt[1]} r="2.6" fill="rgba(255,230,164,0.95)" />
                    </>
                ) : null}
            </svg>
        </div>
    );
};

const LoggedInDashboardHome = ({ user, token, navigate }) => {
    const { t } = useTranslation();
    const { hasAnyConnection, loading: auraConnectionsLoading } = useAuraConnection();
    const [dashboardLoading, setDashboardLoading] = useState(true);
    const [dashboardData, setDashboardData] = useState({
        auraTrades: [],
        auraPnl: {},
        journalTasks: [],
        journalDaily: null,
        labSessions: [],
        validatorAccounts: [],
        reportsEligibility: null,
        headlines: [],
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
                dailyPnl: response.data?.dailyPnl,
                weeklyPnl: response.data?.weeklyPnl,
            })),
            Api.getJournalTasks({ dateFrom: toIsoDate(monthStart), dateTo: toIsoDate(now) }).then((response) => response.data?.tasks ?? []),
            Api.getJournalDaily(toIsoDate(now)).then((response) => response.data?.note ?? null),
            Api.getTraderLabSessions().then((response) => response.data?.sessions ?? []),
            Api.getValidatorAccounts()
                .then((response) => (Array.isArray(response.data?.accounts) ? response.data.accounts : []))
                .catch(() => []),
            reportsPromise,
            Api.getTraderDeckNews(false)
                .then((response) => (Array.isArray(response.data?.articles) ? response.data.articles : []))
                .catch(() => []),
        ]).then((results) => {
            if (!mounted) return;
            setDashboardData({
                auraTrades: results[0].status === 'fulfilled' && Array.isArray(results[0].value) ? results[0].value : [],
                auraPnl: results[1].status === 'fulfilled' ? results[1].value || {} : {},
                journalTasks: results[2].status === 'fulfilled' && Array.isArray(results[2].value) ? results[2].value : [],
                journalDaily: results[3].status === 'fulfilled' ? results[3].value : null,
                labSessions: results[4].status === 'fulfilled' && Array.isArray(results[4].value) ? results[4].value : [],
                validatorAccounts: results[5].status === 'fulfilled' && Array.isArray(results[5].value) ? results[5].value : [],
                reportsEligibility: results[6].status === 'fulfilled' ? results[6].value : null,
                headlines: results[7].status === 'fulfilled' && Array.isArray(results[7].value) ? results[7].value : [],
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

    const welcomeShort = formatWelcomeSentence(user);

    /** MT-linked: API month P&L. Otherwise: sum of closed trades this month (validator / Aura Analysis). */
    const liveDeskPnl = useMemo(() => {
        if (hasAnyConnection && dashboardData.auraPnl.monthlyPnl != null && !Number.isNaN(Number(dashboardData.auraPnl.monthlyPnl))) {
            return Number(dashboardData.auraPnl.monthlyPnl);
        }
        return analytics.monthToDatePnl;
    }, [hasAnyConnection, dashboardData.auraPnl.monthlyPnl, analytics.monthToDatePnl]);

    const rewardKey = useMemo(() => {
        if (!lab) return 'empty';
        if (lab.resultR == null || Number.isNaN(Number(lab.resultR))) return 'tbd';
        const r = Number(lab.resultR);
        if (r >= 2) return 'high';
        if (r >= 1) return 'moderate';
        return 'building';
    }, [lab]);

    const riskLabel = lab?.riskLevel && String(lab.riskLevel).trim() ? lab.riskLevel : t('home.desk.rewardModerate');

    /**
     * Live P&L from MetaTrader when linked; otherwise show month-to-date from logged Aura Analysis trades.
     * Frost overlay only when we have neither a broker link nor any logged trades.
     */
    const liveMetricsLocked =
        auraConnectionsLoading || (!hasAnyConnection && analytics.totalTrades === 0);

    const deskBias = useMemo(() => normalizeDeskBias(lab, analytics), [lab, analytics]);
    const biasDisplay = deskBias.label;

    const scenarioLines = useMemo(() => {
        const lines = [];
        if (lab?.targetPrice) lines.push(t('home.desk.scenarioTarget', { price: lab.targetPrice }));
        if (lab?.stopLoss) lines.push(t('home.desk.scenarioStop', { level: lab.stopLoss }));
        if (lab?.todaysFocus) lines.push(lab.todaysFocus.slice(0, 120));
        if (lab?.whatDoISee && lines.length < 3) lines.push(lab.whatDoISee.slice(0, 120));
        if (lines.length === 0) lines.push(t('home.desk.scenarioDefault'));
        return lines.slice(0, 3);
    }, [lab, t]);

    const disciplineScore = Math.round(
        journal.monthPct != null ? journal.monthPct : analytics.avgChecklistPct ?? analytics.consistencyScore ?? 72
    );
    const behaviourScore = Math.round(
        analytics.consistencyScore != null ? analytics.consistencyScore : disciplineScore
    );

    const convictionDisplay = useMemo(() => {
        if (lab?.confidence != null && lab.confidence !== '' && !Number.isNaN(Number(lab.confidence))) {
            return formatNumber(Number(lab.confidence), 1);
        }
        if (lab?.resultR != null && !Number.isNaN(Number(lab.resultR))) {
            return formatNumber(Number(lab.resultR), 1);
        }
        if (analytics.averageR > 0) return formatNumber(analytics.averageR * 10, 1);
        if (analytics.totalTrades) return formatNumber(Math.min(99, analytics.winRate * 0.65), 1);
        return t('common.dash');
    }, [lab, analytics, t]);

    const consistencyRing = Math.round(
        journal.monthPct != null ? journal.monthPct : analytics.winRate || disciplineScore
    );

    const validatorCompletion = useMemo(() => {
        const checks = [lab?.setupValid, lab?.biasAligned, lab?.entryConfirmed, lab?.riskDefined];
        const completed = checks.filter(Boolean).length;
        return {
            completed,
            total: checks.length,
            pct: Math.round((completed / checks.length) * 100),
        };
    }, [lab]);

    const expectancyHint = useMemo(() => {
        if (!analytics.settledTrades) return t('home.desk.expectancyEmpty');
        if (analytics.averageR >= 0.8) return t('home.desk.expectancyStrong');
        if (analytics.averageR >= 0.2) return t('home.desk.expectancyPositive');
        if (analytics.averageR >= 0) return t('home.desk.expectancyFlat');
        return t('home.desk.expectancyNegative');
    }, [analytics, t]);

    const journalBullets = useMemo(() => {
        const out = [];
        const raw = dashboardData.journalDaily?.notes;
        const n = raw != null ? String(raw).trim() : '';
        if (n) {
            n.split(/\n+/)
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, 4)
                .forEach((x) => out.push(x.length > 100 ? `${x.slice(0, 97)}…` : x));
        }
        scenarioLines.slice(0, Math.max(0, 3 - out.length)).forEach((x) => out.push(x));
        if (out.length === 0) out.push(t('home.desk.journalNotesEmpty'));
        return out.slice(0, 4);
    }, [dashboardData.journalDaily, scenarioLines, t]);

    if (dashboardLoading) {
        return (
            <div className="terminal-dashboard">
                <div className="terminal-dashboard__loading glass-card">
                    <span className="terminal-dashboard__loading-kicker">{t('home.desk.loadingKicker')}</span>
                    <h2>{t('home.desk.loadingTitle')}</h2>
                    <p>{t('home.desk.loadingSubtitle')}</p>
                </div>
            </div>
        );
    }

    const rewardHintKey =
        rewardKey === 'empty' || rewardKey === 'tbd'
            ? null
            : ({ high: 'home.desk.rewardHigh', moderate: 'home.desk.rewardModerate', building: 'home.desk.rewardBuilding' }[rewardKey] || null);

    return (
        <div className="terminal-dashboard">
            <header className="terminal-dashboard__topbar glass-card">
                <p className="terminal-dashboard__welcome">{welcomeShort}</p>
                <div className="terminal-dashboard__top-right">
                    <span className="terminal-dashboard__wordmark">{t('home.desk.wordmark')}</span>
                </div>
            </header>

            <div className="home-desk2" aria-label={t('home.desk.ariaLabel')}>
                <div className="home-desk2__cols">
                    <aside className="home-desk2__col home-desk2__col--left">
                        <section className="desk2-card desk2-card--pulse glass-card">
                            <DeskPulseGauge
                                biasReadout={translateBiasLabel(biasDisplay, t)}
                                biasLabelInternal={biasDisplay}
                                pulsePct={deskBias.pct}
                            />
                        </section>
                        <section className="desk2-card glass-card">
                            <span className="desk2-card__label">{t('home.desk.watchlist')}</span>
                            <DeskWatchlist />
                        </section>
                        <section className="desk2-card glass-card">
                            <span className="desk2-card__label">{t('home.desk.liveMetrics')}</span>
                            <div className="desk2-metrics-shell">
                                <div
                                    className={`desk2-metrics-grid${liveMetricsLocked ? ' desk2-metrics-grid--muted' : ''}`}
                                    aria-hidden={liveMetricsLocked}
                                >
                                    <div>
                                        <span>{t('home.desk.pnl')}</span>
                                        <strong className={liveDeskPnl >= 0 ? 'is-positive' : 'is-negative'}>
                                            {liveMetricsLocked ? t('common.dash') : formatSignedCurrency(liveDeskPnl)}
                                        </strong>
                                    </div>
                                    <div>
                                        <span>{t('home.desk.winRate')}</span>
                                        <strong>
                                            {liveMetricsLocked
                                                ? t('common.dash')
                                                : analytics.totalTrades
                                                  ? formatPercent(analytics.winRate, 0)
                                                  : t('common.dash')}
                                        </strong>
                                    </div>
                                    <div>
                                        <span>{t('home.desk.winStreak')}</span>
                                        <strong>{liveMetricsLocked ? t('common.dash') : analytics.activeWinStreak ?? 0}</strong>
                                    </div>
                                </div>
                                {liveMetricsLocked ? (
                                    <div className="desk2-frost" role="status">
                                        <p className="desk2-frost__t">
                                            {auraConnectionsLoading ? t('home.desk.checkingLink') : t('home.desk.connectMt')}
                                        </p>
                                        {!auraConnectionsLoading ? (
                                            <Link to="/aura-analysis/ai" className="desk2-frost__a">
                                                {t('home.desk.connectionHub')} <FaArrowRight aria-hidden />
                                            </Link>
                                        ) : null}
                                    </div>
                                ) : null}
                                <MiniEquitySpark points={analytics.equityCurve} />
                            </div>
                        </section>

                        <section className="desk2-card desk2-card--fill desk2-card--metrics-extra glass-card">
                            <span className="desk2-card__label">{t('home.desk.executionMetrics')}</span>
                            <div className="desk2-mini-metrics">
                                <div>
                                    <span>{t('home.desk.totalTrades')}</span>
                                    <strong>{analytics.totalTrades || t('common.dash')}</strong>
                                </div>
                                <div>
                                    <span>{t('home.desk.profitFactor')}</span>
                                    <strong>{analytics.settledTrades ? analytics.profitFactorDisplay : t('common.dash')}</strong>
                                </div>
                                <div>
                                    <span>{t('home.desk.avgRLabel')}</span>
                                    <strong>
                                        {analytics.settledTrades ? formatNumber(analytics.averageR, 2) : t('common.dash')}
                                    </strong>
                                </div>
                                <div>
                                    <span>{t('home.desk.maxDrawdown')}</span>
                                    <strong>
                                        {analytics.settledTrades
                                            ? formatSignedCurrency(-Math.abs(analytics.maxDrawdown || 0))
                                            : t('common.dash')}
                                    </strong>
                                </div>
                            </div>
                            <div className="desk2-mini-metrics">
                                <div>
                                    <span>{t('home.desk.bestPair')}</span>
                                    <strong>{analytics.bestPair || t('common.dash')}</strong>
                                </div>
                                <div>
                                    <span>{t('home.desk.worstPair')}</span>
                                    <strong>{analytics.worstPair || t('common.dash')}</strong>
                                </div>
                                <div>
                                    <span>{t('home.desk.operatorAccounts')}</span>
                                    <strong>{dashboardData.validatorAccounts?.length ?? t('common.dash')}</strong>
                                </div>
                            </div>
                            <Link to="/aura-analysis/dashboard/overview" className="desk2-inline-link">
                                {t('home.desk.auraAnalysisOverview')} <FaArrowRight aria-hidden />
                            </Link>
                        </section>
                    </aside>

                    <main className="home-desk2__col home-desk2__col--center">
                        <section className="desk2-card glass-card">
                            <span className="desk2-card__label">{t('home.desk.traderDesk')}</span>
                            <div className="desk2-trio">
                                <div className="desk2-trio__cell">
                                    <span>{t('home.desk.bias')}</span>
                                    <strong
                                        className={
                                            biasDisplay === 'Bearish'
                                                ? 'is-bear'
                                                : biasDisplay === 'Bullish'
                                                  ? 'is-bull'
                                                  : ''
                                        }
                                    >
                                        {translateBiasLabel(biasDisplay, t)}
                                    </strong>
                                </div>
                                <div className="desk2-trio__cell">
                                    <span>{t('home.desk.conviction')}</span>
                                    <strong>{convictionDisplay}</strong>
                                </div>
                                <div className="desk2-trio__cell">
                                    <span>{t('home.desk.risk')}</span>
                                    <strong>{riskLabel}</strong>
                                    {rewardHintKey ? (
                                        <span className="desk2-trio__hint">
                                            {t('home.desk.rProfile')} {t(rewardHintKey)}
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                            <div className="desk2-scen">
                                <span className="desk2-scen__lab">{t('home.desk.scenarios')}</span>
                                <ul>
                                    {scenarioLines.map((line) => (
                                        <li key={line}>{line}</li>
                                    ))}
                                </ul>
                            </div>
                            <button type="button" className="desk2-cta" onClick={() => navigate('/trader-deck')}>
                                {t('home.desk.openDesk')} <FaArrowRight aria-hidden />
                            </button>
                        </section>

                        <section className="desk2-card glass-card">
                            <span className="desk2-card__label">{t('home.desk.latestHeadlines')}</span>
                            <ul className="desk2-news">
                                {(dashboardData.headlines || []).slice(0, 4).map((a, i) => (
                                    <li key={`${a.headline || i}-${i}`}>
                                        {a.url ? (
                                            <a href={a.url} target="_blank" rel="noopener noreferrer" className="desk2-news__link">
                                                {a.headline || t('common.article')}
                                            </a>
                                        ) : (
                                            <span className="desk2-news__text">{a.headline || t('common.dash')}</span>
                                        )}
                                        <span className="desk2-news__time">{headlineTimeAgo(a.publishedAt, t)}</span>
                                    </li>
                                ))}
                            </ul>
                            {!dashboardData.headlines?.length ? (
                                <p className="desk2-muted">{t('home.desk.headlinesEmpty')}</p>
                            ) : null}
                        </section>

                        <section className="desk2-card glass-card">
                            <span className="desk2-card__label">{t('home.desk.edgeSnapshot')}</span>
                            <div className="desk2-mini-metrics">
                                <div>
                                    <span>{t('home.desk.checklistAvg')}</span>
                                    <strong>
                                        {analytics.avgChecklistPct != null
                                            ? `${Math.round(analytics.avgChecklistPct)}%`
                                            : t('common.dash')}
                                    </strong>
                                </div>
                                <div>
                                    <span>{t('home.desk.avgRShort')}</span>
                                    <strong>{analytics.settledTrades ? `${formatNumber(analytics.averageR, 2)}R` : t('common.dash')}</strong>
                                </div>
                                <div>
                                    <span>{t('home.desk.lossStreak')}</span>
                                    <strong>{analytics.settledTrades ? analytics.activeLossStreak : t('common.dash')}</strong>
                                </div>
                                <div>
                                    <span>{t('home.desk.validSetups')}</span>
                                    <strong>{lab ? `${validatorCompletion.pct}%` : t('common.dash')}</strong>
                                </div>
                            </div>
                            <p className="desk2-muted">{expectancyHint}</p>
                            <button
                                type="button"
                                className="desk2-cta desk2-cta--ghost"
                                onClick={() => navigate('/trader-deck/trade-validator/calculator')}
                            >
                                {t('home.desk.openCalculator')} <FaArrowRight aria-hidden />
                            </button>
                        </section>

                        <section className="desk2-card desk2-card--chart glass-card">
                            <span className="desk2-card__label">{t('home.desk.performance')}</span>
                            <TerminalEquityChart points={analytics.equityCurve} />
                        </section>
                    </main>

                    <aside className="home-desk2__col home-desk2__col--right">
                        <section className="desk2-card glass-card">
                            <span className="desk2-card__label">{t('home.desk.deskPosture')}</span>
                            <div className="desk2-postures">
                                <Link
                                    to="/trader-deck"
                                    className={`desk2-posture ${biasDisplay === 'Bullish' ? 'is-active' : ''}`}
                                >
                                    <span className="desk2-posture__tag">{t('home.desk.biasBullish')}</span>
                                    <span className="desk2-posture__sub">{t('home.desk.setupsIdentified')}</span>
                                </Link>
                                <Link
                                    to="/trader-deck"
                                    className={`desk2-posture ${biasDisplay === 'Bearish' ? 'is-active' : ''}`}
                                >
                                    <span className="desk2-posture__tag">{t('home.desk.biasBearish')}</span>
                                    <span className="desk2-posture__sub">{t('home.desk.waitConfirm')}</span>
                                </Link>
                                <Link
                                    to="/trader-deck/trade-validator"
                                    className={`desk2-posture ${
                                        biasDisplay !== 'Bullish' && biasDisplay !== 'Bearish' ? 'is-active' : ''
                                    }`}
                                >
                                    <span className="desk2-posture__tag">{t('home.desk.noTrade')}</span>
                                    <span className="desk2-posture__sub">{t('home.desk.staySidelines')}</span>
                                </Link>
                            </div>
                        </section>

                        <section className="desk2-card glass-card">
                            <span className="desk2-card__label">{t('home.desk.behaviourDiscipline')}</span>
                            <div className="desk2-rings">
                                <ScoreRing label={t('home.desk.discipline')} value={disciplineScore} />
                                <ScoreRing label={t('home.desk.consistency')} value={consistencyRing} />
                                <ScoreRing label={t('home.desk.behaviour')} value={behaviourScore} />
                            </div>
                        </section>

                        <section className="desk2-card desk2-card--fill glass-card">
                            <span className="desk2-card__label">{t('home.desk.reportsDna')}</span>
                            <div className="desk2-insight-grid">
                                <div>
                                    <span>{t('home.desk.reportData')}</span>
                                    <strong>
                                        {dashboardData.reportsEligibility?.dataDays != null
                                            ? `${dashboardData.reportsEligibility.dataDays}d`
                                            : t('common.dash')}
                                    </strong>
                                </div>
                                <div>
                                    <span>{t('home.desk.chartChecks')}</span>
                                    <strong>
                                        {dashboardData.reportsEligibility?.chartCheckCount != null
                                            ? dashboardData.reportsEligibility.chartCheckCount
                                            : t('common.dash')}
                                    </strong>
                                </div>
                                <div>
                                    <span>{t('home.desk.monthTasks')}</span>
                                    <strong>
                                        {journal.monthTotal != null ? `${journal.monthCompleted}/${journal.monthTotal}` : t('common.dash')}
                                    </strong>
                                </div>
                                <div>
                                    <span>{t('home.desk.plan')}</span>
                                    <strong className="desk2-insight-plan">
                                        {String(dashboardData.reportsEligibility?.role || t('common.dash'))}
                                    </strong>
                                </div>
                            </div>
                            <div className="desk2-insight-links">
                                <Link to="/reports">{t('home.desk.monthlyReports')}</Link>
                                <Link to="/reports/dna">{t('home.desk.traderDna')}</Link>
                            </div>
                        </section>

                        <section className="desk2-card desk2-card--fill glass-card">
                            <span className="desk2-card__label">{t('home.desk.journalSnapshot')}</span>
                            <ul className="desk2-trades">
                                {(analytics.recentTrades || []).slice(0, 3).map((trade, i) => {
                                    const pnl = Number(trade.pnl);
                                    const win = (trade.result || '').toLowerCase() === 'win' || pnl > 0;
                                    const tag = pnl > 0 || win ? t('home.desk.winTag') : pnl < 0 ? t('home.desk.lossTag') : t('home.desk.tradeTag');
                                    return (
                                        <li key={`${trade.pair}-${i}`}>
                                            <span>
                                                {tag} · {trade.pair || t('common.dash')}
                                            </span>
                                            <span className={pnl >= 0 ? 'is-up' : 'is-down'}>
                                                {Number.isFinite(pnl) ? formatSignedCurrency(pnl) : t('common.dash')}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                            {!analytics.recentTrades?.length ? (
                                <p className="desk2-muted">{t('home.desk.journalEmptyTrades')}</p>
                            ) : null}
                            <span className="desk2-card__sublabel">{t('home.desk.notes')}</span>
                            <ul className="desk2-notes">
                                {journalBullets.map((line) => (
                                    <li key={line}>{line}</li>
                                ))}
                            </ul>
                            <button type="button" className="desk2-cta desk2-cta--ghost" onClick={() => navigate('/journal')}>
                                {t('home.desk.journalButton')} <FaArrowRight aria-hidden />
                            </button>
                        </section>
                    </aside>
                </div>
            </div>
        </div>
    );
};

/* ══════════════════════════════════════════════════════════
   HOME PAGE
══════════════════════════════════════════════════════════ */
const Home = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { isAuthenticated, user, token } = useAuth();
    const slides = useMemo(() => buildSlides(t), [t, i18n.language]);
    // Cinematic intro only for visitors who are not signed in (normal landing).
    // After login (or any authenticated session), skip the delay so the dashboard is immediate.
    const [showContent, setShowContent] = useState(() => isAuthenticated);
    const [isLoading, setIsLoading] = useState(() => !isAuthenticated);

    useEffect(() => {
        if (isAuthenticated) {
            setIsLoading(false);
            setShowContent(true);
            return undefined;
        }
        const introTimer = setTimeout(() => {
            setIsLoading(false);
            setShowContent(true);
        }, 3000);
        return () => clearTimeout(introTimer);
    }, [isAuthenticated]);

    const handleStart = () => navigate(isAuthenticated ? '/community' : '/register');

    return (
        <>
            {isLoading && (
                <div className="loading-screen">
                    <CosmicBackground />
                    <div className="loading-content">
                        <span className="loading-brand-text">{t('homeLoading.brand')}</span>
                        <div className="loading-subtitle">{t('homeLoading.subtitle')}</div>
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
                                        <span className="hero-eyebrow-text">{t('home.marketing.heroEyebrow')}</span>
                                    </div>
                                    <div className="brand-name-container">
                                        <h1 className="brand-name">
                                            <span className="brand-name-line">{t('home.marketing.brandLine1')}</span>
                                            <span className="brand-name-line">{t('home.marketing.brandLine2')}</span>
                                        </h1>
                                        <p className="powered-by-glitch">{t('home.marketing.poweredBy')} <strong>{t('home.marketing.poweredByStrong')}</strong></p>
                                    </div>
                                    <div className="content-intro hero-intro">
                                        <p className="intro-text">{t('home.marketing.introText')}</p>
                                    </div>
                                    <div className="home-cta-section hero-cta">
                                        <button className="home-cta-button"      onClick={handleStart}>{t('home.marketing.getStarted')}</button>
                                        <button className="home-secondary-button" onClick={() => navigate('/explore')}>{t('home.marketing.exploreFeatures')}</button>
                                    </div>
                                    <div className="hero-trust-badges">
                                        {[{icon:'✓',label:t('home.marketing.trustRealtime')},{icon:'🔒',label:t('home.marketing.trustSecure')},{icon:'⊙',label:t('home.marketing.trustSupport')}].map(b=>(
                                            <div className="trust-badge" key={b.label}><div className="trust-badge-icon">{b.icon}</div>{b.label}</div>
                                        ))}
                                    </div>
                                    <div className="partner-logos-row">
                                        {[{icon:'📊',name:t('home.marketing.partnerTradingView')},{icon:'◈',name:t('home.marketing.partnerBinance')},{icon:'©',name:t('home.marketing.partnerCoinbase')},{icon:'◉',name:t('home.marketing.partnerBloomberg')},{icon:'◎',name:t('home.marketing.partnerReuters')}].map(p=>(
                                            <div className="partner-logo" key={p.name}><span className="partner-logo-icon">{p.icon}</span>{p.name}</div>
                                        ))}
                                    </div>
                                </div>
                                <div className="hero-right"><FloatingIPad slides={slides} dragHint={t('home.ipad.dragHint')} /></div>
                            </div>

                            <div className="home-main-content">
                                <div className="market-ticker-wrapper">
                                    <MarketTicker compact={true} showTabs={false} showViewAll={true} autoScroll={true} />
                                </div>
                                <div className="cosmic-divider" />

                                <div className="feature-cards-grid">
                                    {[
                                        { icon: '📈', title: t('home.features.forexTitle'), desc: t('home.features.forexDesc') },
                                        { icon: '💹', title: t('home.features.stockTitle'), desc: t('home.features.stockDesc') },
                                        { icon: '₿', title: t('home.features.cryptoTitle'), desc: t('home.features.cryptoDesc') },
                                        { icon: '🎯', title: t('home.features.mentorshipTitle'), desc: t('home.features.mentorshipDesc') },
                                    ].map((c) => (
                                        <div className="feature-card" key={c.title}>
                                            <div className="feature-icon">{c.icon}</div>
                                            <h3 className="feature-title">{c.title}</h3>
                                            <p className="feature-description">{c.desc}</p>
                                        </div>
                                    ))}
                                </div>

                                <div className="stats-section">
                                    <div className="stats-grid">
                                        <StatItem number="24.7%" label={t('home.stats.avgRoi')} fill="82%"/>
                                        <StatItem number="1,200+" label={t('home.stats.activeTraders')} fill="90%"/>
                                        <StatItem number="85%" label={t('home.stats.successRate')} fill="85%"/>
                                        <StatItem number="50+" label={t('home.stats.expertCourses')} fill="60%"/>
                                    </div>
                                </div>
                                <div className="cosmic-divider" />

                                <div className="why-choose-section">
                                    <h2 className="section-title">{t('home.why.title')}</h2>
                                    <div className="why-grid">
                                        {[
                                            { title: t('home.why.eliteEducationTitle'), text: t('home.why.eliteEducationText') },
                                            { title: t('home.why.provenStrategiesTitle'), text: t('home.why.provenStrategiesText') },
                                            { title: t('home.why.support247Title'), text: t('home.why.support247Text') },
                                            { title: t('home.why.resourcesTitle'), text: t('home.why.resourcesText') },
                                        ].map((w) => (
                                            <div className="why-item" key={w.title}>
                                                <div className="why-icon">✓</div>
                                                <h3 className="why-title">{w.title}</h3>
                                                <p className="why-text">{w.text}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="trade-markets-section">
                                    <h2 className="trade-markets-section__title">{t('home.tradeMarkets.title')}</h2>
                                    <div className="trade-markets-section__grid">
                                        {[
                                            { icon: <FaChartLine />, title: t('home.tradeMarkets.forexTitle'), desc: t('home.tradeMarkets.forexDesc') },
                                            { icon: <FaGlobe />, title: t('home.tradeMarkets.futuresTitle'), desc: t('home.tradeMarkets.futuresDesc') },
                                            { icon: <FaRocket />, title: t('home.tradeMarkets.cryptoTitle'), desc: t('home.tradeMarkets.cryptoDesc') },
                                            { icon: <FaTrophy />, title: t('home.tradeMarkets.stocksTitle'), desc: t('home.tradeMarkets.stocksDesc') },
                                            { icon: <FaChartBar />, title: t('home.tradeMarkets.indicesTitle'), desc: t('home.tradeMarkets.indicesDesc') },
                                            { icon: <FaCoins />, title: t('home.tradeMarkets.commoditiesTitle'), desc: t('home.tradeMarkets.commoditiesDesc') },
                                        ].map((m) => (
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
                                    <h2 className="section-title">{t('home.keyFeatures.title')}</h2>
                                    <div className="features-list">
                                        {[
                                            { icon: <FaShieldAlt />, title: t('home.keyFeatures.securityTitle'), text: t('home.keyFeatures.securityText') },
                                            { icon: <FaClock />, title: t('home.keyFeatures.premiumSupportTitle'), text: t('home.keyFeatures.premiumSupportText') },
                                            { icon: <FaUsers />, title: t('home.keyFeatures.communityTitle'), text: t('home.keyFeatures.communityText') },
                                            { icon: <FaGraduationCap />, title: t('home.keyFeatures.mentorsTitle'), text: t('home.keyFeatures.mentorsText') },
                                        ].map((f) => (
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