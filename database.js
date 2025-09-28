import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_FILE = join(__dirname, 'data.json');

// Initialize data structure
let data = {
  sessions: {},
  songs: {},
  singer_stats: {},
  nextSongId: 1
};

// Load data from file
async function loadData() {
  try {
    const fileContent = await fs.readFile(DB_FILE, 'utf8');
    data = JSON.parse(fileContent);
  } catch (error) {
    // File doesn't exist or is invalid, use default data
    await saveData();
  }
}

// Save data to file
async function saveData() {
  try {
    await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

// Initialize on startup
await loadData();

// Session functions
export function createSession(sessionId, songDuration = 270) {
  data.sessions[sessionId] = {
    id: sessionId,
    created_at: new Date().toISOString(),
    song_duration: songDuration,
    is_active: true
  };
  saveData();
  return { changes: 1 };
}

export function getSession(sessionId) {
  return data.sessions[sessionId] || null;
}

// Song functions
export function addSong(sessionId, singerName, artist, songTitle) {
  const songId = data.nextSongId++;
  const existingSongs = Object.values(data.songs).filter(s => s.session_id === sessionId);
  const position = existingSongs.length + 1;

  data.songs[songId] = {
    id: songId,
    session_id: sessionId,
    singer_name: singerName,
    artist,
    song_title: songTitle,
    position,
    status: 'waiting',
    requested_at: new Date().toISOString()
  };

  // Update singer stats
  const statsKey = `${sessionId}_${singerName}`;
  if (!data.singer_stats[statsKey]) {
    data.singer_stats[statsKey] = {
      session_id: sessionId,
      singer_name: singerName,
      song_count: 0
    };
  }
  data.singer_stats[statsKey].song_count++;

  saveData();
  return { lastInsertRowid: songId };
}

export function getSongs(sessionId) {
  return Object.values(data.songs)
    .filter(song => song.session_id === sessionId)
    .sort((a, b) => a.position - b.position);
}

export function updateSongPosition(songId, position) {
  if (data.songs[songId]) {
    data.songs[songId].position = position;
    saveData();
    return { changes: 1 };
  }
  return { changes: 0 };
}

export function updateSongStatus(songId, status) {
  if (data.songs[songId]) {
    data.songs[songId].status = status;
    saveData();
    return { changes: 1 };
  }
  return { changes: 0 };
}

export function deleteSong(songId) {
  if (data.songs[songId]) {
    delete data.songs[songId];
    saveData();
    return { changes: 1 };
  }
  return { changes: 0 };
}

export function getSingerStats(sessionId) {
  return Object.values(data.singer_stats)
    .filter(stat => stat.session_id === sessionId);
}

export function reorderSongs(sessionId, songPositions) {
  songPositions.forEach(({ id, position }) => {
    if (data.songs[id] && data.songs[id].session_id === sessionId) {
      data.songs[id].position = position;
    }
  });
  saveData();
  return { changes: songPositions.length };
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
  const songs = getSongs(sessionId);
  const uniqueNames = [...new Set(songs.map(song => song.singer_name))];
  return uniqueNames.sort();
}