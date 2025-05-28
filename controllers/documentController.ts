import { Request, Response } from "express";
import { Document } from "../models/Document";

export const documentController = {
  async getAll(req: Request, res: Response) {
    try {
      const documents = await Document.find().sort({ uploadedAt: -1 });
      res.json(documents);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  },

  async getById(req: Request, res: Response) {
    try {
      const document = await Document.findOne({ id: req.params.id });
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(document);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch document" });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const document = new Document(req.body);
      await document.save();
      res.status(201).json(document);
    } catch (error) {
      res.status(500).json({ error: "Failed to create document" });
    }
  },

  async update(req: Request, res: Response) {
    try {
      const document = await Document.findOneAndUpdate(
        { id: req.params.id },
        req.body,
        { new: true }
      );
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(document);
    } catch (error) {
      res.status(500).json({ error: "Failed to update document" });
    }
  },

  async delete(req: Request, res: Response) {
    try {
      const document = await Document.findOneAndDelete({ id: req.params.id });
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json({ message: "Document deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete document" });
    }
  },
};
