const { useState, useEffect, useRef } = React;

function DJDashboard() {
    const [sessionId, setSessionId] = useState('');
    const [session, setSession] = useState(null);
    const [songs, setSongs] = useState([]);
    const [stats, setStats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [songDuration, setSongDuration] = useState(270);
    const sortableRef = useRef(null);

    // Get session ID from URL
    useEffect(() => {
        const pathParts = window.location.pathname.split('/');
        const id = pathParts[pathParts.length - 1];
        setSessionId(id);
    }, []);

    // Fetch session data
    useEffect(() => {
        if (!sessionId) return;

        async function fetchSession() {
            try {
                const response = await fetch(`/api/sessions/${sessionId}`);
                if (response.ok) {
                    const sessionData = await response.json();
                    setSession(sessionData);
                    setSongDuration(sessionData.song_duration);
                }
            } catch (error) {
                console.error('Error fetching session:', error);
            }
        }

        fetchSession();
    }, [sessionId]);

    // Fetch songs and stats
    const fetchData = async () => {
        if (!sessionId) return;

        try {
            const response = await fetch(`/api/sessions/${sessionId}/songs`);
            if (response.ok) {
                const data = await response.json();
                setSongs(data.songs);
                setStats(data.stats);
            }
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [sessionId]);

    // Set up polling for real-time updates
    useEffect(() => {
        const interval = setInterval(fetchData, 3000); // Poll every 3 seconds
        return () => clearInterval(interval);
    }, [sessionId]);

    // Set up drag and drop
    useEffect(() => {
        if (!sortableRef.current || songs.length === 0) return;

        const sortable = Sortable.create(sortableRef.current, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            onEnd: async (evt) => {
                const newOrder = Array.from(sortableRef.current.children).map((child, index) => ({
                    id: parseInt(child.dataset.songId),
                    position: index + 1
                }));

                try {
                    await fetch(`/api/sessions/${sessionId}/reorder`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ songPositions: newOrder })
                    });
                    await fetchData(); // Refresh data
                } catch (error) {
                    console.error('Error reordering songs:', error);
                }
            }
        });

        return () => sortable.destroy();
    }, [songs, sessionId]);

    // Update song status
    const updateSongStatus = async (songId, status) => {
        try {
            await fetch(`/api/songs/${songId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            });
            await fetchData();
        } catch (error) {
            console.error('Error updating song status:', error);
        }
    };

    // Delete song
    const deleteSong = async (songId) => {
        if (!confirm('Are you sure you want to remove this song?')) return;

        try {
            await fetch(`/api/songs/${songId}`, { method: 'DELETE' });
            await fetchData();
        } catch (error) {
            console.error('Error deleting song:', error);
        }
    };

    // Generate YouTube search URL
    const getYouTubeUrl = (artist, song) => {
        const query = encodeURIComponent(`${artist} ${song} karaoke`);
        return `https://www.youtube.com/results?search_query=${query}`;
    };

    // Calculate wait time
    const calculateWaitTime = (position, currentSongDuration) => {
        const waitingSongs = songs.filter(s => s.position < position && s.status === 'waiting').length;
        const playingSongs = songs.filter(s => s.status === 'playing').length;
        const totalWaitMinutes = (waitingSongs + playingSongs) * (currentSongDuration / 60);
        return Math.round(totalWaitMinutes);
    };

    if (loading) {
        return (
            <div className="container">
                <div className="loading">Loading dashboard...</div>
            </div>
        );
    }

    return (
        <div className="container">
            <div className="header">
                <h1>🎤 DJ Dashboard</h1>
            </div>

            {session && (
                <div className="session-info">
                    <div className="qr-section">
                        <div className="qr-code">
                            <img src={`/qr-codes/${sessionId}.png`} alt="QR Code" />
                        </div>
                        <div>Scan to request songs</div>
                    </div>

                    <div className="session-details">
                        <div className="session-id">{sessionId}</div>
                        <div>Session ID</div>
                        <div style={{ marginTop: '10px', fontSize: '0.9rem', opacity: '0.8' }}>
                            Singer URL: {window.location.origin}/singer/{sessionId}
                        </div>
                    </div>

                    <div className="stats">
                        <div className="stat-item">
                            <div className="stat-number">{songs.length}</div>
                            <div>Total Requests</div>
                        </div>
                        <div className="stat-item">
                            <div className="stat-number">{songs.filter(s => s.status === 'waiting').length}</div>
                            <div>In Queue</div>
                        </div>
                        <div className="stat-item">
                            <div className="stat-number">{songs.filter(s => s.status === 'done').length}</div>
                            <div>Completed</div>
                        </div>
                    </div>
                </div>
            )}

            <div className="main-content">
                <div className="queue-section">
                    <h2 className="section-title">Song Queue</h2>

                    {songs.length === 0 ? (
                        <div className="empty-queue">
                            <div>No songs in queue yet!</div>
                            <div style={{ marginTop: '10px', fontSize: '0.9rem' }}>
                                Share the QR code or session ID for singers to start requesting songs.
                            </div>
                        </div>
                    ) : (
                        <ul className="song-list" ref={sortableRef}>
                            {songs.map((song) => (
                                <li
                                    key={song.id}
                                    className={`song-item ${song.status}`}
                                    data-song-id={song.id}
                                >
                                    <div className="song-header">
                                        <div className="song-position">#{song.position}</div>
                                        <div className="song-actions">
                                            {song.status === 'waiting' && (
                                                <button
                                                    className="btn btn-play"
                                                    onClick={() => updateSongStatus(song.id, 'playing')}
                                                >
                                                    ▶ Play
                                                </button>
                                            )}
                                            {song.status === 'playing' && (
                                                <button
                                                    className="btn btn-done"
                                                    onClick={() => updateSongStatus(song.id, 'done')}
                                                >
                                                    ✓ Done
                                                </button>
                                            )}
                                            <a
                                                href={getYouTubeUrl(song.artist, song.song_title)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="btn btn-youtube"
                                            >
                                                📺 YouTube
                                            </a>
                                            <button
                                                className="btn btn-delete"
                                                onClick={() => deleteSong(song.id)}
                                            >
                                                🗑 Delete
                                            </button>
                                        </div>
                                    </div>

                                    <div className="song-info">
                                        <div className="singer-name">{song.singer_name}</div>
                                        <div className="song-details">
                                            "{song.song_title}" by {song.artist}
                                        </div>
                                    </div>

                                    {song.status === 'waiting' && (
                                        <div className="wait-time">
                                            Est. wait: ~{calculateWaitTime(song.position, songDuration)} min
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="sidebar">
                    <div className="controls-section">
                        <h3 className="section-title">Controls</h3>

                        <div className="control-group">
                            <label htmlFor="song-duration">Average Song Duration (seconds)</label>
                            <input
                                type="number"
                                id="song-duration"
                                value={songDuration}
                                onChange={(e) => setSongDuration(parseInt(e.target.value))}
                                min="60"
                                max="600"
                            />
                        </div>

                        <button
                            className="btn btn-primary"
                            onClick={() => {
                                if (confirm('End this session? This will stop accepting new requests.')) {
                                    window.location.href = '/';
                                }
                            }}
                        >
                            End Session
                        </button>
                    </div>

                    {stats.length > 0 && (
                        <div className="singer-stats-section">
                            <h3 className="section-title">Singer Stats</h3>
                            <ul className="singer-list">
                                {stats.map((stat) => (
                                    <li key={stat.singer_name} className="singer-item">
                                        <span>{stat.singer_name}</span>
                                        <span className="singer-count">{stat.song_count} songs</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

ReactDOM.render(<DJDashboard />, document.getElementById('root'));