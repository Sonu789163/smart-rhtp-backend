const fs = require("fs");
const mongoose = require("mongoose");
const { GridFSBucket, ObjectId } = require("mongodb");
const path = require("path");

// --- CONFIGURE THESE ---
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://Sonu7891:Sonu1234@cluster0.qfv4x.mongodb.net/pdf-summarizer";

// List of documents to update: [{ id: 'documentId', file: '/path/to/file.pdf' }]
const updates = [
  {
    _id: {
      $oid: "685be4599c1d07125daa62c3",
    },
    id: "session_302f83c9-391f-441b-a9f0-6c0320bc299a",
    name: "CURRENT-INFRAPROJECTS-LIMITED",
    file: "C:/Users/91789/Downloads/Documents/Registration_31032025193330_DRHP.pdf",
  },
  
  {
    _id: {
      $oid: "685be58c9c1d07125daa62c6",
    },
    id: "session_302f83c9-391f-441b-a9f0-6c0337bc249a",
    name: "INFINITY-INFOWAY-LIMITED",
    file: "C:/Users/91789/Downloads/Documents/INFINITY INFOWAY LIMITED-DRHP.pdf",
  }
];

const Document = require("./dist/models/Document").Document;

if (!Document) {
  console.error(
    'Could not load Document model. Make sure you have run "npm run build" in the smart-rhtp-backend directory.'
  );
  process.exit(1);
}

async function replaceDocumentFile(documentId, filePath, bucket) {
  // 1. Find the document
  const doc = await Document.findOne({ id: documentId });
  if (!doc) {
    console.error(`Document not found: ${documentId}`);
    return;
  }
  const oldFileId = doc.fileId;

  // 2. Upload new file to GridFS
  const filename = path.basename(filePath);
  const uploadStream = bucket.openUploadStream(filename, {
    contentType: "application/pdf",
  });
  fs.createReadStream(filePath).pipe(uploadStream);
  const newFileId = await new Promise((resolve, reject) => {
    uploadStream.on("finish", () => resolve(uploadStream.id));
    uploadStream.on("error", reject);
  });

  // 3. Update the document's fileId
  doc.fileId = newFileId;
  await doc.save();

  // 4. Optionally, delete the old file from GridFS
  if (oldFileId && oldFileId.toString() !== newFileId.toString()) {
    try {
      await bucket.delete(new ObjectId(oldFileId));
      console.log(`Old file deleted for document ${documentId}`);
    } catch (err) {
      console.warn(
        `Could not delete old file for document ${documentId}:`,
        err.message
      );
    }
  }

  console.log(`Updated document ${documentId} with new fileId: ${newFileId}`);
}

(async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: "uploads",
    });

    for (const { id, file } of updates) {
      try {
        await replaceDocumentFile(id, file, bucket);
      } catch (err) {
        console.error(`Failed to update document ${id}:`, err);
      }
    }
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
})();
