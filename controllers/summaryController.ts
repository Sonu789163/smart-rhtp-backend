import { Request, Response } from "express";
import { Summary } from "../models/Summary";

export const summaryController = {
  async getByDocumentId(req: Request, res: Response) {
    try {
      const { documentId } = req.params;
      const summaries = await Summary.find({ documentId }).sort({
        updatedAt: -1,
      });
      res.json(summaries);
    } catch (error) {
      console.error("Error fetching summaries:", error);
      res.status(500).json({ message: "Error fetching summaries" });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const { title, content, documentId, metadata } = req.body;

      if (!title || !content || !documentId) {
        return res.status(400).json({
          message: "Missing required fields",
          required: { title, content, documentId },
        });
      }

      const summary = new Summary({
        id: Date.now().toString(),
        title,
        content,
        documentId,
        updatedAt: new Date(),
        metadata,
      });

      await summary.save();
      res.status(201).json(summary);
    } catch (error) {
      console.error("Error creating summary:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      res.status(500).json({
        message: "Error creating summary",
        error: errorMessage,
      });
    }
  },

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const summary = await Summary.findOneAndUpdate({ id }, req.body, {
        new: true,
      });
      if (!summary) {
        return res.status(404).json({ message: "Summary not found" });
      }
      res.json(summary);
    } catch (error) {
      console.error("Error updating summary:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      res.status(500).json({
        message: "Error updating summary",
        error: errorMessage,
      });
    }
  },

  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const summary = await Summary.findOneAndDelete({ id });
      if (!summary) {
        return res.status(404).json({ message: "Summary not found" });
      }
      res.json({ message: "Summary deleted successfully" });
    } catch (error) {
      console.error("Error deleting summary:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      res.status(500).json({
        message: "Error deleting summary",
        error: errorMessage,
      });
    }
  },
};
