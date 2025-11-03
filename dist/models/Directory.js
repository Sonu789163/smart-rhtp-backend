"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Directory = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const directorySchema = new mongoose_1.default.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    parentId: { type: String, default: null },
    domain: { type: String, required: true, index: true }, // Domain isolation (company level) - backward compatibility
    domainId: { type: String, required: true, index: true }, // Link to Domain schema
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
exports.Directory = mongoose_1.default.model("Directory", directorySchema);
