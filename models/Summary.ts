import mongoose from "mongoose";

const summarySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now },
  documentId: { type: String, required: true },
  metadata: {
    pageCount: Number,
    url: String,
    pdfExpiry: String,
    duration: Number,
    name: String,
  },
});

export const Summary = mongoose.model("Summary", summarySchema);
