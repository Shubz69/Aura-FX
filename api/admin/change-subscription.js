// api/admin/change-subscription.js

const { getDbConnection } = require('../db');
const { isSuperAdminEmail } = require('../utils/entitlements');
require('../utils/suppress-warnings');

const log = (level, message, data = {}) => {
  console.log(JSON.stringify({
    time: new Date().toISOString(),
    level,
    endpoint: "change-subscription",
    message,
    ...data
  }));
};

module.exports = async (req, res) => {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  let db;

  try {

    /* ---------------- BODY SAFE PARSE ---------------- */

    let body = req.body;

    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({
          success: false,
          message: "Invalid JSON body"
        });
      }
    }

    const { userId, plan, durationDays: durationRaw } = body || {};

    if (!userId || !plan) {
      return res.status(400).json({
        success: false,
        message: "User ID and plan are required"
      });
    }

    const validPlans = ['free', 'premium', 'aura', 'a7fx', 'elite'];

    if (!validPlans.includes(plan)) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan. Use free, premium, aura, a7fx, elite"
      });
    }

    /* ---------------- AUTH ---------------- */

    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const parts = token.split('.');

    if (parts.length !== 3) {
      return res.status(401).json({
        success: false,
        message: "Invalid token"
      });
    }

    /* ---------------- TOKEN DECODE ---------------- */

    let decoded;

    try {

      const payloadBase64 = parts[1]
        .replace(/-/g, '+')
        .replace(/_/g, '/');

      const payload = Buffer.from(payloadBase64, 'base64').toString('utf8');

      decoded = JSON.parse(payload);

    } catch (err) {

      return res.status(401).json({
        success: false,
        message: "Invalid token payload"
      });

    }

    /* ---------------- DB CONNECT ---------------- */

    db = await getDbConnection();

    if (!db) {
      return res.status(500).json({
        success: false,
        message: "Database connection failed"
      });
    }

    /* ---------------- VERIFY ADMIN ---------------- */

    const [adminCheck] = await db.execute(
      'SELECT role, email FROM users WHERE id = ?',
      [decoded.id]
    );

    if (adminCheck.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Admin not found"
      });
    }

    const adminRole = adminCheck[0].role?.toLowerCase();

    if (
      adminRole !== 'admin' &&
      adminRole !== 'super_admin' &&
      !isSuperAdminEmail(adminCheck[0])
    ) {
      return res.status(403).json({
        success: false,
        message: "Admin access required"
      });
    }

    /* ---------------- FIND TARGET USER ---------------- */

    const [userCheck] = await db.execute(
      'SELECT email, subscription_plan, role FROM users WHERE id = ?',
      [userId]
    );

    if (userCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const userEmail = userCheck[0].email;
    const oldPlan = userCheck[0].subscription_plan || "free";

    /* ---------------- PLAN + DURATION ---------------- */

    let newRole = "free";
    if (plan === "premium" || plan === "aura") newRole = "premium";
    if (plan === "a7fx" || plan === "elite") newRole = "a7fx";

    let durationDays = 90;
    if (plan !== "free") {
      const parsed = parseInt(durationRaw, 10);
      if (Number.isFinite(parsed) && parsed >= 1) {
        durationDays = Math.min(3650, parsed);
      }
    }

    let expiryDate = null;
    if (plan !== "free") {
      expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + durationDays);
    }

    const subscriptionStatus = plan === "free" ? "inactive" : "active";
    /* Clear payment_failed when admin sets access (same as successful Stripe path). */
    const paymentFailed = 0;

    /* ---------------- UPDATE USER ---------------- */

    const [updateResult] = await db.execute(
      `UPDATE users 
       SET subscription_plan = ?,
           role = ?,
           subscription_status = ?,
           subscription_expiry = ?,
           payment_failed = ?
       WHERE id = ?`,
      [
        plan,
        newRole,
        subscriptionStatus,
        expiryDate,
        paymentFailed,
        userId
      ]
    );

    log("info", "Subscription updated", {
      userId,
      userEmail,
      oldPlan,
      newPlan: plan,
      durationDays: plan === "free" ? null : durationDays,
      expiry: expiryDate ? expiryDate.toISOString() : null
    });

    return res.status(200).json({
      success: true,
      message:
        plan === "free"
          ? `Subscription set to free`
          : `Subscription set to ${plan} for ${durationDays} day(s)`,
      user: {
        id: userId,
        email: userEmail,
        oldPlan,
        newPlan: plan,
        role: newRole,
        durationDays: plan === "free" ? null : durationDays,
        subscription_expiry: expiryDate ? expiryDate.toISOString() : null
      }
    });

  } catch (error) {

    log("error", "Subscription change failed", {
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      message: error.message || "Server error"
    });

  } finally {

    try {
      if (db) await db.end();
    } catch {}

  }

};