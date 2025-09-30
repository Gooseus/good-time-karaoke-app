import { createMachine, assign } from 'xstate';

/**
 * Song State Machine
 *
 * Manages the lifecycle of a karaoke song request from submission to completion.
 *
 * States:
 * - waiting: Song is in queue, waiting to be played
 * - delayed: Song is temporarily delayed by DJ (returns to waiting after delay expires)
 * - playing: Song is currently being performed
 * - done: Song was successfully performed (final state)
 * - skipped: Song was skipped/cancelled (final state)
 *
 * Guards:
 * - isNextInQueue: Validates that the song is the next eligible song to play
 * - canBeDelayed: Ensures only waiting songs can be delayed
 * - canBeEdited: Ensures only waiting songs can have details edited
 */
export const songMachine = createMachine({
  id: 'song',
  initial: 'waiting',
  context: {
    songId: null,
    sessionId: null,
    position: 0,
    delayedUntil: null,
    delayMinutes: null,
    isNextInQueue: false,
  },
  states: {
    waiting: {
      on: {
        PLAY: {
          target: 'playing',
          guard: 'isNextInQueue',
        },
        SKIP: {
          target: 'skipped',
        },
        DELAY: {
          target: 'delayed',
          guard: 'canBeDelayed',
          actions: assign({
            delayedUntil: ({ event }) => event.delayedUntil,
            delayMinutes: ({ event }) => event.delayMinutes,
          }),
        },
        EDIT: {
          target: 'waiting',
          guard: 'canBeEdited',
        },
      },
    },
    delayed: {
      entry: 'startDelayTimer',
      exit: 'clearDelayTimer',
      on: {
        DELAY_EXPIRED: {
          target: 'waiting',
          actions: assign({
            delayedUntil: null,
            delayMinutes: null,
          }),
        },
        SKIP: {
          target: 'skipped',
        },
      },
      // Automatic transition after delay expires
      after: {
        DELAY_DURATION: {
          target: 'waiting',
          actions: assign({
            delayedUntil: null,
            delayMinutes: null,
          }),
        },
      },
    },
    playing: {
      entry: 'markAsPlaying',
      on: {
        COMPLETE: {
          target: 'done',
        },
        SKIP: {
          target: 'skipped',
        },
      },
    },
    done: {
      type: 'final',
      entry: 'markAsDone',
    },
    skipped: {
      type: 'final',
      entry: 'markAsSkipped',
    },
  },
}, {
  guards: {
    isNextInQueue: ({ context }) => {
      return context.isNextInQueue === true;
    },
    canBeDelayed: ({ context }) => {
      return context.delayedUntil === null;
    },
    canBeEdited: () => {
      // Only waiting songs can be edited
      return true;
    },
  },
  actions: {
    startDelayTimer: ({ context }) => {
      console.log(`Song ${context.songId} delayed until ${context.delayedUntil}`);
    },
    clearDelayTimer: ({ context }) => {
      console.log(`Song ${context.songId} delay cleared`);
    },
    markAsPlaying: ({ context }) => {
      console.log(`Song ${context.songId} is now playing`);
    },
    markAsDone: ({ context }) => {
      console.log(`Song ${context.songId} marked as done`);
    },
    markAsSkipped: ({ context }) => {
      console.log(`Song ${context.songId} marked as skipped`);
    },
  },
  delays: {
    DELAY_DURATION: ({ context }) => {
      if (!context.delayedUntil) return 0;
      const delayTime = new Date(context.delayedUntil).getTime() - Date.now();
      return Math.max(0, delayTime);
    },
  },
});

/**
 * Helper function to create a song machine instance with initial context
 */
export function createSongMachine(songData) {
  return songMachine.provide({
    guards: {
      isNextInQueue: ({ context }) => context.isNextInQueue === true,
      canBeDelayed: ({ context }) => context.delayedUntil === null,
      canBeEdited: () => true,
    },
  }).withConfig({
    context: {
      songId: songData.id,
      sessionId: songData.session_id,
      position: songData.position,
      delayedUntil: songData.delayed_until,
      delayMinutes: songData.delay_minutes,
      isNextInQueue: songData.isNextInQueue || false,
    },
  });
}

/**
 * Maps database status strings to XState state values
 */
export function getStateFromStatus(status) {
  const statusMap = {
    waiting: 'waiting',
    delayed: 'delayed',
    playing: 'playing',
    done: 'done',
    skipped: 'skipped',
  };
  return statusMap[status] || 'waiting';
}

/**
 * Maps XState state values to database status strings
 */
export function getStatusFromState(state) {
  return state.value;
}