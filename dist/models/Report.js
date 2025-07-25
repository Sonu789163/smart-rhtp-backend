"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Report = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const reportSchema = new mongoose_1.default.Schema({
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now },
    drhpId: { type: String, required: true },
    rhpId: { type: String, required: true },
    drhpNamespace: { type: String, required: true },
    rhpNamespace: { type: String, required: true },
});
exports.Report = mongoose_1.default.model("Report", reportSchema);
