import mongoose from "mongoose";

const documentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
  namespace: { type: String, required: true }, // for DRHP namespace
  rhpNamespace: { type: String }, // for RHP namespace (different from DRHP)
  status: { type: String, default: "completed" },
  microsoftId: { type: String },
  userId: { type: String },
  fileId: { type: mongoose.Schema.Types.ObjectId, required: true },
  type: { type: String, enum: ["DRHP", "RHP"], required: true }, // distinguish between DRHP and RHP
  relatedDrhpId: { type: mongoose.Schema.Types.ObjectId, ref: "Document" }, // for RHP to link to DRHP
  relatedRhpId: { type: mongoose.Schema.Types.ObjectId, ref: "Document" }, // for DRHP to link to RHP
});

documentSchema.pre("validate", function (next) {
  if (!this.microsoftId && !this.userId) {
    next(new Error("Either microsoftId or userId must be present."));
  } else {
    next();
  }
});

export const Document = mongoose.model("Document", documentSchema);
