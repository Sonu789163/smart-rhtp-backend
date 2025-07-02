import { GridFsStorage } from "multer-gridfs-storage";
import dotenv from "dotenv";
dotenv.config();

const mongoURI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/pdf-summarizer";

export const storage = new GridFsStorage({
  url: mongoURI,
  file: (req, file) => {
    return {
      filename: file.originalname,
      bucketName: "uploads", // collection name in MongoDB
    };
  },
});
