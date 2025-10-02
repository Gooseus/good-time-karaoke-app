const { useState, useEffect, useRef } = React;

function DJDashboard() {
    const [sessionId, setSessionId] = useState('');
    const [session, setSession] = useState(null);
    const [sessionState, setSessionState] = useState(null); // XState session state
    const [songs, setSongs] = useState([]);
    const [stats, setStats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [songDuration, setSongDuration] = useState(270);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [selectedSongs, setSelectedSongs] = useState(new Set());
    const [showTipSettings, setShowTipSettings] = useState(false);
    const [tipHandles, setTipHandles] = useState({
        venmo_handle: '',
        cashapp_handle: '',
        zelle_handle: ''
    });
    const [undoStack, setUndoStack] = useState([]);
    const sortableRef = useRef(null);

    // Get session ID from URL
    useEffect(() => {
        const pathParts = window.location.pathname.split('/');
        const id = pathParts[pathParts.length - 1];
        setSessionId(id);
    }, []);

    // Fetch session data and state
    useEffect(() => {
        if (!sessionId) return;

        async function fetchSession() {
            try {
                const response = await fetch(`/api/sessions/${sessionId}`);
                if (response.ok) {
                    const sessionData = await response.json();
                    setSession(sessionData);
                    setSongDuration(sessionData.song_duration);
                    setTipHandles({
                        venmo_handle: sessionData.venmo_handle || '',
                        cashapp_handle: sessionData.cashapp_handle || '',
                        zelle_handle: sessionData.zelle_handle || ''
                    });
                }
            } catch (error) {
                console.error('Error fetching session:', error);
            }
        }

        async function fetchSessionState() {
            try {
                const response = await fetch(`/api/sessions/${sessionId}/state`);
                if (response.ok) {
                    const state = await response.json();
                    setSessionState(state);
                }
            } catch (error) {
                console.error('Error fetching session state:', error);
            }
        }

        fetchSession();
        fetchSessionState();
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
            handle: '.drag-handle',
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            forceFallback: true,
            fallbackTolerance: 3,
            touchStartThreshold: 5,
            delayOnTouchOnly: true,
            delay: 100,
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

    // Transition song using XState machine
    const transitionSong = async (songId, event) => {
        try {
            // Save current state for undo
            const song = songs.find(s => s.id === songId);
            if (song) {
                setUndoStack(prev => [...prev.slice(-9), { // Keep last 10 actions
                    songId: song.id,
                    previousStatus: song.status,
                    newStatus: event,
                    songName: song.song_title,
                    artist: song.artist,
                    singerName: song.singer_name,
                    timestamp: Date.now()
                }]);
            }

            const response = await fetch(`/api/songs/${songId}/transition`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Transition failed');
            }

            await fetchData();
        } catch (error) {
            console.error('Error transitioning song:', error);
            alert(`Cannot ${event.toLowerCase()} song: ${error.message}`);
        }
    };

    // Undo last action
    const undoLastAction = async () => {
        if (undoStack.length === 0) return;

        const lastAction = undoStack[undoStack.length - 1];

        // Check if action is recent (within last 5 minutes)
        if (Date.now() - lastAction.timestamp > 5 * 60 * 1000) {
            alert('Cannot undo actions older than 5 minutes');
            setUndoStack([]);
            return;
        }

        try {
            await fetch(`/api/songs/${lastAction.songId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: lastAction.previousStatus })
            });

            // Remove the undone action from stack
            setUndoStack(prev => prev.slice(0, -1));
            await fetchData();
        } catch (error) {
            console.error('Error undoing action:', error);
            alert('Failed to undo action');
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
        const isPaused = sessionState?.value === 'paused';
        if (isPaused) return 'Paused';
        const waitingSongs = songs.filter(s => s.position < position && s.status === 'waiting').length;
        const playingSongs = songs.filter(s => s.status === 'playing').length;
        const totalWaitMinutes = (waitingSongs + playingSongs) * (currentSongDuration / 60);
        return Math.round(totalWaitMinutes);
    };

    // Check if delay has expired
    const isDelayExpired = (delayedUntil) => {
        if (!delayedUntil) return true;
        return new Date(delayedUntil) <= new Date();
    };

    // Calculate remaining delay time
    const getRemainingDelayTime = (delayedUntil) => {
        if (!delayedUntil || isDelayExpired(delayedUntil)) return null;
        const minutesLeft = Math.ceil((new Date(delayedUntil) - new Date()) / 60000);
        return minutesLeft;
    };

    // Find the next song that can be played (first waiting song by position)
    const getNextPlayableSong = () => {
        const waitingSongs = songs.filter(s => s.status === 'waiting').sort((a, b) => a.position - b.position);
        return waitingSongs.length > 0 ? waitingSongs[0] : null;
    };

    // Filter songs based on search and status
    const filteredSongs = songs.filter(song => {
        const matchesSearch = searchTerm === '' ||
            song.singer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            song.artist.toLowerCase().includes(searchTerm.toLowerCase()) ||
            song.song_title.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesStatus = filterStatus === 'all' || song.status === filterStatus;

        return matchesSearch && matchesStatus;
    });

    const nextPlayableSong = getNextPlayableSong();

    // Bulk operations
    const bulkUpdateStatus = async (status) => {
        if (selectedSongs.size === 0) return;

        try {
            await Promise.all(
                Array.from(selectedSongs).map(songId =>
                    fetch(`/api/songs/${songId}/status`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status })
                    })
                )
            );
            setSelectedSongs(new Set());
            await fetchData();
        } catch (error) {
            console.error('Error in bulk update:', error);
        }
    };

    const bulkDelete = async () => {
        if (selectedSongs.size === 0) return;
        if (!confirm(`Delete ${selectedSongs.size} selected songs?`)) return;

        try {
            await Promise.all(
                Array.from(selectedSongs).map(songId =>
                    fetch(`/api/songs/${songId}`, { method: 'DELETE' })
                )
            );
            setSelectedSongs(new Set());
            await fetchData();
        } catch (error) {
            console.error('Error in bulk delete:', error);
        }
    };

    const clearCompleted = async () => {
        const completedSongs = songs.filter(s => s.status === 'done');
        if (completedSongs.length === 0) return;
        if (!confirm(`Delete ${completedSongs.length} completed songs?`)) return;

        try {
            await Promise.all(
                completedSongs.map(song =>
                    fetch(`/api/songs/${song.id}`, { method: 'DELETE' })
                )
            );
            await fetchData();
        } catch (error) {
            console.error('Error clearing completed:', error);
        }
    };

    const toggleSongSelection = (songId) => {
        const newSelected = new Set(selectedSongs);
        if (newSelected.has(songId)) {
            newSelected.delete(songId);
        } else {
            newSelected.add(songId);
        }
        setSelectedSongs(newSelected);
    };

    const selectAll = () => {
        if (selectedSongs.size === filteredSongs.length) {
            setSelectedSongs(new Set());
        } else {
            setSelectedSongs(new Set(filteredSongs.map(s => s.id)));
        }
    };

    // Save tip settings
    const saveTipSettings = async () => {
        try {
            await fetch(`/api/sessions/${sessionId}/tips`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tipHandles)
            });
            setShowTipSettings(false);
            alert('Tip settings saved successfully!');
        } catch (error) {
            console.error('Error saving tip settings:', error);
            alert('Failed to save tip settings');
        }
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
                        <div className="stat-item">
                            <div className="stat-number">{songs.filter(s => s.status === 'skipped').length}</div>
                            <div>Skipped</div>
                        </div>
                    </div>
                </div>
            )}

            <div className="main-content">
                <div className="queue-section">
                    <div className="queue-header">
                        <h2 className="section-title">Song Queue</h2>
                        {sessionState?.value === 'paused' && <div className="pause-indicator">⏸ PAUSED</div>}
                    </div>

                    {songs.length > 0 && (
                        <div className="queue-controls">
                            <div className="search-filter-row">
                                <input
                                    type="text"
                                    placeholder="Search songs, artists, or singers..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="search-input"
                                />
                                <select
                                    value={filterStatus}
                                    onChange={(e) => setFilterStatus(e.target.value)}
                                    className="filter-select"
                                >
                                    <option value="all">All Songs</option>
                                    <option value="waiting">Waiting</option>
                                    <option value="playing">Playing</option>
                                    <option value="done">Completed</option>
                                    <option value="skipped">Skipped</option>
                                </select>
                            </div>

                            <div className="bulk-controls">
                                <button
                                    onClick={selectAll}
                                    className="btn btn-secondary"
                                    disabled={filteredSongs.length === 0}
                                >
                                    {selectedSongs.size === filteredSongs.length && filteredSongs.length > 0 ? 'Deselect All' : 'Select All'}
                                </button>

                                {selectedSongs.size > 0 && (
                                    <div className="bulk-actions">
                                        <span className="selected-count">{selectedSongs.size} selected</span>
                                        <button
                                            onClick={() => bulkUpdateStatus('done')}
                                            className="btn btn-done"
                                        >
                                            Mark Done
                                        </button>
                                        <button
                                            onClick={() => bulkUpdateStatus('waiting')}
                                            className="btn btn-secondary"
                                        >
                                            Mark Waiting
                                        </button>
                                        <button
                                            onClick={() => bulkUpdateStatus('skipped')}
                                            className="btn btn-skip"
                                        >
                                            Mark Skipped
                                        </button>
                                        <button
                                            onClick={bulkDelete}
                                            className="btn btn-delete"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                )}

                                <button
                                    onClick={clearCompleted}
                                    className="btn btn-cleanup"
                                    disabled={songs.filter(s => s.status === 'done').length === 0}
                                >
                                    Clear Completed ({songs.filter(s => s.status === 'done').length})
                                </button>
                            </div>
                        </div>
                    )}

                    {songs.length === 0 ? (
                        <div className="empty-queue">
                            <div>No songs in queue yet!</div>
                            <div style={{ marginTop: '10px', fontSize: '0.9rem' }}>
                                Share the QR code or session ID for singers to start requesting songs.
                            </div>
                        </div>
                    ) : filteredSongs.length === 0 ? (
                        <div className="empty-queue">
                            <div>No songs match your filters</div>
                        </div>
                    ) : (
                        <ul className="song-list" ref={sortableRef}>
                            {filteredSongs.map((song) => {
                                const isNextSong = nextPlayableSong && nextPlayableSong.id === song.id;
                                const canPlay = song.status === 'waiting' && isNextSong;

                                return (
                                    <li
                                        key={song.id}
                                        className={`song-item ${song.status} ${selectedSongs.has(song.id) ? 'selected' : ''} ${isNextSong ? 'next-song' : ''}`}
                                        data-song-id={song.id}
                                    >
                                        <div className="song-header">
                                            <div className="song-left">
                                                <div className="drag-handle" title="Drag to reorder">
                                                    ⋮⋮
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedSongs.has(song.id)}
                                                    onChange={() => toggleSongSelection(song.id)}
                                                    className="song-checkbox"
                                                />
                                                <div className="song-position">
                                                    #{song.position}
                                                    {isNextSong && (
                                                        <span style={{
                                                            marginLeft: '8px',
                                                            padding: '2px 6px',
                                                            background: 'linear-gradient(135deg, #4caf50, #45a049)',
                                                            borderRadius: '4px',
                                                            fontSize: '0.7rem',
                                                            fontWeight: '700',
                                                            textTransform: 'uppercase'
                                                        }}>
                                                            NEXT
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="song-actions">
                                                {song.status === 'waiting' && (
                                                    <button
                                                        className="btn btn-play"
                                                        onClick={() => transitionSong(song.id, 'PLAY')}
                                                        disabled={!canPlay}
                                                        style={{
                                                            opacity: canPlay ? 1 : 0.5,
                                                            cursor: canPlay ? 'pointer' : 'not-allowed'
                                                        }}
                                                        title={canPlay ? 'Play this song' : 'Reorder to play this song next'}
                                                    >
                                                        ▶ Play
                                                    </button>
                                                )}
                                            {song.status === 'playing' && (
                                                <>
                                                    <button
                                                        className="btn btn-done"
                                                        onClick={() => transitionSong(song.id, 'COMPLETE')}
                                                    >
                                                        ✓ Done
                                                    </button>
                                                    <button
                                                        className="btn btn-skip"
                                                        onClick={() => transitionSong(song.id, 'SKIP')}
                                                    >
                                                        ⏭ Skip
                                                    </button>
                                                </>
                                            )}
                                            {song.status === 'waiting' && (
                                                <button
                                                    className="btn btn-skip"
                                                    onClick={() => transitionSong(song.id, 'SKIP')}
                                                >
                                                    ⏭ Skip
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
                                        <div className="singer-name">
                                            {song.singer_name}
                                            {song.status === 'skipped' && (
                                                <span style={{
                                                    marginLeft: '8px',
                                                    padding: '2px 8px',
                                                    background: 'linear-gradient(135deg, #f44336, #d32f2f)',
                                                    borderRadius: '4px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: '700',
                                                    textTransform: 'uppercase'
                                                }}>
                                                    Cancelled
                                                </span>
                                            )}
                                        </div>
                                        <div className="song-details">
                                            "{song.song_title}" by {song.artist}
                                        </div>
                                    </div>

                                    {song.status === 'waiting' && (
                                        <div className="wait-time">
                                            {(() => {
                                                const delayTime = getRemainingDelayTime(song.delayed_until);
                                                if (delayTime) {
                                                    return (
                                                        <span style={{
                                                            background: 'linear-gradient(135deg, rgba(255, 152, 0, 0.3), rgba(255, 152, 0, 0.2))',
                                                            padding: '4px 8px',
                                                            borderRadius: '4px',
                                                            border: '1px solid rgba(255, 152, 0, 0.5)',
                                                            fontWeight: '600'
                                                        }}>
                                                            ⏱ Delayed: {delayTime} min left
                                                        </span>
                                                    );
                                                }
                                                return `Est. wait: ${sessionState?.value === 'paused' ? 'Paused' : `~${calculateWaitTime(song.position, songDuration)} min`}`;
                                            })()}
                                        </div>
                                    )}
                                </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                <div className="sidebar">
                    <div className="controls-section">
                        <h3 className="section-title">Controls</h3>

                        {undoStack.length > 0 && (
                            <div className="control-group" style={{marginBottom: '15px'}}>
                                <button
                                    className="btn btn-undo"
                                    onClick={undoLastAction}
                                    style={{
                                        background: 'linear-gradient(135deg, #ff9800, #f57c00)',
                                        color: 'white',
                                        fontWeight: '700',
                                        fontSize: '16px'
                                    }}
                                >
                                    ↶ Undo Last Action
                                </button>
                                <div style={{fontSize: '0.85rem', opacity: '0.8', marginTop: '5px', textAlign: 'center'}}>
                                    {undoStack[undoStack.length - 1].singerName}: "{undoStack[undoStack.length - 1].songName}"
                                    <br />
                                    {undoStack[undoStack.length - 1].previousStatus} → {undoStack[undoStack.length - 1].newStatus}
                                </div>
                            </div>
                        )}

                        <div className="control-group">
                            <button
                                className={`btn ${sessionState?.value === 'paused' ? 'btn-play' : 'btn-pause'} btn-large`}
                                onClick={async () => {
                                    const event = sessionState?.value === 'active' ? 'PAUSE' : 'RESUME';
                                    try {
                                        await fetch(`/api/sessions/${sessionId}/transition`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ event })
                                        });
                                        // Refresh session state
                                        const response = await fetch(`/api/sessions/${sessionId}/state`);
                                        if (response.ok) {
                                            const newState = await response.json();
                                            setSessionState(newState);
                                        }
                                    } catch (error) {
                                        console.error('Error toggling pause:', error);
                                        alert('Failed to update session state');
                                    }
                                }}
                            >
                                {sessionState?.value === 'paused' ? '▶ Resume Queue' : '⏸ Pause Queue'}
                            </button>
                        </div>

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

                    <div className="controls-section">
                        <h3 className="section-title">💰 Tip Settings</h3>

                        {!showTipSettings ? (
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowTipSettings(true)}
                            >
                                Manage Tips
                            </button>
                        ) : (
                            <div className="tip-settings">
                                <div className="control-group">
                                    <label htmlFor="tip-venmo">Venmo Handle</label>
                                    <input
                                        type="text"
                                        id="tip-venmo"
                                        value={tipHandles.venmo_handle}
                                        onChange={(e) => setTipHandles(prev => ({...prev, venmo_handle: e.target.value}))}
                                        placeholder="@your-venmo"
                                    />
                                </div>

                                <div className="control-group">
                                    <label htmlFor="tip-cashapp">Cash App Handle</label>
                                    <input
                                        type="text"
                                        id="tip-cashapp"
                                        value={tipHandles.cashapp_handle}
                                        onChange={(e) => setTipHandles(prev => ({...prev, cashapp_handle: e.target.value}))}
                                        placeholder="$your-cashapp"
                                    />
                                </div>

                                <div className="control-group">
                                    <label htmlFor="tip-zelle">Zelle (Phone/Email)</label>
                                    <input
                                        type="text"
                                        id="tip-zelle"
                                        value={tipHandles.zelle_handle}
                                        onChange={(e) => setTipHandles(prev => ({...prev, zelle_handle: e.target.value}))}
                                        placeholder="555-123-4567 or email@example.com"
                                    />
                                </div>

                                <div style={{display: 'flex', gap: '10px', marginTop: '15px'}}>
                                    <button
                                        className="btn btn-done"
                                        onClick={saveTipSettings}
                                        style={{flex: 1}}
                                    >
                                        Save
                                    </button>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => setShowTipSettings(false)}
                                        style={{flex: 1}}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
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