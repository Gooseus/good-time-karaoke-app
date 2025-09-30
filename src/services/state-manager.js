import { createActor } from 'xstate';
import { songMachine, createSongMachine, getStateFromStatus as getSongStateFromStatus, getStatusFromState as getSongStatusFromState } from '../machines/song-machine.js';
import { sessionMachine, createSessionMachine, getStateFromStatus as getSessionStateFromStatus, getStatusFromState as getSessionStatusFromState } from '../machines/session-machine.js';
import {
  getSongs,
  getSongById,
  updateSongStatus as dbUpdateSongStatus,
  getSession,
  updateSessionStatus as dbUpdateSessionStatus
} from '../../database-sqlite.js';

/**
 * State Manager Service
 *
 * Provides integration between XState machines and the database layer.
 * Manages state machine instances and ensures state changes are persisted.
 */

// In-memory cache of active state machine actors
const songActors = new Map();
const sessionActors = new Map();

/**
 * Song State Management
 */

/**
 * Get or create a song actor for the given song ID
 */
export function getSongActor(songId) {
  if (songActors.has(songId)) {
    return songActors.get(songId);
  }

  const songData = getSongById(songId);
  if (!songData) {
    return null;
  }

  // Determine if this song is next in queue
  const sessionSongs = getSongs(songData.session_id);
  const waitingSongs = sessionSongs
    .filter(s => s.status === 'waiting')
    .sort((a, b) => a.position - b.position);
  const isNextInQueue = waitingSongs.length > 0 && waitingSongs[0].id === songId;

  // Create machine with song context
  const machine = songMachine.provide({
    guards: {
      isNextInQueue: ({ context }) => context.isNextInQueue === true,
      canBeDelayed: ({ context }) => context.delayedUntil === null,
      canBeEdited: () => true,
    },
  });

  const actor = createActor(machine, {
    snapshot: machine.resolveState({
      value: getSongStateFromStatus(songData.status),
      context: {
        songId: songData.id,
        sessionId: songData.session_id,
        position: songData.position,
        delayedUntil: songData.delayed_until,
        delayMinutes: songData.delay_minutes,
        isNextInQueue,
      },
    }),
  });

  // Subscribe to state changes and persist to database
  actor.subscribe((state) => {
    const newStatus = getSongStatusFromState(state);
    dbUpdateSongStatus(songId, newStatus);
  });

  actor.start();
  songActors.set(songId, actor);

  return actor;
}

/**
 * Send an event to a song's state machine
 */
export function sendSongEvent(songId, event) {
  const actor = getSongActor(songId);
  if (!actor) {
    throw new Error(`Song ${songId} not found`);
  }

  actor.send(event);
  return { success: true, state: actor.getSnapshot().value };
}

/**
 * Get the current state of a song
 */
export function getSongState(songId) {
  const actor = getSongActor(songId);
  if (!actor) {
    return null;
  }

  const snapshot = actor.getSnapshot();
  return {
    value: snapshot.value,
    context: snapshot.context,
    can: {
      play: snapshot.can({ type: 'PLAY' }),
      skip: snapshot.can({ type: 'SKIP' }),
      delay: snapshot.can({ type: 'DELAY' }),
      edit: snapshot.can({ type: 'EDIT' }),
    },
  };
}

/**
 * Transition a song to a new state
 */
export function transitionSong(songId, event) {
  try {
    const result = sendSongEvent(songId, { type: event });

    // Clean up actor if in final state
    const actor = songActors.get(songId);
    if (actor && actor.getSnapshot().status === 'done') {
      actor.stop();
      songActors.delete(songId);
    }

    return result;
  } catch (error) {
    console.error(`Error transitioning song ${songId}:`, error);
    throw error;
  }
}

/**
 * Validate if a song can transition to a new state
 */
export function canTransitionSong(songId, event) {
  const state = getSongState(songId);
  if (!state) {
    return false;
  }

  const eventMap = {
    play: 'PLAY',
    skip: 'SKIP',
    delay: 'DELAY',
    edit: 'EDIT',
    complete: 'COMPLETE',
  };

  const eventType = eventMap[event.toLowerCase()];
  return state.can[event.toLowerCase()] || false;
}

/**
 * Clear a song actor from memory
 */
export function clearSongActor(songId) {
  const actor = songActors.get(songId);
  if (actor) {
    actor.stop();
    songActors.delete(songId);
  }
}

/**
 * Session State Management
 */

/**
 * Get or create a session actor for the given session ID
 */
export function getSessionActor(sessionId) {
  if (sessionActors.has(sessionId)) {
    return sessionActors.get(sessionId);
  }

  const sessionData = getSession(sessionId);
  if (!sessionData) {
    return null;
  }

  // Create machine with session context
  const machine = sessionMachine.provide({});

  const actor = createActor(machine, {
    snapshot: machine.resolveState({
      value: getSessionStateFromStatus(sessionData.status || 'active'),
      context: {
        sessionId: sessionData.id,
        songDuration: sessionData.song_duration,
        createdAt: sessionData.created_at,
        tipHandles: {
          venmo_handle: sessionData.venmo_handle,
          cashapp_handle: sessionData.cashapp_handle,
          zelle_handle: sessionData.zelle_handle,
        },
      },
    }),
  });

  // Subscribe to state changes and persist to database
  actor.subscribe((state) => {
    const newStatus = getSessionStatusFromState(state);
    dbUpdateSessionStatus(sessionId, newStatus);
  });

  actor.start();
  sessionActors.set(sessionId, actor);

  return actor;
}

/**
 * Send an event to a session's state machine
 */
export function sendSessionEvent(sessionId, event) {
  const actor = getSessionActor(sessionId);
  if (!actor) {
    throw new Error(`Session ${sessionId} not found`);
  }

  actor.send(event);
  return { success: true, state: actor.getSnapshot().value };
}

/**
 * Get the current state of a session
 */
export function getSessionState(sessionId) {
  const actor = getSessionActor(sessionId);
  if (!actor) {
    return null;
  }

  const snapshot = actor.getSnapshot();
  return {
    value: snapshot.value,
    context: snapshot.context,
    can: {
      pause: snapshot.can({ type: 'PAUSE' }),
      resume: snapshot.can({ type: 'RESUME' }),
      end: snapshot.can({ type: 'END' }),
    },
  };
}

/**
 * Transition a session to a new state
 */
export function transitionSession(sessionId, event) {
  try {
    const result = sendSessionEvent(sessionId, { type: event });

    // Clean up actor if in final state
    const actor = sessionActors.get(sessionId);
    if (actor && actor.getSnapshot().status === 'done') {
      actor.stop();
      sessionActors.delete(sessionId);
    }

    return result;
  } catch (error) {
    console.error(`Error transitioning session ${sessionId}:`, error);
    throw error;
  }
}

/**
 * Clear a session actor from memory
 */
export function clearSessionActor(sessionId) {
  const actor = sessionActors.get(sessionId);
  if (actor) {
    actor.stop();
    sessionActors.delete(sessionId);
  }
}

/**
 * Clear all actors (useful for testing or shutdown)
 */
export function clearAllActors() {
  for (const [id, actor] of songActors.entries()) {
    actor.stop();
  }
  for (const [id, actor] of sessionActors.entries()) {
    actor.stop();
  }
  songActors.clear();
  sessionActors.clear();
}