import mongoose from "mongoose";
import dotenv from "dotenv";
import { Document } from "../models/Document";
import { Summary } from "../models/Summary";
import { Chat } from "../models/Chat";
import { Report } from "../models/Report";

dotenv.config();

async function migrateAddWorkspaceId() {
  try {
    console.log("Starting workspace ID migration...");

    // Connect to MongoDB
    const MONGODB_URI = process.env.MONGODB_URI;
    if (!MONGODB_URI) {
      throw new Error("MONGODB_URI is not set");
    }

    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    // Migrate Documents
    console.log("Migrating Documents...");
    const documentsWithoutWorkspace = await Document.find({
      workspaceId: { $exists: false },
    });
    console.log(
      `Found ${documentsWithoutWorkspace.length} documents without workspaceId`
    );

    for (const doc of documentsWithoutWorkspace) {
      // Set workspaceId to domain for existing documents (they were in the default workspace)
      await Document.updateOne(
        { _id: doc._id },
        { $set: { workspaceId: doc.domain } }
      );
      console.log(`Updated document ${doc.id} with workspaceId: ${doc.domain}`);
    }

    // Migrate Summaries
    console.log("Migrating Summaries...");
    const summariesWithoutWorkspace = await Summary.find({
      workspaceId: { $exists: false },
    });
    console.log(
      `Found ${summariesWithoutWorkspace.length} summaries without workspaceId`
    );

    for (const summary of summariesWithoutWorkspace) {
      // Set workspaceId to domain for existing summaries
      await Summary.updateOne(
        { _id: summary._id },
        { $set: { workspaceId: summary.domain } }
      );
      console.log(
        `Updated summary ${summary.id} with workspaceId: ${summary.domain}`
      );
    }

    // Migrate Chats
    console.log("Migrating Chats...");
    const chatsWithoutWorkspace = await Chat.find({
      workspaceId: { $exists: false },
    });
    console.log(
      `Found ${chatsWithoutWorkspace.length} chats without workspaceId`
    );

    for (const chat of chatsWithoutWorkspace) {
      // Set workspaceId to domain for existing chats
      await Chat.updateOne(
        { _id: chat._id },
        { $set: { workspaceId: chat.domain } }
      );
      console.log(`Updated chat ${chat.id} with workspaceId: ${chat.domain}`);
    }

    // Migrate Reports
    console.log("Migrating Reports...");
    const reportsWithoutWorkspace = await Report.find({
      workspaceId: { $exists: false },
    });
    console.log(
      `Found ${reportsWithoutWorkspace.length} reports without workspaceId`
    );

    for (const report of reportsWithoutWorkspace) {
      // Set workspaceId to domain for existing reports
      await Report.updateOne(
        { _id: report._id },
        { $set: { workspaceId: report.domain } }
      );
      console.log(
        `Updated report ${report.id} with workspaceId: ${report.domain}`
      );
    }

    console.log("Migration completed successfully!");

    // Verify migration
    console.log("Verifying migration...");
    const remainingDocs = await Document.countDocuments({
      workspaceId: { $exists: false },
    });
    const remainingSummaries = await Summary.countDocuments({
      workspaceId: { $exists: false },
    });
    const remainingChats = await Chat.countDocuments({
      workspaceId: { $exists: false },
    });
    const remainingReports = await Report.countDocuments({
      workspaceId: { $exists: false },
    });

    console.log(`Remaining documents without workspaceId: ${remainingDocs}`);
    console.log(
      `Remaining summaries without workspaceId: ${remainingSummaries}`
    );
    console.log(`Remaining chats without workspaceId: ${remainingChats}`);
    console.log(`Remaining reports without workspaceId: ${remainingReports}`);
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrateAddWorkspaceId().catch(console.error);
}

export { migrateAddWorkspaceId };
