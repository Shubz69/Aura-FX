import React from 'react';
import { FaChartLine, FaBrain } from 'react-icons/fa';
import '../../styles/trader-deck/TraderDeckGateway.css';

export default function TraderDeckGateway({ onSelect }) {
  return (
    <div className="td-gateway">
      <h2 className="td-gateway-title">Trader Deck</h2>
      <p className="td-gateway-sub">Choose where to start</p>
      <div className="td-gateway-buttons">
        <button
          type="button"
          className="td-gateway-btn"
          onClick={() => onSelect('overview')}
        >
          <FaChartLine className="td-gateway-btn-icon" aria-hidden />
          <span className="td-gateway-btn-label">Overview</span>
          <span className="td-gateway-btn-desc">At a glance: KPIs, calendar & charts</span>
        </button>
        <button
          type="button"
          className="td-gateway-btn"
          onClick={() => onSelect('market-intelligence')}
        >
          <FaBrain className="td-gateway-btn-icon" aria-hidden />
          <span className="td-gateway-btn-label">Market Intelligence</span>
          <span className="td-gateway-btn-desc">Live market data & insights</span>
        </button>
      </div>
    </div>
  );
}
