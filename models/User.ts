import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  microsoftId: { type: String, unique: true, sparse: true },
  name: { type: String },
  email: { type: String, required: true, unique: true },
  domain: { type: String, required: true, index: true },
  password: { type: String }, // Optional: only for email/password users
  role: { type: String, enum: ["admin", "user"], default: "user", index: true },
  status: {
    type: String,
    enum: ["active", "suspended"],
    default: "active",
    index: true,
  },
  // New profile fields
  phoneNumber: { type: String },
  gender: {
    type: String,
    enum: ["male", "female", "other", "prefer-not-to-say"],
    default: "prefer-not-to-say",
  },
  refreshTokens: { type: [{ type: String }], default: [] }, // To store active refresh tokens
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date, default: Date.now },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
});

export const User = mongoose.model("User", userSchema);
