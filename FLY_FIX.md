# Fly.io Persistence Fix

## Problems Fixed

### Issue 1: Ephemeral Storage
Sessions and QR codes were appearing/disappearing because:
1. Data was written to ephemeral container filesystem (`/app/`)
2. Container restarts lost all data
3. Multiple instances could be created, each with different data

### Issue 2: Losing Data on Deploy
Deploys were losing all sessions because:
1. `auto_stop_machines = 'stop'` destroys old machines
2. `min_machines_running = 0` allows all machines to stop
3. New deploys create new machines that attach to different/new volumes
4. Old volumes with data get orphaned

## Solution
Store data in persistent volume mounted at `/data`:

### Changes Made

**database.js**
- Changed `data.json` path from `/app/data.json` → `/data/data.json` in production

**server.js**
- Changed QR code directory from `/app/public/qr-codes/` → `/data/qr-codes/` in production
- Added middleware to serve QR codes from persistent volume
- Added directory creation on startup

**fly.toml**
- Changed `auto_stop_machines = false` - keeps machine running
- Changed `min_machines_running = 1` - always keeps 1 machine alive
- Set `max_machines_running = 1` - prevents multiple instances
- **Result:** Same machine persists across deploys, keeping volume data intact

## Deployment

```bash
# Clean up orphaned volumes first
fly volumes list
# Identify unused volumes and delete them:
# fly volumes delete vol_xxxxx

# Deploy the fix
fly deploy

# Verify volume is mounted and has data
fly ssh console -C "ls -la /data"
fly ssh console -C "cat /data/karaoke.db" # Should show SQLite data

# Check logs for errors
fly logs

# Verify machine stays running
fly status
```

## Important Notes

**Cost Impact:**
- With `min_machines_running = 1`, you'll have 1 machine always running (~$2-3/month)
- Previous config (min=0) would suspend when idle, saving costs
- For a karaoke app used regularly, keeping it running is worth the consistency

**Volume Management:**
- Only delete volumes when you want to wipe all data
- Each deploy now updates the existing machine, preserving the volume
- Backup important data before deleting volumes

## Verification

After deployment:
1. Create a new session
2. Reload the page - session should persist
3. Restart the machine: `fly machine restart <machine-id>`
4. Session should still be there
5. QR codes should load correctly

## Future Improvement

Consider migrating from JSON file storage to a proper database:
- SQLite (simple, works with Fly volumes)
- PostgreSQL (Fly.io offers managed Postgres)
- Turso (distributed SQLite)

This would provide better reliability, concurrent access, and backup options.
