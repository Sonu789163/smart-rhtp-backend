import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  microsoftId: { type: String, unique: true, sparse: true },
  name: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String }, // Optional: only for email/password users
  refreshTokens: { type: [{ type: String }], default: [] }, // To store active refresh tokens
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date, default: Date.now },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
});

export const User = mongoose.model("User", userSchema);
