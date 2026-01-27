"use strict";
/**
 * Company Name Normalization Utility
 *
 * Normalizes company names for duplicate detection and fuzzy matching.
 * Removes common suffixes, special characters, and standardizes format.
 */
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeCompanyName = normalizeCompanyName;
exports.calculateSimilarity = calculateSimilarity;
exports.findSimilarDirectories = findSimilarDirectories;
function normalizeCompanyName(name) {
    if (!name || typeof name !== 'string') {
        return '';
    }
    // Step 1: Convert to lowercase and trim
    let normalized = name.toLowerCase().trim();
    // Step 2: Remove common company suffixes/prefixes
    const suffixes = [
        'pvt ltd', 'private limited', 'ltd', 'limited',
        'inc', 'incorporated', 'corp', 'corporation',
        'llc', 'llp', 'plc', 'sa', 'ag', 'gmbh',
        'pvt', 'private', 'co', 'company'
    ];
    suffixes.forEach(suffix => {
        // Match suffix at end of string (with optional punctuation)
        const regex = new RegExp(`\\s+${suffix}(\\.|,|$|\\s)`, 'gi');
        normalized = normalized.replace(regex, ' ').trim();
        // Also check if suffix is at the end without space
        if (normalized.endsWith(suffix)) {
            normalized = normalized.slice(0, -suffix.length).trim();
        }
    });
    // Step 3: Remove special characters (keep spaces and alphanumeric)
    normalized = normalized.replace(/[^\w\s]/g, ' ');
    // Step 4: Normalize whitespace (multiple spaces to single space)
    normalized = normalized.replace(/\s+/g, ' ').trim();
    return normalized;
}
/**
 * Calculate similarity score between two strings using Levenshtein distance
 * Returns a percentage (0-100)
 */
function calculateSimilarity(str1, str2) {
    if (!str1 || !str2)
        return 0;
    if (str1 === str2)
        return 100;
    const len1 = str1.length;
    const len2 = str2.length;
    const maxLen = Math.max(len1, len2);
    if (maxLen === 0)
        return 100;
    // Calculate Levenshtein distance
    const distance = levenshteinDistance(str1, str2);
    // Convert to similarity percentage
    return ((maxLen - distance) / maxLen) * 100;
}
/**
 * Levenshtein distance algorithm
 */
function levenshteinDistance(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    // Create DP table
    const dp = Array(m + 1)
        .fill(null)
        .map(() => Array(n + 1).fill(0));
    // Initialize base cases
    for (let i = 0; i <= m; i++) {
        dp[i][0] = i;
    }
    for (let j = 0; j <= n; j++) {
        dp[0][j] = j;
    }
    // Fill DP table
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            }
            else {
                dp[i][j] = Math.min(dp[i - 1][j] + 1, // deletion
                dp[i][j - 1] + 1, // insertion
                dp[i - 1][j - 1] + 1 // substitution
                );
            }
        }
    }
    return dp[m][n];
}
async function findSimilarDirectories(searchName, workspaceId, threshold = 80) {
    const { Directory } = await Promise.resolve().then(() => __importStar(require('../models/Directory')));
    const normalized = normalizeCompanyName(searchName);
    if (!normalized) {
        return [];
    }
    // Get all directories in the workspace
    const directories = await Directory.find({
        workspaceId,
        parentId: null // Only top-level directories (company directories)
    });
    const matches = [];
    for (const dir of directories) {
        const dirNormalized = dir.normalizedName || normalizeCompanyName(dir.name);
        // Calculate similarity
        const similarity = calculateSimilarity(normalized, dirNormalized);
        if (similarity >= threshold) {
            matches.push({
                id: dir.id,
                name: dir.name,
                normalizedName: dirNormalized,
                similarity: Math.round(similarity * 100) / 100, // Round to 2 decimal places
                documentCount: dir.documentCount || 0,
                drhpCount: dir.drhpCount || 0,
                rhpCount: dir.rhpCount || 0,
                lastDocumentUpload: dir.lastDocumentUpload,
            });
        }
    }
    // Sort by similarity (descending)
    return matches.sort((a, b) => b.similarity - a.similarity);
}
