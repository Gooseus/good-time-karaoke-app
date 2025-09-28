# Karaoke DJ Queue - Fly.io Deployment Guide

## Overview
This guide walks you through deploying your SQLite-powered karaoke app to Fly.io with persistent data storage.

## Prerequisites
- [Fly.io CLI installed](https://fly.io/docs/hands-on/install-flyctl/)
- Fly.io account

## Quick Start

### 1. Login to Fly.io
```bash
flyctl auth login
```

### 2. Create and Deploy the App
```bash
# Create the volume (free tier gets 3GB)
flyctl volumes create karaoke_data --region ewr --size 1

# Deploy the app
flyctl deploy
```

### 3. Access Your App
Your app will be available at: `https://good-time-karaoke-app.fly.dev`

## What's Configured

### Persistent Storage
- **Volume**: 1GB persistent volume mounted at `/data`
- **Database**: SQLite database stored in `/data/karaoke.db`
- **Auto-scaling**: App sleeps when idle, wakes on requests (free tier)

### Features Included
✅ **SQLite Database** - Production-ready with WAL mode
✅ **Search & Filter** - Find songs by artist, title, or singer
✅ **Bulk Operations** - Select multiple songs for batch actions
✅ **Pause/Resume** - Control queue timing
✅ **Skip Songs** - Mark songs as skipped
✅ **Session Cleanup** - Clear completed songs
✅ **Time Estimates** - Shows wait times (accounts for pause state)
✅ **Persistent Data** - Survives app restarts and deployments

## Testing Persistence

### 1. Create a test session:
- Visit your app URL
- Create a new session
- Add some songs

### 2. Restart the app:
```bash
flyctl apps restart good-time-karaoke-app
```

### 3. Verify data persistence:
- Visit the same session URL
- All songs and data should still be there!

## Managing Your App

### View logs
```bash
flyctl logs
```

### Monitor resources
```bash
flyctl status
```

### SSH into your app (if needed)
```bash
flyctl ssh console
```

### Scale up (if you need more resources later)
```bash
flyctl scale memory 2048
```

## Database Commands

### Backup your database
```bash
# SSH into the app
flyctl ssh console

# Create backup
cp /data/karaoke.db /data/karaoke.db.backup
```

### View database stats
```bash
# SSH into the app
flyctl ssh console

# Install sqlite3 and check
apk add sqlite
sqlite3 /data/karaoke.db "SELECT name FROM sqlite_master WHERE type='table';"
```

## Troubleshooting

### If deployment fails:
```bash
# Check detailed logs
flyctl logs --app good-time-karaoke-app

# Check app status
flyctl status
```

### If volume doesn't mount:
```bash
# List volumes
flyctl volumes list

# If missing, create it:
flyctl volumes create karaoke_data --region ewr --size 1
```

### If app won't start:
```bash
# Check the Dockerfile and fly.toml are correct
flyctl config validate

# Redeploy
flyctl deploy
```

## Cost Information (Free Tier)
- **Compute**: Free allowance covers typical karaoke bar usage
- **Storage**: 3GB included (1GB allocated for database)
- **Bandwidth**: Generous free allowance
- **Auto-stop**: App sleeps when idle to conserve resources

## Next Steps
- Share your app URL with DJs
- QR codes work automatically with your custom domain
- Data persists across restarts and deployments
- Monitor usage through Fly.io dashboard

Happy karaoke! 🎤