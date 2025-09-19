"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shareController = void 0;
const SharePermission_1 = require("../models/SharePermission");
const events_1 = require("../lib/events");
function generateId(prefix = "shr") {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
function generateToken() {
    return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}
exports.shareController = {
    async list(req, res) {
        try {
            const { resourceType, resourceId } = req.query;
            if (!resourceType || !resourceId) {
                return res.status(400).json({ error: "resourceType and resourceId are required" });
            }
            const items = await SharePermission_1.SharePermission.find({
                domain: req.userDomain,
                resourceType,
                resourceId,
            }).sort({ createdAt: -1 });
            res.json(items);
        }
        catch (err) {
            res.status(500).json({ error: "Failed to list shares" });
        }
    },
    async create(req, res) {
        var _a, _b, _c, _d, _e, _f;
        try {
            const { resourceType, resourceId, scope, principalId, role, expiresAt, invitedEmail } = req.body || {};
            if (!resourceType || !resourceId || !scope || !role) {
                return res.status(400).json({ error: "Missing required fields" });
            }
            if (scope !== "link" && !principalId) {
                return res.status(400).json({ error: "principalId is required for user/workspace scope" });
            }
            const payload = {
                id: generateId(),
                resourceType,
                resourceId,
                domain: req.userDomain,
                scope,
                principalId: principalId || null,
                role,
                invitedEmail: invitedEmail || null,
                createdBy: (_c = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id) === null || _b === void 0 ? void 0 : _b.toString) === null || _c === void 0 ? void 0 : _c.call(_b),
            };
            if (expiresAt)
                payload.expiresAt = new Date(expiresAt);
            const share = new SharePermission_1.SharePermission(payload);
            await share.save();
            await (0, events_1.publishEvent)({
                actorUserId: (_f = (_e = (_d = req.user) === null || _d === void 0 ? void 0 : _d._id) === null || _e === void 0 ? void 0 : _e.toString) === null || _f === void 0 ? void 0 : _f.call(_e),
                domain: req.userDomain,
                action: "share.granted",
                resourceType: resourceType,
                resourceId: resourceId,
                title: `Share granted: ${role}`,
            });
            res.status(201).json(share);
        }
        catch (err) {
            res.status(500).json({ error: "Failed to create share" });
        }
    },
    async revoke(req, res) {
        var _a, _b, _c;
        try {
            const { id } = req.params;
            const toDelete = await SharePermission_1.SharePermission.findOne({ id, domain: req.userDomain });
            const deleted = await SharePermission_1.SharePermission.deleteOne({ id, domain: req.userDomain });
            if (deleted.deletedCount === 0) {
                return res.status(404).json({ error: "Share not found" });
            }
            if (toDelete) {
                await (0, events_1.publishEvent)({
                    actorUserId: (_c = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id) === null || _b === void 0 ? void 0 : _b.toString) === null || _c === void 0 ? void 0 : _c.call(_b),
                    domain: req.userDomain,
                    action: "share.revoked",
                    resourceType: toDelete.resourceType,
                    resourceId: toDelete.resourceId,
                    title: `Share revoked`,
                });
            }
            res.json({ message: "Share revoked" });
        }
        catch (err) {
            res.status(500).json({ error: "Failed to revoke share" });
        }
    },
    async linkCreateOrRotate(req, res) {
        var _a, _b, _c, _d, _e, _f;
        try {
            const { resourceType, resourceId, role, expiresAt } = req.body || {};
            if (!resourceType || !resourceId || !role) {
                return res.status(400).json({ error: "Missing required fields" });
            }
            // Upsert one link per resource/domain
            const token = generateToken();
            const update = {
                id: generateId("lnk"),
                resourceType,
                resourceId,
                domain: req.userDomain,
                scope: "link",
                role,
                linkToken: token,
                createdBy: (_c = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id) === null || _b === void 0 ? void 0 : _b.toString) === null || _c === void 0 ? void 0 : _c.call(_b),
                expiresAt: expiresAt ? new Date(expiresAt) : null,
            };
            const link = await SharePermission_1.SharePermission.findOneAndUpdate({ domain: req.userDomain, resourceType, resourceId, scope: "link" }, update, { new: true, upsert: true, setDefaultsOnInsert: true });
            await (0, events_1.publishEvent)({
                actorUserId: (_f = (_e = (_d = req.user) === null || _d === void 0 ? void 0 : _d._id) === null || _e === void 0 ? void 0 : _e.toString) === null || _f === void 0 ? void 0 : _f.call(_e),
                domain: req.userDomain,
                action: "share.link.rotated",
                resourceType,
                resourceId,
                title: `Share link created/rotated`,
            });
            res.json({ token: link.linkToken });
        }
        catch (err) {
            res.status(500).json({ error: "Failed to create link" });
        }
    },
    async linkResolve(req, res) {
        try {
            const { token } = req.params;
            // Find any domain link (domain-agnostic resolve by token)
            const link = await SharePermission_1.SharePermission.findOne({ scope: "link", linkToken: token });
            if (!link) {
                return res.status(404).json({ error: "Invalid link" });
            }
            if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
                return res.status(410).json({ error: "Link expired" });
            }
            res.json({
                resourceType: link.resourceType,
                resourceId: link.resourceId,
                role: link.role,
                domain: link.domain,
            });
        }
        catch (err) {
            res.status(500).json({ error: "Failed to resolve link" });
        }
    },
};
