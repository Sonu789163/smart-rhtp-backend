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
    microsoftId: { type: String },
    userId: { type: String },
    fileId: { type: mongoose_1.default.Schema.Types.ObjectId, required: true },
});
documentSchema.pre("validate", function (next) {
    if (!this.microsoftId && !this.userId) {
        next(new Error("Either microsoftId or userId must be present."));
    }
    else {
        next();
    }
});
exports.Document = mongoose_1.default.model("Document", documentSchema);
