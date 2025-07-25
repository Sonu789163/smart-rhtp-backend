import mongoose from "mongoose";

const summarySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now },
  documentId: { type: String, required: true },
});

export const Summary = mongoose.model("Summary", summarySchema);
