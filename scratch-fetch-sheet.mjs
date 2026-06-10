import { google } from "googleapis";
import fs from "fs";

const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, "\n");

if (!email || !key) {
  console.error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_KEY");
  process.exit(1);
}

const spreadsheetId = "1p6ILP4rv6NF4u6MaUfhkI4zZtATkuhsfOF0XWlz-DS8";
const targetGid = 1176200280;

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: email,
    private_key: key,
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

const sheets = google.sheets({ version: "v4", auth });

try {
  const info = await sheets.spreadsheets.get({ spreadsheetId });
  const allSheets = info.data.sheets || [];
  const foundSheet = allSheets.find(s => s.properties?.sheetId === targetGid);
  const targetSheetTitle = foundSheet?.properties?.title || "Sheet1";
  
  console.log(`Target Sheet Title: ${targetSheetTitle}`);
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${targetSheetTitle}'!A1:AZ300`,
  });
  
  const rows = response.data.values;
  fs.writeFileSync("test-fetch.json", JSON.stringify(rows, null, 2));
  console.log(`Fetched ${rows?.length} rows and wrote to test-fetch.json`);
} catch (err) {
  console.error("Error fetching sheet:", err);
}
