import mongoose from "mongoose";

const documentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
  namespace: { type: String, required: true }, // for DRHP namespace
  rhpNamespace: { type: String }, // for RHP namespace (different from DRHP)
  status: { type: String, default: "completed" },
  fileKey: { type: String, required: true },
  type: { type: String, enum: ["DRHP", "RHP"], required: true }, // distinguish between DRHP and RHP
  relatedDrhpId: { type: String }, // for RHP to link to DRHP (using string IDs)
  relatedRhpId: { type: String }, // for DRHP to link to RHP (using string IDs)
});

export const Document = mongoose.model("Document", documentSchema);
