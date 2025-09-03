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
    ALLOWED_DOMAINS: [
        "excollo.com", // Current client domain
        // Add more domains as needed:
        // "client2.com",
        // "client3.com",
    ],
    // Special allowed emails from other domains (exceptions)
    ALLOWED_SPECIAL_EMAILS: [
        "test@gmail.com", // Special exception user
    ],
    // Default role for new users (first user becomes admin automatically)
    DEFAULT_USER_ROLE: "user",
    // Whether to allow multiple domains or restrict to single domain
    ALLOW_MULTIPLE_DOMAINS: false,
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
    // Check if domain matches any allowed domain
    return exports.DOMAIN_CONFIG.ALLOWED_DOMAINS.some((allowedDomain) => {
        if (exports.DOMAIN_CONFIG.VALIDATION.ALLOW_SUBDOMAINS) {
            // Allow subdomains (e.g., user.subdomain.excollo.com matches excollo.com)
            return domain === allowedDomain || domain.endsWith("." + allowedDomain);
        }
        else {
            // Exact domain match only
            return domain === allowedDomain;
        }
    });
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
    // Find the matching allowed domain
    const allowedDomain = exports.DOMAIN_CONFIG.ALLOWED_DOMAINS.find((allowedDomain) => {
        if (exports.DOMAIN_CONFIG.VALIDATION.ALLOW_SUBDOMAINS) {
            return domain === allowedDomain || domain.endsWith("." + allowedDomain);
        }
        else {
            return domain === allowedDomain;
        }
    });
    return allowedDomain || null;
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
    // Check domain restriction
    if (!isEmailDomainAllowed(email)) {
        const allowedDomains = exports.DOMAIN_CONFIG.ALLOWED_DOMAINS.join(", ");
        return {
            isValid: false,
            error: `Email domain not allowed. Only emails from these domains are accepted: ${allowedDomains}`,
        };
    }
    return { isValid: true };
}
