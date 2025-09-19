import mongoose from "mongoose";

const directorySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  parentId: { type: String, default: null },
  domain: { type: String, required: true, index: true }, // Domain isolation (company level)
  workspaceId: { type: String, required: true, index: true }, // Workspace isolation (team level)
  ownerUserId: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Index for workspace-based directory hierarchy
directorySchema.index({ workspaceId: 1, parentId: 1, name: 1 });

// Index for domain-level queries (admin access)
directorySchema.index({ domain: 1, parentId: 1, name: 1 });

// Index for finding directories within workspace
directorySchema.index({ workspaceId: 1, id: 1 });

export const Directory = mongoose.model("Directory", directorySchema);
