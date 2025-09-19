import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    domain: { type: String, required: true, index: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String },
    resourceType: { type: String },
    resourceId: { type: String },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

export const Notification = mongoose.model("Notification", notificationSchema);








