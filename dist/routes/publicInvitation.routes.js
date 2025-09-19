"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const WorkspaceInvitation_1 = require("../models/WorkspaceInvitation");
const router = express_1.default.Router();
// Get invitation details by invitation ID (public route)
router.get("/:invitationId", async (req, res) => {
    try {
        const { invitationId } = req.params;
        const invitation = await WorkspaceInvitation_1.WorkspaceInvitation.findOne({
            invitationId,
            status: "pending",
        }).populate("inviterId", "name email");
        if (!invitation) {
            return res.status(404).json({
                message: "Invitation not found or already processed",
            });
        }
        if (new Date() > invitation.expiresAt) {
            invitation.status = "expired";
            await invitation.save();
            return res.status(400).json({
                message: "Invitation has expired",
            });
        }
        res.json({
            invitation: {
                id: invitation._id,
                invitationId: invitation.invitationId,
                inviterName: invitation.inviterName,
                inviterEmail: invitation.inviterEmail,
                workspaceName: invitation.workspaceName,
                workspaceDomain: invitation.workspaceDomain,
                invitedRole: invitation.invitedRole,
                message: invitation.message,
                expiresAt: invitation.expiresAt,
            },
        });
    }
    catch (error) {
        console.error("Error fetching invitation:", error);
        res.status(500).json({ message: "Failed to fetch invitation" });
    }
});
exports.default = router;
