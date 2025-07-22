const fs = require("fs");
const mongoose = require("mongoose");
const { GridFSBucket, ObjectId } = require("mongodb");
const path = require("path");

// --- CONFIGURE THESE ---
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://Sonu7891:Sonu1234@cluster0.qfv4x.mongodb.net/pdf-summarizer";

// List of summaries to update: [{ id: 'summaryId', file: '/path/to/file.pdf' }]
const updates = [
  {
    _id: {
      $oid: "6836ec1b93094196f7f789d1",
    },
    id: "session_c89c97a5-5970-444f-8aa8-1e016eba647a",
    name: "Solarium Green Energy Limited",
    file: "C:/Users/91789/Downloads/Documents/SOLARIUM GREEN ENERGY LIMITED-DRHP.pdf",
  },
  {
    _id: {
      $oid: "6836ec1b93094196f7f789d2",
    },
    id: "session_c89c97a5-5970-444f-8aa8-1e016eba647b",
    name: "Monarch Surveyors and Engineering Consultants Limited",
    file: "C:/Users/91789/Downloads/Documents/MONARCH SURVEYORS AND ENGINEERING CONSULTANTS LIMITED-DRHP.pdf",
  },
  {
    _id: {
      $oid: "6836ec1b93094196f7f789d3",
    },
    id: "session_46208d20-3409-44f2-9184-d9e87f5412a8",
    name: "Virtual Galaxy Infotech Limited",
    file: "C:/Users/91789/Downloads/Documents/VIRTUAL GALAXY INFOTECH LIMITED-DRHP.pdf",
  },
  {
    _id: {
      $oid: "6836ec1b93094196f7f789d4",
    },
    id: "session_44149ba8-9eb4-493c-a84a-4b88561b2b59",
    name: "Classic Electrodes (India) Limited",
    file: "C:/Users/91789/Downloads/Documents/CLASSIC ELECTRODES (INDIA) LIMITED-DRHP.pdf",
  },
  {
    _id: {
      $oid: "685bced42f2c73788414f058",
    },
    id: "session_302f83c9-391f-441b-a9f0-6c0337bc299d",
    name: "Vandan Foods Limited",
    file: "C:/Users/91789/Downloads/Documents/VANDAN FOODS LIMITED-DRHP.pdf",
  },
  {
    _id: {
      $oid: "685bd32e2f2c73788414f079",
    },
    id: "session_3c06be18-d6a8-417c-81c9-16971adfe652",
    name: "Integrum Energy Infrastructure Limited",
    file: "C:/Users/91789/Downloads/Documents/INTEGRUM ENERGY INFRASTRUCTURE LIMITED-DRHP.pdf",
  },
  {
    _id: {
      $oid: "685bd9f92f2c73788414f0ac",
    },
    id: "session_4c736fa8-13a9-4241-868f-478318057d06",
    name: "current-infraprojects.pdf",
    file: "C:/Users/91789/Downloads/Documents/Registration_31032025193330_DRHP.pdf",
  },
  {
    _id: {
      $oid: "685bdb1c2882c3dc5e74bf88",
    },
    id: "session_302f83c9-391f-441b-a9f0-6c0337bc299a",
    name: "Axiom Gas Engineering Limited",
    file: "C:/Users/91789/Downloads/Documents/AXIOM GAS ENGINEERING LIMITED-DRHP.pdf",
  },
  {
    _id: {
      $oid: "685be4599c1d07125daa62c3",
    },
    id: "session_302f83c9-391f-441b-a9f0-6c0320bc299a",
    name: "CURRENT-INFRAPROJECTS-LIMITED",
    file: "C:/Users/91789/Downloads/Documents/Registration_31032025193330_DRHP.pdf",
  },
  {
    _id: {
      $oid: "685be4ca9c1d07125daa62c4",
    },
    id: "session_302f83c9-391f-441b-a9f0-6c0337bc209a",
    name: "Influx Healthtech Limited",
    file: "C:/Users/91789/Downloads/Documents/INFLUX HEALTHTECH LIMITED-DRHP.pdf",
  },
  {
    _id: {
      $oid: "685be53b9c1d07125daa62c5",
    },
    id: "session_302f83c9-391f-441b-a9f0-6c0337bc229a",
    name: "GEOSYS-INDIA-INFRASTRUCTURES-LIMITED",
    file: "C:/Users/91789/Downloads/Documents/GEOSYS INDIA INFRASTRUCTURES LIMITED-DRHP.pdf",
  },
  {
    _id: {
      $oid: "685be58c9c1d07125daa62c6",
    },
    id: "session_302f83c9-391f-441b-a9f0-6c0337bc249a",
    name: "INFINITY-INFOWAY-LIMITED",
    file: "C:/Users/91789/Downloads/Documents/INFINITY INFOWAY LIMITED-DRHP.pdf",
  },
  {
    _id: {
      $oid: "6863af2550056ec6a9862c78",
    },
    id: "session_e6a1cb43-16d1-48c4-a6b5-c430e5206fca",
    name: "Meta Infotech Limited",
    file: "C:/Users/91789/Downloads/Documents/Meta-Infotech-Limited-DRHP.pdf",
  },
  {
    _id: {
      $oid: "6863d8e53c95218c6967e1fc",
    },
    id: "session_949b1232-4670-4929-b4ea-c98eab7b83ef",
    name: "Shri Hare-Krishna Sponge Iron Limited",
    file: "C:/Users/91789/Downloads/Documents/Shri Hare-Krishna Sponge Iron Limited-DRHP.pdf",
  },
  {
    _id: {
      $oid: "6864a92faa17295ee7130849",
    },
    id: "session_bebe29b6-ca92-458f-8c54-07af108504b9",
    name: "Chemkart India Limited",
    file: "C:/Users/91789/Downloads/Documents/Chemkart India Limited-DRHP.pdf",
  },
  {
    _id: {
      $oid: "68660fc9cba0ba75c0290b69",
    },
    id: "68660fc5cba0ba75c0290b59",
    name: "B. D. Industries (Pune) Limited",
    file: "C:/Users/91789/Downloads/Documents/B. D. Industries (Pune) Limited-DRHP.pdf",
  },
  {
    _id: {
      $oid: "68661295cba0ba75c0290ba7",
    },
    id: "6866128fcba0ba75c0290b93",
    name: "Moving Media Entertainment Limited",
    file: "C:/Users/91789/Downloads/Documents/Moving Media Entertainment Limited-DRHP.pdf",
  },
  {
    _id: {
      $oid: "68661365cba0ba75c0290bd2",
    },
    id: "68661362cba0ba75c0290bbc",
    name: "Vidya-Wires-Ltd-DRHP",
    file: "C:/Users/91789/Downloads/Documents/Vidya-Wires-Ltd-DRHP.pdf",
  },
  {
    _id: {
      $oid: "686cae2fdf2f50f46328f35c",
    },
    id: "686cae2ddf2f50f46328f338",
    name: "Ecoline Exim Limited",
    file: "C:/Users/91789/Downloads/Documents/Ecoline Exim Limited-DRHP.pdf",
  },
  {
    _id: {
      $oid: "686caec1df2f50f46328f395",
    },
    id: "686caec1df2f50f46328f37b",
    name: "Umiya Mobile Limited",
    file: "C:/Users/91789/Downloads/Documents/Umiya Mobile Limited-DRHP.pdf",
  },
  {
    _id: {
      $oid: "686caf98df2f50f46328f3cb",
    },
    id: "686caf97df2f50f46328f3b4",
    name: "Vikran Engineering Limited (formerly Vikran Engineering & Exim Private Limited)",
    file: "C:/Users/91789/Downloads/Documents/VIKRAN ENGINEERING LIMITED-DRHP.pdf",
  },
  {
    _id: {
      $oid: "686e1a32e91714334fae28de",
    },
    id: "686e1a2ce91714334fae28cc",
    name: "Savy Infra and Logistics Limited",
    file: "C:/Users/91789/Downloads/Documents/Savy Infra and Logistics Limited-DRHP.pdf",
  },
  {
    _id: {
      $oid: "686e1ae2e91714334fae2908",
    },
    id: "686e1adfe91714334fae28f7",
    name: "Takyon Networks Limited",
    file: "C:/Users/91789/Downloads/Documents/Takyon Networks Limited-DRHP.pdf",
  },
  {
    _id: {
      $oid: "6870abd2535405a98ee2aa5e",
    },
    id: "6870abcc535405a98ee2aa34",
    name: "Amanta-DRHP",
    file: "C:/Users/91789/Downloads/Documents/Amanta-DRHP.pdf",
  },
  {
    _id: {
      $oid: "6870ac90535405a98ee2aa95",
    },
    id: "6870ac88535405a98ee2aa77",
    name: "Monika Alcobev Limited",
    file: "C:/Users/91789/Downloads/Documents/DRHP MAL_20250414233235.pdf",
  },
  {
    _id: {
      $oid: "6877a6b1106ef1b0337c88ef",
    },
    id: "6877a6a8106ef1b0337c88cf",
    name: "Sri Lotus Developers and Realty Limited",
    file: "C:/Users/91789/Downloads/Documents/SRI LOTUS DEVELOPERS AND REALTY LIMITED-DRHP.pdf",
  },
  {
    _id: {
      $oid: "687c9fca2aa6e68d8b8df057",
    },
    id: "687c9fc32aa6e68d8b8df02c",
    name: "Neetu Yoshi DRHP.pdf",
    file: "C:/Users/91789/Downloads/Documents/Neetu Yoshi DRHP.pdf",
  },
];

const Summary = require("./dist/models/Summary").Summary;

if (!Summary) {
  console.error(
    'Could not load Summary model. Make sure you have run "npm run build" in the smart-rhtp-backend directory.'
  );
  process.exit(1);
}

async function replaceSummaryFile(summaryId, filePath, bucket) {
  // 1. Find the summary
  const summary = await Summary.findOne({ id: summaryId });
  if (!summary) {
    console.error(`Summary not found: ${summaryId}`);
    return;
  }
  const oldFileId = summary.pdfFileId;

  // 2. Upload new file to GridFS
  const filename = path.basename(filePath);
  const uploadStream = bucket.openUploadStream(filename, {
    contentType: "application/pdf",
  });
  fs.createReadStream(filePath).pipe(uploadStream);
  const newFileId = await new Promise((resolve, reject) => {
    uploadStream.on("finish", () => resolve(uploadStream.id));
    uploadStream.on("error", reject);
  });

  // 3. Update the summary's pdfFileId
  summary.pdfFileId = newFileId;
  await summary.save();

  // 4. Optionally, delete the old file from GridFS
  if (oldFileId && oldFileId.toString() !== newFileId.toString()) {
    try {
      await bucket.delete(new ObjectId(oldFileId));
      console.log(`Old file deleted for summary ${summaryId}`);
    } catch (err) {
      console.warn(
        `Could not delete old file for summary ${summaryId}:`,
        err.message
      );
    }
  }

  console.log(`Updated summary ${summaryId} with new pdfFileId: ${newFileId}`);
}

(async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: "uploads",
    });

    for (const { id, file } of updates) {
      try {
        await replaceSummaryFile(id, file, bucket);
      } catch (err) {
        console.error(`Failed to update summary ${id}:`, err);
      }
    }
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
})();
