# XState Implementation Guide

This document explains the XState state machine implementation for the karaoke queue management application.

## Overview

XState has been integrated to manage the state transitions for:
1. **Song Requests** - Managing the lifecycle of individual song requests
2. **DJ Sessions** - Managing the overall session state (active, paused, ended)

## Why XState?

### Benefits
- **Explicit State Transitions**: Clear, enforceable rules for state changes
- **Guard Conditions**: Prevents invalid transitions (e.g., can't play a song unless it's next in queue)
- **Built-in Delay Handling**: Automatic time-based transitions for delayed songs
- **State Visualization**: Can generate visual diagrams of state flows
- **Testing**: Easier to test state logic in isolation
- **History/Undo**: Built-in support for state history tracking

### Before vs After

**Before (manual state management):**
```javascript
// No validation - any song could be set to "playing"
updateSongStatus(songId, 'playing');
```

**After (XState):**
```javascript
// Validated transition - only allowed if song is next in queue
transitionSong(songId, 'PLAY');
// Throws error if transition is invalid
```

---

## Architecture

### File Structure

```
src/
├── machines/
│   ├── song-machine.js      # Song state machine definition
│   └── session-machine.js   # Session state machine definition
├── services/
│   └── state-manager.js     # Integration layer between XState and database
```

### Data Flow

```
React Component
    ↓ (action)
API Endpoint (server.js)
    ↓ (event)
State Manager (state-manager.js)
    ↓ (validates & transitions)
XState Machine (song-machine.js / session-machine.js)
    ↓ (persists)
Database (database-sqlite.js)
```

---

## Song State Machine

### States

```
waiting → playing → done (final)
   ↓         ↓
   ↓      skipped (final)
delayed
   ↓
waiting
```

### State Definitions

- **`waiting`**: Song is in queue, waiting to be performed
  - Can transition to: `playing`, `skipped`, `delayed`

- **`delayed`**: Song is temporarily delayed by DJ
  - Automatically returns to `waiting` after delay expires
  - Can transition to: `skipped`

- **`playing`**: Song is currently being performed
  - Can transition to: `done`, `skipped`

- **`done`**: Song was successfully performed (final state)

- **`skipped`**: Song was cancelled/skipped (final state)

### Events

| Event | Description | Guards |
|-------|-------------|--------|
| `PLAY` | Start playing the song | `isNextInQueue` - Must be the next song in queue |
| `SKIP` | Skip/cancel the song | None |
| `DELAY` | Temporarily delay the song | `canBeDelayed` - Must not already be delayed |
| `EDIT` | Edit song details | `canBeEdited` - Only in waiting state |
| `COMPLETE` | Mark song as done | None |
| `DELAY_EXPIRED` | Automatic transition after delay | None (automatic) |

### Context

```javascript
{
  songId: number,           // Unique song ID
  sessionId: string,        // Session this song belongs to
  position: number,         // Queue position
  delayedUntil: string,     // ISO timestamp when delay expires
  delayMinutes: number,     // Duration of delay in minutes
  isNextInQueue: boolean    // Whether this is the next playable song
}
```

### Example Usage

```javascript
// Get current state
const state = getSongState(songId);
console.log(state.value); // "waiting"
console.log(state.can.play); // true/false

// Transition to playing
transitionSong(songId, 'PLAY'); // Only works if song is next in queue

// Check if transition is allowed before attempting
if (canTransitionSong(songId, 'play')) {
  transitionSong(songId, 'PLAY');
}
```

---

## Session State Machine

### States

```
active ⇄ paused
   ↓        ↓
ending → ended (final)
```

### State Definitions

- **`active`**: Session is running, accepting requests
  - Can transition to: `paused`, `ending`

- **`paused`**: Session temporarily paused (queue doesn't advance)
  - Can transition to: `active`, `ending`

- **`ending`**: Session is ending (5-second grace period)
  - Automatically transitions to `ended` after 5 seconds
  - Can transition to: `active` (cancel end)

- **`ended`**: Session has ended (final state)

### Events

| Event | Description |
|-------|-------------|
| `PAUSE` | Pause the session |
| `RESUME` | Resume from paused state |
| `END` | Begin ending the session |
| `CANCEL_END` | Cancel the ending process |
| `UPDATE_DURATION` | Update average song duration |
| `UPDATE_TIPS` | Update tip handles |

### Context

```javascript
{
  sessionId: string,
  songDuration: number,     // Average song duration in seconds
  createdAt: string,        // ISO timestamp
  tipHandles: {
    venmo_handle: string,
    cashapp_handle: string,
    zelle_handle: string
  }
}
```

### Example Usage

```javascript
// Get current state
const state = getSessionState(sessionId);
console.log(state.value); // "active"
console.log(state.can.pause); // true/false

// Pause session
transitionSession(sessionId, 'PAUSE');

// Resume session
transitionSession(sessionId, 'RESUME');
```

---

## API Endpoints

### Song State Endpoints

#### `GET /api/songs/:id/state`
Get the current state machine state for a song.

**Response:**
```json
{
  "value": "waiting",
  "context": {
    "songId": 123,
    "sessionId": "ABC123",
    "position": 5,
    "isNextInQueue": false
  },
  "can": {
    "play": false,
    "skip": true,
    "delay": true,
    "edit": true
  }
}
```

#### `POST /api/songs/:id/transition`
Transition a song to a new state.

**Request Body:**
```json
{
  "event": "PLAY"
}
```

**Response:**
```json
{
  "success": true,
  "state": "playing"
}
```

#### `GET /api/songs/:id/can-transition/:event`
Check if a song can transition to a new state.

**Response:**
```json
{
  "canTransition": true
}
```

### Session State Endpoints

#### `GET /api/sessions/:id/state`
Get the current state machine state for a session.

**Response:**
```json
{
  "value": "active",
  "context": {
    "sessionId": "ABC123",
    "songDuration": 270
  },
  "can": {
    "pause": true,
    "resume": false,
    "end": true
  }
}
```

#### `POST /api/sessions/:id/transition`
Transition a session to a new state.

**Request Body:**
```json
{
  "event": "PAUSE"
}
```

**Response:**
```json
{
  "success": true,
  "state": "paused"
}
```

---

## Database Schema Changes

### Sessions Table

Added `status` column to track session state:

```sql
ALTER TABLE sessions ADD COLUMN status TEXT DEFAULT "active"
```

**Possible Values:**
- `active` - Session is running
- `paused` - Session is paused
- `ending` - Session is in the process of ending
- `ended` - Session has ended

### Songs Table

No changes required - existing `status` column is used:

**Possible Values:**
- `waiting` - In queue
- `delayed` - Temporarily delayed (deprecated in favor of XState)
- `playing` - Currently performing
- `done` - Completed
- `skipped` - Cancelled

---

## Integration with Existing Code

### Backward Compatibility

The XState implementation is designed to be **backward compatible** with the existing codebase:

1. **Database columns unchanged**: Existing status strings map directly to XState states
2. **Legacy endpoints still work**: Old `PUT /api/songs/:id/status` endpoint still functions
3. **Gradual migration**: Can use XState endpoints alongside legacy endpoints

### Migration Strategy

**Phase 1** (Current): XState layer added, both old and new endpoints work
**Phase 2** (Future): Update React components to use new state-aware endpoints
**Phase 3** (Future): Deprecate legacy status update endpoints

### Example: Gradual Migration

**Before:**
```javascript
// Direct status update (no validation)
await fetch(`/api/songs/${songId}/status`, {
  method: 'PUT',
  body: JSON.stringify({ status: 'playing' })
});
```

**After (with XState):**
```javascript
// Validated state transition
await fetch(`/api/songs/${songId}/transition`, {
  method: 'POST',
  body: JSON.stringify({ event: 'PLAY' })
});
```

---

## Testing State Machines

### Unit Testing State Machines

```javascript
import { songMachine } from './src/machines/song-machine.js';
import { createActor } from 'xstate';

// Test that song can transition from waiting to playing
const actor = createActor(songMachine);
actor.start();

actor.send({ type: 'PLAY' }); // Will fail guard if not next in queue
console.log(actor.getSnapshot().value); // "playing" or still "waiting"
```

### Integration Testing

```javascript
// Test full flow with state manager
import { transitionSong, getSongState } from './src/services/state-manager.js';

// Ensure song is next in queue
const state = getSongState(songId);
if (state.can.play) {
  transitionSong(songId, 'PLAY');
  assert(getSongState(songId).value === 'playing');
}
```

---

## Visualizing State Machines

XState machines can be visualized using the [Stately.ai visualizer](https://stately.ai/viz):

1. Copy the machine definition from `song-machine.js` or `session-machine.js`
2. Paste into the visualizer at https://stately.ai/viz
3. View interactive state diagram

---

## Future Enhancements

### Potential Additions

1. **Singer State Machine**
   - States: `new`, `active`, `VIP`, `restricted`
   - Track singer behavior and reputation

2. **Queue State Machine**
   - States: `open`, `locked`, `reordering`
   - Manage queue-level operations

3. **Advanced Song Features**
   - Automatic promotion of next song
   - Priority queue based on singer stats
   - Automatic delay expiration handling

4. **Session Features**
   - Scheduled auto-pause (e.g., during breaks)
   - Session time limits
   - Automatic archival

---

## Troubleshooting

### Common Issues

#### "Song transition failed"
- **Cause**: Guard condition not met (e.g., trying to play a song that's not next)
- **Solution**: Check `getSongState(songId).can.play` before attempting transition

#### "State not persisting to database"
- **Cause**: State machine actor subscription not properly set up
- **Solution**: Check that `state-manager.js` is subscribing to state changes

#### "Cannot find state machine for song/session"
- **Cause**: Actor not created or already cleaned up
- **Solution**: Actors are created lazily on first access and cleaned up when in final state

---

## Performance Considerations

### Memory Management

State machine actors are stored in memory:
- Automatically created on first access
- Automatically cleaned up when entering final state
- Can be manually cleared using `clearSongActor(songId)` or `clearSessionActor(sessionId)`

### Scalability

For high-volume deployments:
- Consider adding Redis cache for actor storage
- Implement actor pooling for frequently accessed songs/sessions
- Add TTL for inactive actors

---

## References

- [XState Documentation](https://xstate.js.org/docs/)
- [XState with React](https://xstate.js.org/docs/recipes/react.html)
- [Stately Visualizer](https://stately.ai/viz)
- [Finite State Machines](https://en.wikipedia.org/wiki/Finite-state_machine)

---

## Support

For questions or issues with the XState implementation:
1. Check this documentation first
2. Review the state machine definitions in `src/machines/`
3. Examine the integration layer in `src/services/state-manager.js`
4. Test state transitions using the provided API endpoints