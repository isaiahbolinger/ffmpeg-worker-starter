// FFmpeg Render Worker (Local starter)
const express = require("express");
const cors = require("cors");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// serve finished clips
const OUT_DIR = path.join(__dirname, "outputs");
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
app.use("/outputs", express.static(OUT_DIR));

app.get("/health", (req, res) => res.json({ ok: true }));

// POST /render  { input_url, in_s, out_s }
app.post("/render", (req, res) => {
  try {
    const { input_url, in_s, out_s } = req.body || {};
    if (!input_url) return res.status(400).json({ error: "Missing input_url" });
    if (typeof in_s !== "number" || typeof out_s !== "number") {
      return res.status(400).json({ error: "in_s and out_s must be numbers (seconds)" });
    }
    if (out_s <= in_s) {
      return res.status(400).json({ error: "out_s must be greater than in_s" });
    }
    if (out_s - in_s > 90) {
      return res.status(400).json({ error: "clip too long (max 90s)" });
    }

    const id = Date.now().toString(36);
    const outfile = path.join(OUT_DIR, `clip_${id}.mp4`);

    const vf = "scale=1080:-1:force_original_aspect_ratio=decrease,pad=1080:1920:(1080-iw)/2:(1920-ih)/2";

    const args = [
      "-ss", String(in_s),
      "-to", String(out_s),
      "-i", input_url,
      "-vf", vf,
      "-r", "30",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
      "-c:a", "aac", "-b:a", "128k",
      outfile
    ];

    execFile("ffmpeg", args, (err) => {
      if (err) {
        console.error("FFmpeg error:", err);
        return res.status(500).json({ error: "ffmpeg failed", detail: String(err.message || err) });
      }
      const url = `${req.protocol}://${req.get("host")}/outputs/${path.basename(outfile)}`;
      res.json({ url, id, duration: out_s - in_s });
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`FFmpeg worker running at http://localhost:${PORT}`);
});
