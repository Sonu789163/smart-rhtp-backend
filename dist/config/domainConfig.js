"use strict";
// Domain Configuration for User Management
// Change this when handing over to different clients
Object.defineProperty(exports, "__esModule", { value: true });
exports.DOMAIN_CONFIG = void 0;
exports.isEmailDomainAllowed = isEmailDomainAllowed;
exports.getPrimaryDomain = getPrimaryDomain;
exports.validateEmail = validateEmail;
exports.DOMAIN_CONFIG = {
    // Allowed email domains for user registration
    ALLOWED_DOMAINS: [], // Allow all domains
    // Special allowed emails from other domains (exceptions)
    ALLOWED_SPECIAL_EMAILS: [
        "test@gmail.com", // Special exception user
    ],
    // Default role for new users (first user becomes admin automatically)
    DEFAULT_USER_ROLE: "user",
    // Whether to allow multiple domains or restrict to single domain
    ALLOW_MULTIPLE_DOMAINS: true,
    // Custom domain validation rules
    VALIDATION: {
        // Minimum email length
        MIN_EMAIL_LENGTH: 5,
        // Maximum email length
        MAX_EMAIL_LENGTH: 254,
        // Whether to allow subdomains (e.g., user.subdomain.excollo.com)
        ALLOW_SUBDOMAINS: true,
    },
};
// Helper function to check if email domain is allowed
function isEmailDomainAllowed(email) {
    var _a;
    if (!email || typeof email !== "string")
        return false;
    // Check if this is a special allowed email (exception)
    if (exports.DOMAIN_CONFIG.ALLOWED_SPECIAL_EMAILS.includes(email.toLowerCase())) {
        return true;
    }
    const domain = (_a = email.split("@")[1]) === null || _a === void 0 ? void 0 : _a.toLowerCase();
    if (!domain)
        return false;
    // Allow all domains
    return true;
}
// Helper function to get the primary domain from email
function getPrimaryDomain(email) {
    var _a;
    if (!email || typeof email !== "string")
        return null;
    // Check if this is a special allowed email (exception)
    if (exports.DOMAIN_CONFIG.ALLOWED_SPECIAL_EMAILS.includes(email.toLowerCase())) {
        // For special emails, use a special domain identifier
        return "special";
    }
    const domain = (_a = email.split("@")[1]) === null || _a === void 0 ? void 0 : _a.toLowerCase();
    if (!domain)
        return null;
    // Return the raw domain (allow all domains)
    return domain;
}
// Helper function to validate email format and domain
function validateEmail(email) {
    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return { isValid: false, error: "Invalid email format" };
    }
    // Check email length
    if (email.length < exports.DOMAIN_CONFIG.VALIDATION.MIN_EMAIL_LENGTH) {
        return {
            isValid: false,
            error: `Email must be at least ${exports.DOMAIN_CONFIG.VALIDATION.MIN_EMAIL_LENGTH} characters`,
        };
    }
    if (email.length > exports.DOMAIN_CONFIG.VALIDATION.MAX_EMAIL_LENGTH) {
        return {
            isValid: false,
            error: `Email must be no more than ${exports.DOMAIN_CONFIG.VALIDATION.MAX_EMAIL_LENGTH} characters`,
        };
    }
    return { isValid: true };
}
