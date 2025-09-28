import express from 'express';
import { nanoid } from 'nanoid';
import QRCode from 'qrcode';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import {
  createSession,
  getSession,
  addSong,
  getSongs,
  updateSongPosition,
  updateSongStatus,
  deleteSong,
  getSingerStats,
  reorderSongs,
  getDeduplicatedName,
  getUniqueSingers
} from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Helper function to generate QR code
async function generateQRCode(sessionId, req) {
  // Get the base URL from the request
  const protocol = req.headers['x-forwarded-proto'] || (req.connection.encrypted ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
  const baseUrl = `${protocol}://${host}`;

  const url = `${baseUrl}/singer/${sessionId}`;
  const qrCodePath = join(__dirname, 'public', 'qr-codes', `${sessionId}.png`);

  try {
    await QRCode.toFile(qrCodePath, url, {
      width: 300,
      margin: 2
    });
    return `/qr-codes/${sessionId}.png`;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw error;
  }
}

// Routes

// Create new session (for DJ)
app.post('/api/sessions', async (req, res) => {
  try {
    const sessionId = nanoid(6).toUpperCase();
    const songDuration = req.body.songDuration || 270;

    createSession(sessionId, songDuration);
    const qrCodePath = await generateQRCode(sessionId, req);

    res.json({
      sessionId,
      qrCodePath,
      djUrl: `/dj/${sessionId}`
    });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Get session info
app.get('/api/sessions/:id', (req, res) => {
  try {
    const session = getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
  } catch (error) {
    console.error('Error getting session:', error);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

// Singer request form (HTML)
app.get('/singer/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = getSession(sessionId);

  if (!session) {
    return res.status(404).send('<h1>Session not found</h1>');
  }

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Karaoke Request</title>
    <script src="https://unpkg.com/htmx.org@1.9.10"></script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 400px;
            margin: 0 auto;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: white;
        }
        .container {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 30px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
        h1 {
            text-align: center;
            margin-bottom: 30px;
            font-size: 2rem;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
        }
        input, select {
            width: 100%;
            padding: 15px;
            border: none;
            border-radius: 10px;
            font-size: 16px;
            background: rgba(255, 255, 255, 0.9);
            box-sizing: border-box;
        }
        select {
            cursor: pointer;
        }
        button {
            width: 100%;
            padding: 15px;
            background: #ff6b6b;
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 18px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.3s;
        }
        button:hover {
            background: #ff5252;
        }
        button:disabled {
            background: #ccc;
            cursor: not-allowed;
        }
        .success {
            text-align: center;
            padding: 20px;
            background: rgba(76, 175, 80, 0.2);
            border-radius: 10px;
            margin-top: 20px;
        }
        .error {
            color: #ff6b6b;
            margin-top: 10px;
            text-align: center;
        }
        .queue-link {
            text-align: center;
            margin-top: 20px;
        }
        .queue-link a {
            color: #4fc3f7;
            text-decoration: none;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎤 Song Request</h1>

        <form hx-post="/api/sessions/${sessionId}/songs"
              hx-target="#result"
              hx-swap="innerHTML"
              hx-on::before-request="document.querySelector('button').disabled = true"
              hx-on::after-request="document.querySelector('button').disabled = false">

            <div class="form-group">
                <label for="singer_select">Singer</label>
                <select id="singer_select" name="singer_select" onchange="toggleNewSingerInput()" required>
                    <option value="">Select a singer...</option>
                    <option value="__NEW__">🆕 New Singer</option>
                    <div id="existing-singers-options"></div>
                </select>
            </div>

            <div class="form-group" id="new-singer-group" style="display: none;">
                <label for="new_singer_name">New Singer Name</label>
                <input type="text" id="new_singer_name" name="new_singer_name" placeholder="Enter your name">
            </div>

            <div class="form-group">
                <label for="artist">Artist</label>
                <input type="text" id="artist" name="artist" required>
            </div>

            <div class="form-group">
                <label for="song_title">Song Title</label>
                <input type="text" id="song_title" name="song_title" required>
            </div>

            <button type="submit">🎵 Add to Queue</button>
        </form>

        <div id="result"></div>

        <div class="queue-link">
            <a href="/queue/${sessionId}">View Queue</a>
        </div>
    </div>

    <script>
        // Load existing singers when page loads
        async function loadExistingSingers() {
            try {
                const response = await fetch('/api/sessions/${sessionId}/singers');
                const data = await response.json();

                const select = document.getElementById('singer_select');
                const existingOptions = document.getElementById('existing-singers-options');

                // Clear existing options (except the first two)
                existingOptions.innerHTML = '';

                // Add existing singers as options
                data.singers.forEach(singer => {
                    const option = document.createElement('option');
                    option.value = singer;
                    option.textContent = singer;
                    select.insertBefore(option, select.children[2]); // Insert before the existing-singers-options div
                });
            } catch (error) {
                console.error('Error loading singers:', error);
            }
        }

        // Toggle new singer input based on selection
        function toggleNewSingerInput() {
            const select = document.getElementById('singer_select');
            const newSingerGroup = document.getElementById('new-singer-group');
            const newSingerInput = document.getElementById('new_singer_name');

            if (select.value === '__NEW__') {
                newSingerGroup.style.display = 'block';
                newSingerInput.required = true;
                newSingerInput.focus();
            } else {
                newSingerGroup.style.display = 'none';
                newSingerInput.required = false;
                newSingerInput.value = '';
            }
        }

        // Custom form validation
        function validateForm() {
            const select = document.getElementById('singer_select');
            const newSingerInput = document.getElementById('new_singer_name');

            if (select.value === '__NEW__' && !newSingerInput.value.trim()) {
                alert('Please enter your name');
                newSingerInput.focus();
                return false;
            }

            if (!select.value) {
                alert('Please select a singer');
                select.focus();
                return false;
            }

            return true;
        }

        // Override form submission to include validation
        document.querySelector('form').addEventListener('submit', function(e) {
            if (!validateForm()) {
                e.preventDefault();
                return false;
            }

            // Set the singer name based on selection
            const select = document.getElementById('singer_select');
            const newSingerInput = document.getElementById('new_singer_name');

            // Create a hidden input with the final singer name
            const hiddenInput = document.createElement('input');
            hiddenInput.type = 'hidden';
            hiddenInput.name = 'singer_name';

            if (select.value === '__NEW__') {
                hiddenInput.value = newSingerInput.value.trim();
            } else {
                hiddenInput.value = select.value;
            }

            this.appendChild(hiddenInput);
        });

        // Load singers when page loads
        window.addEventListener('load', loadExistingSingers);
    </script>
</body>
</html>`;

  res.send(html);
});

// Submit song request
app.post('/api/sessions/:sessionId/songs', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { singer_name, artist, song_title } = req.body;

    const session = getSession(sessionId);
    if (!session) {
      return res.status(404).send('<div class="error">Session not found</div>');
    }

    // Get deduplicated name
    const finalName = getDeduplicatedName(sessionId, singer_name);

    // Add song to queue
    const result = addSong(sessionId, finalName, artist, song_title);
    const songs = getSongs(sessionId);
    const position = songs.length;

    const successHtml = `
      <div class="success">
        <h3>🎉 Request Added!</h3>
        <p><strong>${finalName}</strong></p>
        <p>"${song_title}" by ${artist}</p>
        <p>Queue position: <strong>#${position}</strong></p>
        <p>Estimated wait: ~${Math.round((position - 1) * session.song_duration / 60)} minutes</p>
      </div>`;

    res.send(successHtml);
  } catch (error) {
    console.error('Error adding song:', error);
    res.status(500).send('<div class="error">Failed to add song request</div>');
  }
});

// Queue view (HTML)
app.get('/queue/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = getSession(sessionId);

  if (!session) {
    return res.status(404).send('<h1>Session not found</h1>');
  }

  const songs = getSongs(sessionId);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Karaoke Queue</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: white;
        }
        .container {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 30px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
        h1 {
            text-align: center;
            margin-bottom: 30px;
        }
        .song {
            background: rgba(255, 255, 255, 0.1);
            margin-bottom: 15px;
            padding: 20px;
            border-radius: 10px;
            border-left: 4px solid #ff6b6b;
        }
        .song.playing {
            border-left-color: #4caf50;
            background: rgba(76, 175, 80, 0.2);
        }
        .song.done {
            opacity: 0.6;
            border-left-color: #999;
        }
        .position {
            font-size: 1.2em;
            font-weight: bold;
            color: #ff6b6b;
        }
        .song.playing .position {
            color: #4caf50;
        }
        .singer {
            font-size: 1.1em;
            font-weight: 600;
            margin: 5px 0;
        }
        .track {
            font-style: italic;
        }
        .refresh-btn {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #ff6b6b;
            color: white;
            border: none;
            border-radius: 50%;
            width: 60px;
            height: 60px;
            font-size: 24px;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎵 Queue</h1>

        <div id="queue">
            ${songs.map(song => `
                <div class="song ${song.status}">
                    <div class="position">#${song.position}</div>
                    <div class="singer">${song.singer_name}</div>
                    <div class="track">"${song.song_title}" by ${song.artist}</div>
                </div>
            `).join('')}
        </div>

        ${songs.length === 0 ? '<p style="text-align: center; opacity: 0.7;">No songs in queue yet!</p>' : ''}
    </div>

    <button class="refresh-btn" onclick="location.reload()">🔄</button>

    <script>
        // Auto-refresh every 10 seconds
        setInterval(() => {
            location.reload();
        }, 10000);
    </script>
</body>
</html>`;

  res.send(html);
});

// DJ Dashboard (serves React app)
app.get('/dj/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = getSession(sessionId);

  if (!session) {
    return res.status(404).send('<h1>Session not found</h1>');
  }

  res.sendFile(join(__dirname, 'public', 'dj', 'index.html'));
});

// API: Get songs for session
app.get('/api/sessions/:sessionId/songs', (req, res) => {
  try {
    const songs = getSongs(req.params.sessionId);
    const stats = getSingerStats(req.params.sessionId);
    res.json({ songs, stats });
  } catch (error) {
    console.error('Error getting songs:', error);
    res.status(500).json({ error: 'Failed to get songs' });
  }
});

// API: Get existing singers for session
app.get('/api/sessions/:sessionId/singers', (req, res) => {
  try {
    const session = getSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const singers = getUniqueSingers(req.params.sessionId);
    res.json({ singers });
  } catch (error) {
    console.error('Error getting singers:', error);
    res.status(500).json({ error: 'Failed to get singers' });
  }
});

// API: Update song position
app.put('/api/songs/:id/position', (req, res) => {
  try {
    const { position } = req.body;
    updateSongPosition(req.params.id, position);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating position:', error);
    res.status(500).json({ error: 'Failed to update position' });
  }
});

// API: Update song status
app.put('/api/songs/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    updateSongStatus(req.params.id, status);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// API: Delete song
app.delete('/api/songs/:id', (req, res) => {
  try {
    deleteSong(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting song:', error);
    res.status(500).json({ error: 'Failed to delete song' });
  }
});

// API: Reorder songs
app.put('/api/sessions/:sessionId/reorder', (req, res) => {
  try {
    const { songPositions } = req.body;
    reorderSongs(req.params.sessionId, songPositions);
    res.json({ success: true });
  } catch (error) {
    console.error('Error reordering songs:', error);
    res.status(500).json({ error: 'Failed to reorder songs' });
  }
});

// Home page
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Karaoke DJ Queue</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
            text-align: center;
        }
        button {
            background: #ff6b6b;
            color: white;
            border: none;
            padding: 15px 30px;
            font-size: 18px;
            border-radius: 10px;
            cursor: pointer;
            margin: 10px;
        }
        button:hover {
            background: #ff5252;
        }
    </style>
</head>
<body>
    <h1>🎤 Karaoke DJ Queue</h1>
    <p>Create a new session to start accepting song requests!</p>
    <button onclick="createSession()">Start New Session</button>

    <script>
        async function createSession() {
            try {
                const response = await fetch('/api/sessions', { method: 'POST' });
                const data = await response.json();
                window.location.href = data.djUrl;
            } catch (error) {
                alert('Failed to create session');
            }
        }
    </script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`🎤 Karaoke DJ Queue server running on http://localhost:${PORT}`);
});