import express, { Request, Response, NextFunction } from 'express';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting: in-memory map by IP
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 5;

// Rate limiting middleware
const rateLimiter = (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  
  const entry = rateLimitMap.get(ip);
  
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }
  
  if (entry.count >= MAX_REQUESTS) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: `Maximum ${MAX_REQUESTS} requests per minute allowed`
    });
  }
  
  entry.count++;
  next();
};

// Clean up old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now > entry.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW);

// Validate TikTok URL
const isValidTikTokUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    const validHostnames = [
      'www.tiktok.com',
      'tiktok.com',
      'vm.tiktok.com',
      'vt.tiktok.com'
    ];
    
    if (!validHostnames.includes(parsed.hostname)) {
      return false;
    }
    
    // For short URLs (vt.tiktok.com, vm.tiktok.com), just check hostname
    if (parsed.hostname === 'vt.tiktok.com' || parsed.hostname === 'vm.tiktok.com') {
      return parsed.pathname.length > 1; // Must have a path
    }
    
    // For full URLs, check for video path or @username
    return parsed.pathname.includes('/video/') || parsed.pathname.includes('/@');
  } catch {
    return false;
  }
};

// Extract video ID from TikTok URL
const extractVideoId = (url: string): string | null => {
  try {
    const match = url.match(/\/video\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
};

// Get random User-Agent
const getRandomUserAgent = (): string => {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
};

// Stream video directly from yt-dlp
const streamVideo = async (
  tiktokUrl: string,
  req: Request,
  res: Response
): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Use yt-dlp to stream video directly (handles auth, headers, etc.)
    const ytdlp = spawn('yt-dlp', [
      '-f', 'best[ext=mp4]', // Best quality MP4
      '--no-warnings',
      '--no-playlist',
      '-o', '-', // Output to stdout
      tiktokUrl
    ]);
    
    // Set headers
    const videoId = extractVideoId(tiktokUrl) || 'video';
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="tiktok-${videoId}.mp4"`);
    res.setHeader('Accept-Ranges', 'bytes');
    
    // Pipe yt-dlp stdout to response
    ytdlp.stdout.pipe(res);
    
    // Handle errors
    ytdlp.stderr.on('data', (data) => {
      const errorMsg = data.toString();
      // Ignore warnings, but log actual errors
      if (!errorMsg.includes('WARNING') && !errorMsg.includes('ERROR')) {
        console.error('yt-dlp stderr:', errorMsg);
      }
    });
    
    ytdlp.on('error', (err) => {
      if (!res.headersSent) {
        reject(new Error(`Failed to start yt-dlp: ${err.message}`));
      }
    });
    
    ytdlp.on('close', (code) => {
      if (code !== 0 && !res.headersSent) {
        reject(new Error(`yt-dlp exited with code ${code}`));
      } else {
        resolve();
      }
    });
    
    // Handle client disconnect
    req.on('close', () => {
      if (!ytdlp.killed) {
        ytdlp.kill();
      }
    });
  });
};

// Main download endpoint
app.get('/download', rateLimiter, async (req: Request, res: Response) => {
  try {
    const url = req.query.url as string;
    
    // Input validation
    if (!url) {
      return res.status(400).json({
        error: 'Missing URL parameter',
        message: 'Please provide a TikTok video URL in the query parameter: ?url=<tiktok_url>'
      });
    }
    
    if (!isValidTikTokUrl(url)) {
      return res.status(400).json({
        error: 'Invalid TikTok URL',
        message: 'Please provide a valid TikTok video URL'
      });
    }
    
    // Stream video directly using yt-dlp
    try {
      await streamVideo(url, req, res);
    } catch (error: any) {
      if (!res.headersSent) {
        return res.status(500).json({
          error: 'Download failed',
          message: error.message || 'Failed to download video. The video might be private or unavailable.'
        });
      }
    }
  } catch (error: any) {
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Internal server error',
        message: error.message || 'An unexpected error occurred'
      });
    }
  }
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  if (!res.headersSent) {
    res.status(500).json({
      error: 'Internal server error',
      message: 'An unexpected error occurred'
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`TikTok Downloader API running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Download endpoint: http://localhost:${PORT}/download?url=<tiktok_url>`);
});

