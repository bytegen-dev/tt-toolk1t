# TikTok Video Downloader API

A lightweight, production-ready REST API for downloading TikTok videos without watermarks. Built with Express.js, TypeScript, and yt-dlp. Includes an optional web interface for convenience.

<img width="699" height="691" alt="image" src="https://github.com/user-attachments/assets/872a5672-bd03-42f1-b820-aefb8c0c567d" />

## Features

- **REST API** - Simple GET endpoints for downloading TikTok videos
- **No watermark** - Downloads clean videos directly
- **Streaming** - Efficiently streams videos without saving to disk
- **User posts** - Get all videos from a TikTok user profile
- **Range requests** - Supports video seeking and partial content
- **Video metadata** - Get thumbnail, title, and uploader info
- **Rate limiting** - 5 requests per minute per IP
- **Error handling** - Graceful handling of invalid URLs, private videos, etc.
- **Web interface** - Optional minimal dark mode UI for easy testing (available at `/web`)
- **Railway ready** - Pre-configured for easy deployment

## Prerequisites

- Node.js 18+
- Python 3.x (for yt-dlp)
- yt-dlp installed globally: `pip install yt-dlp`

## Installation

1. Clone the repository:

```bash
git clone <your-repo-url>
cd tiktok-downloader
```

2. Install dependencies:

```bash
npm install
```

3. Ensure yt-dlp is installed:

```bash
pip install yt-dlp
```

## Quick Start

### Installation

```bash
npm install
npm run build
npm start
```

The API will be available at `http://localhost:3000`

### Development

Run API server with hot reload:

```bash
npm run dev
```

For frontend development (optional):

```bash
npm run dev:frontend
```

## API Documentation

### Download Video

**GET** `/download?url=<tiktok_video_url>`

Downloads a TikTok video without watermark. Streams the video directly to the client.

**Query Parameters:**

- `url` (required) - The TikTok video URL

**Example:**

```bash
curl "http://localhost:3000/download?url=https://www.tiktok.com/@username/video/1234567890" --output video.mp4
```

**Response:**

- Success: Video stream with headers:
  - `Content-Type: video/mp4`
  - `Content-Disposition: attachment; filename="tiktok-[id].mp4"`
  - `Accept-Ranges: bytes`
  - `Content-Length: <size>`
- Error: JSON response with error details

**Error Responses:**

```json
{
  "error": "Missing URL parameter",
  "message": "Please provide a TikTok video URL in the query parameter: ?url=<tiktok_url>"
}
```

```json
{
  "error": "Invalid TikTok URL",
  "message": "Please provide a valid TikTok video URL"
}
```

```json
{
  "error": "Extraction failed",
  "message": "Failed to extract video URL. The video might be private or unavailable."
}
```

```json
{
  "error": "Rate limit exceeded",
  "message": "Maximum 5 requests per minute allowed"
}
```

### Get Video Metadata

**GET** `/metadata?url=<tiktok_video_url>`

Returns video information including thumbnail, title, uploader, and duration.

**Example:**

```bash
curl "http://localhost:3000/metadata?url=https://www.tiktok.com/@username/video/1234567890"
```

**Response:**

```json
{
  "id": "1234567890",
  "title": "Video Title",
  "thumbnail": "https://...",
  "duration": 30,
  "uploader": "username"
}
```

### Get User Posts

**GET** `/user-posts?username=<username>` or `/user-posts?profile=<profile_url>`

Returns a list of all public videos from a TikTok user profile.

**Query Parameters:**

- `username` (optional) - TikTok username (without @)
- `profile` (optional) - Full TikTok profile URL

**Example:**

```bash
curl "http://localhost:3000/user-posts?username=example"
# or
curl "http://localhost:3000/user-posts?profile=https://www.tiktok.com/@example"
```

**Response:**

```json
{
  "profile": "https://www.tiktok.com/@example",
  "count": 10,
  "posts": [
    {
      "id": "1234567890",
      "url": "https://www.tiktok.com/@example/video/1234567890",
      "title": "Video Title",
      "thumbnail": "https://...",
      "duration": 30,
      "uploader": "example",
      "view_count": 1000000,
      "like_count": 50000
    }
  ]
}
```

### Health Check

**GET** `/health`

Returns API status.

**Example:**

```bash
curl http://localhost:3000/health
```

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Rate Limiting

- **Limit**: 5 requests per minute per IP address
- **Window**: 60 seconds
- **Response**: 429 Too Many Requests when exceeded

## Deployment

### Railway

This project is pre-configured for Railway deployment:

1. Push your code to GitHub
2. Create a new project on [Railway](https://railway.app)
3. Connect your GitHub repository
4. Railway will automatically detect the configuration and deploy

The `nixpacks.toml` file ensures:

- Node.js 20 is installed
- Python 3 and ffmpeg are available
- yt-dlp is installed during build
- The app is built and started correctly

### Environment Variables

- `PORT` - Server port (default: 3000)

## Project Structure

```
tiktok-downloader/
├── src/
│   └── server.ts         # Express API server
├── frontend/              # Optional web interface (convenience feature)
│   ├── app/              # Next.js app directory
│   └── components/       # React components
├── dist/                 # Compiled backend JavaScript
├── dist-frontend/        # Static frontend build output
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── railway.json          # Railway deployment config
├── nixpacks.toml         # Railway build config
└── README.md             # This file
```

## Development

### Scripts

- `npm run build` - Build both frontend and backend
- `npm run build:frontend` - Build frontend only
- `npm run build:backend` - Build backend only
- `npm start` - Start production server
- `npm run dev` - Start backend development server with hot reload
- `npm run dev:frontend` - Start frontend development server
- `npm run type-check` - Type check without building

### How It Works

1. **URL Validation**: Validates the provided TikTok URL format
2. **Video Extraction**: Uses `yt-dlp` to stream videos directly (no watermark)
3. **Streaming**: Streams video directly to the client without saving to disk
4. **Headers**: Sets proper headers for video download and seeking support
5. **Error Handling**: Returns JSON error responses for invalid requests

The API can be used independently from any client. The web interface at `/web` is provided as a convenience for testing and quick downloads.

## Notes

- Videos are streamed directly without being saved to disk
- API can be used independently - the web interface is optional
- Range requests are supported for video seeking
- Rate limiting uses in-memory storage (resets on server restart)
- Web interface available at `/web` for convenience (built as static files)
