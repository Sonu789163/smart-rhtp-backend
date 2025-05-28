import express from "express";
import { documentController } from "../controllers/documentController";

const router = express.Router();

// Get all documents
router.get("/", documentController.getAll);

// Get single document
router.get("/:id", documentController.getById);

// Create document
router.post("/", documentController.create);

// Update document
router.put("/:id", documentController.update);

// Delete document
router.delete("/:id", documentController.delete);

export default router;
