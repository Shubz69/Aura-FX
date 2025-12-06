const mysql = require('mysql2/promise');

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
            ADD COLUMN payment_failed BOOLEAN DEFAULT FALSE
          `);
        }

        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 90); // 3 months free trial

        await db.execute(
          `UPDATE users 
           SET subscription_status = 'active',
               subscription_expiry = ?,
               subscription_started = NOW(),
               stripe_session_id = ?,
               payment_failed = FALSE
           WHERE id = ?`,
          [expiryDate, sessionId || null, userId]
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
            await db.execute(
              'UPDATE users SET payment_failed = TRUE, subscription_status = ? WHERE id = ?',
              ['inactive', userId]
            );
            console.log('Marked payment as failed for user:', userId);
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
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + 30); // 1 month from now
            
            await db.execute(
              'UPDATE users SET payment_failed = FALSE, subscription_status = ?, subscription_expiry = ? WHERE id = ?',
              ['active', expiryDate.toISOString().slice(0, 19).replace('T', ' '), userId]
            );
            console.log('Reactivated subscription for user:', userId);
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
      return res.redirect(302, `${process.env.FRONTEND_URL || 'https://www.theglitch.world'}/subscription`);
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

