import mongoose from "mongoose";

const activityLogSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    actorUserId: { type: String },
    domain: { type: String, required: true, index: true },
    action: { type: String, required: true },
    resourceType: { type: String, required: true },
    resourceId: { type: String, required: true },
    title: { type: String },
    metadata: { type: Object, default: {} },
    requestId: { type: String },
  },
  { timestamps: true }
);

activityLogSchema.index({ domain: 1, createdAt: -1 });

export const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);








