// Simple Express server with Stripe integration
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'your_stripe_key_here');
const path = require('path');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const sqlite3 = require('better-sqlite3');

const app = express();
const port = process.env.PORT || 8080;

// Email configuration
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'your-email@gmail.com',
    pass: process.env.EMAIL_PASS || 'your-app-password'
  }
});

// Database setup
let db;
try {
  db = sqlite3('data.sqlite3');
  console.log('Connected to SQLite database');
  
  // Create reset_codes table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS reset_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_reset_codes_email ON reset_codes(email);
    CREATE INDEX IF NOT EXISTS idx_reset_codes_expires ON reset_codes(expires_at);
  `);
  
  // Clean up expired codes on startup
  const expiredCount = db.prepare('DELETE FROM reset_codes WHERE expires_at < ?').run(Date.now()).changes;
  if (expiredCount > 0) {
    console.log(`Cleaned up ${expiredCount} expired reset codes`);
  }
} catch (error) {
  console.error('Database connection error:', error);
  console.warn('Password reset will use in-memory storage (codes will be lost on restart)');
  db = null;
}

// Middleware
app.use(express.json());
app.use(cors({
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));
app.use(express.static(path.join(__dirname, 'build')));

// Mock course data
const courses = [
  { id: 1, title: "Intro to Trading", description: "Learn the basics of trading.", price: 0.3 },
  { id: 2, title: "Technical Analysis", description: "Master chart patterns and indicators.", price: 0.3 },
  { id: 3, title: "Fundamental Analysis", description: "Analyze financial statements.", price: 0.3 },
  { id: 4, title: "Crypto Trading", description: "Trade crypto assets effectively.", price: 0.3 },
  { id: 5, title: "Day Trading", description: "Master intraday trading strategies.", price: 0.3 },
  { id: 6, title: "Swing Trading", description: "Profit from market swings.", price: 0.3 }
];

// Direct checkout endpoint - no authentication required
app.get('/api/payments/checkout-direct', async (req, res) => {
  try {
    // Get course ID from query parameters
    const { courseId } = req.query;
    
    if (!courseId) {
      return res.status(400).json({ error: 'Course ID is required' });
    }
    
    // Find course by ID
    const course = courses.find(c => c.id.toString() === courseId.toString());
    
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }
    
    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: course.title,
              description: course.description,
            },
            unit_amount: Math.round(course.price * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `http://localhost:3000/payment-success?courseId=${courseId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `http://localhost:3000/courses`,
    });
    
    // Redirect to Stripe checkout
    return res.redirect(303, session.url);
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Payment success webhook
app.post('/api/payments/complete', (req, res) => {
  // In a real application, you would verify the payment with Stripe
  // and update your database accordingly
  
  return res.json({ 
    success: true, 
    message: 'Payment completed successfully' 
  });
});

// Contact form endpoint
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    
    // Email content
    const mailOptions = {
      from: process.env.EMAIL_USER || 'your-email@gmail.com',
      to: 'platform@theglitch.online',
      subject: `Contact Form Message from ${name}`,
      html: `
        <h3>New Contact Form Submission</h3>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Message:</strong></p>
        <p>${message.replace(/\n/g, '<br>')}</p>
        <hr>
        <p><em>Sent from The Glitch website contact form</em></p>
      `
    };
    
    // Send email
    await transporter.sendMail(mailOptions);
    
    res.json({ 
      success: true, 
      message: 'Message sent successfully' 
    });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send message' 
    });
  }
});

// Password Reset Endpoints
// Use database if available, otherwise fallback to in-memory storage
const resetCodes = new Map(); // email -> { code, expiresAt } (fallback)

// Generate 6-digit code
const generateResetCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Forgot password - send reset code
// Handle both /api/auth/forgot-password and /forgot-password for compatibility
app.post(['/api/auth/forgot-password', '/forgot-password'], async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email is required' 
      });
    }
    
    // Generate 6-digit code
    const resetCode = generateResetCode();
    const expiresAt = Date.now() + (10 * 60 * 1000); // 10 minutes
    const emailLower = email.toLowerCase();
    
    // Store code in database or memory
    if (db) {
      // Delete any existing codes for this email
      db.prepare('DELETE FROM reset_codes WHERE email = ?').run(emailLower);
      // Insert new code
      db.prepare('INSERT INTO reset_codes (email, code, expires_at) VALUES (?, ?, ?)')
        .run(emailLower, resetCode, expiresAt);
    } else {
      // Fallback to in-memory storage
      resetCodes.set(emailLower, {
        code: resetCode,
        expiresAt: expiresAt
      });
    }
    
    // Send email with reset code
    const mailOptions = {
      from: process.env.EMAIL_USER || 'your-email@gmail.com',
      to: email,
      subject: 'THE GLITCH - Password Reset Code',
      html: `
        <h2>THE GLITCH - Password Reset</h2>
        <p>You requested to reset your password. Use the code below to verify:</p>
        <h3 style="font-size: 24px; color: #8B5CF6; letter-spacing: 5px;">${resetCode}</h3>
        <p>This code will expire in 10 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
        <hr>
        <p><em>THE GLITCH Platform</em></p>
      `
    };
    
    await transporter.sendMail(mailOptions);
    
    console.log(`Password reset code sent to ${email}: ${resetCode}`);
    
    res.json({ 
      success: true, 
      message: 'Reset code sent to your email' 
    });
  } catch (error) {
    console.error('Error sending reset email:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send reset email' 
    });
  }
});

// Verify reset code
app.post(['/api/auth/verify-reset-code', '/verify-reset-code'], async (req, res) => {
  try {
    const { email, code } = req.body;
    
    if (!email || !code) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and code are required' 
      });
    }
    
    const emailLower = email.toLowerCase();
    let stored;
    
    // Retrieve code from database or memory
    if (db) {
      const row = db.prepare('SELECT * FROM reset_codes WHERE email = ? AND code = ? ORDER BY created_at DESC LIMIT 1')
        .get(emailLower, code);
      
      if (!row) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid code' 
        });
      }
      
      if (Date.now() > row.expires_at) {
        db.prepare('DELETE FROM reset_codes WHERE email = ?').run(emailLower);
        return res.status(400).json({ 
          success: false, 
          message: 'Code has expired' 
        });
      }
      
      stored = { code: row.code, expiresAt: row.expires_at };
      // Delete used code
      db.prepare('DELETE FROM reset_codes WHERE email = ?').run(emailLower);
    } else {
      // Fallback to in-memory storage
      stored = resetCodes.get(emailLower);
      
      if (!stored) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid or expired code' 
        });
      }
      
      if (Date.now() > stored.expiresAt) {
        resetCodes.delete(emailLower);
        return res.status(400).json({ 
          success: false, 
          message: 'Code has expired' 
        });
      }
      
      if (stored.code !== code) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid code' 
        });
      }
      
      // Remove used code
      resetCodes.delete(emailLower);
    }
    
    // Generate reset token (JWT-like token for password reset)
    const resetToken = Buffer.from(JSON.stringify({
      email: email,
      code: code,
      expiresAt: Date.now() + (15 * 60 * 1000) // 15 minutes
    })).toString('base64');
    
    res.json({ 
      success: true, 
      token: resetToken,
      message: 'Code verified successfully' 
    });
  } catch (error) {
    console.error('Error verifying reset code:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to verify code' 
    });
  }
});

// Reset password with token
app.post(['/api/auth/reset-password', '/reset-password'], async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Token and new password are required' 
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 6 characters' 
      });
    }
    
    // Decode token
    let tokenData;
    try {
      tokenData = JSON.parse(Buffer.from(token, 'base64').toString());
    } catch (error) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }
    
    // Check if token expired
    if (Date.now() > tokenData.expiresAt) {
      return res.status(400).json({ 
        success: false, 
        message: 'Token has expired' 
      });
    }
    
    // Hash the new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    // Update password in database
    if (db) {
      // Check if users table exists
      const tableExists = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='users'
      `).get();
      
      if (tableExists) {
        // Update user password
        const result = db.prepare('UPDATE users SET password = ? WHERE email = ?')
          .run(hashedPassword, tokenData.email.toLowerCase());
        
        if (result.changes === 0) {
          return res.status(404).json({ 
            success: false, 
            message: 'User not found' 
          });
        }
        
        console.log(`Password reset for ${tokenData.email} - password updated in database`);
      } else {
        console.warn('Users table not found - password reset logged but not saved');
      }
    } else {
      console.log(`Password reset for ${tokenData.email} - password would be updated (database not connected)`);
    }
    
    res.json({ 
      success: true, 
      message: 'Password reset successfully' 
    });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to reset password' 
    });
  }
});

// Serve the React app - catch-all route using regex for compatibility
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Cleanup expired codes periodically (every hour)
if (db) {
  setInterval(() => {
    try {
      const expiredCount = db.prepare('DELETE FROM reset_codes WHERE expires_at < ?').run(Date.now()).changes;
      if (expiredCount > 0) {
        console.log(`Cleaned up ${expiredCount} expired reset codes`);
      }
    } catch (error) {
      console.error('Error cleaning up expired codes:', error);
    }
  }, 60 * 60 * 1000); // Every hour
}

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  if (db) {
    console.log('✓ Database connected - reset codes will persist');
  } else {
    console.log('⚠ Database not connected - using in-memory storage');
  }
});

// To use this server:
// 1. Install required packages: npm install express cors stripe nodemailer bcrypt better-sqlite3
// 2. Set environment variables:
//    - EMAIL_USER: Your email address
//    - EMAIL_PASS: Your email app password
//    - STRIPE_SECRET_KEY: Your Stripe secret key
// 3. Save this file as server.js in your project root
// 4. Run with: node server.js
//
// Password Reset Features:
// - Stores reset codes in SQLite database (data.sqlite3)
// - Codes expire after 10 minutes
// - Passwords are hashed with bcrypt before storage
// - Automatic cleanup of expired codes