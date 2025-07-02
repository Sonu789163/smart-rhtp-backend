import mongoose from "mongoose";

const documentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
  namespace: { type: String },
  status: { type: String, default: "completed" },
  microsoftId: { type: String },
  userId: { type: String },
  fileId: { type: mongoose.Schema.Types.ObjectId, required: true },
});

documentSchema.pre("validate", function (next) {
  if (!this.microsoftId && !this.userId) {
    next(new Error("Either microsoftId or userId must be present."));
  } else {
    next();
  }
});

export const Document = mongoose.model("Document", documentSchema);
