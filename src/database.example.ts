// src/database.example.ts
// Copy this file to src/database.ts and fill in your actual credentials.
// Make sure src/database.ts is listed in your .gitignore file!

import { Pool } from 'pg';
import type { DbPlayerState, InMemoryPlayerState } from './types';

// Replace with your actual database connection details
const pool = new Pool({
  host: 'YOUR_DATABASE_HOST', // e.g., 'pc-xxxxxxxx.pg.polardb.region.rds.aliyuncs.com' or 'localhost'
  port: 5432,                // Default PostgreSQL port
  database: 'YOUR_DATABASE_NAME',
  user: 'YOUR_DATABASE_USER',
  password: 'YOUR_DATABASE_PASSWORD',
  // Uncomment and configure if your database requires SSL
  // ssl: {
  //   rejectUnauthorized: false // Set to true if you have proper CA verification
  //   // ca: '-----BEGIN CERTIFICATE-----\n...' // Add CA certificate if needed
  // }
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export async function initializeDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS players (
        player_id TEXT PRIMARY KEY,
        sats INTEGER DEFAULT 5,
        completed_lessons TEXT[] DEFAULT '{}',
        completed_quizzes TEXT[] DEFAULT '{}',
        last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database table "players" initialized successfully.');
  } catch (err) {
    console.error('Error initializing database table:', err);
    throw err; // Re-throw error to potentially stop server startup
  } finally {
    client.release();
  }
}

export async function loadPlayerData(playerId: string): Promise<InMemoryPlayerState> {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT sats, completed_lessons, completed_quizzes FROM players WHERE player_id = $1', [playerId]);
    if (res.rows.length > 0) {
      // Explicitly assert row type based on the query structure
      const data = res.rows[0] as { sats: number; completed_lessons: string[]; completed_quizzes: string[] };
      console.log(`Loaded data for ${playerId}:`, data);
      return {
        sats: data.sats,
        completedLessons: new Set(data.completed_lessons || []), // Use snake_case from DB result
        completedQuizzes: new Set(data.completed_quizzes || []), // Use snake_case from DB result
        activeQuiz: null, // Initialize non-persistent state
      };
    } else {
      console.log(`No data found for ${playerId}, returning defaults.`);
      // Return default state if player not found
      return {
        sats: 5, // Default sats
        completedLessons: new Set<string>(),
        completedQuizzes: new Set<string>(),
        activeQuiz: null, // Default non-persistent state
      };
    }
  } catch (err) {
    console.error(`Error loading player data for ${playerId}:`, err);
    // Return default state on error to prevent blocking login
    return {
      sats: 5, // Default sats on error
      completedLessons: new Set<string>(),
      completedQuizzes: new Set<string>(),
      activeQuiz: null, // Default non-persistent state on error
    };
  } finally {
    client.release();
  }
}

export async function savePlayerData(playerId: string, data: InMemoryPlayerState): Promise<void> {
  const client = await pool.connect();
  try {
    const completedLessonsArray = Array.from(data.completedLessons);
    const completedQuizzesArray = Array.from(data.completedQuizzes);

    await client.query(`
      INSERT INTO players (player_id, sats, completed_lessons, completed_quizzes, last_seen)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT (player_id) DO UPDATE SET
        sats = EXCLUDED.sats,
        completed_lessons = EXCLUDED.completed_lessons,
        completed_quizzes = EXCLUDED.completed_quizzes,
        last_seen = CURRENT_TIMESTAMP;
    `, [playerId, data.sats, completedLessonsArray, completedQuizzesArray]);
    console.log(`Saved data for ${playerId}`);
  } catch (err) {
    console.error(`Error saving player data for ${playerId}:`, err);
  } finally {
    client.release();
  }
}

export default pool;