"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const newsArticleController_1 = require("../controllers/newsArticleController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// POST endpoint for n8n to submit news articles (no auth for n8n webhooks)
router.post('/submit', newsArticleController_1.newsArticleController.submitNewsArticles);
// All other routes require authentication
router.use(auth_1.authMiddleware);
// GET all news articles with filters
router.get('/', newsArticleController_1.newsArticleController.getNewsArticles);
// GET dashboard stats for articles
router.get('/stats', newsArticleController_1.newsArticleController.getArticleStats);
// GET single article by ID
router.get('/:id', newsArticleController_1.newsArticleController.getArticleById);
// GET articles by company
router.get('/company/:company', newsArticleController_1.newsArticleController.getArticlesByCompany);
exports.default = router;
