import React, { useEffect, useState, useMemo } from 'react';
import { motion, useMotionValue, animate } from 'framer-motion';
import '../../styles/aura-analysis/AuraEnterTransition.css';

const GALAXY_ITEMS = [
  'ΣR', 'R-multiple', 'Expectancy', 'Win% × Avg Win − Loss% × Avg Loss',
  'Sharpe', 'Sortino', 'Risk %', 'Drawdown %', 'Max DD', 'Equity', 'Balance',
  '0.01', '0.02', '0.1 Lot', '1.23%', '2.5%', '09:42', '14:30', 'RR 1:2', 'RR 1:3',
  'Win %', 'P/L', 'P&L', 'Gross', 'Net', 'Commission', 'Spread',
  'ATR', 'SL', 'TP', 'Entry', 'Exit', 'Size', 'Leverage',
  'α', 'β', 'σ', 'μ', 'VaR', 'CAGR', 'MDD', 'Recovery',
  'Kelly %', 'Position size', 'Risk/Reward', 'Hit rate', 'Expectancy = (Win% × Avg Win) − (Loss% × Avg Loss)',
  'Sharpe = (R − Rf) / σ', 'Sortino = (R − Rf) / σ_down', 'Profit Factor', 'PF = Gross Win / Gross Loss',
  '42.5', '1.8', '0.67', '−0.02', '12,450', '98.2%', '3:1',
];

const COLORS = ['#a78bfa', '#c084fc', '#34d399', '#22c55e', '#e9d5ff', '#ffffff', '#a78bfa', '#4ade80'];

function usePrefersReducedMotion() {
  const [prefersReduced, setPrefersReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReduced(mq.matches);
    const handler = () => setPrefersReduced(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return prefersReduced;
}

function useLoadingProgress(onReach100) {
  const progress = useMotionValue(0);
  const [displayProgress, setDisplayProgress] = useState(0);

  useEffect(() => {
    const controls = animate(progress, 100, {
      type: 'tween',
      ease: [0.22, 1, 0.36, 1],
      duration: 1.4,
      onUpdate: (latest) => setDisplayProgress(Math.round(latest)),
      onComplete: () => {
        setDisplayProgress(100);
        onReach100();
      },
    });
    return () => controls.stop();
  }, [onReach100, progress]);

  return { displayProgress };
}

export default function AuraEnterTransition({ onComplete }) {
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState('loading'); // 'loading' | 'zooming' | 'done'

  const onBarComplete = useMemo(
    () => () => {
      setPhase('zooming');
    },
    []
  );

  const { displayProgress } = useLoadingProgress(onBarComplete);

  useEffect(() => {
    if (reduced) return;
    if (phase !== 'zooming') return;
    const t = setTimeout(onComplete, 1200);
    return () => clearTimeout(t);
  }, [phase, onComplete, reduced]);

  const galaxyPositions = useMemo(() => {
    return GALAXY_ITEMS.map((_, i) => {
      const spiralAngle = (i / GALAXY_ITEMS.length) * Math.PI * 8 + Math.random() * 1.2;
      const spiralR = 20 + (i / GALAXY_ITEMS.length) * 55 + Math.random() * 18;
      const x = Math.cos(spiralAngle) * spiralR + (Math.random() - 0.5) * 10;
      const y = Math.sin(spiralAngle) * spiralR + (Math.random() - 0.5) * 10;
      return {
        x,
        y,
        color: COLORS[i % COLORS.length],
        size: 0.55 + Math.random() * 0.65,
        delay: Math.random() * 0.5,
        rotation: (Math.random() - 0.5) * 24,
      };
    });
  }, []);

  if (reduced) {
    return (
      <motion.div
        className="aura-enter-transition aura-enter-reduced"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        <div className="aura-enter-cosmic" />
        <p className="aura-enter-loading-label">Initializing Aura Analysis</p>
        <div className="aura-enter-loading-bar-wrap aura-enter-loading-bar-reduced">
          <div className="aura-enter-loading-track">
            <motion.div
              className="aura-enter-loading-fill"
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              onAnimationComplete={onComplete}
            />
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="aura-enter-transition"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="aura-enter-cosmic" />
      <div className="aura-enter-starfield" aria-hidden="true" />
      <motion.div
        className={`aura-enter-galaxy ${phase === 'loading' ? 'aura-enter-galaxy-spin' : ''}`}
        animate={
          phase === 'zooming'
            ? {
                scale: 4.5,
                opacity: 0,
                filter: 'blur(14px)',
              }
            : {
                scale: 1,
                opacity: 1,
                filter: 'blur(0px)',
                rotate: 0,
              }
        }
        transition={{
          type: 'tween',
          ease: [0.22, 1, 0.36, 1],
          duration: phase === 'zooming' ? 1.15 : 0.5,
        }}
      >
        {GALAXY_ITEMS.map((text, i) => {
          const pos = galaxyPositions[i];
          return (
            <motion.span
              key={i}
              className="aura-enter-galaxy-item"
              style={{
                '--galaxy-color': pos.color,
                '--galaxy-size': pos.size,
                left: `50%`,
                top: `50%`,
                x: `${pos.x}vw`,
                y: `${pos.y}vh`,
                rotate: pos.rotation,
              }}
              initial={{ opacity: 0 }}
              animate={{
                opacity: [0, 0.7, 0.85],
                scale: [0.6, 1],
              }}
              transition={{
                duration: 0.8,
                delay: 0.2 + pos.delay * 0.5,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              {text}
            </motion.span>
          );
        })}
      </motion.div>

      <motion.div
        className="aura-enter-loading-section"
        initial={false}
        animate={{
          opacity: phase === 'loading' ? 1 : 0,
          pointerEvents: phase === 'loading' ? 'auto' : 'none',
        }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
          <p className="aura-enter-loading-label">Initializing Aura Analysis</p>
          <div className="aura-enter-loading-bar-wrap">
            <motion.div
              className="aura-enter-loading-track"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.3 }}
          >
            <motion.div
              className="aura-enter-loading-fill"
              initial={{ width: '0%' }}
              animate={{ width: `${displayProgress}%` }}
              transition={{ type: 'tween', ease: [0.22, 1, 0.36, 1], duration: 0.12 }}
            />
          </motion.div>
          <motion.p
            className="aura-enter-loading-pct"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            {displayProgress}%
          </motion.p>
          </div>
        </motion.div>
    </motion.div>
  );
}
