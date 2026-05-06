import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { isPremium } from '../../utils/roles';

const VALIDATOR_BASE = '/trader-deck/trade-validator';

/**
 * Center nav for Trader Lab terminal bar — same destinations as main navbar + Saved trades.
 */
export default function TraderLabShellNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const auraAiHref = isPremium(user) ? '/premium-ai' : '/subscription';

  const isActive = (path) => {
    if (!path) return false;
    if (path.startsWith('http')) return false;
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  const tabClass = (path) =>
    `tlab-shell-nav__tab${isActive(path) ? ' tlab-shell-nav__tab--active' : ''}`;

  return (
    <nav className="tlab-shell-nav" aria-label="Trader Lab quick navigation">
      <Link className={tabClass('/')} to="/">
        {t('navbar.home')}
      </Link>
      <Link className={tabClass('/community')} to="/community">
        {t('navbar.network')}
      </Link>
      <Link
        className={`tlab-shell-nav__tab${pathname.startsWith('/premium-ai') || pathname.startsWith('/subscription') ? ' tlab-shell-nav__tab--active' : ''}`}
        to={auraAiHref}
      >
        {t('navbar.auraAi')}
      </Link>
      <Link className={tabClass('/courses')} to="/courses">
        C &amp; S
      </Link>
      <Link className={tabClass('/leaderboard')} to="/leaderboard">
        {t('navbar.leaderboard')}
      </Link>
      <Link className={tabClass(`${VALIDATOR_BASE}/trader-lab/saved-trades`)} to={`${VALIDATOR_BASE}/trader-lab/saved-trades`}>
        Saved trades
      </Link>
    </nav>
  );
}
