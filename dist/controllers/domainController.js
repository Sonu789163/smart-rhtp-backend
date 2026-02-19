"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.domainController = void 0;
const Domain_1 = require("../models/Domain");
exports.domainController = {
    // Get current domain configuration
    async getConfig(req, res) {
        try {
            // Use domain from user or request context
            const domainId = req.userDomain;
            if (!domainId) {
                return res.status(400).json({ error: "Domain context not found" });
            }
            console.log(`Fetching config for domain: ${domainId}`);
            const domain = await Domain_1.Domain.findOne({ domainId });
            if (!domain) {
                console.warn(`Domain config not found for ${domainId}`);
                return res.status(404).json({ error: "Domain configuration not found" });
            }
            // Return only configuration fields
            res.json({
                domainId: domain.domainId,
                domainName: domain.domainName,
                investor_match_only: domain.investor_match_only,
                valuation_matching: domain.valuation_matching,
                adverse_finding: domain.adverse_finding,
                target_investors: domain.target_investors || [],
                custom_summary_sop: domain.custom_summary_sop || "",
                validator_checklist: domain.validator_checklist || []
            });
        }
        catch (error) {
            console.error("Error fetching domain config:", error);
            res.status(500).json({ error: "Failed to fetch domain configuration" });
        }
    },
    // Update domain configuration (Admin only)
    async updateConfig(req, res) {
        try {
            const { user } = req;
            const domainId = req.userDomain;
            const updates = req.body;
            if (!domainId) {
                return res.status(400).json({ error: "Domain context not found" });
            }
            // Verify admin role
            if ((user === null || user === void 0 ? void 0 : user.role) !== 'admin') {
                console.warn(`Unauthorized config update attempt by ${user === null || user === void 0 ? void 0 : user._id} for ${domainId}`);
                return res.status(403).json({ error: "Only admins can update domain configuration" });
            }
            console.log(`Updating config for domain: ${domainId} by user ${user._id}`);
            const domain = await Domain_1.Domain.findOne({ domainId });
            if (!domain) {
                return res.status(404).json({ error: "Domain configuration not found" });
            }
            // Update fields if provided
            if (updates.investor_match_only !== undefined)
                domain.investor_match_only = updates.investor_match_only;
            if (updates.valuation_matching !== undefined)
                domain.valuation_matching = updates.valuation_matching;
            if (updates.adverse_finding !== undefined)
                domain.adverse_finding = updates.adverse_finding;
            // Update lists if provided (replace entire list)
            if (Array.isArray(updates.target_investors)) {
                domain.target_investors = updates.target_investors;
            }
            if (updates.custom_summary_sop !== undefined) {
                domain.custom_summary_sop = updates.custom_summary_sop;
            }
            if (Array.isArray(updates.validator_checklist)) {
                domain.validator_checklist = updates.validator_checklist;
            }
            domain.updatedAt = new Date();
            await domain.save();
            console.log(`✅ Domain config updated for ${domainId}`);
            res.json({
                message: "Configuration updated successfully",
                config: {
                    investor_match_only: domain.investor_match_only,
                    valuation_matching: domain.valuation_matching,
                    adverse_finding: domain.adverse_finding,
                    target_investors: domain.target_investors,
                    custom_summary_sop: domain.custom_summary_sop,
                    validator_checklist: domain.validator_checklist
                }
            });
        }
        catch (error) {
            console.error("Error updating domain config:", error);
            res.status(500).json({ error: "Failed to update domain configuration" });
        }
    }
};
