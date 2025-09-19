import mongoose from "mongoose";

const directorySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  parentId: { type: String, default: null },
  domain: { type: String, required: true, index: true },
  ownerUserId: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

directorySchema.index({ domain: 1, parentId: 1, name: 1 });

export const Directory = mongoose.model("Directory", directorySchema);




