import mongoose from "mongoose";

const summarySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now },
  documentId: { type: String, required: true },
  microsoftId: { type: String },
  userId: { type: String },
  metadata: {
    pageCount: Number,
    url: String,
    pdfExpiry: String,
    duration: Number,
    name: String,
  },
});

summarySchema.pre("validate", function (next) {
  if (!this.microsoftId && !this.userId) {
    next(new Error("Either microsoftId or userId must be present."));
  } else {
    next();
  }
});

export const Summary = mongoose.model("Summary", summarySchema);
