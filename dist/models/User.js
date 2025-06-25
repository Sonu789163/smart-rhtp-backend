"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const userSchema = new mongoose_1.default.Schema({
    microsoftId: { type: String, unique: true, sparse: true },
    name: { type: String },
    email: { type: String, required: true, unique: true },
    password: { type: String }, // Optional: only for email/password users
    refreshTokens: { type: [{ type: String }], default: [] }, // To store active refresh tokens
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date, default: Date.now },
});
exports.User = mongoose_1.default.model("User", userSchema);
