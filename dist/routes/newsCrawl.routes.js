"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const newsCrawlController_1 = require("../controllers/newsCrawlController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// POST endpoint for n8n to submit crawl results (no auth for n8n webhooks)
router.post('/submit', newsCrawlController_1.newsCrawlController.submitCrawlResults);
// All other routes require authentication
router.use(auth_1.authMiddleware);
// GET all crawl results with filters
router.get('/', newsCrawlController_1.newsCrawlController.getCrawlResults);
// GET dashboard stats
router.get('/dashboard/stats', newsCrawlController_1.newsCrawlController.getDashboardStats);
// GET companies list
router.get('/companies', newsCrawlController_1.newsCrawlController.getCompaniesList);
// GET single crawl result by ID
router.get('/:id', newsCrawlController_1.newsCrawlController.getCrawlResultById);
// GET latest result for a specific company
router.get('/company/:company', newsCrawlController_1.newsCrawlController.getLatestForCompany);
exports.default = router;
