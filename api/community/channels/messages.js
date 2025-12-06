const mysql = require('mysql2/promise');

// Get database connection
const getDbConnection = async () => {
  if (!process.env.MYSQL_HOST || !process.env.MYSQL_USER || !process.env.MYSQL_PASSWORD || !process.env.MYSQL_DATABASE) {
    return null;
  }

  try {
    const connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT) : 3306,
      connectTimeout: 5000, // 5 second timeout
      ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : false
    });
    await connection.ping(); // Test connection
    return connection;
  } catch (error) {
    console.error('Database connection error:', error);
    return null;
  }
};

// Ensure messages table exists with correct schema
const ensureMessagesTable = async (db) => {
  if (!db || !process.env.MYSQL_DATABASE) {
    return false;
  }

  try {
    // Create table if it doesn't exist with VARCHAR channel_id (supports string IDs)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        channel_id VARCHAR(255) NOT NULL,
        sender_id INT,
        content TEXT NOT NULL,
        encrypted BOOLEAN DEFAULT FALSE,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_channel (channel_id),
        INDEX idx_timestamp (timestamp),
        INDEX idx_sender (sender_id)
      )
    `);
    console.log('Messages table ensured (created or already exists)');
    
    // Check if encrypted column exists, add it if it doesn't
    try {
      const [encryptedColumn] = await db.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = ? 
        AND TABLE_NAME = 'messages' 
        AND COLUMN_NAME = 'encrypted'
      `, [process.env.MYSQL_DATABASE]);
      
      if (!encryptedColumn || encryptedColumn.length === 0) {
        // Add encrypted column with default value
        await db.execute('ALTER TABLE messages ADD COLUMN encrypted BOOLEAN DEFAULT FALSE');
        console.log('Added encrypted column to messages table');
      } else {
        // Check if it has a default value
        const [columnInfo] = await db.execute(`
          SELECT COLUMN_DEFAULT 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = ? 
          AND TABLE_NAME = 'messages' 
          AND COLUMN_NAME = 'encrypted'
        `, [process.env.MYSQL_DATABASE]);
        
        if (columnInfo && columnInfo.length > 0 && columnInfo[0].COLUMN_DEFAULT === null) {
          // Set default value if it doesn't have one
          await db.execute('ALTER TABLE messages MODIFY COLUMN encrypted BOOLEAN DEFAULT FALSE');
          console.log('Set default value for encrypted column');
        }
      }
    } catch (encryptedError) {
      console.warn('Could not check/add encrypted column:', encryptedError.message);
      // Continue anyway
    }
    
    // Check if channel_id is VARCHAR, if not, convert it
    try {
      const [columnInfo] = await db.execute(`
        SELECT DATA_TYPE, COLUMN_TYPE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = ? 
        AND TABLE_NAME = 'messages' 
        AND COLUMN_NAME = 'channel_id'
      `, [process.env.MYSQL_DATABASE]);
      
      if (columnInfo && columnInfo.length > 0) {
        const dataType = columnInfo[0].DATA_TYPE;
        if (dataType === 'int' || dataType === 'bigint') {
          console.log('Converting channel_id from', dataType, 'to VARCHAR(255)...');
          try {
            // Drop foreign keys first
            const [fks] = await db.execute(`
              SELECT CONSTRAINT_NAME 
              FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
              WHERE TABLE_SCHEMA = ? 
              AND TABLE_NAME = 'messages' 
              AND COLUMN_NAME = 'channel_id' 
              AND REFERENCED_TABLE_NAME IS NOT NULL
            `, [process.env.MYSQL_DATABASE]);
            
            for (const fk of fks) {
              try {
                await db.execute(`ALTER TABLE messages DROP FOREIGN KEY ${fk.CONSTRAINT_NAME}`);
                console.log(`Dropped foreign key: ${fk.CONSTRAINT_NAME}`);
              } catch (fkError) {
                console.warn('Could not drop foreign key:', fkError.message);
              }
            }
            
            // Convert to VARCHAR
            await db.execute('ALTER TABLE messages MODIFY COLUMN channel_id VARCHAR(255) NOT NULL');
            console.log('Successfully converted channel_id to VARCHAR(255)');
          } catch (alterError) {
            console.error('Failed to convert channel_id:', alterError.message);
            // Continue anyway
          }
        }
      }
    } catch (checkError) {
      console.warn('Could not check channel_id column:', checkError.message);
    }
    
    return true;
  } catch (error) {
    console.error('Error ensuring messages table:', error);
    return false;
  }
};

module.exports = async (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Extract channel ID from query or URL
  const channelId = req.query.channelId || req.query.id;

  if (!channelId) {
    return res.status(400).json({ success: false, message: 'Channel ID is required' });
  }

  try {
    const db = await getDbConnection();
    
    if (req.method === 'GET') {
      // Get messages for a channel
      if (!db) {
        return res.status(200).json([]); // Return empty array if DB unavailable
      }

      try {
        // Use existing table structure - don't try to create/modify
        // The actual table has: id, content, encrypted, timestamp, channel_id, sender_id
        
        // Try to fetch messages with username from users table
        // channel_id is bigint in actual table, but we receive it as string, so we need to handle both
        let [rows] = [];
        try {
          // Try with channel_id as string first (for string IDs like 'welcome')
          // JOIN with users table to get username
          [rows] = await db.execute(
            `SELECT m.*, u.username, u.name, u.email 
             FROM messages m 
             LEFT JOIN users u ON m.sender_id = u.id 
             WHERE m.channel_id = ? 
             ORDER BY m.timestamp ASC`,
            [channelId]
          );
        } catch (queryError) {
          // If that fails, try converting channelId to number (for numeric IDs)
          const numericChannelId = parseInt(channelId);
          if (!isNaN(numericChannelId)) {
            [rows] = await db.execute(
              `SELECT m.*, u.username, u.name, u.email 
               FROM messages m 
               LEFT JOIN users u ON m.sender_id = u.id 
               WHERE m.channel_id = ? 
               ORDER BY m.timestamp ASC`,
              [numericChannelId]
            );
          } else {
            // If channelId is not numeric and query failed, try ordering by id
            try {
              [rows] = await db.execute(
                `SELECT m.*, u.username, u.name, u.email 
                 FROM messages m 
                 LEFT JOIN users u ON m.sender_id = u.id 
                 WHERE m.channel_id = ? 
                 ORDER BY m.id ASC`,
                [channelId]
              );
            } catch (fallbackError) {
              if (!isNaN(numericChannelId)) {
                [rows] = await db.execute(
                  `SELECT m.*, u.username, u.name, u.email 
                   FROM messages m 
                   LEFT JOIN users u ON m.sender_id = u.id 
                   WHERE m.channel_id = ? 
                   ORDER BY m.id ASC`,
                  [numericChannelId]
                );
              } else {
                throw queryError;
              }
            }
          }
        }
        await db.end();

        // Map to frontend format - handle actual column names
        const messages = rows.map(row => {
          // Get username from joined user table, fallback to name, then email prefix, then Anonymous
          const username = row.username || row.name || (row.email ? row.email.split('@')[0] : 'Anonymous');
          
          return {
            id: row.id,
            channelId: row.channel_id,
            userId: row.sender_id,
            username: username,
            content: row.content,
            createdAt: row.timestamp,
            timestamp: row.timestamp,
            sender: {
              id: row.sender_id,
              username: username,
              avatar: '/avatars/avatar_ai.png',
              role: 'USER'
            }
          };
        });

        return res.status(200).json(messages);
      } catch (dbError) {
        console.error('Database error fetching messages:', dbError);
        await db.end();
        return res.status(200).json([]);
      }
    }

    if (req.method === 'POST') {
      // Create a new message
      const { userId, username, content } = req.body;

      if (!content || !content.trim()) {
        return res.status(400).json({ success: false, message: 'Message content is required' });
      }

      if (!db) {
        return res.status(500).json({ success: false, message: 'Database unavailable' });
      }

      try {
        // Ensure messages table exists with correct schema
        const tableExists = await ensureMessagesTable(db);
        if (!tableExists) {
          console.error('Failed to ensure messages table exists');
          await db.end();
          return res.status(500).json({ 
            success: false, 
            message: 'Failed to initialize messages table. Please contact support.',
            error: 'Table initialization failed'
          });
        }

        // Check and convert channel_id column type if needed (to support string channel IDs)
        let columnType = null;
        try {
          const [columnInfo] = await db.execute(`
            SELECT DATA_TYPE, COLUMN_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? 
            AND TABLE_NAME = 'messages' 
            AND COLUMN_NAME = 'channel_id'
          `, [process.env.MYSQL_DATABASE]);
          
          if (columnInfo && columnInfo.length > 0) {
            columnType = columnInfo[0].DATA_TYPE;
            // If channel_id is numeric (int, bigint) but we have string channel IDs, convert it
            if ((columnType === 'int' || columnType === 'bigint') && isNaN(parseInt(channelId))) {
              console.log(`Channel ID "${channelId}" is string but column is ${columnType}. Attempting conversion...`);
              try {
                // Drop foreign key if exists (required before ALTER)
                try {
                  const [fks] = await db.execute(`
                    SELECT CONSTRAINT_NAME 
                    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
                    WHERE TABLE_SCHEMA = ? 
                    AND TABLE_NAME = 'messages' 
                    AND COLUMN_NAME = 'channel_id' 
                    AND REFERENCED_TABLE_NAME IS NOT NULL
                  `, [process.env.MYSQL_DATABASE]);
                  
                  for (const fk of fks) {
                    try {
                      await db.execute(`ALTER TABLE messages DROP FOREIGN KEY ${fk.CONSTRAINT_NAME}`);
                      console.log(`Dropped foreign key: ${fk.CONSTRAINT_NAME}`);
                    } catch (fkError) {
                      console.warn('Could not drop foreign key:', fkError.message);
                    }
                  }
                } catch (fkQueryError) {
                  console.warn('Could not query foreign keys:', fkQueryError.message);
                }
                
                // Convert column to VARCHAR
                await db.execute('ALTER TABLE messages MODIFY COLUMN channel_id VARCHAR(255) NOT NULL');
                console.log('Successfully converted messages.channel_id to VARCHAR(255)');
                columnType = 'varchar'; // Update for next insert attempt
              } catch (alterError) {
                console.error('Failed to convert channel_id column type:', alterError.message);
                console.error('Error code:', alterError.code);
                // Continue - we'll try to insert anyway
              }
            } else if (columnType === 'varchar' || columnType === 'char') {
              console.log(`Channel ID column is already ${columnType}, no conversion needed`);
            }
          } else {
            console.warn('Could not find channel_id column in messages table');
          }
        } catch (schemaError) {
          console.warn('Could not check channel_id column type:', schemaError.message);
          // Continue with insert attempt
        }
        
        // Use actual table structure: id, content, encrypted, timestamp, channel_id, sender_id
        // Handle channel_id as either string or number based on column type
        let channelIdValue = channelId; // Default to string
        if (columnType === 'int' || columnType === 'bigint') {
          // If column is numeric, try to convert channelId to number
          const numericId = parseInt(channelId);
          if (!isNaN(numericId)) {
            channelIdValue = numericId;
          } else {
            // Can't convert string to number for numeric column
            console.error(`Cannot convert channel ID "${channelId}" to number for ${columnType} column`);
            await db.end();
            return res.status(500).json({ 
              success: false, 
              message: `Channel ID "${channelId}" is not compatible with database column type ${columnType}`,
              error: 'Type mismatch'
            });
          }
        }
        
        // Insert message - use actual column names
        // Include encrypted field with default FALSE value
        let result;
        try {
          const insertResult = await db.execute(
            'INSERT INTO messages (channel_id, sender_id, content, encrypted, timestamp) VALUES (?, ?, ?, FALSE, NOW())',
            [channelIdValue, userId || null, content.trim()]
          );
          // result is [ResultSetHeader, fields], we need the first element
          result = insertResult[0];
          console.log('Message inserted successfully with ID:', result.insertId);
        } catch (insertError) {
          console.error('Insert error:', insertError.message);
          console.error('Insert error code:', insertError.code);
          console.error('Channel ID value:', channelIdValue, 'Type:', typeof channelIdValue);
          
          // If insert failed, try alternative approaches
          if (insertError.code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD' || 
              insertError.message?.includes('channel_id')) {
            // Try with string conversion
            console.log('Retrying insert with channelId as string...');
            try {
              const retryResult = await db.execute(
                'INSERT INTO messages (channel_id, sender_id, content, timestamp) VALUES (?, ?, ?, NOW())',
                [String(channelId), userId || null, content.trim()]
              );
              result = retryResult[0];
              console.log('Message inserted successfully on retry with ID:', result.insertId);
            } catch (retryError) {
              console.error('Insert failed even with string conversion:', retryError);
              throw retryError; // Re-throw to be caught by outer catch
            }
          } else {
            throw insertError; // Re-throw other errors
          }
        }

        // Fetch the newly created message - execute returns [rows, fields]
        const [newMessageRows] = await db.execute('SELECT * FROM messages WHERE id = ?', [result.insertId]);
        const newMessage = newMessageRows[0]; // Get first row
        
        // Also fetch username from users table if userId is provided
        let senderUsername = username || 'Anonymous';
        if (userId) {
          try {
            const [userRows] = await db.execute('SELECT username FROM users WHERE id = ?', [userId]);
            if (userRows && userRows[0]) {
              senderUsername = userRows[0].username || username || 'Anonymous';
            }
          } catch (userError) {
            console.warn('Could not fetch username from users table:', userError);
            // Use provided username as fallback
          }
        }
        
        await db.end();

        // Map to frontend format
        const message = {
          id: newMessage.id,
          channelId: newMessage.channel_id,
          userId: newMessage.sender_id, // Actual column is sender_id
          username: senderUsername,
          content: newMessage.content,
          createdAt: newMessage.timestamp, // Actual column is timestamp
          timestamp: newMessage.timestamp,
          sender: {
            id: newMessage.sender_id,
            username: senderUsername,
            avatar: '/avatars/avatar_ai.png',
            role: 'USER'
          }
        };

        return res.status(201).json(message);
      } catch (dbError) {
        console.error('Database error creating message:', dbError);
        console.error('Error details:', {
          message: dbError.message,
          code: dbError.code,
          errno: dbError.errno,
          sqlState: dbError.sqlState,
          sqlMessage: dbError.sqlMessage,
          sql: dbError.sql,
          channelId: channelId,
          channelIdType: typeof channelId,
          stack: dbError.stack
        });
        
        // Try to provide more helpful error message
        let errorMessage = 'Failed to create message';
        let errorDetails = null;
        
        if (dbError.code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD' || dbError.code === 'ER_BAD_FIELD_ERROR') {
          errorMessage = 'Channel ID type mismatch. Database schema needs update.';
          errorDetails = `Channel ID "${channelId}" (${typeof channelId}) cannot be inserted into column type.`;
        } else if (dbError.message && dbError.message.includes('channel_id')) {
          errorMessage = 'Invalid channel ID format';
          errorDetails = dbError.message;
        } else if (dbError.code === 'ER_NO_SUCH_TABLE') {
          errorMessage = 'Messages table does not exist';
          errorDetails = 'Database table needs to be created.';
        } else if (dbError.code === 'ER_ACCESS_DENIED_ERROR' || dbError.code === 'ER_DBACCESS_DENIED_ERROR') {
          errorMessage = 'Database access denied';
          errorDetails = 'Check database credentials and permissions.';
        } else {
          errorMessage = dbError.message || 'Database error occurred';
          errorDetails = `Error code: ${dbError.code || 'UNKNOWN'}`;
        }
        
        try {
          if (db && !db.ended) {
            await db.end();
          }
        } catch (endError) {
          // Ignore errors when closing connection
          console.warn('Error closing database connection:', endError.message);
        }
        
        // Return detailed error in development, generic in production
        return res.status(500).json({ 
          success: false, 
          message: errorMessage,
          error: errorDetails,
          code: dbError.code,
          // Include full error in development mode for debugging
          ...(process.env.NODE_ENV === 'development' ? {
            fullError: dbError.message,
            stack: dbError.stack
          } : {})
        });
      }
    }

    if (req.method === 'DELETE') {
      // Delete a message (admin only or message owner)
      // Extract messageId from query params (Vercel routing) or URL path
      let messageId = req.query.messageId || req.query.id;
      
      // If not in query, try to extract from URL path
      if (!messageId && req.url) {
        const urlParts = req.url.split('/');
        const messageIdIndex = urlParts.findIndex(part => part === 'messages') + 1;
        if (messageIdIndex > 0 && urlParts[messageIdIndex]) {
          messageId = urlParts[messageIdIndex].split('?')[0]; // Remove query string if present
        }
      }
      
      console.log('DELETE request - messageId:', messageId, 'from query:', req.query, 'from URL:', req.url);
      
      if (!messageId) {
        return res.status(400).json({ success: false, message: 'Message ID is required' });
      }

      if (!db) {
        return res.status(500).json({ success: false, message: 'Database unavailable' });
      }

      try {
        // Try both string and numeric messageId (handle both cases)
        let messageRows = [];
        let messageIdValue = messageId;
        
        // First try with the messageId as-is (could be string or number)
        try {
          [messageRows] = await db.execute('SELECT id, sender_id, channel_id FROM messages WHERE id = ?', [messageIdValue]);
        } catch (queryError) {
          // If that fails, try converting to number
          const numericId = parseInt(messageId);
          if (!isNaN(numericId)) {
            messageIdValue = numericId;
            [messageRows] = await db.execute('SELECT id, sender_id, channel_id FROM messages WHERE id = ?', [messageIdValue]);
          } else {
            throw queryError;
          }
        }
        
        if (!messageRows || messageRows.length === 0) {
          console.log('Message not found with ID:', messageId, 'tried value:', messageIdValue);
          await db.end();
          return res.status(404).json({ success: false, message: 'Message not found' });
        }

        const message = messageRows[0];
        console.log('Found message to delete:', message.id, 'in channel:', message.channel_id);

        // TODO: Add admin check from JWT token
        // For now, allow deletion (you can add auth check later)
        const [result] = await db.execute('DELETE FROM messages WHERE id = ?', [messageIdValue]);
        await db.end();

        if (result.affectedRows > 0) {
          console.log('Message deleted successfully:', messageIdValue);
          return res.status(200).json({ 
            success: true, 
            message: 'Message deleted successfully' 
          });
        } else {
          console.log('Delete query executed but no rows affected');
          return res.status(404).json({ 
            success: false, 
            message: 'Message not found' 
          });
        }
      } catch (dbError) {
        console.error('Database error deleting message:', dbError);
        console.error('Error details:', {
          message: dbError.message,
          code: dbError.code,
          messageId: messageId,
          messageIdType: typeof messageId
        });
        try {
          if (db && !db.ended) {
            await db.end();
          }
        } catch (endError) {
          // Ignore errors when closing connection
        }
        return res.status(500).json({ 
          success: false, 
          message: 'Failed to delete message',
          error: process.env.NODE_ENV === 'development' ? dbError.message : undefined
        });
      }
    }

    return res.status(405).json({ success: false, message: 'Method not allowed' });
  } catch (error) {
    console.error('Error handling messages:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'An error occurred' 
    });
  }
};

