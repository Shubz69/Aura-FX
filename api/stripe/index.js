const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');

const getDbConnection = async () => {
  if (!process.env.MYSQL_HOST || !process.env.MYSQL_USER || !process.env.MYSQL_PASSWORD || !process.env.MYSQL_DATABASE) {
    return null;
  }

  try {
    const connectionConfig = {
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT) : 3306,
      connectTimeout: 10000
    };

    if (process.env.MYSQL_SSL === 'true') {
      connectionConfig.ssl = { rejectUnauthorized: false };
    } else {
      connectionConfig.ssl = false;
    }

    const connection = await mysql.createConnection(connectionConfig);
    await connection.ping();
    return connection;
  } catch (error) {
    console.error('Database connection error:', error);
    return null;
  }
};

// Email transporter for sending subscription cancellation emails
const createEmailTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('Email credentials not configured - subscription cancellation emails will not be sent');
    return null;
  }

  try {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  } catch (error) {
    console.error('Failed to create email transporter:', error);
    return null;
  }
};

const sendSubscriptionCancellationEmail = async (userEmail, userName) => {
  const transporter = createEmailTransporter();
  if (!transporter) {
    return { sent: false, reason: 'transporter_not_configured' };
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: userEmail,
      subject: '⚠️ Your AURA FX Subscription Has Been Cancelled',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #d32f2f;">⚠️ Subscription Cancelled</h2>
          <p>Dear ${userName || 'Valued Member'},</p>
          <p>We regret to inform you that your AURA FX subscription has been cancelled due to a payment failure.</p>
          <p><strong>What this means:</strong></p>
          <ul>
            <li>Your access to the community has been temporarily suspended</li>
            <li>You will no longer be able to post messages or access premium features</li>
            <li>Your subscription status has been set to inactive</li>
          </ul>
          <p><strong>To restore your access:</strong></p>
          <ol>
            <li>Update your payment method in your Stripe account</li>
            <li>Complete the payment for your subscription</li>
            <li>Your access will be automatically restored once payment is successful</li>
          </ol>
          <p>If you believe this is an error or need assistance, please contact our support team immediately.</p>
          <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px;">
            Best regards,<br>
            The AURA FX Team
          </p>
        </div>
      `
    });
    return { sent: true };
  } catch (error) {
    console.error('Failed to send subscription cancellation email:', error);
    return { sent: false, reason: error.message };
  }
};

module.exports = async (req, res) => {
  // Handle CORS
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, stripe-signature');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Extract pathname to determine which endpoint
  let pathname = '';
  try {
    if (req.url) {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      pathname = url.pathname;
    } else if (req.path) {
      pathname = req.path;
    }
  } catch (e) {
    pathname = req.url || '';
  }

  // Handle /api/stripe/subscription-success
  if (pathname.includes('/subscription-success') || pathname.endsWith('/subscription-success')) {
    try {
      const userId = req.query.userId || req.body?.userId;
      const sessionId = req.query.session_id || req.body?.session_id;
      const planType = req.query.plan || req.body?.plan || 'aura'; // Default to 'aura' if not specified
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required'
        });
      }

      const db = await getDbConnection();
      if (!db) {
        return res.status(500).json({
          success: false,
          message: 'Database connection error'
        });
      }

      try {
        // Check if subscription_status column exists, if not add it
        try {
          await db.execute('SELECT subscription_status FROM users LIMIT 1');
        } catch (err) {
          console.log('Adding subscription columns to users table');
          await db.execute(`
            ALTER TABLE users 
            ADD COLUMN subscription_status VARCHAR(50) DEFAULT 'inactive',
            ADD COLUMN subscription_expiry DATETIME NULL,
            ADD COLUMN subscription_started DATETIME NULL,
            ADD COLUMN stripe_session_id VARCHAR(255) NULL,
            ADD COLUMN payment_failed BOOLEAN DEFAULT FALSE,
            ADD COLUMN subscription_plan VARCHAR(50) DEFAULT NULL
          `);
        }

        // Check if subscription_plan column exists, add if not
        try {
          await db.execute('SELECT subscription_plan FROM users LIMIT 1');
        } catch (err) {
          await db.execute('ALTER TABLE users ADD COLUMN subscription_plan VARCHAR(50) DEFAULT NULL');
        }

        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30); // 1 month subscription

        // Determine role based on plan type
        let userRole = 'premium'; // Default to premium for Aura FX
        if (planType === 'a7fx' || planType === 'A7FX' || planType === 'elite') {
          userRole = 'a7fx'; // A7FX Elite subscription
        }

        // Update subscription status AND role based on plan
        await db.execute(
          `UPDATE users 
           SET subscription_status = 'active',
               subscription_expiry = ?,
               subscription_started = NOW(),
               stripe_session_id = ?,
               payment_failed = FALSE,
               role = ?,
               subscription_plan = ?
           WHERE id = ?`,
          [expiryDate, sessionId || null, userRole, planType, userId]
        );

        const [updatedUser] = await db.execute(
          'SELECT id, subscription_status, subscription_expiry FROM users WHERE id = ?',
          [userId]
        );

        await db.end();

        if (updatedUser && updatedUser.length > 0) {
          return res.status(200).json({
            success: true,
            message: 'Subscription activated successfully',
            subscription: {
              status: updatedUser[0].subscription_status,
              expiry: updatedUser[0].subscription_expiry
            }
          });
        } else {
          return res.status(404).json({
            success: false,
            message: 'User not found'
          });
        }
      } catch (dbError) {
        console.error('Database error updating subscription:', dbError);
        if (db && !db.ended) await db.end();
        return res.status(500).json({
          success: false,
          message: 'Failed to update subscription status'
        });
      }
    } catch (error) {
      console.error('Error in subscription success handler:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Handle /api/stripe/webhook
  if (pathname.includes('/webhook') || pathname.endsWith('/webhook')) {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    try {
      const event = req.body;
      
      if (event.type === 'invoice.payment_failed' || event.type === 'customer.subscription.deleted') {
        const customerId = event.data.object.customer;
        const subscriptionId = event.data.object.subscription || event.data.object.id;
        
        console.log('Payment failed for customer:', customerId, 'subscription:', subscriptionId);
        
        const db = await getDbConnection();
        if (!db) {
          console.error('Database connection failed for webhook');
          return res.status(500).json({ success: false, message: 'Database connection error' });
        }

        try {
          let userId = null;
          
          if (event.data.object.customer_email) {
            const [userRows] = await db.execute(
              'SELECT id FROM users WHERE email = ?',
              [event.data.object.customer_email]
            );
            if (userRows.length > 0) {
              userId = userRows[0].id;
            }
          }

          if (userId) {
            // Get user email and name before updating
            const [userRows] = await db.execute(
              'SELECT email, name, username FROM users WHERE id = ?',
              [userId]
            );
            const userEmail = userRows[0]?.email;
            const userName = userRows[0]?.name || userRows[0]?.username || 'Valued Member';
            
            // Update subscription status
            await db.execute(
              'UPDATE users SET payment_failed = TRUE, subscription_status = ?, role = ? WHERE id = ?',
              ['inactive', 'free', userId]
            );
            console.log('Marked payment as failed for user:', userId);
            
            // Send email notification
            if (userEmail) {
              try {
                await sendSubscriptionCancellationEmail(userEmail, userName);
                console.log('Subscription cancellation email sent to:', userEmail);
              } catch (emailError) {
                console.error('Failed to send cancellation email:', emailError);
              }
            }
          }
          
          await db.end();
        } catch (dbError) {
          console.error('Database error in webhook:', dbError);
          if (db && !db.ended) await db.end();
        }
      } else if (event.type === 'invoice.payment_succeeded') {
        const customerId = event.data.object.customer;
        
        const db = await getDbConnection();
        if (!db) {
          return res.status(500).json({ success: false, message: 'Database connection error' });
        }

        try {
          let userId = null;
          
          if (event.data.object.customer_email) {
            const [userRows] = await db.execute(
              'SELECT id FROM users WHERE email = ?',
              [event.data.object.customer_email]
            );
            if (userRows.length > 0) {
              userId = userRows[0].id;
            }
          }

          if (userId) {
            // Get user's current subscription plan to maintain correct role
            const [userRows] = await db.execute(
              'SELECT subscription_plan FROM users WHERE id = ?',
              [userId]
            );
            const subscriptionPlan = userRows[0]?.subscription_plan || 'aura';
            const userRole = (subscriptionPlan === 'a7fx' || subscriptionPlan === 'A7FX' || subscriptionPlan === 'elite') ? 'a7fx' : 'premium';
            
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + 30); // 1 month from now
            
            await db.execute(
              'UPDATE users SET payment_failed = FALSE, subscription_status = ?, subscription_expiry = ?, role = ? WHERE id = ?',
              ['active', expiryDate.toISOString().slice(0, 19).replace('T', ' '), userRole, userId]
            );
            console.log('Reactivated subscription for user:', userId, 'with role:', userRole);
          }
          
          await db.end();
        } catch (dbError) {
          console.error('Database error in webhook:', dbError);
          if (db && !db.ended) await db.end();
        }
      }

      return res.status(200).json({ received: true });
    } catch (error) {
      console.error('Error processing webhook:', error);
      return res.status(500).json({ success: false, message: 'Error processing webhook' });
    }
  }

  // Handle /api/stripe/create-subscription
  if (pathname.includes('/create-subscription') || pathname.endsWith('/create-subscription')) {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    try {
      // Placeholder - Stripe integration pending
      return res.status(200).json({
        success: true,
        message: 'Stripe integration pending. Please contact support for subscription setup.',
        checkoutUrl: null
      });
    } catch (error) {
      console.error('Error creating subscription:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to create subscription. Please try again later.' 
      });
    }
  }

  // Handle /api/stripe/direct-checkout
  if (pathname.includes('/direct-checkout') || pathname.endsWith('/direct-checkout')) {
    if (req.method !== 'GET') {
      return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    try {
      const { courseId } = req.query;
      // Placeholder - redirect to subscription page
      return res.redirect(302, `${process.env.FRONTEND_URL || 'https://www.aurafx.com'}/subscription`);
    } catch (error) {
      console.error('Error creating checkout:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to create checkout session.' 
      });
    }
  }

  return res.status(404).json({ success: false, message: 'Stripe endpoint not found' });
};

