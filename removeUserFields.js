// scripts/removeUserFields.js
const mongoose = require("mongoose");

async function removeUserFields() {
  await mongoose.connect(
    "mongodb+srv://Sonu7891:Sonu1234@cluster0.qfv4x.mongodb.net/pdf-summarizer"
  ); // Update with your connection string

  await mongoose.connection
    .collection("documents")
    .updateMany({}, { $unset: { userId: "" } });
  await mongoose.connection
    .collection("summaries")
    .updateMany({}, { $unset: { userId: "" } });
  await mongoose.connection
    .collection("reports")
    .updateMany({}, { $unset: { userId: "" } });

  console.log(
    "Removed userId and microsoftId from all documents, summaries, and reports."
  );
  await mongoose.disconnect();
}

removeUserFields();


