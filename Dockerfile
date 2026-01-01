# Stage 1: Build Next.js frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
# Temporarily override distDir to build locally (Turbopack doesn't allow ../ paths)
RUN sed -i "s|distDir: '../dist-frontend'|distDir: 'out'|g" next.config.ts
RUN npm run build
# Copy build output to the expected location (/app/dist-frontend)
RUN mkdir -p /app/dist-frontend && cp -r out/* /app/dist-frontend/

# Stage 2: Build backend
FROM node:20-alpine AS backend-builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src/ ./src/
COPY tsconfig.json ./
RUN npm run build:backend

# Stage 3: Runtime (slim image with Node + Python + yt-dlp + ffmpeg)
FROM node:20-alpine

# Install Python, pip, ffmpeg, and other essentials
RUN apk add --no-cache python3 py3-pip ffmpeg

# Install yt-dlp and transcription dependencies via pip
# Using --break-system-packages is safe in a container environment
RUN pip3 install --no-cache-dir --break-system-packages yt-dlp && \
    pip3 install --no-cache-dir --break-system-packages faster-whisper

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built backend from builder
COPY --from=backend-builder /app/dist ./dist

# Copy built frontend from builder (frontend builds to ../dist-frontend relative to frontend dir)
COPY --from=frontend-builder /app/dist-frontend ./dist-frontend

# Copy transcription script
COPY scripts/transcribe.py ./scripts/transcribe.py
RUN chmod +x ./scripts/transcribe.py

# Expose port (Railway uses $PORT)
EXPOSE 3000

# Start command
CMD ["npm", "start"]

