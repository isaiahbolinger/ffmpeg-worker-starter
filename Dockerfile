# ---- Minimal Node + FFmpeg image ----
FROM node:18-slim

# Install ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# App directory
WORKDIR /app

# Install deps first (better layer caching)
COPY package*.json ./
RUN npm ci || npm i --production

# Copy the rest of the app
COPY . .

ENV NODE_ENV=production
# Render sets PORT at runtime; default to 8080 locally
ENV PORT=8080

EXPOSE 8080

# Start the server
CMD ["node", "server.js"]
