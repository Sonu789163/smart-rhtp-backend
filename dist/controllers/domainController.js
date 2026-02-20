"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.domainController = void 0;
const Domain_1 = require("../models/Domain");
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const PYTHON_API_URL = process.env.PYTHON_API_URL || "http://localhost:8001";
exports.domainController = {
    // Get current domain configuration
    async getConfig(req, res) {
        try {
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
            // Return configuration fields including onboarding data
            res.json({
                domainId: domain.domainId,
                domainName: domain.domainName,
                // Feature toggles
                investor_match_only: domain.investor_match_only,
                valuation_matching: domain.valuation_matching,
                adverse_finding: domain.adverse_finding,
                target_investors: domain.target_investors || [],
                // SOP data
                has_sop: !!(domain.sop_text),
                // Onboarding status
                onboarding_status: domain.onboarding_status || "pending",
                last_onboarded: domain.last_onboarded,
                // Custom configs summary (don't send full prompts to frontend)
                has_custom_subqueries: !!(domain.custom_subqueries && domain.custom_subqueries.length > 0),
                custom_subqueries_count: (domain.custom_subqueries || []).length,
                has_agent3_prompt: !!(domain.agent3_prompt),
                has_agent4_prompt: !!(domain.agent4_prompt),
                // Legacy
                validator_checklist: domain.validator_checklist || [],
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
            // Update toggle fields if provided
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
                    validator_checklist: domain.validator_checklist
                }
            });
        }
        catch (error) {
            console.error("Error updating domain config:", error);
            res.status(500).json({ error: "Failed to update domain configuration" });
        }
    },
    // Get onboarding status
    async getOnboardingStatus(req, res) {
        try {
            const domainId = req.userDomain;
            if (!domainId) {
                return res.status(400).json({ error: "Domain context not found" });
            }
            const domain = await Domain_1.Domain.findOne({ domainId });
            if (!domain) {
                return res.json({
                    status: "not_found",
                    onboarding_required: true,
                    message: "Domain not configured yet"
                });
            }
            res.json({
                status: "found",
                domainId: domain.domainId,
                domainName: domain.domainName,
                onboarding_status: domain.onboarding_status || "pending",
                last_onboarded: domain.last_onboarded,
                has_sop: !!(domain.sop_text),
                has_custom_subqueries: !!(domain.custom_subqueries && domain.custom_subqueries.length > 0),
                custom_subqueries_count: (domain.custom_subqueries || []).length,
                has_agent3_prompt: !!(domain.agent3_prompt),
                has_agent4_prompt: !!(domain.agent4_prompt),
                subquery_analysis: domain.subquery_analysis || {},
                toggles: {
                    investor_match_only: domain.investor_match_only,
                    valuation_matching: domain.valuation_matching,
                    adverse_finding: domain.adverse_finding,
                },
                target_investors: domain.target_investors || [],
            });
        }
        catch (error) {
            console.error("Error fetching onboarding status:", error);
            res.status(500).json({ error: "Failed to fetch onboarding status" });
        }
    },
    // Proxy onboarding setup to Python AI Platform
    async setupOnboarding(req, res) {
        var _a, _b;
        try {
            const { user } = req;
            const domainId = req.userDomain;
            if (!domainId) {
                return res.status(400).json({ error: "Domain context not found" });
            }
            // Verify admin role
            if ((user === null || user === void 0 ? void 0 : user.role) !== 'admin') {
                return res.status(403).json({ error: "Only admins can configure onboarding" });
            }
            console.log(`🔄 Proxying onboarding setup for domain: ${domainId} to Python AI Platform`);
            // Build FormData to forward to Python API
            const forwardData = new form_data_1.default();
            forwardData.append("domainId", domainId);
            // Extract config from request body
            const config = req.body.config;
            if (config) {
                forwardData.append("config", typeof config === 'string' ? config : JSON.stringify(config));
            }
            else {
                // Build default config from body fields
                const defaultConfig = {
                    toggles: {
                        investor_match_only: req.body.investor_match_only || false,
                        valuation_matching: req.body.valuation_matching || false,
                        adverse_finding: req.body.adverse_finding || false,
                    },
                    targetInvestors: req.body.target_investors || [],
                };
                forwardData.append("config", JSON.stringify(defaultConfig));
            }
            // If file was uploaded (handled by multer middleware in route)
            if (req.file) {
                forwardData.append("file", req.file.buffer, {
                    filename: req.file.originalname,
                    contentType: req.file.mimetype,
                });
            }
            // Update domain status to processing
            await Domain_1.Domain.updateOne({ domainId }, { $set: { onboarding_status: "processing", updatedAt: new Date() } }, { upsert: true });
            // Forward to Python AI Platform
            const pythonResponse = await axios_1.default.post(`${PYTHON_API_URL}/onboarding/setup`, forwardData, {
                headers: {
                    ...forwardData.getHeaders(),
                },
                timeout: 30000, // 30s timeout for initial request (processing is async)
            });
            console.log(`✅ Onboarding request forwarded for ${domainId}`, pythonResponse.data);
            res.json({
                message: "Onboarding started successfully",
                status: "processing",
                domain_id: domainId,
                ai_platform_response: pythonResponse.data,
            });
        }
        catch (error) {
            console.error("Error in onboarding setup proxy:", ((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.data) || error.message);
            // Update status to failed
            const domainId = req.userDomain;
            if (domainId) {
                await Domain_1.Domain.updateOne({ domainId }, { $set: { onboarding_status: "failed", updatedAt: new Date() } }).catch(() => { });
            }
            res.status(500).json({
                error: "Failed to start onboarding",
                details: ((_b = error === null || error === void 0 ? void 0 : error.response) === null || _b === void 0 ? void 0 : _b.data) || error.message
            });
        }
    },
    // Proxy re-onboarding to Python AI Platform
    async reOnboard(req, res) {
        var _a, _b;
        try {
            const { user } = req;
            const domainId = req.userDomain;
            if (!domainId) {
                return res.status(400).json({ error: "Domain context not found" });
            }
            if ((user === null || user === void 0 ? void 0 : user.role) !== 'admin') {
                return res.status(403).json({ error: "Only admins can re-configure onboarding" });
            }
            if (!req.file) {
                return res.status(400).json({ error: "SOP file is required for re-onboarding" });
            }
            console.log(`🔄 Re-onboarding for domain: ${domainId}`);
            const forwardData = new form_data_1.default();
            forwardData.append("domainId", domainId);
            const config = req.body.config;
            if (config) {
                forwardData.append("config", typeof config === 'string' ? config : JSON.stringify(config));
            }
            else {
                const defaultConfig = {
                    toggles: {
                        investor_match_only: req.body.investor_match_only || false,
                        valuation_matching: req.body.valuation_matching || false,
                        adverse_finding: req.body.adverse_finding || false,
                    },
                    targetInvestors: req.body.target_investors || [],
                };
                forwardData.append("config", JSON.stringify(defaultConfig));
            }
            forwardData.append("file", req.file.buffer, {
                filename: req.file.originalname,
                contentType: req.file.mimetype,
            });
            // Update status
            await Domain_1.Domain.updateOne({ domainId }, { $set: { onboarding_status: "processing", updatedAt: new Date() } });
            const pythonResponse = await axios_1.default.post(`${PYTHON_API_URL}/onboarding/re-onboard`, forwardData, {
                headers: { ...forwardData.getHeaders() },
                timeout: 30000,
            });
            console.log(`✅ Re-onboarding forwarded for ${domainId}`, pythonResponse.data);
            res.json({
                message: "Re-onboarding started. Pipeline configs will be updated.",
                status: "processing",
                domain_id: domainId,
                ai_platform_response: pythonResponse.data,
            });
        }
        catch (error) {
            console.error("Error in re-onboarding proxy:", ((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.data) || error.message);
            const domainId = req.userDomain;
            if (domainId) {
                await Domain_1.Domain.updateOne({ domainId }, { $set: { onboarding_status: "failed", updatedAt: new Date() } }).catch(() => { });
            }
            res.status(500).json({
                error: "Failed to start re-onboarding",
                details: ((_b = error === null || error === void 0 ? void 0 : error.response) === null || _b === void 0 ? void 0 : _b.data) || error.message
            });
        }
    },
};
