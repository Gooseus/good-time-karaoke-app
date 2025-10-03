# Deployment Checklist for Fly.io

## Pre-Deployment Checks

### ✅ Code Quality
- [x] All TypeScript diagnostics fixed (unused `req` parameters prefixed with `_`)
- [x] Server starts successfully locally (`PORT=3001 npm start`)
- [x] SQLite database file created (`karaoke.db` exists)
- [x] No console errors on startup

### ✅ File Paths Fixed
- [x] `database-sqlite.js` uses `/data` in production
- [x] `server.js` QR codes use `/data/qr-codes` in production
- [x] All file writes go to persistent volume in production

### ✅ Fly.io Configuration
- [x] `fly.toml` updated:
  - `auto_stop_machines = false` (keeps machine running)
  - `min_machines_running = 1` (prevents data loss)
  - `max_machines_running = 1` (single instance)
- [x] Volume mounted at `/data` with 1GB space
- [x] `NODE_ENV=production` set by Dockerfile

### ✅ Documentation
- [x] `CLAUDE.md` updated with latest features
- [x] `FLY_FIX.md` explains volume persistence fixes
- [x] This checklist created

## Deployment Steps

```bash
# 1. Check current status
fly status --app good-time-karaoke-app

# 2. List volumes (should see 2, need to clean up 1)
fly volumes list --app good-time-karaoke-app

# 3. Identify which machine is currently active
fly machines list --app good-time-karaoke-app

# 4. Delete unused volume (the one NOT attached to active machine)
# fly volumes delete vol_xxxxx --app good-time-karaoke-app

# 5. Deploy the fixes
fly deploy

# 6. Watch logs for any errors
fly logs --app good-time-karaoke-app

# 7. Verify machine is running
fly status --app good-time-karaoke-app

# 8. Check volume mount
fly ssh console -C "ls -la /data" --app good-time-karaoke-app

# 9. Verify database exists
fly ssh console -C "ls -lh /data/karaoke.db" --app good-time-karaoke-app

# 10. Test the app
open https://good-time-karaoke-app.fly.dev
```

## Post-Deployment Verification

### Test the following:
1. **Homepage** - `https://good-time-karaoke-app.fly.dev/`
   - [ ] Loads successfully
   - [ ] "Start New Session" button works

2. **Create Session** - POST to `/api/sessions`
   - [ ] Session created with random ID
   - [ ] QR code generated
   - [ ] Redirects to DJ dashboard

3. **DJ Dashboard** - `/dj/{sessionId}`
   - [ ] Page loads
   - [ ] QR code displays
   - [ ] Session info shows
   - [ ] No console errors

4. **Singer Form** - `/singer/{sessionId}`
   - [ ] Form loads
   - [ ] Dropdown populates
   - [ ] Can submit song
   - [ ] Form disables after submission

5. **Touch Controls** - Test on iPad/mobile
   - [ ] Drag handle works
   - [ ] Up/down buttons work
   - [ ] Touch drag-and-drop works

6. **Data Persistence**
   - [ ] Create a test session
   - [ ] Add a song
   - [ ] Restart machine: `fly machine restart {machine-id}`
   - [ ] Session still exists after restart
   - [ ] Song still in queue

7. **Second Deploy Test**
   - [ ] Run `fly deploy` again
   - [ ] Check if sessions persist
   - [ ] Verify same machine is updated (not replaced)

## Known Issues

### If data is still lost on deploy:
1. Check if a new machine was created instead of updating existing one
2. Verify volume is attached: `fly volumes list`
3. Check machine count: `fly machines list` (should only be 1)
4. SSH in and verify `/data` has content: `fly ssh console -C "ls -la /data"`

### If multiple machines exist:
```bash
# Stop and remove extra machines
fly machines list
fly machine stop {extra-machine-id}
fly machine destroy {extra-machine-id}
```

### If volume gets detached:
```bash
# This shouldn't happen with current config, but if it does:
fly volumes list
# Find the volume with your data (check creation date)
# Destroy the machine and create a new one attached to correct volume
```

## Success Criteria

✅ **Deployment is successful when:**
1. Single machine stays running continuously
2. Sessions persist across deploys
3. QR codes load correctly
4. Touch controls work on iPad
5. Song form disables after submission
6. No data loss after multiple deploys
7. Cost is ~$2-3/month for always-on machine

## Rollback Plan

If deployment fails:
```bash
# View deployment history
fly releases

# Rollback to previous version
fly releases rollback {version-number}

# Check logs
fly logs
```

## Monitoring

```bash
# Watch logs live
fly logs --app good-time-karaoke-app

# Check machine status
fly status

# SSH into machine for debugging
fly ssh console

# Check disk usage
fly ssh console -C "df -h /data"

# View SQLite database
fly ssh console -C "sqlite3 /data/karaoke.db '.tables'"
```
