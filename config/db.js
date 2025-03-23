const mysql = require('mysql2/promise');
require('dotenv').config();

// Log the SSL_CA to ensure it's being loaded correctly
console.log('SSL_CA:', process.env.SSL_CA ? 'Loaded' : 'Not loaded');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  ssl: {
    ca: process.env.SSL_CA,
    rejectUnauthorized: true,
  },
  waitForConnections: true,
  connectionLimit: 5, // Reduced for Aiven's free tier
  queueLimit: 0,
  connectTimeout: 60000, // 60 seconds
  idleTimeout: 60000, // 60 seconds
});

// Handle connection errors and attempt to reconnect
pool.on('error', (err) => {
  console.error('Database pool error:', err);
  if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNREFUSED') {
    console.log('Attempting to reconnect to the database...');
    // The pool will automatically attempt to reconnect
  } else {
    throw err;
  }
});

const getConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('Successfully connected to the database');
    return connection;
  } catch (err) {
    console.error('Error connecting to the database:', err);
    throw err;
  }
};

const query = async (sql, params, retries = 3) => {
  let connection;
  for (let i = 0; i < retries; i++) {
    try {
      connection = await getConnection();
      const [results] = await connection.query(sql, params);
      return results;
    } catch (err) {
      console.error(`Query error (attempt ${i + 1}/${retries}):`, err);
      if (err.message.includes('connection is in closed state') && i < retries - 1) {
        console.log('Retrying query after connection error...');
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second before retrying
        continue;
      }
      throw err;
    } finally {
      if (connection) connection.release();
    }
  }
  throw new Error('Max retries reached for database query');
};

// Test the connection on startup
(async () => {
  try {
    await query('SELECT 1 + 1 AS result', []);
    console.log('Database connection test successful');
  } catch (err) {
    console.error('Database connection test failed:', err);
  }
})();

module.exports = { pool, query };