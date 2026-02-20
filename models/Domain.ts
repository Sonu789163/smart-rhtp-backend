import mongoose from "mongoose";

const domainSchema = new mongoose.Schema({
  domainId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  domainName: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ["active", "suspended", "deleted"],
    default: "active",
    index: true,
  },

  // ── Feature Toggles ──
  investor_match_only: { type: Boolean, default: false },
  valuation_matching: { type: Boolean, default: false },
  adverse_finding: { type: Boolean, default: false },
  target_investors: { type: [String], default: [] },          // Admin-input: investor names to prioritize
  matched_investors: { type: mongoose.Schema.Types.Mixed, default: [] },  // Pipeline output: matched investor results

  // ── SOP Storage (populated by Onboarding Agent) ──
  sop_text: { type: String, default: "" },               // Original uploaded SOP text
  custom_summary_sop: { type: String, default: "" },     // Structured/processed SOP template

  // ── Onboarding Agent Outputs ──
  // Task 1: Custom subqueries (refactored from default 10)
  custom_subqueries: { type: [String], default: [] },
  subquery_analysis: { type: mongoose.Schema.Types.Mixed, default: {} },
  subquery_changes_log: { type: [String], default: [] },

  // Task 2: Customized Agent 3 prompt (Summarization Agent)
  agent3_prompt: { type: String, default: "" },

  // Task 3: Customized Agent 4 prompt (Validation Agent)
  agent4_prompt: { type: String, default: "" },
  custom_validator_prompt: { type: String, default: "" }, // backward compat

  // Legacy fields
  validator_checklist: { type: [String], default: [] },

  // ── Onboarding Metadata ──
  onboarding_status: {
    type: String,
    enum: ["pending", "processing", "completed", "completed_no_sop", "failed"],
    default: "pending",
  },
  last_onboarded: { type: Date, default: null },
});

// Generate domainId before saving
domainSchema.pre("save", async function (next) {
  if (!this.domainId) {
    // Generate domainId from domainName (slug format)
    const slug = this.domainName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    this.domainId = `domain_${slug}_${Date.now()}`;
  }
  this.updatedAt = new Date();
  next();
});

// Index for efficient queries
domainSchema.index({ domainName: 1, status: 1 });
domainSchema.index({ domainId: 1, status: 1 });

export const Domain = mongoose.model("Domain", domainSchema);
