import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use persistent volume path in production, local path in development
const DB_DIR = process.env.FLY_APP_NAME ? '/data' : __dirname;
const DB_PATH = join(DB_DIR, 'karaoke.db');

// Ensure directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Initialize database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    song_duration INTEGER DEFAULT 270,
    is_active INTEGER DEFAULT 1,
    venmo_handle TEXT,
    cashapp_handle TEXT,
    zelle_handle TEXT
  );

  CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    singer_name TEXT NOT NULL,
    artist TEXT NOT NULL,
    song_title TEXT NOT NULL,
    position INTEGER NOT NULL,
    status TEXT DEFAULT 'waiting',
    requested_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions (id)
  );

  CREATE TABLE IF NOT EXISTS singer_stats (
    session_id TEXT NOT NULL,
    singer_name TEXT NOT NULL,
    song_count INTEGER DEFAULT 0,
    PRIMARY KEY (session_id, singer_name),
    FOREIGN KEY (session_id) REFERENCES sessions (id)
  );

  CREATE INDEX IF NOT EXISTS idx_songs_session_position ON songs (session_id, position);
  CREATE INDEX IF NOT EXISTS idx_songs_session_status ON songs (session_id, status);
`);

// Prepared statements for performance
const stmts = {
  createSession: db.prepare(`
    INSERT INTO sessions (id, created_at, song_duration, is_active, venmo_handle, cashapp_handle, zelle_handle)
    VALUES (?, ?, ?, 1, ?, ?, ?)
  `),

  getSession: db.prepare(`
    SELECT * FROM sessions WHERE id = ?
  `),

  updateSessionTips: db.prepare(`
    UPDATE sessions
    SET venmo_handle = ?, cashapp_handle = ?, zelle_handle = ?
    WHERE id = ?
  `),

  addSong: db.prepare(`
    INSERT INTO songs (session_id, singer_name, artist, song_title, position, status, requested_at)
    VALUES (?, ?, ?, ?, ?, 'waiting', ?)
  `),

  getSongs: db.prepare(`
    SELECT * FROM songs
    WHERE session_id = ?
    ORDER BY position ASC
  `),

  updateSongPosition: db.prepare(`
    UPDATE songs SET position = ? WHERE id = ?
  `),

  updateSongStatus: db.prepare(`
    UPDATE songs SET status = ? WHERE id = ?
  `),

  deleteSong: db.prepare(`
    DELETE FROM songs WHERE id = ?
  `),

  getSingerStats: db.prepare(`
    SELECT * FROM singer_stats WHERE session_id = ?
  `),

  upsertSingerStats: db.prepare(`
    INSERT INTO singer_stats (session_id, singer_name, song_count)
    VALUES (?, ?, 1)
    ON CONFLICT (session_id, singer_name)
    DO UPDATE SET song_count = song_count + 1
  `),

  getUniqueSingers: db.prepare(`
    SELECT DISTINCT singer_name FROM songs
    WHERE session_id = ?
    ORDER BY singer_name ASC
  `),

  getMaxPosition: db.prepare(`
    SELECT COALESCE(MAX(position), 0) as max_pos FROM songs WHERE session_id = ?
  `),

  getAllSessions: db.prepare(`
    SELECT * FROM sessions ORDER BY created_at DESC
  `),

  getSessionStats: db.prepare(`
    SELECT
      s.id,
      s.created_at,
      s.song_duration,
      s.is_active,
      COUNT(songs.id) as total_songs,
      COUNT(CASE WHEN songs.status = 'waiting' THEN 1 END) as waiting_songs,
      COUNT(CASE WHEN songs.status = 'playing' THEN 1 END) as playing_songs,
      COUNT(CASE WHEN songs.status = 'done' THEN 1 END) as completed_songs,
      COUNT(CASE WHEN songs.status = 'skipped' THEN 1 END) as skipped_songs,
      COUNT(DISTINCT songs.singer_name) as unique_singers
    FROM sessions s
    LEFT JOIN songs ON s.id = songs.session_id
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `)
};

// Session functions
export function createSession(sessionId, songDuration = 270, tipHandles = {}) {
  const { venmo_handle = null, cashapp_handle = null, zelle_handle = null } = tipHandles;
  const result = stmts.createSession.run(
    sessionId,
    new Date().toISOString(),
    songDuration,
    venmo_handle,
    cashapp_handle,
    zelle_handle
  );
  return { changes: result.changes };
}

export function getSession(sessionId) {
  return stmts.getSession.get(sessionId) || null;
}

export function updateSessionTips(sessionId, tipHandles) {
  const { venmo_handle = null, cashapp_handle = null, zelle_handle = null } = tipHandles;
  const result = stmts.updateSessionTips.run(venmo_handle, cashapp_handle, zelle_handle, sessionId);
  return { changes: result.changes };
}

// Song functions
export function addSong(sessionId, singerName, artist, songTitle) {
  const maxPosResult = stmts.getMaxPosition.get(sessionId);
  const position = maxPosResult.max_pos + 1;

  const transaction = db.transaction(() => {
    const songResult = stmts.addSong.run(
      sessionId,
      singerName,
      artist,
      songTitle,
      position,
      new Date().toISOString()
    );

    stmts.upsertSingerStats.run(sessionId, singerName);

    return songResult;
  });

  const result = transaction();
  return { lastInsertRowid: result.lastInsertRowid };
}

export function getSongs(sessionId) {
  return stmts.getSongs.all(sessionId);
}

export function updateSongPosition(songId, position) {
  const result = stmts.updateSongPosition.run(position, songId);
  return { changes: result.changes };
}

export function updateSongStatus(songId, status) {
  const result = stmts.updateSongStatus.run(status, songId);
  return { changes: result.changes };
}

export function deleteSong(songId) {
  const result = stmts.deleteSong.run(songId);
  return { changes: result.changes };
}

export function getSingerStats(sessionId) {
  return stmts.getSingerStats.all(sessionId);
}

export function reorderSongs(sessionId, songPositions) {
  const transaction = db.transaction(() => {
    let changes = 0;
    for (const { id, position } of songPositions) {
      const result = stmts.updateSongPosition.run(position, id);
      changes += result.changes;
    }
    return changes;
  });

  const changes = transaction();
  return { changes };
}

export function getDeduplicatedName(sessionId, requestedName) {
  const existingSongs = getSongs(sessionId);
  const existingNames = existingSongs.map(song => song.singer_name.toLowerCase());

  let finalName = requestedName;
  let counter = 1;

  while (existingNames.includes(finalName.toLowerCase())) {
    counter++;
    finalName = `${requestedName} (${counter})`;
  }

  return finalName;
}

export function getUniqueSingers(sessionId) {
  const result = stmts.getUniqueSingers.all(sessionId);
  return result.map(row => row.singer_name);
}

export function getAllSessionsWithStats() {
  return stmts.getSessionStats.all();
}

// Graceful shutdown
process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  db.close();
  process.exit(0);
});