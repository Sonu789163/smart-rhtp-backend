import mongoose from "mongoose";

const documentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
  namespace: { type: String },
  status: { type: String, default: "completed" },
});

export const Document = mongoose.model("Document", documentSchema);
