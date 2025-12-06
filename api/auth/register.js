const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt'); // bcrypt is in package.json

// Get database connection
const getDbConnection = async () => {
  // Check if required environment variables are set
  if (!process.env.MYSQL_HOST || !process.env.MYSQL_USER || !process.env.MYSQL_PASSWORD || !process.env.MYSQL_DATABASE) {
    console.error('Missing MySQL environment variables:', {
      hasHost: !!process.env.MYSQL_HOST,
      hasUser: !!process.env.MYSQL_USER,
      hasPassword: !!process.env.MYSQL_PASSWORD,
      hasDatabase: !!process.env.MYSQL_DATABASE
    });
    return null;
  }

  try {
    const connectionConfig = {
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT) : 3306,
      connectTimeout: 10000,
    };

    // SSL configuration
    if (process.env.MYSQL_SSL === 'true') {
      connectionConfig.ssl = { rejectUnauthorized: false };
    } else {
      connectionConfig.ssl = false;
    }

    console.log('Attempting database connection:', {
      host: connectionConfig.host,
      user: connectionConfig.user,
      database: connectionConfig.database,
      port: connectionConfig.port,
      ssl: connectionConfig.ssl
    });

    const connection = await mysql.createConnection(connectionConfig);
    
    // Test the connection
    await connection.ping();
    
    // Create users table if it doesn't exist
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        avatar VARCHAR(255),
        role VARCHAR(50) DEFAULT 'USER',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    console.log('Database connection successful');
    return connection;
  } catch (error) {
    console.error('Database connection error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      syscall: error.syscall,
      address: error.address,
      port: error.port,
      stack: error.stack
    });
    console.error('Connection config used:', {
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      database: process.env.MYSQL_DATABASE,
      port: process.env.MYSQL_PORT || 3306,
      ssl: process.env.MYSQL_SSL
    });
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
    const { username, email, password, name, avatar } = req.body;

    // Validate required fields
    if (!username || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username, email, and password are required' 
      });
    }

    // Validate email format
    if (!email.includes('@') || !email.includes('.')) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid email address' 
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 6 characters long' 
      });
    }

    const emailLower = email.toLowerCase();
    const usernameLower = username.toLowerCase();

    // Connect to database
    const db = await getDbConnection();
    if (!db) {
      return res.status(500).json({ 
        success: false, 
        message: 'Database connection error. Please try again later.' 
      });
    }

    try {
      // Check if email or username already exists
      const [emailCheck] = await db.execute('SELECT id FROM users WHERE email = ?', [emailLower]);
      if (emailCheck && emailCheck.length > 0) {
        await db.end();
        return res.status(409).json({ 
          success: false, 
          message: 'An account with this email already exists. Please sign in instead.' 
        });
      }

      const [usernameCheck] = await db.execute('SELECT id FROM users WHERE username = ?', [usernameLower]);
      if (usernameCheck && usernameCheck.length > 0) {
        await db.end();
        return res.status(409).json({ 
          success: false, 
          message: 'Username already taken. Please choose a different username.' 
        });
      }

      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Insert new user
      const [result] = await db.execute(
        'INSERT INTO users (username, email, password, name, avatar, role, muted, mfa_verified, dtype) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [usernameLower, emailLower, hashedPassword, name || username, avatar || '/avatars/avatar_ai.png', 'USER', 0, 0, 'UserModel']
      );

      const userId = result.insertId;

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
        id: userId,
        email: emailLower,
        username: usernameLower,
        role: 'USER',
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
      }));
      const signature = toBase64Url('signature-' + Date.now());
      const token = `${header}.${payload}.${signature}`;
      
      console.log('Generated token (length):', token.length, 'parts:', token.split('.').length);

      await db.end();

      return res.status(200).json({
        success: true,
        id: userId,
        username: usernameLower,
        email: emailLower,
        name: name || username,
        avatar: avatar || '/avatars/avatar_ai.png',
        role: 'USER',
        token: token,
        status: 'SUCCESS'
      });
    } catch (dbError) {
      console.error('Database error during registration:', dbError);
      await db.end();
      
      if (dbError.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ 
          success: false, 
          message: 'Email or username already exists. Please sign in instead.' 
        });
      }
      
      return res.status(500).json({ 
        success: false, 
        message: 'Database error. Please try again later.' 
      });
    }
  } catch (error) {
    console.error('Error during registration:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Registration failed. Please try again later.' 
    });
  }
};

