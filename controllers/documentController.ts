import { Request, Response } from "express";
import { Document } from "../models/Document";

interface AuthRequest extends Request {
  user?: any;
}

export const documentController = {
  async getAll(req: AuthRequest, res: Response) {
    try {
      const query: any = {};
      if (req.user.microsoftId) query.microsoftId = req.user.microsoftId;
      else if (req.user._id) query.userId = req.user._id;
      const documents = await Document.find(query).sort({ uploadedAt: -1 });
      res.json(documents);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  },

  async getById(req: AuthRequest, res: Response) {
    try {
      const query: any = { id: req.params.id };
      if (req.user.microsoftId) query.microsoftId = req.user.microsoftId;
      else if (req.user._id) query.userId = req.user._id;
      const document = await Document.findOne(query);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(document);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch document" });
    }
  },

  async create(req: AuthRequest, res: Response) {
    try {
      const user = req.user;
      const docData = { ...req.body };
      if (user.microsoftId) {
        docData.microsoftId = user.microsoftId;
      } else if (user._id) {
        docData.userId = user._id;
      } else {
        return res.status(400).json({ error: "No user identifier found" });
      }
      const document = new Document(docData);
      await document.save();
      res.status(201).json(document);
    } catch (error) {
      console.error("Error creating document:", error);
      res.status(500).json({ error: "Failed to create document" });
    }
  },

  async update(req: AuthRequest, res: Response) {
    try {
      const query: any = { id: req.params.id };
      if (req.user.microsoftId) query.microsoftId = req.user.microsoftId;
      else if (req.user._id) query.userId = req.user._id;
      const document = await Document.findOneAndUpdate(query, req.body, {
        new: true,
      });
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(document);
    } catch (error) {
      res.status(500).json({ error: "Failed to update document" });
    }
  },

  async delete(req: AuthRequest, res: Response) {
    try {
      const query: any = { id: req.params.id };
      if (req.user.microsoftId) query.microsoftId = req.user.microsoftId;
      else if (req.user._id) query.userId = req.user._id;
      const document = await Document.findOneAndDelete(query);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json({ message: "Document deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete document" });
    }
  },
};
