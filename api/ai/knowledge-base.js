// Knowledge Base (RAG) System
// Vector database for trading knowledge, strategies, and rules
// Uses simple in-memory storage for now (can be upgraded to Qdrant/Pinecone/Weaviate)

const { getDbConnection } = require('../db');

// Simple vector similarity (cosine similarity)
function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Simple text embedding (word frequency vector)
function simpleEmbedding(text, vocabulary = null) {
  const words = text.toLowerCase().split(/\s+/);
  const wordFreq = {};
  
  words.forEach(word => {
    wordFreq[word] = (wordFreq[word] || 0) + 1;
  });
  
  if (!vocabulary) {
    vocabulary = Object.keys(wordFreq);
  }
  
  return vocabulary.map(word => wordFreq[word] || 0);
}

// Search knowledge base
async function kbSearch(query, limit = 5) {
  const db = await getDbConnection();
  if (!db) return [];

  try {
    // Create knowledge_base table if it doesn't exist
    await db.execute(`
      CREATE TABLE IF NOT EXISTS knowledge_base (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        category VARCHAR(100),
        source VARCHAR(255),
        tags TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FULLTEXT INDEX idx_content (content),
        INDEX idx_category (category)
      )
    `);

    // Search using full-text search
    const [rows] = await db.execute(`
      SELECT *, MATCH(content, title) AGAINST(? IN NATURAL LANGUAGE MODE) as relevance
      FROM knowledge_base
      WHERE MATCH(content, title) AGAINST(? IN NATURAL LANGUAGE MODE)
      ORDER BY relevance DESC
      LIMIT ?
    `, [query, query, limit]);

    if (db && typeof db.release === 'function') {
      db.release();
    }

    return rows.map(row => ({
      id: row.id,
      title: row.title,
      content: row.content,
      category: row.category,
      source: row.source,
      tags: row.tags ? row.tags.split(',') : [],
      relevance: row.relevance
    }));

  } catch (error) {
    console.error('Error searching knowledge base:', error);
    if (db && typeof db.release === 'function') {
      db.release();
    }
    return [];
  }
}

// Ingest document into knowledge base
async function kbIngest(title, content, category = 'general', source = 'user', tags = []) {
  const db = await getDbConnection();
  if (!db) return null;

  try {
    // Create knowledge_base table if it doesn't exist
    await db.execute(`
      CREATE TABLE IF NOT EXISTS knowledge_base (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        category VARCHAR(100),
        source VARCHAR(255),
        tags TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FULLTEXT INDEX idx_content (content),
        INDEX idx_category (category)
      )
    `);

    const [result] = await db.execute(`
      INSERT INTO knowledge_base (title, content, category, source, tags)
      VALUES (?, ?, ?, ?, ?)
    `, [title, content, category, source, tags.join(',')]);

    if (db && typeof db.release === 'function') {
      db.release();
    }

    return {
      id: result.insertId,
      title,
      category,
      source
    };

  } catch (error) {
    console.error('Error ingesting into knowledge base:', error);
    if (db && typeof db.release === 'function') {
      db.release();
    }
    return null;
  }
}

// Get knowledge base entry by ID
async function kbGetById(id) {
  const db = await getDbConnection();
  if (!db) return null;

  try {
    const [rows] = await db.execute(
      'SELECT * FROM knowledge_base WHERE id = ?',
      [id]
    );

    if (db && typeof db.release === 'function') {
      db.release();
    }

    return rows.length > 0 ? rows[0] : null;

  } catch (error) {
    console.error('Error getting knowledge base entry:', error);
    if (db && typeof db.release === 'function') {
      db.release();
    }
    return null;
  }
}

module.exports = {
  kbSearch,
  kbIngest,
  kbGetById,
  cosineSimilarity,
  simpleEmbedding
};
