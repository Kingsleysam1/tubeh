# Stage 1: Build the React frontend
FROM node:20 AS frontend-builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci || npm install --legacy-peer-deps
COPY . .
RUN npm run build

# Stage 2: Setup Python backend
FROM python:3.11-slim
WORKDIR /app

# Install ffmpeg, which is required by yt-dlp
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy backend requirements and install
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt
RUN pip install -U https://github.com/yt-dlp/yt-dlp/archive/master.tar.gz

# Copy backend source code
COPY backend/ ./backend/

# Copy built frontend from Stage 1
COPY --from=frontend-builder /app/dist /app/dist

# Expose port (Render requires services to bind to the PORT env variable)
ENV PORT=10000
ENV FLASK_ENV=production
EXPOSE 10000

# Start gunicorn
CMD ["sh", "-c", "cd backend && gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 300 --access-logfile - --error-logfile -"]
