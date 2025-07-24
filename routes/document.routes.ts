import express from "express";
import { documentController } from "../controllers/documentController";
import { authMiddleware } from "../middleware/auth";
import multer from "multer";
import { Request, Response, NextFunction } from "express";
import { r2Client, R2_BUCKET } from "../config/r2";
import multerS3 from "multer-s3";

const router = express.Router();

// POST /upload-status/update (for n8n to notify upload status)
router.post("/upload-status/update", documentController.uploadStatusUpdate);

// Apply auth middleware to all routes
router.use(authMiddleware);

const upload = multer({
  storage: multerS3({
    s3: r2Client,
    bucket: R2_BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function (
      req: Request,
      file: Express.Multer.File,
      cb: (error: Error | null, key?: string) => void
    ) {
      // Use a unique key for each file, e.g., timestamp + original name
      const uniqueKey = `${Date.now()}-${file.originalname}`;
      cb(null, uniqueKey);
    },
    acl: "private", // or 'public-read' if you want public access
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
});

// Get all documents for current user
router.get("/", documentController.getAll);

// Check if document exists by namespace
router.get("/check-existing", documentController.checkExistingByNamespace);

// Get single document
router.get("/:id", documentController.getById);

// Create document
router.post("/", documentController.create);

// Upload PDF document
router.post(
  "/upload",
  upload.single("file"),
  // @ts-ignore
  function (err: any, req: Request, res: Response, next: NextFunction) {
    if (err && err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(413)
        .json({ error: "File too large. Maximum size is 25MB." });
    }
    next(err);
  },
  documentController.uploadDocument
);

// Upload RHP document
router.post(
  "/upload-rhp",
  upload.single("file"), // @ts-ignore
  documentController.uploadRhp
);

// Download/view PDF document
router.get("/download/:id", documentController.downloadDocument);

// Update document
router.put("/:id", documentController.update);

// Delete document
router.delete("/:id", documentController.delete);

export default router;
