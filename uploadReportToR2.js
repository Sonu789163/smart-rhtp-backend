const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
require("dotenv").config();

const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const CLOUDFLARE_URI = process.env.CLOUDFLARE_URI;
const MONGODB_URI = process.env.MONGODB_URI;

const s3 = new S3Client({
  region: "auto",
  endpoint: CLOUDFLARE_URI,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

async function main() {
  // --- INPUTS: Set these for your use case ---
  const reportMongoId = "688227f478357fa9a3e02237"; // e.g. "68821a0ad9222857d3cbf3c8"
  const localFilePath = path.resolve("reports", "C:/Users/91789/Downloads/report-Neetu_Yoshi_DRHP.pdf"); // Path to your local PDF
  const fileName = "report-Neetu_Yoshi_DRHP.pdf"; // e.g. "Report-Example.pdf"
  // ------------------------------------------

  await mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  const Report = require("./models/Report").Report;

  try {
    // Read local file
    const fileStats = fs.statSync(localFilePath);
    const fileStream = fs.createReadStream(localFilePath);
    const contentLength = fileStats.size;

    // Upload to R2
    const s3Key = `reports/${Date.now()}-${fileName}`;
    await s3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: s3Key,
        Body: fileStream,
        ContentType: "application/pdf",
        ContentLength: contentLength,
      })
    );

    // Update MongoDB
    const report = await Report.findById(reportMongoId);
    if (report) {
      report.pdfFileKey = s3Key;
      await report.save();
      console.log(`Uploaded and updated report: ${fileName}`);
    } else {
      console.warn(`MongoDB report not found for ID: ${reportMongoId}`);
    }
  } catch (err) {
    console.error(`Failed to upload report:`, err);
  }
  process.exit(0);
}

main();
