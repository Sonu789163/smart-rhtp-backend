import mongoose from "mongoose";

const reportSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now },
  drhpId: { type: String, required: true },
  rhpId: { type: String, required: true },
  drhpNamespace: { type: String, required: true },
  rhpNamespace: { type: String, required: true },
  microsoftId: { type: String },
  userId: { type: String },
});

reportSchema.pre("validate", function (next) {
  if (!this.microsoftId && !this.userId) {
    next(new Error("Either microsoftId or userId must be present."));
  } else {
    next();
  }
});

export const Report = mongoose.model("Report", reportSchema);
