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
    domain: { type: String, required: true, index: true },
    ownerUserId: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});
directorySchema.index({ domain: 1, parentId: 1, name: 1 });
exports.Directory = mongoose_1.default.model("Directory", directorySchema);
