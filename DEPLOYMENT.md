# Deployment Guide

This guide covers deploying the Karaoke DJ Queue app to various platforms.

## Environment Variables

The app uses these environment variables:

- `PORT` - Server port (default: 3000)
- `BASE_URL` - Override base URL for QR codes (optional - auto-detects from request)
- `DEFAULT_SONG_DURATION` - Default song duration in seconds (default: 270)

## Local Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Start the server: `npm start` or `npm run dev`
4. Visit: `http://localhost:3000`

## Production Deployment

### Railway

1. Connect your GitHub repository to Railway
2. Set environment variables in Railway dashboard:
   ```
   PORT=3000
   ```
3. Deploy - Railway will automatically detect the Node.js app

### Render

1. Connect your GitHub repository to Render
2. Set build command: `npm install`
3. Set start command: `npm start`
4. Set environment variables if needed

### DigitalOcean App Platform

1. Connect your GitHub repository
2. Set build command: `npm install`
3. Set run command: `npm start`
4. Configure environment variables

### Heroku

1. Install Heroku CLI
2. Create app: `heroku create your-karaoke-app`
3. Deploy: `git push heroku main`

### Docker

Build and run with Docker:

```bash
# Build image
docker build -t karaoke-app .

# Run container
docker run -p 3000:3000 karaoke-app
```

## Important Notes

### QR Code Generation
- QR codes are automatically generated with the correct domain
- Uses request headers to detect the production URL
- Works with reverse proxies and load balancers

### Data Persistence
- Uses JSON file storage (`data.json`)
- QR codes saved to `public/qr-codes/`
- Make sure these directories are writable

### Domain Configuration
The app automatically detects the correct domain for QR codes by checking:
1. `x-forwarded-host` header (from reverse proxy)
2. `x-forwarded-proto` header (http/https)
3. Standard `host` header
4. Falls back to localhost in development

### Session Management
- Sessions persist across server restarts
- Old sessions remain accessible until manually cleaned up
- Consider implementing session cleanup for long-running deployments

## Performance Tips

- The app is designed for 20-30 concurrent singers
- Uses polling instead of WebSockets for simplicity
- Static files are served efficiently by Express
- Consider adding a reverse proxy (nginx) for better performance in production