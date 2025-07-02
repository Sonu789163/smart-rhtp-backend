const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { GridFSBucket } = require("mongodb");

// Inline Document model definition
const documentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
  namespace: { type: String },
  status: { type: String, default: "completed" },
  microsoftId: { type: String },
  userId: { type: String },
  fileId: { type: mongoose.Schema.Types.ObjectId },
});
const Document = mongoose.model("Document", documentSchema, "documents");

const MONGODB_URI =
  "mongodb+srv://Sonu7891:Sonu1234@cluster0.qfv4x.mongodb.net/pdf-summarizer";

async function updateDocumentWithPDF(documentId, pdfPath, bucket) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(pdfPath)) {
      return reject(new Error(`File not found: ${pdfPath}`));
    }
    const readStream = fs.createReadStream(pdfPath);
    const uploadStream = bucket.openUploadStream(path.basename(pdfPath), {
      contentType: "application/pdf",
    });

    readStream
      .pipe(uploadStream)
      .on("error", (err) => {
        reject(err);
      })
      .on("finish", async function () {
        await Document.updateOne(
          { id: documentId },
          { $set: { fileId: uploadStream.id } }
        );
        resolve(uploadStream.id);
      });
  });
}

async function processCSV(csvPath) {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  const bucket = new GridFSBucket(db, { bucketName: "uploads" });

  const rl = readline.createInterface({
    input: fs.createReadStream(csvPath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [documentId, pdfPath] = line.split(",");
    if (!documentId || !pdfPath) {
      console.error(`Invalid line: ${line}`);
      continue;
    }
    try {
      const fileId = await updateDocumentWithPDF(
        documentId.trim(),
        pdfPath.trim(),
        bucket
      );
      console.log(
        `Updated document ${documentId.trim()} with fileId ${fileId}`
      );
    } catch (err) {
      console.error(`Failed for ${documentId.trim()}: ${err.message}`);
    }
  }

  mongoose.disconnect();
}

// Usage: node bulkUpdateDocumentsWithPDF.js docs_to_update.csv
const [, , csvPath] = process.argv;
if (!csvPath) {
  console.error(
    "Usage: node bulkUpdateDocumentsWithPDF.js <docs_to_update.csv>"
  );
  process.exit(1);
}

processCSV(csvPath);
