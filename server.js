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
  getUniqueSingers,
  getAllSessionsWithStats,
  updateSessionTips
} from './database-sqlite.js';

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
    const tipHandles = {
      venmo_handle: req.body.venmo_handle || null,
      cashapp_handle: req.body.cashapp_handle || null,
      zelle_handle: req.body.zelle_handle || null
    };

    createSession(sessionId, songDuration, tipHandles);
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
            margin-top: 25px;
        }
        .view-queue-btn {
            display: inline-block;
            background: linear-gradient(135deg, #4fc3f7, #29b6f6);
            color: white;
            text-decoration: none;
            font-weight: 600;
            font-size: 18px;
            padding: 15px 30px;
            border-radius: 12px;
            box-shadow: 0 4px 15px rgba(79, 195, 247, 0.3);
            transition: all 0.3s ease;
        }
        .view-queue-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(79, 195, 247, 0.4);
            background: linear-gradient(135deg, #29b6f6, #4fc3f7);
        }
        .tip-section {
            margin-top: 30px;
            background: rgba(255, 255, 255, 0.15);
            border-radius: 15px;
            padding: 25px;
            text-align: center;
        }
        .tip-section h3 {
            margin-bottom: 10px;
            font-size: 1.3rem;
        }
        .tip-section p {
            margin-bottom: 20px;
            opacity: 0.9;
        }
        .tip-buttons {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .tip-button-container {
            display: flex;
            gap: 8px;
            align-items: center;
        }
        .tip-button {
            display: block;
            padding: 15px 20px;
            border-radius: 10px;
            text-decoration: none;
            color: white;
            font-weight: 600;
            font-size: 16px;
            transition: all 0.3s ease;
            text-align: center;
            flex: 1;
        }
        .qr-btn {
            background: rgba(255, 255, 255, 0.2);
            border: 2px solid rgba(255, 255, 255, 0.3);
            color: white;
            padding: 12px 15px;
            border-radius: 10px;
            cursor: pointer;
            font-size: 18px;
            transition: all 0.3s ease;
            backdrop-filter: blur(5px);
        }
        .qr-btn:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: scale(1.05);
        }
        .tip-button.venmo {
            background: linear-gradient(135deg, #8B5CF6, #A855F7);
        }
        .tip-button.cashapp {
            background: linear-gradient(135deg, #10B981, #059669);
        }
        .tip-button.zelle {
            background: linear-gradient(135deg, #F59E0B, #D97706);
            cursor: default;
        }
        .tip-button:hover:not(.zelle) {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
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

${(session.venmo_handle || session.cashapp_handle || session.zelle_handle) ? `
        <div class="tip-section">
            <h3>💰 Tip Your DJ!</h3>
            <p>Enjoying the music? Show some love!</p>
            <div class="tip-buttons">
                ${session.venmo_handle ? `
                <div class="tip-button-container">
                    <a href="https://venmo.com/${session.venmo_handle.replace('@', '')}" target="_blank" class="tip-button venmo">
                        💜 Venmo: ${session.venmo_handle}
                    </a>
                    <button onclick="showQRCode('https://venmo.com/${session.venmo_handle.replace('@', '')}', 'Venmo: ${session.venmo_handle}')" class="qr-btn">📱</button>
                </div>` : ''}
                ${session.cashapp_handle ? `
                <div class="tip-button-container">
                    <a href="https://cash.app/${session.cashapp_handle.replace('$', '')}" target="_blank" class="tip-button cashapp">
                        💚 Cash App: ${session.cashapp_handle}
                    </a>
                    <button onclick="showQRCode('https://cash.app/${session.cashapp_handle.replace('$', '')}', 'Cash App: ${session.cashapp_handle}')" class="qr-btn">📱</button>
                </div>` : ''}
                ${session.zelle_handle ? `
                <div class="tip-button-container">
                    <div class="tip-button zelle">
                        💛 Zelle: ${session.zelle_handle}
                    </div>
                    <button onclick="showQRCode('${session.zelle_handle}', 'Zelle: ${session.zelle_handle}')" class="qr-btn">📱</button>
                </div>` : ''}
            </div>
        </div>` : ''}

        <div class="queue-link">
            <a href="/queue/${sessionId}" class="view-queue-btn">📋 View Live Queue</a>
        </div>
    </div>

    <!-- QR Code Modal -->
    <div id="qrModal" class="qr-modal">
        <div class="qr-modal-content">
            <button class="close-modal" onclick="closeQRModal()">×</button>
            <h3 id="qrTitle">Share This Link</h3>
            <div class="qr-code-container">
                <div id="qrcode"></div>
            </div>
            <p>Scan with your phone to open the link</p>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
    <script>
        // QR Code functionality
        function showQRCode(url, title) {
            document.getElementById('qrTitle').textContent = title;
            const qrContainer = document.getElementById('qrcode');
            qrContainer.innerHTML = ''; // Clear previous QR code

            // Use QR Server API for reliable QR generation
            const img = document.createElement('img');
            img.src = \`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=\${encodeURIComponent(url)}\`;
            img.style.width = '200px';
            img.style.height = '200px';
            img.style.display = 'block';
            img.style.margin = '0 auto';
            img.alt = 'QR Code';
            img.onload = function() {
                console.log('QR Code loaded successfully');
            };
            img.onerror = function() {
                console.error('Failed to load QR code');
                qrContainer.innerHTML = '<p>Failed to generate QR code</p>';
            };
            qrContainer.appendChild(img);

            document.getElementById('qrModal').style.display = 'block';
        }

        function closeQRModal() {
            document.getElementById('qrModal').style.display = 'none';
        }

        // Close modal when clicking outside
        document.getElementById('qrModal').addEventListener('click', function(e) {
            if (e.target === this) {
                closeQRModal();
            }
        });

        // Load existing singers when page loads
        async function loadExistingSingers() {
            try {
                const response = await fetch('/api/sessions/${sessionId}/singers');
                const data = await response.json();

                const select = document.getElementById('singer_select');

                // Remove any existing singer options (keep first two: placeholder and "New Singer")
                while (select.children.length > 2) {
                    select.removeChild(select.lastChild);
                }

                // Add existing singers as options
                data.singers.forEach(singer => {
                    const option = document.createElement('option');
                    option.value = singer;
                    option.textContent = singer;
                    select.appendChild(option);
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

    // Use the singer name as-is if it's from the dropdown (existing singer)
    // Only apply deduplication if it's a new singer name
    const existingSingers = getUniqueSingers(sessionId);
    let finalName = singer_name;

    // If this singer name doesn't exist yet, apply deduplication
    if (!existingSingers.includes(singer_name)) {
      finalName = getDeduplicatedName(sessionId, singer_name);
    }

    // Add song to queue
    const result = addSong(sessionId, finalName, artist, song_title);
    const songs = getSongs(sessionId);
    const position = songs.length;

    console.log('Session data:', session); // Debug log
    console.log('Tip handles:', { venmo: session.venmo_handle, cashapp: session.cashapp_handle, zelle: session.zelle_handle }); // Debug log

    const tipSection = (session.venmo_handle || session.cashapp_handle || session.zelle_handle) ? `
      <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.3);">
        <h4 style="margin-bottom: 10px; color: #4fc3f7;">💰 Tip Your DJ!</h4>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${session.venmo_handle ? `
          <div style="display: flex; gap: 8px; align-items: center;">
            <a href="https://venmo.com/${session.venmo_handle.replace('@', '')}" target="_blank"
               style="display: block; padding: 10px; background: linear-gradient(135deg, #8B5CF6, #A855F7);
                      color: white; text-decoration: none; border-radius: 8px; font-weight: 600; text-align: center; flex: 1;">
              💜 Venmo: ${session.venmo_handle}
            </a>
            <button onclick="showQRCode('https://venmo.com/${session.venmo_handle.replace('@', '')}', 'Venmo: ${session.venmo_handle}')"
                    style="background: rgba(255, 255, 255, 0.2); border: 2px solid rgba(255, 255, 255, 0.3); color: white;
                           padding: 10px 12px; border-radius: 8px; cursor: pointer; font-size: 16px;">📱</button>
          </div>` : ''}
          ${session.cashapp_handle ? `
          <div style="display: flex; gap: 8px; align-items: center;">
            <a href="https://cash.app/${session.cashapp_handle.replace('$', '')}" target="_blank"
               style="display: block; padding: 10px; background: linear-gradient(135deg, #10B981, #059669);
                      color: white; text-decoration: none; border-radius: 8px; font-weight: 600; text-align: center; flex: 1;">
              💚 Cash App: ${session.cashapp_handle}
            </a>
            <button onclick="showQRCode('https://cash.app/${session.cashapp_handle.replace('$', '')}', 'Cash App: ${session.cashapp_handle}')"
                    style="background: rgba(255, 255, 255, 0.2); border: 2px solid rgba(255, 255, 255, 0.3); color: white;
                           padding: 10px 12px; border-radius: 8px; cursor: pointer; font-size: 16px;">📱</button>
          </div>` : ''}
          ${session.zelle_handle ? `
          <div style="display: flex; gap: 8px; align-items: center;">
            <div style="display: block; padding: 10px; background: linear-gradient(135deg, #F59E0B, #D97706);
                        color: white; border-radius: 8px; font-weight: 600; text-align: center; flex: 1;">
              💛 Zelle: ${session.zelle_handle}
            </div>
            <button onclick="showQRCode('${session.zelle_handle}', 'Zelle: ${session.zelle_handle}')"
                    style="background: rgba(255, 255, 255, 0.2); border: 2px solid rgba(255, 255, 255, 0.3); color: white;
                           padding: 10px 12px; border-radius: 8px; cursor: pointer; font-size: 16px;">📱</button>
          </div>` : ''}
        </div>
      </div>` : '';

    const successHtml = `
      <div class="success">
        <h3>🎉 Request Added!</h3>
        <p><strong>${finalName}</strong></p>
        <p>"${song_title}" by ${artist}</p>
        <p>Queue position: <strong>#${position}</strong></p>
        <p>Estimated wait: ~${Math.round((position - 1) * session.song_duration / 60)} minutes</p>
        ${tipSection}
        <div style="margin-top: 20px; display: flex; gap: 10px; flex-wrap: wrap;">
          <a href="/queue/${sessionId}" class="view-queue-btn" style="display: inline-block; background: linear-gradient(135deg, #4fc3f7, #29b6f6); color: white; text-decoration: none; font-weight: 600; font-size: 16px; padding: 12px 25px; border-radius: 10px; box-shadow: 0 4px 15px rgba(79, 195, 247, 0.3); flex: 1; text-align: center;">
            📋 View Live Queue
          </a>
          <button onclick="location.reload()" style="background: linear-gradient(135deg, #ff6b6b, #ff5252); color: white; border: none; font-weight: 600; font-size: 16px; padding: 12px 25px; border-radius: 10px; box-shadow: 0 4px 15px rgba(255, 107, 107, 0.3); flex: 1; cursor: pointer;">
            🎵 Request Another
          </button>
        </div>
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

  const allSongs = getSongs(sessionId);
  const queueSongs = allSongs.filter(song => song.status === 'waiting' || song.status === 'playing');
  const playedSongs = allSongs.filter(song => song.status === 'done');

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
        .section-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid rgba(255, 255, 255, 0.2);
        }
        .section-title {
            font-size: 1.2rem;
            font-weight: 600;
        }
        .section-count {
            background: rgba(255, 255, 255, 0.2);
            padding: 5px 12px;
            border-radius: 15px;
            font-size: 0.9rem;
            font-weight: 600;
        }
        .played-section {
            margin-top: 40px;
            padding-top: 30px;
            border-top: 2px solid rgba(255, 255, 255, 0.1);
        }
        .played-songs {
            max-height: 300px;
            overflow-y: auto;
        }
        .played-songs::-webkit-scrollbar {
            width: 8px;
        }
        .played-songs::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 4px;
        }
        .played-songs::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.3);
            border-radius: 4px;
        }
        .queue-tips {
            margin-top: 40px;
            border-top: 2px solid rgba(255, 255, 255, 0.1);
            padding-top: 30px;
        }
        /* QR Code Modal */
        .qr-modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            z-index: 1000;
            backdrop-filter: blur(5px);
        }
        .qr-modal-content {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 30px;
            text-align: center;
            max-width: 90vw;
            max-height: 90vh;
            color: #333;
        }
        .qr-modal h3 {
            margin-bottom: 20px;
            color: #333;
        }
        .qr-code-container {
            background: white;
            padding: 20px;
            border-radius: 15px;
            margin: 20px 0;
            display: inline-block;
        }
        .close-modal {
            position: absolute;
            top: 15px;
            right: 20px;
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #666;
        }
        .close-modal:hover {
            color: #333;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎵 Karaoke Queue</h1>

        <!-- Current Queue Section -->
        <div class="section-header">
            <div class="section-title">Up Next</div>
            <div class="section-count">${queueSongs.length} songs</div>
        </div>

        <div id="queue">
            ${queueSongs.map(song => `
                <div class="song ${song.status}">
                    <div class="position">#${song.position}</div>
                    <div class="singer">${song.singer_name}</div>
                    <div class="track">"${song.song_title}" by ${song.artist}</div>
                </div>
            `).join('')}
        </div>

        ${queueSongs.length === 0 ? '<p style="text-align: center; opacity: 0.7;">No songs in queue yet!</p>' : ''}

        <!-- Played Songs Section -->
        ${playedSongs.length > 0 ? `
        <div class="played-section">
            <div class="section-header">
                <div class="section-title">🎤 Already Played</div>
                <div class="section-count">${playedSongs.length} songs</div>
            </div>

            <div class="played-songs">
                ${playedSongs.slice().reverse().map(song => `
                    <div class="song done">
                        <div class="singer">${song.singer_name}</div>
                        <div class="track">"${song.song_title}" by ${song.artist}</div>
                    </div>
                `).join('')}
            </div>
        </div>` : ''}

        <!-- Tip Section for Queue View -->
        ${(session.venmo_handle || session.cashapp_handle || session.zelle_handle) ? `
        <div class="tip-section queue-tips">
            <h3>💰 Tip Your DJ!</h3>
            <p>Enjoying the music? Show some love!</p>
            <div class="tip-buttons">
                ${session.venmo_handle ? `
                <div class="tip-button-container">
                    <a href="https://venmo.com/${session.venmo_handle.replace('@', '')}" target="_blank" class="tip-button venmo">
                        💜 Venmo: ${session.venmo_handle}
                    </a>
                    <button onclick="showQRCode('https://venmo.com/${session.venmo_handle.replace('@', '')}', 'Venmo: ${session.venmo_handle}')" class="qr-btn">📱</button>
                </div>` : ''}
                ${session.cashapp_handle ? `
                <div class="tip-button-container">
                    <a href="https://cash.app/${session.cashapp_handle.replace('$', '')}" target="_blank" class="tip-button cashapp">
                        💚 Cash App: ${session.cashapp_handle}
                    </a>
                    <button onclick="showQRCode('https://cash.app/${session.cashapp_handle.replace('$', '')}', 'Cash App: ${session.cashapp_handle}')" class="qr-btn">📱</button>
                </div>` : ''}
                ${session.zelle_handle ? `
                <div class="tip-button-container">
                    <div class="tip-button zelle">
                        💛 Zelle: ${session.zelle_handle}
                    </div>
                    <button onclick="showQRCode('${session.zelle_handle}', 'Zelle: ${session.zelle_handle}')" class="qr-btn">📱</button>
                </div>` : ''}
            </div>
        </div>` : ''}
    </div>

    <button class="refresh-btn" onclick="location.reload()">🔄</button>

    <!-- QR Code Modal -->
    <div id="qrModal" class="qr-modal">
        <div class="qr-modal-content">
            <button class="close-modal" onclick="closeQRModal()">×</button>
            <h3 id="qrTitle">Share This Link</h3>
            <div class="qr-code-container">
                <div id="qrcode"></div>
            </div>
            <p>Scan with your phone to open the link</p>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
    <script>
        let isUpdating = false;

        // QR Code functionality
        function showQRCode(url, title) {
            document.getElementById('qrTitle').textContent = title;
            const qrContainer = document.getElementById('qrcode');
            qrContainer.innerHTML = ''; // Clear previous QR code

            // Use QR Server API for reliable QR generation
            const img = document.createElement('img');
            img.src = \`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=\${encodeURIComponent(url)}\`;
            img.style.width = '200px';
            img.style.height = '200px';
            img.style.display = 'block';
            img.style.margin = '0 auto';
            img.alt = 'QR Code';
            img.onload = function() {
                console.log('QR Code loaded successfully');
            };
            img.onerror = function() {
                console.error('Failed to load QR code');
                qrContainer.innerHTML = '<p>Failed to generate QR code</p>';
            };
            qrContainer.appendChild(img);

            document.getElementById('qrModal').style.display = 'block';
        }

        function closeQRModal() {
            document.getElementById('qrModal').style.display = 'none';
        }

        // Close modal when clicking outside
        document.getElementById('qrModal').addEventListener('click', function(e) {
            if (e.target === this) {
                closeQRModal();
            }
        });

        // Update queue content without full page reload
        async function updateQueue() {
            if (isUpdating) return;
            isUpdating = true;

            try {
                const response = await fetch('/api/sessions/${sessionId}/songs');
                if (!response.ok) {
                    throw new Error('Failed to fetch queue data');
                }

                const data = await response.json();
                const queueSongs = data.songs.filter(song => song.status === 'waiting' || song.status === 'playing');
                const playedSongs = data.songs.filter(song => song.status === 'done');

                // Update current queue section
                const queueContainer = document.getElementById('queue');
                const queueCountElement = document.querySelector('.section-count');

                if (queueCountElement) {
                    queueCountElement.textContent = queueSongs.length + ' songs';
                }

                if (queueContainer) {
                    if (queueSongs.length === 0) {
                        queueContainer.innerHTML = '<p style="text-align: center; opacity: 0.7;">No songs in queue yet!</p>';
                    } else {
                        queueContainer.innerHTML = queueSongs.map(song => \`
                            <div class="song \${song.status}">
                                <div class="position">#\${song.position}</div>
                                <div class="singer">\${song.singer_name}</div>
                                <div class="track">"\${song.song_title}" by \${song.artist}</div>
                            </div>
                        \`).join('');
                    }
                }

                // Update played songs section
                const playedSection = document.querySelector('.played-section');
                if (playedSongs.length > 0) {
                    if (!playedSection) {
                        // Create played section if it doesn't exist
                        const container = document.querySelector('.container');
                        const playedSectionHtml = \`
                            <div class="played-section">
                                <div class="section-header">
                                    <div class="section-title">🎤 Already Played</div>
                                    <div class="section-count">\${playedSongs.length} songs</div>
                                </div>
                                <div class="played-songs">
                                    \${playedSongs.slice().reverse().map(song => \`
                                        <div class="song done">
                                            <div class="singer">\${song.singer_name}</div>
                                            <div class="track">"\${song.song_title}" by \${song.artist}</div>
                                        </div>
                                    \`).join('')}
                                </div>
                            </div>
                        \`;

                        // Insert before tips section or refresh button
                        const tipsSection = document.querySelector('.queue-tips');
                        const refreshBtn = document.querySelector('.refresh-btn');
                        if (tipsSection) {
                            tipsSection.insertAdjacentHTML('beforebegin', playedSectionHtml);
                        } else if (refreshBtn) {
                            refreshBtn.insertAdjacentHTML('beforebegin', playedSectionHtml);
                        } else {
                            container.insertAdjacentHTML('beforeend', playedSectionHtml);
                        }
                    } else {
                        // Update existing played section
                        const playedCount = playedSection.querySelector('.section-count');
                        const playedContainer = playedSection.querySelector('.played-songs');

                        if (playedCount) {
                            playedCount.textContent = playedSongs.length + ' songs';
                        }

                        if (playedContainer) {
                            playedContainer.innerHTML = playedSongs.slice().reverse().map(song => \`
                                <div class="song done">
                                    <div class="singer">\${song.singer_name}</div>
                                    <div class="track">"\${song.song_title}" by \${song.artist}</div>
                                </div>
                            \`).join('');
                        }
                    }
                } else {
                    // Remove played section if no played songs
                    if (playedSection) {
                        playedSection.remove();
                    }
                }

                // Update refresh button with timestamp
                const refreshBtn = document.querySelector('.refresh-btn');
                if (refreshBtn) {
                    const now = new Date();
                    const timeStr = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    refreshBtn.title = \`Last updated: \${timeStr}\`;
                }

            } catch (error) {
                console.error('Error updating queue:', error);
                // Fall back to full page reload on error
                location.reload();
            } finally {
                isUpdating = false;
            }
        }

        // Update queue every 5 seconds
        setInterval(updateQueue, 5000);

        // Also update when page becomes visible again
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                updateQueue();
            }
        });

        // Manual refresh button functionality
        document.querySelector('.refresh-btn').addEventListener('click', (e) => {
            e.preventDefault();
            updateQueue();
        });
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

// API: Update session tip information
app.put('/api/sessions/:sessionId/tips', (req, res) => {
  try {
    const { venmo_handle, cashapp_handle, zelle_handle } = req.body;
    const tipHandles = { venmo_handle, cashapp_handle, zelle_handle };
    updateSessionTips(req.params.sessionId, tipHandles);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating session tips:', error);
    res.status(500).json({ error: 'Failed to update tip information' });
  }
});

// Admin API endpoint
app.get('/api/admin/sessions', (req, res) => {
  try {
    const sessions = getAllSessionsWithStats();
    res.json({ sessions });
  } catch (error) {
    console.error('Error fetching admin sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Admin dashboard
app.get('/admin', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Admin Dashboard - Karaoke DJ Queue</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
            min-height: 100vh;
            color: white;
            padding: 20px;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
        }

        .header {
            text-align: center;
            margin-bottom: 40px;
        }

        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }

        .stat-card {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 20px;
            text-align: center;
        }

        .stat-number {
            font-size: 2rem;
            font-weight: bold;
            margin-bottom: 5px;
        }

        .stat-label {
            opacity: 0.8;
        }

        .sessions-section {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 30px;
        }

        .section-title {
            font-size: 1.5rem;
            margin-bottom: 20px;
            text-align: center;
        }

        .sessions-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
        }

        .session-card {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            padding: 20px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            transition: all 0.3s ease;
            cursor: pointer;
            text-decoration: none;
            color: inherit;
            display: block;
        }

        .session-card:hover {
            background: rgba(255, 255, 255, 0.2);
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
        }

        .session-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }

        .session-id {
            font-size: 1.2rem;
            font-weight: bold;
        }

        .session-date {
            font-size: 0.9rem;
            opacity: 0.8;
        }

        .session-stats {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
            margin-bottom: 10px;
        }

        .session-stat {
            text-align: center;
            padding: 8px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 5px;
        }

        .session-stat-number {
            font-weight: bold;
            font-size: 1.1rem;
        }

        .session-stat-label {
            font-size: 0.8rem;
            opacity: 0.8;
        }

        .session-singers {
            margin-top: 10px;
            font-size: 0.9rem;
            opacity: 0.8;
        }

        .loading {
            text-align: center;
            padding: 40px;
            opacity: 0.7;
        }

        .back-link {
            display: inline-block;
            margin-bottom: 20px;
            padding: 10px 20px;
            background: rgba(255, 255, 255, 0.2);
            color: white;
            text-decoration: none;
            border-radius: 5px;
            transition: background 0.3s ease;
        }

        .back-link:hover {
            background: rgba(255, 255, 255, 0.3);
        }

        @media (max-width: 768px) {
            .stats-grid {
                grid-template-columns: repeat(2, 1fr);
            }

            .sessions-grid {
                grid-template-columns: 1fr;
            }

            .session-stats {
                grid-template-columns: repeat(3, 1fr);
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <a href="/" class="back-link">← Back to Home</a>

        <div class="header">
            <h1>🎤 Admin Dashboard</h1>
            <p>Manage all your karaoke sessions</p>
        </div>

        <div class="stats-grid" id="overview-stats">
            <div class="stat-card">
                <div class="stat-number" id="total-sessions">-</div>
                <div class="stat-label">Total Sessions</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="total-songs">-</div>
                <div class="stat-label">Total Songs</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="total-singers">-</div>
                <div class="stat-label">Total Singers</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="completion-rate">-</div>
                <div class="stat-label">Completion Rate</div>
            </div>
        </div>

        <div class="sessions-section">
            <h2 class="section-title">All Sessions</h2>
            <div id="sessions-container">
                <div class="loading">Loading sessions...</div>
            </div>
        </div>
    </div>

    <script>
        async function loadAdminData() {
            try {
                const response = await fetch('/api/admin/sessions');
                const data = await response.json();

                displayOverviewStats(data.sessions);
                displaySessions(data.sessions);
            } catch (error) {
                console.error('Error loading admin data:', error);
                document.getElementById('sessions-container').innerHTML =
                    '<div style="text-align: center; color: #ff6b6b;">Error loading sessions</div>';
            }
        }

        function displayOverviewStats(sessions) {
            const totalSessions = sessions.length;
            const totalSongs = sessions.reduce((sum, s) => sum + s.total_songs, 0);
            const totalSingers = sessions.reduce((sum, s) => sum + s.unique_singers, 0);
            const completedSongs = sessions.reduce((sum, s) => sum + s.completed_songs, 0);
            const completionRate = totalSongs > 0 ? Math.round((completedSongs / totalSongs) * 100) : 0;

            document.getElementById('total-sessions').textContent = totalSessions;
            document.getElementById('total-songs').textContent = totalSongs;
            document.getElementById('total-singers').textContent = totalSingers;
            document.getElementById('completion-rate').textContent = completionRate + '%';
        }

        function displaySessions(sessions) {
            const container = document.getElementById('sessions-container');

            if (sessions.length === 0) {
                container.innerHTML = '<div style="text-align: center; opacity: 0.7;">No sessions found</div>';
                return;
            }

            const sessionsHTML = sessions.map(session => {
                const date = new Date(session.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                return \`
                    <a href="/dj/\${session.id}" class="session-card">
                        <div class="session-header">
                            <div class="session-id">\${session.id}</div>
                            <div class="session-date">\${date}</div>
                        </div>

                        <div class="session-stats">
                            <div class="session-stat">
                                <div class="session-stat-number">\${session.total_songs}</div>
                                <div class="session-stat-label">Total Songs</div>
                            </div>
                            <div class="session-stat">
                                <div class="session-stat-number">\${session.waiting_songs}</div>
                                <div class="session-stat-label">Waiting</div>
                            </div>
                            <div class="session-stat">
                                <div class="session-stat-number">\${session.completed_songs}</div>
                                <div class="session-stat-label">Completed</div>
                            </div>
                            <div class="session-stat">
                                <div class="session-stat-number">\${session.skipped_songs}</div>
                                <div class="session-stat-label">Skipped</div>
                            </div>
                        </div>

                        <div class="session-singers">
                            \${session.unique_singers} unique singers
                        </div>
                    </a>
                \`;
            }).join('');

            container.innerHTML = \`<div class="sessions-grid">\${sessionsHTML}</div>\`;
        }

        // Load data when page loads
        loadAdminData();

        // Refresh every 30 seconds
        setInterval(loadAdminData, 30000);
    </script>
</body>
</html>
  `);
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
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: white;
        }
        .container {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
        h1 {
            margin-bottom: 20px;
            font-size: 2.5rem;
        }
        .subtitle {
            margin-bottom: 30px;
            opacity: 0.9;
        }
        .form-section {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 15px;
            padding: 30px;
            margin-bottom: 20px;
            text-align: left;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #fff;
        }
        input {
            width: 100%;
            padding: 12px;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            background: rgba(255, 255, 255, 0.9);
            box-sizing: border-box;
        }
        input::placeholder {
            opacity: 0.6;
        }
        .tip-section {
            margin-top: 20px;
        }
        .tip-subtitle {
            font-size: 1.1rem;
            margin-bottom: 15px;
            color: #4fc3f7;
        }
        .tip-note {
            font-size: 0.9rem;
            opacity: 0.8;
            margin-bottom: 15px;
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
            width: 100%;
            transition: background 0.3s;
        }
        button:hover {
            background: #ff5252;
        }
        .admin-link {
            display: inline-block;
            padding: 12px 24px;
            background: rgba(255, 255, 255, 0.2);
            color: white;
            text-decoration: none;
            border-radius: 5px;
            font-weight: 500;
            transition: background 0.3s ease;
        }
        .admin-link:hover {
            background: rgba(255, 255, 255, 0.3);
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎤 Karaoke DJ Queue</h1>
        <p class="subtitle">Create a new session to start accepting song requests!</p>

        <form id="sessionForm" class="form-section">
            <div class="tip-section">
                <div class="tip-subtitle">💰 Set Up Tips (Optional)</div>
                <div class="tip-note">Let singers know how to tip you for your awesome DJ services!</div>

                <div class="form-group">
                    <label for="venmo">Venmo Handle</label>
                    <input type="text" id="venmo" name="venmo" placeholder="@your-venmo">
                </div>

                <div class="form-group">
                    <label for="cashapp">Cash App Handle</label>
                    <input type="text" id="cashapp" name="cashapp" placeholder="$your-cashapp">
                </div>

                <div class="form-group">
                    <label for="zelle">Zelle (Phone/Email)</label>
                    <input type="text" id="zelle" name="zelle" placeholder="555-123-4567 or email@example.com">
                </div>
            </div>

            <button type="submit">🎵 Start New Session</button>
        </form>

        <div style="margin-top: 30px; text-align: center;">
            <a href="/admin" class="admin-link">
                📊 Admin Dashboard
            </a>
        </div>
    </div>

    <script>
        document.getElementById('sessionForm').addEventListener('submit', async function(e) {
            e.preventDefault();

            try {
                const formData = new FormData(e.target);
                const payload = {
                    venmo_handle: formData.get('venmo') || null,
                    cashapp_handle: formData.get('cashapp') || null,
                    zelle_handle: formData.get('zelle') || null
                };

                const response = await fetch('/api/sessions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();
                window.location.href = data.djUrl;
            } catch (error) {
                alert('Failed to create session');
            }
        });
    </script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`🎤 Karaoke DJ Queue server running on http://localhost:${PORT}`);
});