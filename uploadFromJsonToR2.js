const fs = require("fs");
const mongoose = require("mongoose");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
require("dotenv").config();

const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const CLOUDFLARE_URI = process.env.CLOUDFLARE_URI;
const MONGODB_URI = process.env.MONGODB_URI;

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.CLOUDFLARE_URI,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

async function main() {
  // Load your manifest
  const manifest = JSON.parse(fs.readFileSync("files-to-upload.json", "utf-8"));

  // Connect to MongoDB
  await mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  const Document = require("./models/Document").Document;

  for (const entry of manifest) {
    if (!fs.existsSync(entry.localPath)) {
      console.error(`File not found: ${entry.localPath}`);
      continue;
    }
    const fileStream = fs.createReadStream(entry.localPath);
    const s3Key = `documents/${Date.now()}-${entry.name}`;

    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: s3Key,
          Body: fileStream,
          ContentType: "application/pdf",
        })
      );
      // Update MongoDB
      const doc = await Document.findById(entry.mongoId);
      if (doc) {
        doc.fileKey = s3Key;
        await doc.save();
        console.log(`Uploaded and updated: ${entry.name}`);
      } else {
        console.warn(`MongoDB document not found for ID: ${entry.mongoId}`);
      }
    } catch (err) {
      console.error(`Failed to upload ${entry.name}:`, err);
    }
  }
  process.exit(0);
}

main();
