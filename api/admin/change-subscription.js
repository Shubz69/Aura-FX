// api/admin/change-subscription.js

const { getDbConnection } = require('../../db');
require('../../utils/suppress-warnings');

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

    const { userId, plan } = body || {};

    if (!userId || !plan) {
      return res.status(400).json({
        success: false,
        message: "User ID and plan are required"
      });
    }

    const validPlans = ['free', 'premium', 'a7fx', 'elite'];

    if (!validPlans.includes(plan)) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan. Use free, premium, a7fx, elite"
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
      adminCheck[0].email !== 'shubzfx@gmail.com'
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

    /* ---------------- PLAN LOGIC ---------------- */

    let newRole = "free";

    if (plan === "premium") newRole = "premium";
    if (plan === "a7fx") newRole = "a7fx";
    if (plan === "elite") newRole = "a7fx";

    let expiryDate = null;

    if (plan !== "free") {
      expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 90);
    }

    /* ---------------- UPDATE USER ---------------- */

    const [updateResult] = await db.execute(
      `UPDATE users 
       SET subscription_plan = ?,
           role = ?,
           subscription_status = ?,
           subscription_expiry = ?
       WHERE id = ?`,
      [
        plan,
        newRole,
        plan === "free" ? "inactive" : "active",
        expiryDate,
        userId
      ]
    );

    log("info", "Subscription updated", {
      userId,
      userEmail,
      oldPlan,
      newPlan: plan
    });

    return res.status(200).json({
      success: true,
      message: `Subscription changed to ${plan}`,
      user: {
        id: userId,
        email: userEmail,
        oldPlan,
        newPlan: plan
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