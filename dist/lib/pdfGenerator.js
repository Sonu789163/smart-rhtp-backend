"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PDFGenerator = void 0;
const puppeteer_1 = __importDefault(require("puppeteer"));
class PDFGenerator {
    constructor() {
        this.browser = null;
    }
    static getInstance() {
        if (!PDFGenerator.instance) {
            PDFGenerator.instance = new PDFGenerator();
        }
        return PDFGenerator.instance;
    }
    async generatePDF(htmlContent, options = {}) {
        let browser;
        try {
            console.log('Starting PDF generation...');
            // Launch options optimized for cloud deployment
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
                    '--disable-background-networking',
                    '--disable-ipc-flooding-protection',
                    '--disable-hang-monitor',
                    '--disable-prompt-on-repost',
                    '--disable-domain-reliability',
                    '--disable-component-extensions-with-background-pages',
                    '--disable-default-apps',
                    '--disable-features=TranslateUI',
                    '--disable-ipc-flooding-protection'
                ]
            };
            // Add executable path if provided
            if (process.env.PUPPETEER_EXECUTABLE_PATH) {
                launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
            }
            console.log('Launching Puppeteer...');
            browser = await puppeteer_1.default.launch(launchOptions);
            const page = await browser.newPage();
            // Set viewport for consistent rendering
            await page.setViewport({ width: 1200, height: 800 });
            // Wrap content in proper HTML structure if needed
            let fullHtmlContent = htmlContent;
            if (!htmlContent.includes('<!DOCTYPE html>')) {
                fullHtmlContent = `
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
            console.log('Setting page content...');
            await page.setContent(fullHtmlContent, {
                waitUntil: 'networkidle0',
                timeout: options.timeout || 30000
            });
            console.log('Generating PDF...');
            const pdfBuffer = await page.pdf({
                format: options.format || 'A4',
                printBackground: true,
                preferCSSPageSize: false,
                margin: options.margin || {
                    top: '20px',
                    right: '20px',
                    bottom: '20px',
                    left: '20px'
                },
                displayHeaderFooter: false,
                timeout: options.timeout || 30000
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
            return Buffer.from(pdfBuffer);
        }
        catch (error) {
            console.error('PDF generation error:', error);
            throw error;
        }
        finally {
            if (browser) {
                try {
                    await browser.close();
                }
                catch (closeError) {
                    console.error('Error closing browser:', closeError);
                }
            }
        }
    }
    sanitizeFilename(title) {
        // Clean filename - remove .pdf extension if it exists, then add it back
        let cleanTitle = title || "document";
        if (cleanTitle.toLowerCase().endsWith('.pdf')) {
            cleanTitle = cleanTitle.slice(0, -4);
        }
        return cleanTitle.replace(/[^a-zA-Z0-9\s-_]/g, '');
    }
}
exports.PDFGenerator = PDFGenerator;
