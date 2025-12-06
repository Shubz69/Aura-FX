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
    { id: 1, title: "1 to 1", description: "Personalized one-on-one trading mentorship and guidance tailored to your specific goals and experience level", level: "All Levels", duration: 0, price: 0, imageUrl: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?ixlib=rb-4.0.3&auto=format&fit=crop&w=2340&q=80" }
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

