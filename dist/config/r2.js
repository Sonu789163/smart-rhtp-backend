"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.R2_BUCKET = exports.r2Client = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const CLOUDFLARE_URI = process.env.CLOUDFLARE_URI;
if (!R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_BUCKET_NAME ||
    !CLOUDFLARE_URI) {
    throw new Error("Missing Cloudflare R2 environment variables");
}
exports.r2Client = new client_s3_1.S3Client({
    region: "auto", // Cloudflare R2 uses 'auto' region
    endpoint: CLOUDFLARE_URI,
    credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true, // Required for R2 compatibility
});
exports.R2_BUCKET = R2_BUCKET_NAME;
