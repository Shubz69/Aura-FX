import React, { useEffect, useState, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import '../../styles/aura-analysis/AuraEnterTransition.css';

const FLOATING_ITEMS = [
  'ΣR',
  'Expectancy = (Win% x Avg Win) - (Loss% x Avg Loss)',
  'Sharpe Ratio',
  'Risk %',
  'Drawdown %',
  'Equity',
  '0.01 Lot',
  '1.23%',
  '09:42',
  'RR 1:2',
  'Win %',
  'P/L',
  'Max DD',
  'Sortino',
];

const COLORS = ['#a78bfa', '#60a5fa', '#34d399', '#818cf8', '#22d3ee'];

function usePrefersReducedMotion() {
  const reduced = useReducedMotion();
  const [prefersReduced, setPrefersReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReduced(!!reduced || mq.matches);
    const handler = () => setPrefersReduced(!!reduced || mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [reduced]);
  return prefersReduced;
}

export default function AuraEnterTransition({ onComplete }) {
  const reduced = usePrefersReducedMotion();
  const [startPortal, setStartPortal] = useState(false);

  const positions = useMemo(() => {
    return FLOATING_ITEMS.map((_, i) => {
      const angle = (i / FLOATING_ITEMS.length) * Math.PI * 2 + Math.random() * 0.5;
      const radius = 60 + Math.random() * 35;
      return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        color: COLORS[i % COLORS.length],
        delay: 0.05 * i,
      };
    });
  }, []);

  useEffect(() => {
    if (reduced) {
      const t = setTimeout(onComplete, 320);
      return () => clearTimeout(t);
    }
    const portalStart = 650;
    const id = setTimeout(() => setStartPortal(true), portalStart);
    const done = setTimeout(onComplete, 1650);
    return () => {
      clearTimeout(id);
      clearTimeout(done);
    };
  }, [onComplete, reduced]);

  if (reduced) {
    return (
      <motion.div
        className="aura-enter-transition aura-enter-reduced"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />
    );
  }

  return (
    <motion.div
      className="aura-enter-transition"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      <div className="aura-enter-cosmic" />
      <div className="aura-enter-floats">
        {FLOATING_ITEMS.map((text, i) => {
          const pos = positions[i];
          return (
            <motion.span
              key={i}
              className="aura-enter-float aura-enter-glow"
              style={{ '--float-color': pos.color }}
              initial={{
                x: `${pos.x}vw`,
                y: `${pos.y}vh`,
                opacity: 0.3,
                scale: 0.6,
              }}
              animate={{
                x: 0,
                y: 0,
                opacity: [0.3, 0.85, 0.4],
                scale: [0.6, 1.1, 0.9],
              }}
              transition={{
                type: 'tween',
                ease: [0.25, 0.46, 0.45, 0.94],
                duration: 0.9,
                delay: 0.2 + pos.delay,
              }}
            >
              {text}
            </motion.span>
          );
        })}
      </div>
      <motion.div
        className="aura-enter-portal"
        initial={{ scale: 0, opacity: 0.6 }}
        animate={startPortal ? { scale: 4, opacity: 0 } : { scale: 0, opacity: 0.6 }}
        transition={{
          type: 'tween',
          ease: [0.22, 1, 0.36, 1],
          duration: 0.85,
        }}
      />
    </motion.div>
  );
}
