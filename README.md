# FFmpeg Render Worker — Local Starter

This is a simple render worker you can run locally for n8n.

## Requirements
- Node.js 18+ installed
- FFmpeg installed (brew install ffmpeg on Mac, apt install ffmpeg on Ubuntu, or download from ffmpeg.org on Windows)

## Setup
```bash
cd ffmpeg-worker-starter
npm install
node server.js
```
Now open: http://localhost:8080/health

## Test render
```bash
curl -X POST http://localhost:8080/render   -H "Content-Type: application/json"   -d '{"input_url":"https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4","in_s":0,"out_s":5}'
```

It will return a JSON with a URL like:
```json
{ "url": "http://localhost:8080/outputs/clip_xxx.mp4", "id": "...", "duration": 5 }
```

## Use in n8n
- Node: HTTP Request (Render Clip)
- Method: POST
- URL: http://localhost:8080/render
- Send Body: ON, JSON
- Body:
```json
={
  "input_url": $json.video_url,
  "in_s": $json.in_s,
  "out_s": $json.out_s
}
```
- Response Format: JSON
