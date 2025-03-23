const mysql = require('mysql2/promise');
require('dotenv').config();

// Log environment variables to ensure they're loaded correctly
console.log('DB_HOST:', process.env.DB_HOST ? 'Loaded' : 'Not loaded');
console.log('DB_USER:', process.env.DB_USER ? 'Loaded' : 'Not loaded');
console.log('DB_NAME:', process.env.DB_NAME ? 'Loaded' : 'Not loaded');
console.log('DB_PORT:', process.env.DB_PORT || 3306);
console.log('SSL_CA:', process.env.SSL_CA ? 'Loaded' : 'Not loaded');

let pool = createPool();

function createPool() {
  const newPool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 16105,
    ssl: {
      ca: process.env.SSL_CA,
      rejectUnauthorized: false, // Set to false for testing if SSL issues persist
    },
    waitForConnections: true,
    connectionLimit: 3, // Reduced for Aiven's free tier
    queueLimit: 0,
    connectTimeout: 5000, // 5 seconds
    idleTimeout: 30000, // 30 seconds
  });

  newPool.on('error', (err) => {
    console.error('Database pool error:', err.message, err.code);
    if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
      console.log('Recreating database pool due to connection error...');
      pool = createPool();
    } else {
      throw err;
    }
  });

  newPool.on('acquire', (connection) => {
    console.log(`Connection ${connection.threadId} acquired`);
  });

  newPool.on('release', (connection) => {
    console.log(`Connection ${connection.threadId} released`);
  });

  return newPool;
}

const getConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log(`Successfully connected to the database (Thread ID: ${connection.threadId})`);
    return connection;
  } catch (err) {
    console.error('Error connecting to the database:', err.message, err.code);
    throw err;
  }
};

const query = async (sql, params, retries = 3) => {
  let connection;
  for (let i = 0; i < retries; i++) {
    try {
      connection = await getConnection();
      console.log(`Executing query: ${sql} with params: ${JSON.stringify(params)}`);
      const [results] = await connection.query(sql, params);
      console.log('Query executed successfully');
      return results;
    } catch (err) {
      console.error(`Query error (attempt ${i + 1}/${retries}):`, err.message, err.code);
      if (
        (err.code === 'ETIMEDOUT' ||
         err.code === 'ECONNREFUSED' ||
         err.code === 'PROTOCOL_CONNECTION_LOST' ||
         err.message.includes('connection is in closed state')) &&
        i < retries - 1
      ) {
        console.log('Retrying query after connection error...');
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }
      throw err;
    } finally {
      if (connection) {
        try {
          connection.release();
          console.log('Connection released');
        } catch (releaseErr) {
          console.error('Error releasing connection:', releaseErr.message);
        }
      }
    }
  }
  throw new Error('Max retries reached for database query');
};

(async () => {
  try {
    const result = await query('SELECT 1 + 1 AS result', []);
    console.log('Database connection test successful:', result);
  } catch (err) {
    console.error('Database connection test failed:', err.message, err.code);
    console.error('Exiting application due to database connection failure...');
    process.exit(1);
  }
})();

module.exports = { pool: () => pool, query };