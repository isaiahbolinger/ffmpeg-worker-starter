// FFmpeg Render Worker -> Upload to S3 and return a signed URL
const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto"); // needed for /upload-init

// AWS SDK v3
const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// ---- config from env ----
const REGION = process.env.AWS_REGION || "us-east-2";
const BUCKET = process.env.S3_BUCKET; // e.g. "my-clip-storage"
// (AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY come from Render env)

if (!BUCKET) {
  console.error("Missing S3_BUCKET env var");
}

const s3 = new S3Client({ region: REGION });

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

/**
 * POST /upload-init
 * body: { filename: string, contentType: string }
 * returns: { put_url, file_url, key }
 */
app.post("/upload-init", async (req, res) => {
  try {
    const { filename = `upload_${Date.now()}.mp4`, contentType = "video/mp4" } = req.body || {};
    const key = `uploads/${crypto.randomBytes(8).toString("hex")}_${filename}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
    });

    const put_url = await getSignedUrl(s3, command, { expiresIn: 60 * 10 }); // 10 min
    const file_url = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;

    res.json({ put_url, file_url, key });
  } catch (e) {
    res.status(500).json({ error: "upload-init failed", detail: String(e?.message || e) });
  }
});

/**
 * POST /render
 * body: { input_url: string, in_s: number, out_s: number }
 */
app.post("/render", async (req, res) => {
  try {
    const { input_url, in_s, out_s } = req.body || {};
    if (!input_url) return res.status(400).json({ error: "Missing input_url" });
    if (typeof in_s !== "number" || typeof out_s !== "number") {
      return res.status(400).json({ error: "in_s and out_s must be numbers (seconds)" });
    }
    if (out_s <= in_s) return res.status(400).json({ error: "out_s must be greater than in_s" });
    if (out_s - in_s > 90) return res.status(400).json({ error: "clip too long (max 90s)" });

    const id = Date.now().toString(36);
    const tmpOut = path.join(os.tmpdir(), `clip_${id}.mp4`);

    // 1080x1920 vertical canvas (letterbox/pillarbox as needed)
    const vf = "scale=1080:-1:force_original_aspect_ratio=decrease,pad=1080:1920:(1080-iw)/2:(1920-ih)/2";

    const args = [
      "-ss", String(in_s),
      "-to", String(out_s),
      "-i", input_url,
      "-vf", vf,
      "-r", "30",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
      "-c:a", "aac", "-b:a", "128k",
      tmpOut
    ];

    // Run ffmpeg
    const ff = spawn("ffmpeg", args);
    let stderr = "";
    ff.stderr.on("data", (d) => (stderr += d.toString()));
    ff.on("error", (e) => console.error("ffmpeg spawn error:", e));

    ff.on("close", async (code) => {
      if (code !== 0) {
        console.error("ffmpeg failed:", stderr);
        return res.status(500).json({ error: "ffmpeg failed", detail: stderr.slice(-1200) });
      }

      // Upload to S3 (private), then return a signed URL
      const key = `clips/clip_${id}.mp4`;
      try {
        const uploader = new Upload({
          client: s3,
          params: {
            Bucket: BUCKET,
            Key: key,
            Body: fs.createReadStream(tmpOut),
            ContentType: "video/mp4",
          },
        });
        await uploader.done();

        fs.unlink(tmpOut, () => {}); // clean up temp file

        const signedUrl = await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: BUCKET, Key: key }),
          { expiresIn: 60 * 60 * 24 }
        );

        return res.json({
          url: signedUrl,
          s3_key: key,
          id,
          duration: out_s - in_s,
        });
      } catch (e) {
        console.error("S3 upload error:", e);
        return res.status(500).json({ error: "s3 upload failed", detail: String(e?.message || e) });
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`FFmpeg worker (S3) running on port ${PORT}`);
});


