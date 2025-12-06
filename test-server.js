const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Load environment variables from .env if it exists
require('dotenv').config();

// Import the messages handler
const messagesHandler = require('./api/community/channels/messages');

// Mock Vercel request/response objects
const createMockRequest = (method, url, body = {}, query = {}) => {
  const urlObj = new URL(url, 'http://localhost:3001');
  return {
    method,
    url: urlObj.pathname + urlObj.search,
    query: { ...query, ...Object.fromEntries(urlObj.searchParams) },
    body,
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost:3000'
    }
  };
};

const createMockResponse = () => {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader: function(name, value) {
      this.headers[name] = value;
      return this;
    },
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      this.body = data;
      return this;
    },
    end: function(data) {
      if (data) this.body = data;
      return this;
    }
  };
  return res;
};

// Test endpoint for messages
app.post('/api/community/channels/:channelId/messages', async (req, res) => {
  console.log('\n=== POST Message Request ===');
  console.log('Channel ID:', req.params.channelId);
  console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('Query:', req.query);
  
  const mockReq = createMockRequest('POST', req.url, req.body, { channelId: req.params.channelId });
  const mockRes = createMockResponse();
  
  // Copy headers
  Object.keys(req.headers).forEach(key => {
    mockReq.headers[key] = req.headers[key];
  });
  
  try {
    await messagesHandler(mockReq, mockRes);
    
    // Set response headers
    Object.keys(mockRes.headers).forEach(key => {
      res.setHeader(key, mockRes.headers[key]);
    });
    
    console.log('Response Status:', mockRes.statusCode);
    console.log('Response Body:', JSON.stringify(mockRes.body, null, 2));
    console.log('===========================\n');
    
    res.status(mockRes.statusCode).json(mockRes.body);
  } catch (error) {
    console.error('Handler Error:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Handler error',
      error: error.message,
      stack: error.stack
    });
  }
});

// Test endpoint for GET messages
app.get('/api/community/channels/:channelId/messages', async (req, res) => {
  console.log('\n=== GET Messages Request ===');
  console.log('Channel ID:', req.params.channelId);
  console.log('Query:', req.query);
  
  const mockReq = createMockRequest('GET', req.url, {}, { channelId: req.params.channelId });
  const mockRes = createMockResponse();
  
  try {
    await messagesHandler(mockReq, mockRes);
    
    Object.keys(mockRes.headers).forEach(key => {
      res.setHeader(key, mockRes.headers[key]);
    });
    
    console.log('Response Status:', mockRes.statusCode);
    console.log('Response Body:', Array.isArray(mockRes.body) ? `${mockRes.body.length} messages` : JSON.stringify(mockRes.body, null, 2));
    console.log('===========================\n');
    
    res.status(mockRes.statusCode).json(mockRes.body);
  } catch (error) {
    console.error('Handler Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Handler error',
      error: error.message,
      stack: error.stack
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Test server running',
    env: {
      hasMysqlHost: !!process.env.MYSQL_HOST,
      hasMysqlUser: !!process.env.MYSQL_USER,
      hasMysqlPassword: !!process.env.MYSQL_PASSWORD,
      hasMysqlDatabase: !!process.env.MYSQL_DATABASE,
      mysqlPort: process.env.MYSQL_PORT || 3306,
      mysqlSsl: process.env.MYSQL_SSL || 'false'
    }
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Test server running on http://localhost:${PORT}`);
  console.log(`\n📋 Environment Check:`);
  console.log(`   MYSQL_HOST: ${process.env.MYSQL_HOST ? '✅ Set' : '❌ Missing'}`);
  console.log(`   MYSQL_USER: ${process.env.MYSQL_USER ? '✅ Set' : '❌ Missing'}`);
  console.log(`   MYSQL_PASSWORD: ${process.env.MYSQL_PASSWORD ? '✅ Set' : '❌ Missing'}`);
  console.log(`   MYSQL_DATABASE: ${process.env.MYSQL_DATABASE ? '✅ Set' : '❌ Missing'}`);
  console.log(`   MYSQL_PORT: ${process.env.MYSQL_PORT || 3306}`);
  console.log(`   MYSQL_SSL: ${process.env.MYSQL_SSL || 'false'}`);
  console.log(`\n📝 Test Endpoints:`);
  console.log(`   GET  http://localhost:${PORT}/health`);
  console.log(`   GET  http://localhost:${PORT}/api/community/channels/welcome/messages`);
  console.log(`   POST http://localhost:${PORT}/api/community/channels/welcome/messages`);
  console.log(`\n💡 Example POST request:`);
  console.log(`   curl -X POST http://localhost:${PORT}/api/community/channels/welcome/messages \\`);
  console.log(`        -H "Content-Type: application/json" \\`);
  console.log(`        -d '{"content":"Hello world","userId":1,"username":"test"}'`);
  console.log(`\n`);
});

