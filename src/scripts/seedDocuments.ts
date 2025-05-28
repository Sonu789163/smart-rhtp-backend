import mongoose from "mongoose";
import { Document } from "../models/Document";

const documents = [
  {
    id: "session_c89c97a5-5970-444f-8aa8-1e016eba647a",
    name: "DRHP_Solarium_20240911234442.pdf",
    namespace: "DRHP_Solarium_20240911234442.pdf",
    uploadedAt: "2025-05-28T07:05:25.537Z",
  },
  {
    id: "session_c89c97a5-5970-444f-8aa8-1e016eba647b",
    name: "DRHP_Monarch_28.09.2024_20240928220829.pdf",
    namespace: "DRHP_Monarch_28.09.2024_20240928220829.pdf",
    uploadedAt: "2025-05-28T06:59:20.019Z",
  },
  {
    id: "session_46208d20-3409-44f2-9184-d9e87f5412a8",
    name: "https_www.vgipl.com_documents_VirtualGalaxy-DRHP-29-10-2024.pdf",
    namespace:
      "https_www.vgipl.com_documents_VirtualGalaxy-DRHP-29-10-2024.pdf",
    uploadedAt: "2025-05-27T11:42:55.220Z",
  },
  {
    id: "session_44149ba8-9eb4-493c-a84a-4b88561b2b59",
    name: "DRHP-Classic-Electrodes-India-Limited.pdf",
    namespace: "DRHP-Classic-Electrodes-India-Limited.pdf",
    uploadedAt: "2025-05-27T08:05:12.830Z",
  },
];

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://Sonu7891:Sonu1234@cluster0.qfv4x.mongodb.net/pdf-summarizer";

async function seedDocuments() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    // Clear existing documents
    await Document.deleteMany({});
    console.log("Cleared existing documents");

    // Insert new documents
    await Document.insertMany(documents);
    console.log("Successfully seeded documents");

    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  } catch (error) {
    console.error("Error seeding documents:", error);
    process.exit(1);
  }
}

seedDocuments();
