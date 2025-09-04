import mongoose from "mongoose";

const summarySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now },
  documentId: { type: String, required: true },
  domain: { type: String, required: true, index: true }, // Domain/workspace isolation
  microsoftId: { type: String },
  userId: { type: String },
});

export const Summary = mongoose.model("Summary", summarySchema);
