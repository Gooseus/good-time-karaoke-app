# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a simple karaoke queue management tool for individual karaoke DJs working at bars. The system features a dual-interface design focused on simplicity and convenience:
- **Singer Interface**: Mobile-friendly song request form
- **DJ Interface**: Simple queue management for the DJ's workflow

## Architecture

Simple full-stack web application designed for ease of use:
- **Frontend**: React-based with mobile-first design for singers
- **Backend**: Node.js with WebSocket support for real-time queue updates
- **Database**: Simple session-based storage for queue management
- **External Integrations**: YouTube search links, QR code generation

## Key Technical Requirements

### Real-time Features
- WebSocket server for real-time queue synchronization across all connected devices
- Sub-second queue position updates for singers
- Automatic reconnection with exponential backoff for connection stability

### Data Models
- **Sessions**: Unique session codes, configurable song duration (default 4.5 min)
- **Singers**: Name deduplication with counters (e.g., "John (2)"), performance history
- **Queue**: Position tracking, status (pending → current → completed), wait time calculations

### Performance Targets
- Support 20-30 concurrent singers (typical bar karaoke night)
- Handle 100+ songs in single queue
- Fast mobile loading for singers to quickly submit requests

## Development Phases

### Phase 1 (MVP): Core Functionality
- Session creation and QR code generation
- Basic song request form with validation
- Simple queue display (no reordering yet)
- YouTube search URL generation
- Singer name deduplication

### Phase 2: Enhanced DJ Experience
- Drag & drop queue management
- Real-time WebSocket implementation
- Wait time calculations and display
- Basic reordering capabilities

### Phase 3: Polish
- Simple celebration feedback for singers
- Session persistence
- Mobile optimization

## Design Principles

### Simplicity First
- Keep the DJ interface clean and easy to use during busy nights
- Minimize clicks and complexity for common tasks
- Singer interface should be dead simple - just name, artist, song

### Mobile-First for Singers
- Touch-friendly interface for song requests
- Fast loading on mobile devices
- No app download required - just scan QR code

### DJ Workflow Focus
- Quick setup - generate QR code and start accepting requests
- Easy queue management without complicated features
- YouTube search integration for finding karaoke tracks quickly