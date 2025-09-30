import { createMachine, assign } from 'xstate';

/**
 * Session State Machine
 *
 * Manages the lifecycle of a DJ karaoke session from creation to archival.
 *
 * States:
 * - active: Session is running, accepting and processing song requests
 * - paused: Session is temporarily paused, queue doesn't advance (but can still accept requests)
 * - ending: Session is in the process of ending (grace period for current song)
 * - ended: Session has ended (final state)
 *
 * Context:
 * - sessionId: Unique identifier for the session
 * - songDuration: Average song duration in seconds (for wait time calculations)
 * - createdAt: Timestamp when session was created
 * - tipHandles: Object containing venmo_handle, cashapp_handle, zelle_handle
 */
export const sessionMachine = createMachine({
  id: 'session',
  initial: 'active',
  context: {
    sessionId: null,
    songDuration: 270,
    createdAt: null,
    tipHandles: {
      venmo_handle: null,
      cashapp_handle: null,
      zelle_handle: null,
    },
  },
  states: {
    active: {
      entry: 'onSessionActive',
      on: {
        PAUSE: {
          target: 'paused',
        },
        END: {
          target: 'ending',
        },
        UPDATE_DURATION: {
          target: 'active',
          actions: assign({
            songDuration: ({ event }) => event.songDuration,
          }),
        },
        UPDATE_TIPS: {
          target: 'active',
          actions: assign({
            tipHandles: ({ event }) => event.tipHandles,
          }),
        },
      },
    },
    paused: {
      entry: 'onSessionPaused',
      on: {
        RESUME: {
          target: 'active',
        },
        END: {
          target: 'ending',
        },
      },
    },
    ending: {
      entry: 'onSessionEnding',
      // Give a 5-second grace period before fully ending
      after: {
        5000: {
          target: 'ended',
        },
      },
      on: {
        CANCEL_END: {
          target: 'active',
        },
      },
    },
    ended: {
      type: 'final',
      entry: 'onSessionEnded',
    },
  },
}, {
  actions: {
    onSessionActive: ({ context }) => {
      console.log(`Session ${context.sessionId} is now active`);
    },
    onSessionPaused: ({ context }) => {
      console.log(`Session ${context.sessionId} is now paused`);
    },
    onSessionEnding: ({ context }) => {
      console.log(`Session ${context.sessionId} is ending...`);
    },
    onSessionEnded: ({ context }) => {
      console.log(`Session ${context.sessionId} has ended`);
    },
  },
});

/**
 * Helper function to create a session machine instance with initial context
 */
export function createSessionMachine(sessionData) {
  return sessionMachine.provide({}).withConfig({
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
  });
}

/**
 * Maps database status strings to XState state values
 */
export function getStateFromStatus(status) {
  const statusMap = {
    active: 'active',
    paused: 'paused',
    ending: 'ending',
    ended: 'ended',
  };
  return statusMap[status] || 'active';
}

/**
 * Maps XState state values to database status strings
 */
export function getStatusFromState(state) {
  return state.value;
}