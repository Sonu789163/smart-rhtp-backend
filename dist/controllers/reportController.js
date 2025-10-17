"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportController = void 0;
const Report_1 = require("../models/Report");
const index_1 = require("../index");
const events_1 = require("../lib/events");
const puppeteer_1 = __importDefault(require("puppeteer"));
const promises_1 = require("fs/promises");
const child_process_1 = require("child_process");
const util_1 = require("util");
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
exports.reportController = {
    async getAll(req, res) {
        try {
            // Get current workspace from request
            const currentWorkspace = req.currentWorkspace || req.userDomain;
            const query = {
                domain: req.userDomain, // Filter by user's domain
                workspaceId: currentWorkspace, // Filter by user's workspace
            };
            // Visibility: All members of the workspace can see all reports in that workspace.
            // Do not further restrict by userId/microsoftId for reads.
            const reports = await Report_1.Report.find(query).sort({ updatedAt: -1 });
            res.json(reports);
        }
        catch (error) {
            console.error("Error fetching reports:", error);
            res.status(500).json({ message: "Error fetching reports" });
        }
    },
    async getById(req, res) {
        try {
            const query = {
                id: req.params.id,
                domain: req.userDomain, // Ensure user can only access reports from their domain
            };
            const report = await Report_1.Report.findOne(query);
            if (!report) {
                return res.status(404).json({ error: "Report not found" });
            }
            res.json(report);
        }
        catch (error) {
            console.error("Error fetching report:", error);
            res.status(500).json({ message: "Error fetching report" });
        }
    },
    async create(req, res) {
        var _a, _b, _c;
        try {
            const { title, content, drhpId, rhpId, drhpNamespace, rhpNamespace } = req.body;
            if (!title ||
                !content ||
                !drhpId ||
                !rhpId ||
                !drhpNamespace ||
                !rhpNamespace) {
                return res.status(400).json({
                    message: "Missing required fields",
                    required: {
                        title,
                        content,
                        drhpId,
                        rhpId,
                        drhpNamespace,
                        rhpNamespace,
                    },
                });
            }
            // Get current workspace from request
            const currentWorkspace = req.currentWorkspace || req.userDomain;
            // Ensure one report per DRHP/RHP pair in the workspace: replace previous if exists
            await Report_1.Report.deleteMany({
                domain: req.userDomain,
                workspaceId: currentWorkspace,
                drhpNamespace,
                rhpNamespace,
            });
            const reportData = {
                id: Date.now().toString(),
                title,
                content,
                drhpId,
                rhpId,
                drhpNamespace,
                rhpNamespace,
                domain: req.userDomain, // Add domain for workspace isolation
                workspaceId: currentWorkspace, // Add workspace for team isolation
                updatedAt: new Date(),
            };
            const report = new Report_1.Report(reportData);
            await report.save();
            // Publish event for workspace notification
            await (0, events_1.publishEvent)({
                actorUserId: (_c = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id) === null || _b === void 0 ? void 0 : _b.toString) === null || _c === void 0 ? void 0 : _c.call(_b),
                domain: req.userDomain,
                action: "report.created",
                resourceType: "report",
                resourceId: report.id,
                title: `New report created: ${report.title}`,
                notifyWorkspace: true,
            });
            res.status(201).json(report);
        }
        catch (error) {
            console.error("Error creating report:", error);
            res
                .status(500)
                .json({ error: "Failed to create report", details: error });
        }
    },
    async reportStatusUpdate(req, res) {
        try {
            const { jobId, status, error } = req.body;
            if (!jobId || !status) {
                return res.status(400).json({ message: "Missing jobId or status" });
            }
            // Emit real-time update
            index_1.io.emit("compare_status", { jobId, status, error });
            res
                .status(200)
                .json({ message: "Status update emitted", jobId, status, error });
        }
        catch (err) {
            res.status(500).json({
                message: "Failed to emit status update",
                error: err instanceof Error ? err.message : err,
            });
        }
    },
    // Download DOCX generated from HTML content by report ID
    async downloadDocx(req, res) {
        try {
            const { id } = req.params;
            const report = await Report_1.Report.findOne({ id });
            if (!report || !report.content) {
                return res.status(404).json({ error: "Report not found" });
            }
            // Write HTML to a temp file
            const tmpDir = os_1.default.tmpdir();
            const htmlPath = path_1.default.join(tmpDir, `report_${id}.html`);
            const docxPath = path_1.default.join(tmpDir, `report_${id}.docx`);
            await (0, promises_1.writeFile)(htmlPath, report.content, "utf8");
            // Convert HTML to DOCX using Pandoc
            await execAsync(`pandoc "${htmlPath}" -o "${docxPath}"`);
            // Send DOCX file
            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
            res.setHeader("Content-Disposition", `attachment; filename="${report.title || "report"}.docx"`);
            res.sendFile(docxPath, async (err) => {
                // Clean up temp files
                await (0, promises_1.unlink)(htmlPath);
                await (0, promises_1.unlink)(docxPath);
            });
        }
        catch (error) {
            console.error("Error generating DOCX with Pandoc:", error);
            res.status(500).json({ error: "Failed to generate DOCX" });
        }
    },
    async update(req, res) {
        try {
            const { id } = req.params;
            const query = {
                id,
                domain: req.userDomain, // Ensure user can only update reports from their domain
            };
            // All workspace members can update reports in their workspace
            // No user-based filtering needed - workspace isolation is sufficient
            const report = await Report_1.Report.findOneAndUpdate(query, req.body, {
                new: true,
            });
            if (!report) {
                return res.status(404).json({ error: "Report not found" });
            }
            res.json(report);
        }
        catch (error) {
            console.error("Error updating report:", error);
            res.status(500).json({ error: "Failed to update report" });
        }
    },
    async delete(req, res) {
        var _a, _b, _c;
        try {
            const query = {
                id: req.params.id,
                domain: req.userDomain, // Ensure user can only delete reports from their domain
            };
            // Admins can delete all reports in their domain, regular users see only their own
            if (req.user.role !== "admin") {
                if (req.user.microsoftId) {
                    query.microsoftId = req.user.microsoftId;
                }
                else if (req.user._id) {
                    query.userId = req.user._id.toString();
                }
                else {
                    return res.status(400).json({ error: "No user identifier found" });
                }
            }
            const report = await Report_1.Report.findOne(query);
            if (!report) {
                return res.status(404).json({ error: "Report not found" });
            }
            await report.deleteOne();
            await (0, events_1.publishEvent)({
                actorUserId: (_c = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id) === null || _b === void 0 ? void 0 : _b.toString) === null || _c === void 0 ? void 0 : _c.call(_b),
                domain: req.userDomain,
                action: "report.deleted",
                resourceType: "report",
                resourceId: report.id,
                title: `Report deleted: ${report.title || report.id}`,
                notifyWorkspace: true,
            });
            res.json({ message: "Report deleted successfully" });
        }
        catch (error) {
            console.error("Error deleting report:", error);
            res.status(500).json({ error: "Failed to delete report" });
        }
    },
    async downloadPdfFromHtml(req, res) {
        var _a, _b, _c;
        let browser;
        try {
            const { id } = req.params;
            const report = await Report_1.Report.findOne({ id });
            if (!report || !report.content) {
                return res.status(404).json({ error: "Report not found" });
            }
            console.log('Starting PDF generation for report:', id);
            // Wrap content in proper HTML structure if needed
            let htmlContent = report.content;
            if (!htmlContent.includes('<!DOCTYPE html>')) {
                htmlContent = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="UTF-8">
              <style>
                body { 
                  font-family: Arial, sans-serif; 
                  margin: 0; 
                  padding: 20px; 
                  line-height: 1.6;
                  color: #333;
                }
                h1, h2, h3, h4, h5, h6 { color: #4B2A06; }
                table { border-collapse: collapse; width: 100%; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #f2f2f2; }
              </style>
            </head>
            <body>
              ${htmlContent}
            </body>
          </html>
        `;
            }
            // Cloud-optimized Puppeteer configuration
            const launchOptions = {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--single-process',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--disable-extensions',
                    '--disable-plugins',
                    '--disable-images',
                    '--disable-javascript',
                    '--disable-default-apps',
                    '--disable-sync',
                    '--disable-translate',
                    '--hide-scrollbars',
                    '--mute-audio',
                    '--no-default-browser-check',
                    '--disable-background-networking'
                ]
            };
            // Try different executable paths for different environments
            const possiblePaths = [
                process.env.PUPPETEER_EXECUTABLE_PATH,
                '/usr/bin/chromium-browser',
                '/usr/bin/chromium',
                '/usr/bin/google-chrome',
                '/usr/bin/google-chrome-stable',
                '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // macOS
                'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // Windows
                'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' // Windows 32-bit
            ];
            // Find the first available executable path
            for (const path of possiblePaths) {
                if (path && require('fs').existsSync(path)) {
                    launchOptions.executablePath = path;
                    console.log(`Using Chromium at: ${path}`);
                    break;
                }
            }
            // If no custom path found, let Puppeteer use its bundled Chromium
            if (!launchOptions.executablePath) {
                console.log('Using Puppeteer bundled Chromium');
            }
            console.log('Launching Puppeteer with cloud-optimized options');
            browser = await puppeteer_1.default.launch(launchOptions);
            const page = await browser.newPage();
            // Set viewport for consistent rendering
            await page.setViewport({ width: 1200, height: 800 });
            // Set content and wait for any dynamic content to load
            await page.setContent(htmlContent, {
                waitUntil: 'networkidle0',
                timeout: 30000
            });
            // Generate PDF with enhanced options
            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                preferCSSPageSize: false,
                margin: {
                    top: '20px',
                    right: '20px',
                    bottom: '20px',
                    left: '20px'
                },
                displayHeaderFooter: false,
                timeout: 30000
            });
            // Validate PDF buffer
            if (!pdfBuffer || pdfBuffer.length === 0) {
                throw new Error('PDF buffer is empty');
            }
            // Check PDF header
            const headerBytes = pdfBuffer.slice(0, 4);
            const headerString = String.fromCharCode(...headerBytes);
            if (!headerString.startsWith('%PDF')) {
                throw new Error('Invalid PDF header generated');
            }
            console.log(`PDF generated successfully: ${pdfBuffer.length} bytes`);
            // Set response headers
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Transfer-Encoding", "binary");
            // Clean filename - remove .pdf extension if it exists, then add it back
            let cleanTitle = (report.title || "report");
            if (cleanTitle.toLowerCase().endsWith('.pdf')) {
                cleanTitle = cleanTitle.slice(0, -4);
            }
            const sanitizedTitle = cleanTitle.replace(/[^a-zA-Z0-9\s-_]/g, '');
            res.setHeader("Content-Disposition", `attachment; filename="${sanitizedTitle}.pdf"`);
            res.setHeader("Content-Length", pdfBuffer.length);
            // Send PDF buffer to client
            res.end(pdfBuffer);
        }
        catch (error) {
            console.error("Error generating PDF with Puppeteer:", error);
            console.error("Error details:", {
                message: error === null || error === void 0 ? void 0 : error.message,
                stack: error === null || error === void 0 ? void 0 : error.stack,
                name: error === null || error === void 0 ? void 0 : error.name
            });
            // Provide more specific error messages
            let errorMessage = "Failed to generate PDF";
            if ((_a = error === null || error === void 0 ? void 0 : error.message) === null || _a === void 0 ? void 0 : _a.includes('Could not find browser')) {
                errorMessage = "Browser not found. Please check Puppeteer installation.";
            }
            else if ((_b = error === null || error === void 0 ? void 0 : error.message) === null || _b === void 0 ? void 0 : _b.includes('Failed to launch')) {
                errorMessage = "Failed to launch browser. This might be due to missing dependencies.";
            }
            else if ((_c = error === null || error === void 0 ? void 0 : error.message) === null || _c === void 0 ? void 0 : _c.includes('timeout')) {
                errorMessage = "PDF generation timed out. Please try again.";
            }
            res.status(500).json({
                error: errorMessage,
                details: process.env.NODE_ENV === 'development' ? error === null || error === void 0 ? void 0 : error.message : undefined
            });
        }
        finally {
            // Always close the browser
            if (browser) {
                try {
                    await browser.close();
                }
                catch (closeError) {
                    console.error("Error closing browser:", closeError);
                }
            }
        }
    },
    // Admin: Get all reports across all workspaces in domain
    async getAllAdmin(req, res) {
        var _a, _b;
        try {
            const user = req.user;
            if (!user || user.role !== "admin") {
                return res.status(403).json({ error: "Admin access required" });
            }
            const query = {
                domain: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.domain) || req.userDomain, // Use user's actual domain for admin
            };
            const reports = await Report_1.Report.find(query).sort({ updatedAt: -1 });
            // Get all workspaces to map workspaceId to workspace name
            const { Workspace } = await Promise.resolve().then(() => __importStar(require("../models/Workspace")));
            const workspaces = await Workspace.find({ domain: ((_b = req.user) === null || _b === void 0 ? void 0 : _b.domain) || req.userDomain });
            const workspaceMap = new Map(workspaces.map(ws => [ws.workspaceId, { workspaceId: ws.workspaceId, name: ws.name, slug: ws.slug }]));
            // Add workspace information to each report
            const reportsWithWorkspace = reports.map(report => {
                var _a, _b;
                return ({
                    ...report.toObject(),
                    workspaceId: workspaceMap.get(report.workspaceId) || { workspaceId: report.workspaceId, name: ((_a = workspaceMap.get(report.workspaceId)) === null || _a === void 0 ? void 0 : _a.name) ? (_b = workspaceMap.get(report.workspaceId)) === null || _b === void 0 ? void 0 : _b.name : 'Excollo', slug: 'unknown' }
                });
            });
            res.json(reportsWithWorkspace);
        }
        catch (error) {
            console.error("Error fetching admin reports:", error);
            res.status(500).json({ error: "Failed to fetch reports" });
        }
    },
};
