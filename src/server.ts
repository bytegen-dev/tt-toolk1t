import express, { Request, Response, NextFunction } from 'express';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import tmp from 'tmp';

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

// Get video metadata (thumbnail, title, etc.)
app.get('/metadata', rateLimiter, async (req: Request, res: Response) => {
  try {
    const url = req.query.url as string;
    
    if (!url) {
      return res.status(400).json({
        error: 'Missing URL parameter',
        message: 'Please provide a TikTok video URL'
      });
    }
    
    if (!isValidTikTokUrl(url)) {
      return res.status(400).json({
        error: 'Invalid TikTok URL',
        message: 'Please provide a valid TikTok video URL'
      });
    }
    
    try {
      // Use yt-dlp to get video metadata as JSON
      const command = `yt-dlp --dump-json --no-warnings "${url}"`;
      const { stdout, stderr } = await execAsync(command);
      
      if (stderr && !stderr.includes('WARNING')) {
        throw new Error(`yt-dlp error: ${stderr}`);
      }
      
      const metadata = JSON.parse(stdout);
      
      // Extract useful info
      const videoInfo = {
        id: metadata.id || extractVideoId(url) || null,
        title: metadata.title || 'TikTok Video',
        thumbnail: metadata.thumbnail || null,
        duration: metadata.duration || null,
        uploader: metadata.uploader || metadata.uploader_id || null,
      };
      
      res.json(videoInfo);
    } catch (error: any) {
      return res.status(500).json({
        error: 'Metadata extraction failed',
        message: error.message || 'Failed to extract video metadata'
      });
    }
  } catch (error: any) {
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// Get user posts (all videos from a TikTok profile)
app.get('/user-posts', rateLimiter, async (req: Request, res: Response) => {
  try {
    const username = req.query.username as string;
    const profile = req.query.profile as string;
    
    let profileUrl: string;
    
    if (profile) {
      // If profile URL is provided
      if (!profile.includes('tiktok.com')) {
        return res.status(400).json({
          error: 'Invalid profile URL',
          message: 'Please provide a valid TikTok profile URL'
        });
      }
      profileUrl = profile.startsWith('http') ? profile : `https://${profile}`;
    } else if (username) {
      // Check if username is actually a URL
      if (username.startsWith('http://') || username.startsWith('https://')) {
        // Extract username from URL
        const urlMatch = username.match(/tiktok\.com\/@?([^\/\?]+)/);
        if (urlMatch && urlMatch[1]) {
          const extractedUsername = urlMatch[1];
          profileUrl = `https://www.tiktok.com/@${extractedUsername}`;
        } else {
          // Use as profile URL directly
          profileUrl = username.startsWith('http') ? username : `https://${username}`;
        }
      } else {
        // It's just a username
        profileUrl = `https://www.tiktok.com/@${username.replace('@', '')}`;
      }
    } else {
      return res.status(400).json({
        error: 'Missing parameter',
        message: 'Please provide either ?username=<username> or ?profile=<profile_url>'
      });
    }
    
    try {
      // Use yt-dlp to get flat playlist as JSON (metadata without downloading)
      const command = `yt-dlp --flat-playlist -j --no-warnings "${profileUrl}"`;
      const { stdout, stderr } = await execAsync(command, { maxBuffer: 10 * 1024 * 1024 }); // 10MB buffer
      
      if (stderr && !stderr.includes('WARNING')) {
        throw new Error(`yt-dlp error: ${stderr}`);
      }
      
      // Parse JSON lines (yt-dlp outputs one JSON object per line)
      const lines = stdout.trim().split('\n').filter(line => line.trim());
      const posts = lines.map(line => {
        try {
          const video = JSON.parse(line);
          return {
            id: video.id || null,
            url: video.url || `https://www.tiktok.com/@${video.uploader_id || username}/video/${video.id}`,
            title: video.title || null,
            thumbnail: video.thumbnail || null,
            duration: video.duration || null,
            uploader: video.uploader || video.uploader_id || null,
            view_count: video.view_count || null,
            like_count: video.like_count || null,
          };
        } catch {
          return null;
        }
      }).filter(post => post !== null);
      
      res.json({
        profile: profileUrl,
        count: posts.length,
        posts: posts
      });
    } catch (error: any) {
      return res.status(500).json({
        error: 'Failed to fetch user posts',
        message: error.message || 'Failed to extract user posts. The profile might be private or unavailable.'
      });
    }
  } catch (error: any) {
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// Transcribe video audio endpoint
app.get('/transcribe', rateLimiter, async (req: Request, res: Response) => {
  try {
    const url = req.query.url as string;
    const modelSize = (req.query.model as string) || 'base'; // tiny, base, small, medium, large
    
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
    
    // Validate model size
    const validModels = ['tiny', 'base', 'small', 'medium', 'large'];
    if (!validModels.includes(modelSize)) {
      return res.status(400).json({
        error: 'Invalid model size',
        message: `Model size must be one of: ${validModels.join(', ')}`
      });
    }
    
    // Create temp file for video (with unique name to avoid conflicts)
    const tmpFile = tmp.fileSync({ postfix: '.mp4', keep: false });
    const videoPath = tmpFile.name;
    
    // Ensure the file doesn't exist before download
    if (fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }
    
    try {
      // Download video using yt-dlp
      // Use --no-mtime to avoid timestamp issues, and ensure we get the best quality
      // Use --no-part to avoid partial downloads
      const downloadCommand = `yt-dlp -f "best[ext=mp4]/best" --no-warnings --no-playlist --no-mtime --no-part -o "${videoPath}" "${url}"`;
      
      try {
        const { stdout, stderr } = await execAsync(downloadCommand, { 
          timeout: 120000, // 120 second timeout for longer videos
          maxBuffer: 10 * 1024 * 1024 // 10MB buffer for output
        });
        
        if (stderr && !stderr.includes('WARNING')) {
          console.error('yt-dlp stderr:', stderr);
        }
        console.log('yt-dlp stdout:', stdout);
      } catch (downloadError: any) {
        console.error('yt-dlp download error:', downloadError.message);
        if (downloadError.stderr) {
          console.error('yt-dlp stderr:', downloadError.stderr);
        }
        throw new Error(`Video download failed: ${downloadError.message}`);
      }
      
      // Wait a bit for file system to sync
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check if file was downloaded
      if (!fs.existsSync(videoPath)) {
        throw new Error('Video file was not created');
      }
      
      const fileSize = fs.statSync(videoPath).size;
      if (fileSize === 0) {
        throw new Error('Downloaded video file is empty');
      }
      
      console.log(`Video downloaded successfully: ${fileSize} bytes`);
      
      // Call Python transcription script
      // __dirname in compiled JS is dist/, so go up one level to find scripts/
      const scriptPath = path.resolve(__dirname, '../scripts/transcribe.py');
      const transcribeCommand = `python3 "${scriptPath}" "${videoPath}" "${modelSize}"`;
      const { stdout, stderr } = await execAsync(transcribeCommand, { maxBuffer: 10 * 1024 * 1024 });
      
      if (stderr && !stderr.includes('WARNING')) {
        console.error('Transcription stderr:', stderr);
      }
      
      // Parse JSON response from Python script
      const result = JSON.parse(stdout);
      
      if (result.error) {
        return res.status(500).json({
          error: 'Transcription failed',
          message: result.error
        });
      }
      
      res.json({
        url: url,
        transcript: result.transcript,
        language: result.language,
        language_probability: result.language_probability,
        duration: result.duration,
        model: modelSize
      });
      
    } catch (error: any) {
      return res.status(500).json({
        error: 'Transcription failed',
        message: error.message || 'Failed to transcribe video audio'
      });
    } finally {
      // Clean up temp file
      try {
        if (fs.existsSync(videoPath)) {
          fs.unlinkSync(videoPath);
        }
      } catch (cleanupError) {
        console.error('Failed to cleanup temp file:', cleanupError);
      }
    }
  } catch (error: any) {
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend static files at /web
const frontendPath = path.join(__dirname, '../dist-frontend');

// Serve static assets first
app.use('/web', express.static(frontendPath, {
  maxAge: '1y',
  etag: true,
}));

// Handle frontend SPA routes - serve index.html for all /web routes that don't match static files
app.get('/web', (req: Request, res: Response) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.get('/web/*', (req: Request, res: Response) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
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
  console.log(`tt-toolk1t (TikTok Toolkit) running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Download endpoint: http://localhost:${PORT}/download?url=<tiktok_url>`);
  console.log(`Metadata endpoint: http://localhost:${PORT}/metadata?url=<tiktok_url>`);
  console.log(`User posts endpoint: http://localhost:${PORT}/user-posts?username=<username>`);
  console.log(`Transcribe endpoint: http://localhost:${PORT}/transcribe?url=<tiktok_url>&model=<model_size>`);
  console.log(`Frontend: http://localhost:${PORT}/web`);
});

