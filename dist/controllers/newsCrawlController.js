"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.newsCrawlController = void 0;
const NewsArticle_1 = __importDefault(require("../models/NewsArticle"));
exports.newsCrawlController = {
    // POST endpoint for n8n to submit crawl results
    async submitCrawlResults(req, res) {
        try {
            // Body should be array of source objects: [{ sourceType, summary, articles[] }]
            const sourceDataArray = req.body;
            // Get workspace and domain from headers
            const workspaceId = req.headers['x-workspace'] || 'ws_1758689602670_z3pxonjqn';
            const domainId = req.headers['x-domain'] || 'domain_excollo-com_1762104581969';
            // Ensure we have an array
            const sourcesArray = Array.isArray(sourceDataArray) ? sourceDataArray : [sourceDataArray];
            const savedArticles = [];
            // Helper function to safely parse date
            const parseDate = (dateValue) => {
                if (!dateValue) {
                    return new Date(); // Default to now
                }
                const parsed = new Date(dateValue);
                if (isNaN(parsed.getTime())) {
                    return new Date(); // Default to now if invalid
                }
                return parsed;
            };
            // Helper function to extract company from title
            const extractCompany = (title) => {
                // Try to extract company name from title (usually before the colon or dash)
                const patterns = [/^([^:]+):/, /^([^-]+)-/, /^([^|]+)\|/];
                for (const pattern of patterns) {
                    const match = title.match(pattern);
                    if (match) {
                        return match[1].trim();
                    }
                }
                // Fallback: use first few words
                const words = title.split(' ');
                return words.slice(0, Math.min(3, words.length)).join(' ');
            };
            // Helper function to map severity to risk level
            const mapSeverityToRiskLevel = (severity) => {
                if (!severity)
                    return 'MEDIUM';
                const severityLower = severity.toLowerCase();
                if (severityLower === 'high' || severityLower === 'critical')
                    return 'HIGH';
                if (severityLower === 'medium')
                    return 'MEDIUM';
                if (severityLower === 'low')
                    return 'LOW';
                return 'MEDIUM';
            };
            // Process each source data object
            for (const sourceData of sourcesArray) {
                try {
                    // Each sourceData has articles[]
                    if (sourceData.articles && Array.isArray(sourceData.articles)) {
                        for (const article of sourceData.articles) {
                            try {
                                // Extract company from title
                                const company = extractCompany(article.title || 'Unknown Company');
                                // Build description from keyPoints if available
                                let description = article.title || '';
                                if (article.keyPoints && Array.isArray(article.keyPoints)) {
                                    description = article.keyPoints.join(' • ');
                                }
                                // Map sentiment
                                const sentiment = (article.sentiment || 'neutral').toLowerCase();
                                // Create or update the article
                                const newsArticle = await NewsArticle_1.default.findOneAndUpdate({ url: article.url }, {
                                    title: article.title,
                                    description: description,
                                    url: article.url,
                                    imageUrl: article.imageUrl || '',
                                    source: sourceData.sourceType || 'rss',
                                    publishedDate: parseDate(article.publishedDate),
                                    company: company,
                                    category: article.riskType || 'General',
                                    sentiment: sentiment,
                                    riskLevel: mapSeverityToRiskLevel(article.severity),
                                    findings: description,
                                    confidence: article.confidence || 'medium',
                                    workspaceId,
                                    domainId,
                                    crawledAt: new Date(),
                                }, {
                                    upsert: true,
                                    new: true,
                                    setDefaultsOnInsert: true,
                                });
                                savedArticles.push(newsArticle);
                            }
                            catch (articleError) {
                                console.error('Error saving individual article:', articleError);
                                // Continue processing other articles
                            }
                        }
                    }
                }
                catch (error) {
                    console.error('Error processing source data:', error);
                    // Continue with next source
                }
            }
            res.status(201).json({
                message: 'Crawl results and articles saved successfully',
                articlesCount: savedArticles.length,
                articles: savedArticles,
            });
        }
        catch (error) {
            console.error('Error saving crawl results:', error);
            res.status(500).json({
                message: 'Error saving crawl results',
                error: error.message,
            });
        }
    },
    // GET all crawl results with filters
    async getCrawlResults(req, res) {
        try {
            const { company, riskLevel, sentiment, limit = 50, skip = 0 } = req.query;
            // Build filter query
            const filter = {};
            if (company) {
                filter.company = { $regex: company, $options: 'i' };
            }
            if (riskLevel) {
                filter.riskLevel = riskLevel;
            }
            if (sentiment) {
                filter.sentiment = sentiment;
            }
            const articles = await NewsArticle_1.default.find(filter)
                .sort({ crawledAt: -1 })
                .limit(Number(limit))
                .skip(Number(skip));
            const total = await NewsArticle_1.default.countDocuments(filter);
            res.status(200).json({
                articles,
                total,
                limit: Number(limit),
                skip: Number(skip),
            });
        }
        catch (error) {
            console.error('Error fetching crawl results:', error);
            res.status(500).json({
                message: 'Error fetching crawl results',
                error: error.message,
            });
        }
    },
    // GET dashboard stats
    async getDashboardStats(req, res) {
        try {
            const total = await NewsArticle_1.default.countDocuments();
            const highRisk = await NewsArticle_1.default.countDocuments({ riskLevel: 'HIGH' });
            const mediumRisk = await NewsArticle_1.default.countDocuments({ riskLevel: 'MEDIUM' });
            const lowRisk = await NewsArticle_1.default.countDocuments({ riskLevel: 'LOW' });
            const sentimentStats = await NewsArticle_1.default.aggregate([
                {
                    $group: {
                        _id: '$sentiment',
                        count: { $sum: 1 },
                    },
                },
            ]);
            res.status(200).json({
                total,
                riskLevels: {
                    high: highRisk,
                    medium: mediumRisk,
                    low: lowRisk,
                },
                sentiment: sentimentStats.reduce((acc, item) => {
                    acc[item._id] = item.count;
                    return acc;
                }, {}),
            });
        }
        catch (error) {
            console.error('Error fetching dashboard stats:', error);
            res.status(500).json({
                message: 'Error fetching dashboard stats',
                error: error.message,
            });
        }
    },
    // GET companies list
    async getCompaniesList(req, res) {
        try {
            const companies = await NewsArticle_1.default.distinct('company');
            res.status(200).json({ companies });
        }
        catch (error) {
            console.error('Error fetching companies list:', error);
            res.status(500).json({
                message: 'Error fetching companies list',
                error: error.message,
            });
        }
    },
    // GET single crawl result by ID
    async getCrawlResultById(req, res) {
        try {
            const { id } = req.params;
            const article = await NewsArticle_1.default.findById(id);
            if (!article) {
                return res.status(404).json({ message: 'Article not found' });
            }
            res.status(200).json({ article });
        }
        catch (error) {
            console.error('Error fetching article by ID:', error);
            res.status(500).json({
                message: 'Error fetching article',
                error: error.message,
            });
        }
    },
    // GET latest result for a specific company
    async getLatestForCompany(req, res) {
        try {
            const { company } = req.params;
            const article = await NewsArticle_1.default.findOne({
                company: { $regex: company, $options: 'i' },
            }).sort({ crawledAt: -1 });
            if (!article) {
                return res.status(404).json({ message: 'No articles found for this company' });
            }
            res.status(200).json({ article });
        }
        catch (error) {
            console.error('Error fetching latest article for company:', error);
            res.status(500).json({
                message: 'Error fetching latest article',
                error: error.message,
            });
        }
    },
};
