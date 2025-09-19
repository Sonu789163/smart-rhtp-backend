"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.linkAccess = linkAccess;
const SharePermission_1 = require("../models/SharePermission");
async function linkAccess(req, res, next) {
    try {
        const token = req.query.linkToken || req.headers["x-link-token"];
        if (!token)
            return next();
        const link = await SharePermission_1.SharePermission.findOne({ scope: "link", linkToken: token });
        if (!link)
            return res.status(403).json({ message: "Invalid link token" });
        if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
            return res.status(410).json({ message: "Link expired" });
        }
        req.linkAccess = {
            role: link.role,
            resourceType: link.resourceType,
            resourceId: link.resourceId,
            domain: link.domain,
        };
        next();
    }
    catch (err) {
        console.error('LinkAccess middleware error:', err);
        res.status(500).json({ message: "Failed to process link token" });
    }
}
