"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Document = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const documentSchema = new mongoose_1.default.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
    namespace: { type: String },
    status: { type: String, default: "completed" },
});
exports.Document = mongoose_1.default.model("Document", documentSchema);
