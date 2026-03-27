-- Referral / affiliate tables — run once on your MySQL database (idempotent).
-- Safe to re-run: uses IF NOT EXISTS. Use the same database as MYSQL_DATABASE.

-- ---------------------------------------------------------------------------
-- referral_events: commission ledger (required for /api/referral/ledger, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  referrer_user_id BIGINT NOT NULL,
  referred_user_id BIGINT NOT NULL,
  event_type ENUM('signup','paid_conversion','renewal_conversion','milestone','reversal','manual_adjustment') NOT NULL,
  source_table VARCHAR(64) NULL,
  source_id VARCHAR(128) NULL,
  event_status ENUM('pending','approved','payable','paid','reversed','cancelled') NOT NULL DEFAULT 'pending',
  gross_amount_pence BIGINT NOT NULL DEFAULT 0,
  net_amount_pence BIGINT NOT NULL DEFAULT 0,
  commission_rate_bps INT NOT NULL DEFAULT 0,
  commission_amount_pence BIGINT NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'GBP',
  occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payable_after TIMESTAMP NULL,
  paid_out_at TIMESTAMP NULL,
  metadata_json LONGTEXT NULL,
  INDEX idx_referral_events_referrer (referrer_user_id),
  INDEX idx_referral_events_referred (referred_user_id),
  INDEX idx_referral_events_type (event_type),
  INDEX idx_referral_events_status (event_status),
  UNIQUE KEY uq_referral_source_event (source_table, source_id, event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- referral_payouts / referral_payout_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral_payouts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  payout_method ENUM('paypal','bank_transfer','manual') NOT NULL,
  amount_pence BIGINT NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'GBP',
  status ENUM('requested','processing','paid','failed','cancelled') NOT NULL DEFAULT 'requested',
  destination_masked VARCHAR(255) NULL,
  provider_reference VARCHAR(255) NULL,
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP NULL,
  notes VARCHAR(255) NULL,
  metadata_json LONGTEXT NULL,
  INDEX idx_referral_payouts_user (user_id),
  INDEX idx_referral_payouts_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS referral_payout_items (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  payout_id BIGINT NOT NULL,
  referral_event_id BIGINT NOT NULL,
  amount_pence BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_referral_payout_item_event (referral_event_id),
  INDEX idx_referral_payout_items_payout (payout_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Legacy / auxiliary tables (optional but created by the app)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral_conversion (
  id INT AUTO_INCREMENT PRIMARY KEY,
  referrer_user_id INT NOT NULL,
  referee_user_id INT NOT NULL,
  event_type ENUM('subscription','course') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_referee_event (referee_user_id, event_type),
  INDEX idx_referrer_type (referrer_user_id, event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS referral_attributions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  referrer_user_id BIGINT NOT NULL,
  referred_user_id BIGINT NOT NULL,
  referral_code_used VARCHAR(64) NOT NULL,
  attribution_source ENUM('register','checkout','manual_admin') NOT NULL DEFAULT 'register',
  first_touch_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_confirmed_at TIMESTAMP NULL,
  status ENUM('active','rejected','fraud_review') NOT NULL DEFAULT 'active',
  notes VARCHAR(255) NULL,
  UNIQUE KEY uq_referral_attribution_referred (referred_user_id),
  INDEX idx_referral_attribution_referrer (referrer_user_id),
  INDEX idx_referral_attribution_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
