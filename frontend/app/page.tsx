"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface VideoMetadata {
  id: string | null;
  title: string;
  thumbnail: string | null;
  duration: number | null;
  uploader: string | null;
}

interface UserPost {
  id: string | null;
  url: string;
  title: string | null;
  thumbnail: string | null;
  duration: number | null;
  uploader: string | null;
  view_count: number | null;
  like_count: number | null;
}

interface UserPostsResponse {
  profile: string;
  count: number;
  posts: UserPost[];
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [clipboardChecked, setClipboardChecked] = useState(false);
  const [username, setUsername] = useState("");
  const [userPosts, setUserPosts] = useState<UserPostsResponse | null>(null);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [postsError, setPostsError] = useState("");

  const handleDownload = async () => {
    if (!url.trim()) {
      setError("Please enter a TikTok URL");
      return;
    }

    // Basic URL validation
    const tiktokUrlPattern = /(tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com)/;
    if (!tiktokUrlPattern.test(url)) {
      setError("Please enter a valid TikTok URL");
      return;
    }

    setError("");
    setLoading(true);

    try {
      // Trigger download - use absolute path since we're at /web
      const downloadUrl = `${
        window.location.origin
      }/download?url=${encodeURIComponent(url)}`;
      window.open(downloadUrl, "_blank");

      // Reset after a delay
      setTimeout(() => {
        setLoading(false);
        setUrl("");
        setMetadata(null);
      }, 2000);
    } catch (err) {
      setError("Failed to download video. Please try again.");
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !loading) {
      handleDownload();
    }
  };

  const handleFetchPosts = async () => {
    if (!username.trim()) {
      setPostsError("Please enter a username or profile URL");
      return;
    }

    setPostsError("");
    setLoadingPosts(true);

    try {
      const input = username.trim();
      let apiUrl: string;

      // Check if it's a full URL
      if (input.startsWith("http://") || input.startsWith("https://")) {
        // Extract username from URL or use profile parameter
        const urlMatch = input.match(/tiktok\.com\/@?([^\/\?]+)/);
        if (urlMatch && urlMatch[1]) {
          // Extract username from URL
          const extractedUsername = urlMatch[1];
          apiUrl = `/user-posts?username=${encodeURIComponent(
            extractedUsername
          )}`;
        } else {
          // Use profile parameter directly
          apiUrl = `/user-posts?profile=${encodeURIComponent(input)}`;
        }
      } else {
        // It's just a username
        const cleanUsername = input
          .replace("@", "")
          .replace(/^https?:\/\//, "");
        apiUrl = `/user-posts?username=${encodeURIComponent(cleanUsername)}`;
      }

      const response = await fetch(apiUrl);
      if (response.ok) {
        const data = await response.json();
        setUserPosts(data);
      } else {
        const error = await response.json();
        setPostsError(error.message || "Failed to fetch user posts");
        setUserPosts(null);
      }
    } catch (err) {
      setPostsError("Failed to fetch user posts. Please try again.");
      setUserPosts(null);
    } finally {
      setLoadingPosts(false);
    }
  };

  // Auto-paste from clipboard on site load
  useEffect(() => {
    const pasteFromClipboard = async () => {
      if (clipboardChecked) return;

      try {
        const clipboardText = await navigator.clipboard.readText();
        if (clipboardText && clipboardText.trim()) {
          const text = clipboardText.trim();

          // Check if it's a TikTok URL
          const tiktokUrlPattern =
            /(tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com)/;

          if (tiktokUrlPattern.test(text)) {
            // Check if it's a video URL (contains /video/ or is a short URL)
            const isVideoUrl =
              text.includes("/video/") ||
              text.includes("vt.tiktok.com") ||
              text.includes("vm.tiktok.com");

            if (isVideoUrl) {
              // It's a video URL - paste into video download input
              setUrl(text);
            } else {
              // It's a profile URL or username - paste into user posts input
              setUsername(text);
            }
          } else if (text && !text.includes("http") && !text.includes("/")) {
            // It might be just a username (no URL, no slashes)
            setUsername(text);
          }
        }
      } catch (err) {
        // Clipboard access denied or not available - silently fail
        // This is expected in some browsers or if user hasn't granted permission
      } finally {
        setClipboardChecked(true);
      }
    };

    pasteFromClipboard();
  }, [clipboardChecked]);

  // Fetch metadata when URL changes
  useEffect(() => {
    const fetchMetadata = async () => {
      if (!url.trim()) {
        setMetadata(null);
        return;
      }

      // Check if it's a complete URL (starts with http/https)
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        setMetadata(null);
        return;
      }

      // Check if it matches TikTok URL pattern
      const tiktokUrlPattern = /(tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com)/;
      if (!tiktokUrlPattern.test(url)) {
        setMetadata(null);
        return;
      }

      // Additional check: ensure URL has a path (not just domain)
      try {
        const urlObj = new URL(url);
        if (urlObj.pathname.length <= 1) {
          setMetadata(null);
          return;
        }
      } catch {
        // Invalid URL format
        setMetadata(null);
        return;
      }

      setLoadingMetadata(true);
      try {
        const response = await fetch(
          `/metadata?url=${encodeURIComponent(url)}`
        );
        if (response.ok) {
          const data = await response.json();
          setMetadata(data);
        } else {
          setMetadata(null);
        }
      } catch (err) {
        setMetadata(null);
      } finally {
        setLoadingMetadata(false);
      }
    };

    // Debounce metadata fetch
    const timer = setTimeout(fetchMetadata, 500);
    return () => clearTimeout(timer);
  }, [url]);

  return (
    <div className="flex min-h-screen items-center justify-center flex-col gap-4 bg-black p-4">
      <Card className="w-full max-w-2xl border border-white/10 bg-black">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-3xl font-medium text-white">
            TikTok Video Downloader
          </CardTitle>
          <CardDescription className="text-white/60 text-sm">
            Download TikTok videos without watermarks
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Input
              type="url"
              placeholder="Paste TikTok URL here"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError("");
                if (!e.target.value.trim()) {
                  setMetadata(null);
                }
              }}
              onKeyPress={handleKeyPress}
              disabled={loading}
              className="h-12 text-base bg-black border-white/20 text-white placeholder:text-white/40 focus:border-white/40"
            />
            {error && (
              <p className="text-sm text-white/80 font-medium">{error}</p>
            )}
            {loadingMetadata && (
              <p className="text-xs text-white/40">Loading preview...</p>
            )}
            {metadata && metadata.thumbnail && (
              <div className="mt-4 space-y-2">
                <div className="flex justify-center">
                  <img
                    src={metadata.thumbnail}
                    alt={metadata.title}
                    className="w-full max-w-md max-h-64 object-cover rounded border border-white/10"
                  />
                </div>
                {metadata.title && (
                  <p className="text-sm text-white/80 font-medium line-clamp-2">
                    {metadata.title}
                  </p>
                )}
                {metadata.uploader && (
                  <p className="text-xs text-white/40">@{metadata.uploader}</p>
                )}
              </div>
            )}
          </div>
          <Button
            onClick={handleDownload}
            disabled={loading || !url.trim() || loadingMetadata || !metadata}
            className="w-full h-12 text-base font-medium bg-white text-black hover:bg-white/90 disabled:bg-white/20 disabled:text-white/40"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Downloading...
              </span>
            ) : (
              "Download Video"
            )}
          </Button>
          <div className="pt-4 space-y-2 text-xs text-white/40">
            <p className="font-medium text-white/60">Supported formats:</p>
            <ul className="space-y-1">
              <li>tiktok.com/@user/video/123</li>
              <li>vt.tiktok.com/ABC123</li>
              <li>vm.tiktok.com/XYZ789</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* User Posts Section */}
      <Card className="w-full max-w-2xl border border-white/10 bg-black mt-6">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-2xl font-medium text-white">
            Get User Posts
          </CardTitle>
          <CardDescription className="text-white/60 text-sm">
            Fetch all videos from a TikTok profile
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Input
              type="text"
              placeholder="Enter username or profile URL (e.g., username or https://www.tiktok.com/@username)"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setPostsError("");
                if (!e.target.value.trim()) {
                  setUserPosts(null);
                }
              }}
              onKeyPress={(e) => {
                if (e.key === "Enter" && !loadingPosts && username.trim()) {
                  handleFetchPosts();
                }
              }}
              disabled={loadingPosts}
              className="h-12 text-base bg-black border-white/20 text-white placeholder:text-white/40 focus:border-white/40"
            />
            {postsError && (
              <p className="text-sm text-white/80 font-medium">{postsError}</p>
            )}
          </div>
          <Button
            onClick={handleFetchPosts}
            disabled={loadingPosts || !username.trim()}
            className="w-full h-12 text-base font-medium bg-white text-black hover:bg-white/90 disabled:bg-white/20 disabled:text-white/40"
          >
            {loadingPosts ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Loading posts...
              </span>
            ) : (
              "Fetch Posts"
            )}
          </Button>
          {userPosts && (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-white/60">
                Found {userPosts.count} posts from {userPosts.profile}
              </p>
              <div className="max-h-96 overflow-y-auto space-y-2 border border-white/10 rounded p-3">
                {userPosts.posts.map((post, index) => (
                  <div
                    key={post.id || index}
                    className="flex gap-3 p-2 border border-white/5 rounded hover:bg-white/5"
                  >
                    {post.thumbnail && (
                      <img
                        src={post.thumbnail}
                        alt={post.title || "Video"}
                        className="w-24 h-24 object-cover rounded border border-white/10"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      {post.title && (
                        <p className="text-sm text-white/80 font-medium line-clamp-2">
                          {post.title}
                        </p>
                      )}
                      <p className="text-xs text-white/40 mt-1">
                        ID: {post.id || "N/A"}
                      </p>
                      {post.view_count && (
                        <p className="text-xs text-white/40">
                          👁 {post.view_count.toLocaleString()} views
                        </p>
                      )}
                      <div className="flex gap-2 mt-2">
                        <Button
                          onClick={() => {
                            const downloadUrl = `${
                              window.location.origin
                            }/download?url=${encodeURIComponent(post.url)}`;
                            window.open(downloadUrl, "_blank");
                          }}
                          className="h-7 px-3 text-xs font-medium bg-white text-black hover:bg-white/90"
                        >
                          Download
                        </Button>
                        <a
                          href={post.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-white/60 hover:text-white/80 underline flex items-center"
                        >
                          View on TikTok →
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
