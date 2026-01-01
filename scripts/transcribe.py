#!/usr/bin/env python3
"""
Audio transcription script using faster-whisper
Takes video file path, extracts audio, and returns transcript
"""
import sys
import os
import subprocess
import tempfile
from faster_whisper import WhisperModel

def transcribe_video(video_path: str, model_size: str = "base") -> dict:
    """
    Extract audio from video and transcribe it
    
    Args:
        video_path: Path to video file
        model_size: Whisper model size (tiny, base, small, medium, large)
    
    Returns:
        dict with transcript and metadata
    """
    # Create temp file for audio
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as audio_file:
        audio_path = audio_file.name
    
    try:
        # Extract audio using ffmpeg
        ffmpeg_cmd = [
            'ffmpeg',
            '-i', video_path,
            '-vn',  # No video
            '-acodec', 'pcm_s16le',  # PCM 16-bit
            '-ar', '16000',  # 16kHz sample rate (Whisper's preferred)
            '-ac', '1',  # Mono
            '-y',  # Overwrite output
            audio_path
        ]
        
        subprocess.run(ffmpeg_cmd, check=True, capture_output=True)
        
        # Load Whisper model
        model = WhisperModel(model_size, device="cpu", compute_type="int8")
        
        # Transcribe
        segments, info = model.transcribe(audio_path, beam_size=5)
        
        # Collect transcript segments
        transcript_parts = []
        for segment in segments:
            transcript_parts.append(segment.text.strip())
        
        full_transcript = " ".join(transcript_parts)
        
        return {
            "transcript": full_transcript,
            "language": info.language,
            "language_probability": info.language_probability,
            "duration": info.duration
        }
    
    finally:
        # Clean up temp audio file
        if os.path.exists(audio_path):
            os.unlink(audio_path)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print('{"error": "Usage: transcribe.py <video_path> [model_size]"}', file=sys.stderr)
        sys.exit(1)
    
    video_path = sys.argv[1]
    model_size = sys.argv[2] if len(sys.argv) > 2 else "base"
    
    try:
        result = transcribe_video(video_path, model_size)
        import json
        print(json.dumps(result))
    except Exception as e:
        print(f'{{"error": "{str(e)}"}}', file=sys.stderr)
        sys.exit(1)

