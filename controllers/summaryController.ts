import { Request, Response } from "express";
import { Summary } from "../models/Summary";

interface AuthRequest extends Request {
  user?: any;
}

export const summaryController = {
  async getByDocumentId(req: AuthRequest, res: Response) {
    try {
      const { documentId } = req.params;
      const query: any = { documentId };
      if (req.user.microsoftId) query.microsoftId = req.user.microsoftId;
      else if (req.user._id) query.userId = req.user._id;
      const summaries = await Summary.find(query).sort({ updatedAt: -1 });
      res.json(summaries);
    } catch (error) {
      console.error("Error fetching summaries:", error);
      res.status(500).json({ message: "Error fetching summaries" });
    }
  },

  async create(req: AuthRequest, res: Response) {
    try {
      const { title, content, documentId, metadata } = req.body;
      if (!title || !content || !documentId) {
        return res.status(400).json({
          message: "Missing required fields",
          required: { title, content, documentId },
        });
      }
      const user = req.user;
      const summaryData: any = {
        id: Date.now().toString(),
        title,
        content,
        documentId,
        updatedAt: new Date(),
        metadata,
      };
      if (user.microsoftId) {
        summaryData.microsoftId = user.microsoftId;
      } else if (user._id) {
        summaryData.userId = user._id;
      } else {
        return res.status(400).json({ message: "No user identifier found" });
      }
      const summary = new Summary(summaryData);
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

  async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const query: any = { id };
      if (req.user.microsoftId) query.microsoftId = req.user.microsoftId;
      else if (req.user._id) query.userId = req.user._id;
      const summary = await Summary.findOneAndUpdate(query, req.body, {
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

  async delete(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const query: any = { id };
      if (req.user.microsoftId) query.microsoftId = req.user.microsoftId;
      else if (req.user._id) query.userId = req.user._id;
      const summary = await Summary.findOneAndDelete(query);
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
