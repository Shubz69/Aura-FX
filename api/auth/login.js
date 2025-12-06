const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

// Get database connection
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const emailLower = email.toLowerCase();

    // Connect to database
    let db = null;
    try {
      db = await getDbConnection();
      if (!db) {
        console.error('Failed to establish database connection - missing environment variables or connection failed');
        return res.status(500).json({
          success: false,
          message: 'Database connection error. Please try again later.'
        });
      }
    } catch (connError) {
      console.error('Database connection error:', connError);
      return res.status(500).json({
        success: false,
        message: 'Database connection error. Please try again later.'
      });
    }

    try {
      // Find user by email
      const [users] = await db.execute(
        'SELECT * FROM users WHERE email = ?',
        [emailLower]
      );

      if (!users || users.length === 0) {
        if (db && !db.ended) {
          try {
            await db.end();
          } catch (e) {
            console.warn('Error closing DB connection:', e.message);
          }
        }
        return res.status(404).json({
          success: false,
          message: 'No account with this email exists. Please check your email or sign up for a new account.'
        });
      }

      const user = users[0];

      // Verify password
      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        if (db && !db.ended) {
          try {
            await db.end();
          } catch (e) {
            console.warn('Error closing DB connection:', e.message);
          }
        }
        return res.status(401).json({
          success: false,
          message: 'Incorrect password. Please try again or reset your password.'
        });
      }

      // Update last_seen
      await db.execute(
        'UPDATE users SET last_seen = NOW() WHERE id = ?',
        [user.id]
      );

      // Check subscription status (add columns if they don't exist)
      let subscriptionStatus = 'inactive';
      let subscriptionExpiry = null;
      try {
        // Try to get subscription columns
        const [subscriptionData] = await db.execute(
          'SELECT subscription_status, subscription_expiry FROM users WHERE id = ?',
          [user.id]
        );
        if (subscriptionData && subscriptionData.length > 0) {
          subscriptionStatus = subscriptionData[0].subscription_status || 'inactive';
          subscriptionExpiry = subscriptionData[0].subscription_expiry;
          
          // Check if subscription is still valid
          if (subscriptionStatus === 'active' && subscriptionExpiry) {
            const expiryDate = new Date(subscriptionExpiry);
            if (expiryDate < new Date()) {
              // Subscription expired
              subscriptionStatus = 'expired';
              await db.execute(
                'UPDATE users SET subscription_status = ? WHERE id = ?',
                ['expired', user.id]
              );
            }
          }
        }
      } catch (err) {
        // Columns don't exist yet, they'll be created when subscription is activated
        console.log('Subscription columns not found, will be created on first subscription');
      }

      // Generate JWT token (3-part format: header.payload.signature)
      // Convert to base64url (replace + with -, / with _, remove = padding)
      const toBase64Url = (str) => {
        return Buffer.from(str).toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=/g, '');
      };
      
      const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = toBase64Url(JSON.stringify({
        id: user.id,
        email: user.email,
        username: user.username || user.email.split('@')[0],
        role: user.role || 'USER',
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
      }));
      const signature = toBase64Url('signature-' + Date.now());
      const token = `${header}.${payload}.${signature}`;
      
      console.log('Generated login token (length):', token.length, 'parts:', token.split('.').length);

      await db.end();

      return res.status(200).json({
        success: true,
        id: user.id,
        username: user.username || user.email.split('@')[0],
        email: user.email,
        name: user.name || user.username,
        avatar: user.avatar || '/avatars/avatar_ai.png',
        role: user.role || 'USER',
        token: token,
        status: 'SUCCESS',
        subscription: {
          status: subscriptionStatus,
          expiry: subscriptionExpiry
        }
      });
    } catch (dbError) {
      console.error('Database error during login:', dbError);
      if (db && !db.ended) {
        try {
          await db.end();
        } catch (e) {
          console.warn('Error closing DB connection after error:', e.message);
        }
      }
      return res.status(500).json({
        success: false,
        message: 'Database error. Please try again later.',
        error: process.env.NODE_ENV === 'development' ? dbError.message : undefined
      });
    }
  } catch (error) {
    console.error('Error during login:', error);
    return res.status(500).json({
      success: false,
      message: 'Login failed. Please try again later.'
    });
  }
};

