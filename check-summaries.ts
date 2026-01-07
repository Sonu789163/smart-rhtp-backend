import mongoose from "mongoose";
import { Summary } from "./models/Summary";
import dotenv from "dotenv";

dotenv.config();

async function check() {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/ai_platform");
    const count = await Summary.countDocuments();
    console.log("Total summaries:", count);
    const latest = await Summary.findOne().sort({ updatedAt: -1 });
    console.log("Latest summary:", JSON.stringify(latest, null, 2));
    process.exit(0);
}

check().catch(err => {
    console.error(err);
    process.exit(1);
});
