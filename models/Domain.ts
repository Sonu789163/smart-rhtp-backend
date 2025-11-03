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

