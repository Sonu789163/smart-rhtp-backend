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
    directoryId: { type: String, default: null },
    namespace: { type: String, required: true }, // for DRHP namespace
    rhpNamespace: { type: String }, // for RHP namespace (different from DRHP)
    status: { type: String, default: "completed" },
    fileKey: { type: String, required: true },
    type: { type: String, enum: ["DRHP", "RHP"], required: true }, // distinguish between DRHP and RHP
    relatedDrhpId: { type: String }, // for RHP to link to DRHP (using string IDs)
    relatedRhpId: { type: String }, // for DRHP to link to RHP (using string IDs)
    domain: { type: String, required: true, index: true }, // Domain isolation (company level)
    workspaceId: { type: String, required: true, index: true }, // Workspace isolation (team level)
    microsoftId: { type: String }, // Optional: for tracking who created it
    userId: { type: String }, // Optional: for tracking who created it
});
// Prevent duplicates by namespace within the same workspace (case-insensitive)
documentSchema.index({ workspaceId: 1, namespace: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });
// Index for common time-bucket queries within workspace
documentSchema.index({ workspaceId: 1, uploadedAt: -1 });
// Index to quickly list documents inside a directory within workspace
documentSchema.index({ workspaceId: 1, directoryId: 1, name: 1 });
// Index for domain-level queries (admin access)
documentSchema.index({ domain: 1, uploadedAt: -1 });
exports.Document = mongoose_1.default.model("Document", documentSchema);
