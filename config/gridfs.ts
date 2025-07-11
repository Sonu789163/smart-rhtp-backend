import { GridFsStorage } from "multer-gridfs-storage";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { GridFSBucket } from "mongodb";
dotenv.config();

const mongoURI =
  process.env.MONGODB_URI ||
  "mongodb+srv://Sonu7891:Sonu1234@cluster0.qfv4x.mongodb.net/pdf-summarizer";

export const storage = new GridFsStorage({
  url: mongoURI,
  file: (req, file) => {
    return {
      filename: file.originalname,
      bucketName: "uploads", // collection name in MongoDB
    };
  },
});

export function getGridFSBucket() {
  return new GridFSBucket(mongoose.connection.db, { bucketName: "uploads" });
}
