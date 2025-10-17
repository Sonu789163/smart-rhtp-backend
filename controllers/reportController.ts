import { Request, Response } from "express";
import { Report } from "../models/Report";
import axios from "axios";
import { io } from "../index";
import { publishEvent } from "../lib/events";
import puppeteer from "puppeteer";

import { writeFile, unlink } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

interface AuthRequest extends Request {
  user?: any;
  userDomain?: string;
  currentWorkspace?: string;
}

export const reportController = {
  async getAll(req: AuthRequest, res: Response) {
    try {
      // Get current workspace from request
      const currentWorkspace = req.currentWorkspace || req.userDomain;

      const query: any = {
        domain: req.userDomain, // Filter by user's domain
        workspaceId: currentWorkspace, // Filter by user's workspace
      };

      // Visibility: All members of the workspace can see all reports in that workspace.
      // Do not further restrict by userId/microsoftId for reads.

      const reports = await Report.find(query).sort({ updatedAt: -1 });
      res.json(reports);
    } catch (error) {
      console.error("Error fetching reports:", error);
      res.status(500).json({ message: "Error fetching reports" });
    }
  },

  async getById(req: AuthRequest, res: Response) {
    try {
      const query: any = {
        id: req.params.id,
        domain: req.userDomain, // Ensure user can only access reports from their domain
      };

      const report = await Report.findOne(query);
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }
      res.json(report);
    } catch (error) {
      console.error("Error fetching report:", error);
      res.status(500).json({ message: "Error fetching report" });
    }
  },

  async create(req: AuthRequest, res: Response) {
    try {
      const { title, content, drhpId, rhpId, drhpNamespace, rhpNamespace } =
        req.body;

      if (
        !title ||
        !content ||
        !drhpId ||
        !rhpId ||
        !drhpNamespace ||
        !rhpNamespace
      ) {
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
      await Report.deleteMany({
        domain: req.userDomain,
        workspaceId: currentWorkspace,
        drhpNamespace,
        rhpNamespace,
      });

      const reportData: any = {
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


      const report = new Report(reportData);
      await report.save();

      // Publish event for workspace notification
      await publishEvent({
        actorUserId: req.user?._id?.toString?.(),
        domain: req.userDomain!,
        action: "report.created",
        resourceType: "report",
        resourceId: report.id,
        title: `New report created: ${report.title}`,
        notifyWorkspace: true,
      });

      res.status(201).json(report);
    } catch (error) {
      console.error("Error creating report:", error);
      res
        .status(500)
        .json({ error: "Failed to create report", details: error });
    }
  },

  async reportStatusUpdate(req: Request, res: Response) {
    try {
      const { jobId, status, error } = req.body;
      if (!jobId || !status) {
        return res.status(400).json({ message: "Missing jobId or status" });
      }
      // Emit real-time update
      io.emit("compare_status", { jobId, status, error });
      res
        .status(200)
        .json({ message: "Status update emitted", jobId, status, error });
    } catch (err) {
      res.status(500).json({
        message: "Failed to emit status update",
        error: err instanceof Error ? err.message : err,
      });
    }
  },

  // Download DOCX generated from HTML content by report ID
  async downloadDocx(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const report = await Report.findOne({ id });
      if (!report || !report.content) {
        return res.status(404).json({ error: "Report not found" });
      }

      // Write HTML to a temp file
      const tmpDir = os.tmpdir();
      const htmlPath = path.join(tmpDir, `report_${id}.html`);
      const docxPath = path.join(tmpDir, `report_${id}.docx`);
      await writeFile(htmlPath, report.content, "utf8");

      // Convert HTML to DOCX using Pandoc
      await execAsync(`pandoc "${htmlPath}" -o "${docxPath}"`);

      // Send DOCX file
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${report.title || "report"}.docx"`
      );
      res.sendFile(docxPath, async (err) => {
        // Clean up temp files
        await unlink(htmlPath);
        await unlink(docxPath);
      });
    } catch (error) {
      console.error("Error generating DOCX with Pandoc:", error);
      res.status(500).json({ error: "Failed to generate DOCX" });
    }
  },

  async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const query: any = {
        id,
        domain: req.userDomain, // Ensure user can only update reports from their domain
      };

      // All workspace members can update reports in their workspace
      // No user-based filtering needed - workspace isolation is sufficient

      const report = await Report.findOneAndUpdate(query, req.body, {
        new: true,
      });
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }
      res.json(report);
    } catch (error) {
      console.error("Error updating report:", error);
      res.status(500).json({ error: "Failed to update report" });
    }
  },

  async delete(req: AuthRequest, res: Response) {
    try {
      const query: any = {
        id: req.params.id,
        domain: req.userDomain, // Ensure user can only delete reports from their domain
      };

      // Admins can delete all reports in their domain, regular users see only their own
      if (req.user.role !== "admin") {
        if (req.user.microsoftId) {
          query.microsoftId = req.user.microsoftId;
        } else if (req.user._id) {
          query.userId = req.user._id.toString();
        } else {
          return res.status(400).json({ error: "No user identifier found" });
        }
      }

      const report = await Report.findOne(query);
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      await report.deleteOne();
      await publishEvent({
        actorUserId: req.user?._id?.toString?.(),
        domain: req.userDomain!,
        action: "report.deleted",
        resourceType: "report",
        resourceId: report.id,
        title: `Report deleted: ${report.title || report.id}`,
        notifyWorkspace: true,
      });
      res.json({ message: "Report deleted successfully" });
    } catch (error) {
      console.error("Error deleting report:", error);
      res.status(500).json({ error: "Failed to delete report" });
    }
  },

  async downloadPdfFromHtml(req: AuthRequest, res: Response) {
    let browser;
    try {
      const { id } = req.params;
      const report = await Report.findOne({ id });
      if (!report || !report.content) {
        return res.status(404).json({ error: "Report not found" });
      }

      // Launch Puppeteer browser
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });
      
      const page = await browser.newPage();
      
      // Set viewport for consistent rendering
      await page.setViewport({ width: 1200, height: 800 });
      
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
      
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${sanitizedTitle}.pdf"`
      );
      res.setHeader("Content-Length", pdfBuffer.length);
      
      // Send PDF buffer to client
      res.end(pdfBuffer);
      
    } catch (error) {
      console.error("Error generating PDF with Puppeteer:", error);
      res.status(500).json({ error: "Failed to generate PDF" });
    } finally {
      // Always close the browser
      if (browser) {
        await browser.close();
      }
    }
  },

  // Admin: Get all reports across all workspaces in domain
  async getAllAdmin(req: AuthRequest, res: Response) {
    try {
      const user = req.user;
      if (!user || user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const query: any = {
        domain: req.user?.domain || req.userDomain, // Use user's actual domain for admin
      };

      const reports = await Report.find(query).sort({ updatedAt: -1 });
      
      // Get all workspaces to map workspaceId to workspace name
      const { Workspace } = await import("../models/Workspace");
      const workspaces = await Workspace.find({ domain: req.user?.domain || req.userDomain });
      const workspaceMap = new Map(workspaces.map(ws => [ws.workspaceId, { workspaceId: ws.workspaceId, name: ws.name, slug: ws.slug }]));

      // Add workspace information to each report
      const reportsWithWorkspace = reports.map(report => ({
        ...report.toObject(),
        workspaceId: workspaceMap.get(report.workspaceId) || { workspaceId: report.workspaceId, name: workspaceMap.get(report.workspaceId)?.name ? workspaceMap.get(report.workspaceId)?.name : 'Excollo', slug: 'unknown' }
      }));

      res.json(reportsWithWorkspace);
    } catch (error) {
      console.error("Error fetching admin reports:", error);
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  },
};
