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
    namespace: { type: String, required: true }, // for DRHP namespace
    rhpNamespace: { type: String }, // for RHP namespace (different from DRHP)
    status: { type: String, default: "completed" },
    fileKey: { type: String, required: true },
    type: { type: String, enum: ["DRHP", "RHP"], required: true }, // distinguish between DRHP and RHP
    relatedDrhpId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: "Document" }, // for RHP to link to DRHP
    relatedRhpId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: "Document" }, // for DRHP to link to RHP
});
exports.Document = mongoose_1.default.model("Document", documentSchema);
