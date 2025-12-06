const mysql = require('mysql2/promise');

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
      connectTimeout: 5000 // 5 second timeout
    };

    if (process.env.MYSQL_SSL === 'true') {
      connectionConfig.ssl = { rejectUnauthorized: false };
    } else {
      connectionConfig.ssl = false;
    }

    const connection = await mysql.createConnection(connectionConfig);
    await connection.ping(); // Test connection
    return connection;
  } catch (error) {
    console.error('Database connection error:', error);
    return null;
  }
};

module.exports = async (req, res) => {
  // Set JSON content type first
  res.setHeader('Content-Type', 'application/json');
  
  // Prevent caching to ensure fresh data
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  // Default courses list (fallback if database is unavailable)
  const defaultCourses = [
    { id: 1, title: "E-Commerce", description: "Master Amazon FBA, Shopify, and dropshipping to build multiple income streams", level: "All Levels", duration: 6, price: 99.99, imageUrl: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?ixlib=rb-4.0.3&auto=format&fit=crop&w=2340&q=80" },
    { id: 2, title: "Health & Fitness", description: "Build profitable fitness brands, coaching businesses, and supplement companies", level: "All Levels", duration: 5, price: 79.99, imageUrl: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?ixlib=rb-4.0.3&auto=format&fit=crop&w=2340&q=80" },
    { id: 3, title: "Trading", description: "Master forex, stocks, and crypto trading strategies", level: "Intermediate", duration: 8, price: 149.99, imageUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?ixlib=rb-4.0.3&auto=format&fit=crop&w=2340&q=80" },
    { id: 4, title: "Real Estate", description: "Master strategic property investment, REIT analysis, and PropTech opportunities\n\nProfessor - Raj Johal", level: "Intermediate", duration: 7, price: 119.99, imageUrl: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&auto=format&fit=crop&w=2073&q=80" },
    { id: 5, title: "Social Media", description: "Build massive personal brands and monetize digital influence", level: "All Levels", duration: 4, price: 59.99, imageUrl: "https://images.unsplash.com/photo-1611224923853-80b023f02d71?ixlib=rb-4.0.3&auto=format&fit=crop&w=2339&q=80" },
    { id: 6, title: "Psychology and Mindset", description: "Master the psychological aspects of trading and develop the winning mindset for consistent success", level: "All Levels", duration: 6, price: 129.99, imageUrl: "https://images.unsplash.com/photo-1559757148-5c350d0d4c09?ixlib=rb-4.0.3&auto=format&fit=crop&w=2340&q=80" },
    { id: 7, title: "Algorithmic AI", description: "Learn to build and deploy algorithmic trading systems powered by artificial intelligence", level: "Advanced", duration: 10, price: 199.99, imageUrl: "https://images.unsplash.com/photo-1677442136019-21780ecad995?ixlib=rb-4.0.3&auto=format&fit=crop&w=2340&q=80" },
    { id: 8, title: "Crypto", description: "Master cryptocurrency trading, blockchain technology, and DeFi strategies", level: "Intermediate", duration: 7, price: 149.99, imageUrl: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?ixlib=rb-4.0.3&auto=format&fit=crop&w=2340&q=80" }
  ];

  try {
    console.log('Courses API: Starting request');

    // Try to fetch from database
    console.log('Courses API: Attempting database connection');
    const db = await getDbConnection();
    if (db) {
      console.log('Courses API: Database connection successful');
      try {
        // Create courses table if it doesn't exist
        await db.execute(`
          CREATE TABLE IF NOT EXISTS courses (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            level VARCHAR(50),
            duration INT,
            price DECIMAL(10, 2),
            image_url VARCHAR(500),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          )
        `);

        // Check if duration column exists, add it if it doesn't
        try {
          const [columns] = await db.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'courses' AND COLUMN_NAME = 'duration'
          `, [process.env.MYSQL_DATABASE]);
          
          if (columns.length === 0) {
            await db.execute('ALTER TABLE courses ADD COLUMN duration INT DEFAULT NULL');
            console.log('Courses API: Added duration column to courses table');
          }
        } catch (alterError) {
          // Column might already exist or other error, log and continue
          console.log('Courses API: duration column check:', alterError.message);
        }

        // Check if courses exist
        const [rows] = await db.execute('SELECT * FROM courses ORDER BY id ASC');
        console.log(`Courses API: Found ${rows.length} courses in database, expecting ${defaultCourses.length}`);
        
        // Always sync courses to database (insert missing, update existing)
        let needsUpdate = false;
        for (const course of defaultCourses) {
          const [existing] = await db.execute('SELECT id FROM courses WHERE id = ?', [course.id]);
          if (existing.length === 0) {
            console.log(`Courses API: Inserting missing course: ${course.title}`);
            await db.execute(
              'INSERT INTO courses (id, title, description, level, duration, price, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [course.id, course.title, course.description, course.level, course.duration, course.price, course.imageUrl]
            );
            needsUpdate = true;
          } else {
            // Update existing course to ensure it has latest data
            // Only update columns that exist
            try {
              await db.execute(
                'UPDATE courses SET title = ?, description = ?, level = ?, duration = ?, price = ?, image_url = ? WHERE id = ?',
                [course.title, course.description, course.level, course.duration, course.price, course.imageUrl, course.id]
              );
            } catch (updateError) {
              // If duration column still doesn't exist, update without it
              if (updateError.code === 'ER_BAD_FIELD_ERROR' && updateError.message.includes('duration')) {
                console.log(`Courses API: Updating course ${course.id} without duration column`);
                await db.execute(
                  'UPDATE courses SET title = ?, description = ?, level = ?, price = ?, image_url = ? WHERE id = ?',
                  [course.title, course.description, course.level, course.price, course.imageUrl, course.id]
                );
              } else {
                throw updateError;
              }
            }
          }
        }
        
        // Re-fetch courses after syncing if we made updates
        if (needsUpdate) {
          console.log('Courses API: Re-fetching courses after sync');
          const [updatedRows] = await db.execute('SELECT * FROM courses ORDER BY id ASC');
          await db.end();
          
          if (updatedRows && updatedRows.length > 0) {
            const courses = updatedRows.map(row => ({
              id: row.id || null,
              title: row.title || 'Unnamed Course',
              description: row.description || '',
              level: row.level || 'All Levels',
              duration: row.duration || 0,
              price: parseFloat(row.price) || 0,
              imageUrl: row.image_url || ''
            })).filter(course => course.id !== null && course.title !== 'Unnamed Course');
            console.log(`Courses API: Returning ${courses.length} courses from database after sync`);
            return res.status(200).json(courses);
          }
        }
        
        // If we have courses in DB, return them
        if (rows && rows.length > 0) {
          await db.end();
          const courses = rows.map(row => ({
            id: row.id || null,
            title: row.title || 'Unnamed Course',
            description: row.description || '',
            level: row.level || 'All Levels',
            duration: row.duration || 0,
            price: parseFloat(row.price) || 0,
            imageUrl: row.image_url || ''
          })).filter(course => course.id !== null && course.title !== 'Unnamed Course');
          console.log(`Courses API: Returning ${courses.length} courses from database`);
          return res.status(200).json(courses);
        }
        
        await db.end();
      } catch (dbError) {
        console.error('Database error fetching courses:', dbError);
        console.error('Error details:', {
          message: dbError.message,
          code: dbError.code,
          errno: dbError.errno
        });
        try {
          await db.end();
        } catch (endError) {
          console.error('Error closing database connection:', endError);
        }
      }
    } else {
      console.log('Courses API: Database connection failed or unavailable, using default courses');
    }

    // Return default courses if database unavailable or empty
    console.log(`Courses API: Returning ${defaultCourses.length} default courses`);
    return res.status(200).json(defaultCourses);
  } catch (error) {
    console.error('Error fetching courses:', error);
    // Always return courses array, even on errors
    try {
      return res.status(200).json(defaultCourses);
    } catch (jsonError) {
      // If JSON response fails, send plain text
      res.status(500).end('Internal Server Error');
    }
  }
};

