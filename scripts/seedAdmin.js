const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

// Connect to MongoDB
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://Sonu7891:Sonu1234@cluster0.qfv4x.mongodb.net/pdf-summarizer";

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// User Schema (copy from models/User.ts)
const userSchema = new mongoose.Schema({
  microsoftId: { type: String, unique: true, sparse: true },
  name: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String },
  role: { type: String, enum: ["admin", "user"], default: "user", index: true },
  status: {
    type: String,
    enum: ["active", "suspended"],
    default: "active",
    index: true,
  },
  refreshTokens: { type: [{ type: String }], default: [] },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date, default: Date.now },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
});

const User = mongoose.model("User", userSchema);

async function seedAdmin() {
  try {
    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: "admin" });
    if (existingAdmin) {
      console.log("Admin user already exists:", existingAdmin.email);
      return;
    }

    // Create admin user
    const adminPassword = "Admin@123"; // Change this to a secure password
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    const adminUser = new User({
      email: "admin@rhp.com",
      name: "System Administrator",
      password: hashedPassword,
      role: "admin",
      status: "active",
    });

    await adminUser.save();
    console.log("Admin user created successfully:", adminUser.email);
    console.log("Password:", adminPassword);
    console.log("Please change this password after first login!");
  } catch (error) {
    console.error("Error creating admin user:", error);
  }
}

async function updateExistingUsers() {
  try {
    // Update all existing users to have role 'user' and status 'active'
    const result = await User.updateMany(
      { role: { $exists: false } },
      {
        $set: {
          role: "user",
          status: "active",
        },
      }
    );

    console.log(
      `Updated ${result.modifiedCount} existing users with default role and status`
    );
  } catch (error) {
    console.error("Error updating existing users:", error);
  }
}

async function run() {
  try {
    await updateExistingUsers();
    await seedAdmin();
    console.log("Seeding completed successfully");
  } catch (error) {
    console.error("Seeding failed:", error);
  } finally {
    mongoose.connection.close();
  }
}

run();
