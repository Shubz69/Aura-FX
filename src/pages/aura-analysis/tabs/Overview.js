import React from 'react';
import { useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import '../../../styles/aura-analysis/AuraTabSection.css';

const METRICS = [
  { id: 'equity', label: 'Equity' },
  { id: 'netPl', label: 'Net P/L' },
  { id: 'winRate', label: 'Win Rate' },
  { id: 'profitFactor', label: 'Profit Factor' },
  { id: 'expectancy', label: 'Expectancy' },
  { id: 'avgRR', label: 'Average RR' },
  { id: 'maxDD', label: 'Max Drawdown' },
  { id: 'currentDD', label: 'Current Drawdown' },
  { id: 'riskUsage', label: 'Risk Usage' },
  { id: 'disciplineScore', label: 'Discipline Score' },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: (reduced) => ({
    opacity: 1,
    transition: reduced
      ? { duration: 0.2 }
      : {
          staggerChildren: 0.26,
          delayChildren: 0.15,
        },
  }),
};

const itemVariants = (reduced) =>
  reduced
    ? {}
    : {
        hidden: { opacity: 0, scale: 0.94 },
        visible: {
          opacity: 1,
          scale: 1,
          transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
        },
      };

const pageVariants = (reduced, fromTransition) =>
  reduced || !fromTransition
    ? {}
    : {
        hidden: { opacity: 0, scale: 0.98 },
        visible: {
          opacity: 1,
          scale: 1,
          transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
        },
      };

export default function Overview() {
  const location = useLocation();
  const reduced = useReducedMotion();
  const fromTransition = location.state?.fromTransition === true;

  return (
    <motion.div
      className="aura-tab-page"
      variants={pageVariants(!!reduced, fromTransition)}
      initial="hidden"
      animate="visible"
    >
      <h1 className="aura-tab-title">Command Center</h1>
      <p className="aura-tab-sub">High-level metrics at a glance</p>
      <motion.div
        className="aura-tab-grid"
        variants={containerVariants(!!reduced)}
        initial="hidden"
        animate="visible"
        custom={!!reduced}
      >
        {METRICS.map((m, i) => (
          <motion.div
            key={m.id}
            className="aura-tab-card"
            variants={itemVariants(!!reduced)}
          >
            <div className="aura-tab-card-label">{m.label}</div>
            <div className="aura-tab-card-value">—</div>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}
