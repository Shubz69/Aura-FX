import pool from "../config/db.js";
import { encrypt } from "../services/encryption.js";
import {
  syncWithPython,
  getLiveStats
} from "../services/pythonBridge.js";

/* =====================================================
   LINK MT5 ACCOUNT
===================================================== */

export const linkMT5Account = async (req, res) => {
  try {
    const { login, password, server } = req.body;
    const userId = req.user.id;

    if (!login || !password || !server) {
      return res.status(400).json({
        status: "error",
        message: "Invalid input"
      });
    }

    const accountLogin = Number(login);

    /* ---------- Prevent duplicates ---------- */
    const existing = await pool.query(
      `SELECT id FROM mt5_accounts
       WHERE user_id=$1 AND account_login=$2`,
      [userId, accountLogin]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        status: "error",
        message: "Account already linked"
      });
    } 

    /* ---------- Verify with broker FIRST ---------- */
    const verify = await syncWithPython({
      account_login: accountLogin,
      broker_server: server,
      password:password
    });

    if (verify.status !== "success") {
      return res.status(401).json({
        status: "error",
        message: "Broker verification failed"
      });
    }

    /* ---------- Encrypt AFTER success ---------- */
    const encrypted = encrypt(password);

    /* ---------- Save account ---------- */
    const newLink = await pool.query(
      `INSERT INTO mt5_accounts
       (user_id, account_login, broker_server,
        enc_password, iv, tag)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, account_login, broker_server`,
      [
        userId,
        accountLogin,
        server,
        encrypted.content,
        encrypted.iv,
        encrypted.tag
      ]
    );

    res.status(201).json({
      status: "success",
      message: "Account linked successfully",
      account: newLink.rows[0],
      data: verify.data
    });

  } catch (err) {
    console.error("Link MT5 Error:", err);

    res.status(500).json({
      status: "error",
      message: "Server error"
    });
  }
};


/* =====================================================
   REFRESH ACCOUNT DATA
===================================================== */

export const refreshAccountData = async (req, res) => {
  try {
    const { accountId } = req.params;
    const userId = req.user.id;

    const account = await pool.query(
      `SELECT *
       FROM mt5_accounts
       WHERE id=$1 AND user_id=$2`,
      [accountId, userId]
    );

    if (account.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Account not found"
      });
    }

    const data = await getLiveStats(
      account.rows[0]
    );

    res.json({
      status: "success",
      data
    });

  } catch (err) {
    console.error("Refresh Error:", err);

    res.status(500).json({
      status: "error",
      message: "Server error"
    });
  }
};