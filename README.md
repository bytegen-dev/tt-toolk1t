# TikTok Video Downloader

A lightweight, production-ready full-stack application for downloading TikTok videos without watermarks. Built with Express.js, Next.js, TypeScript, and yt-dlp.

## Features

- **Web Interface** - Clean, minimal dark mode UI built with Next.js
- **API Endpoint** - Simple GET request with TikTok URL
- **No watermark** - Downloads clean videos directly
- **Streaming** - Efficiently streams videos without saving to disk
- **Range requests** - Supports video seeking and partial content
- **Rate limiting** - 5 requests per minute per IP
- **Error handling** - Graceful handling of invalid URLs, private videos, etc.
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

## Usage

### Development

Run backend in development mode with hot reload:

```bash
npm run dev
```

Run frontend in development mode (separate terminal):

```bash
npm run dev:frontend
```

### Production

Build and start:

```bash
npm run build
npm start
```

The application will be available at:

- Frontend: `http://localhost:3000/web`
- API: `http://localhost:3000/download?url=<tiktok_url>`
- Health check: `http://localhost:3000/health`

## API Endpoints

### Download Video

**GET** `/download?url=<tiktok_video_url>`

Downloads a TikTok video without watermark.

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
├── frontend/              # Next.js frontend application
│   ├── app/              # Next.js app directory
│   ├── components/       # React components
│   └── package.json      # Frontend dependencies
├── src/
│   └── server.ts         # Express backend server
├── dist/                 # Compiled backend JavaScript
├── dist-frontend/        # Static frontend build output
├── package.json          # Root dependencies and scripts
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

1. **Frontend**: Next.js UI allows users to paste TikTok URLs and trigger downloads
2. **URL Validation**: Validates the provided TikTok URL format
3. **Video Extraction**: Uses `yt-dlp` to stream videos directly (no watermark)
4. **Streaming**: Streams video directly to the client without saving to disk
5. **Headers**: Sets proper headers for video download and seeking support
6. **Error Handling**: Catches and returns user-friendly error messages

## Notes

- Videos are streamed directly without being saved to disk
- Frontend is built as static files and served by the Express server at `/web`
- Range requests are supported for video seeking
- Rate limiting uses in-memory storage (resets on server restart)
