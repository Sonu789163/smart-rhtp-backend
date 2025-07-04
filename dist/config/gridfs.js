"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storage = void 0;
exports.getGridFSBucket = getGridFSBucket;
const multer_gridfs_storage_1 = require("multer-gridfs-storage");
const dotenv_1 = __importDefault(require("dotenv"));
const mongoose_1 = __importDefault(require("mongoose"));
const mongodb_1 = require("mongodb");
dotenv_1.default.config();
const mongoURI = process.env.MONGODB_URI ||
    "mongodb+srv://Sonu7891:Sonu1234@cluster0.qfv4x.mongodb.net/pdf-summarizer";
exports.storage = new multer_gridfs_storage_1.GridFsStorage({
    url: mongoURI,
    file: (req, file) => {
        return {
            filename: file.originalname,
            bucketName: "uploads", // collection name in MongoDB
        };
    },
});
function getGridFSBucket() {
    return new mongodb_1.GridFSBucket(mongoose_1.default.connection.db, { bucketName: "uploads" });
}
