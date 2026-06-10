const { google } = require('googleapis');
const fs = require('fs');

const envPath = './.env.local';
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const m = line.match(/^\s*([^#=]+)\s*=\s*(.*)$/);
  if (m) {
    let val = m[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    env[m[1].trim()] = val;
  }
});

const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const key = env.GOOGLE_SERVICE_ACCOUNT_KEY ? env.GOOGLE_SERVICE_ACCOUNT_KEY.replace(/\\n/g, '\n') : '';

async function run() {
  const sheetUrl = 'https://docs.google.com/spreadsheets/d/1p6ILP4rv6NF4u6MaUfhkI4zZtATkuhsfOF0XWlz-DS8/edit?gid=128427082#gid=128427082';
  const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error("Invalid URL");
  const spreadsheetId = match[1];

  const gidMatch = sheetUrl.match(/gid=([0-9]+)/);
  const targetGid = gidMatch ? parseInt(gidMatch[1]) : null;

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: email,
      private_key: key,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const info = await sheets.spreadsheets.get({ spreadsheetId });
  const allSheets = info.data.sheets || [];
  let targetSheetTitle = allSheets[0]?.properties?.title || 'Sheet1';

  if (targetGid !== null) {
    const foundSheet = allSheets.find(s => s.properties?.sheetId === targetGid);
    if (foundSheet && foundSheet.properties?.title) {
      targetSheetTitle = foundSheet.properties.title;
    }
  }

  const range = `'${targetSheetTitle}'!A1:Z500`;
  console.log('Fetching range:', range);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = response.data.values;
  fs.writeFileSync('C:/Users/JYP/.gemini/antigravity/brain/50ac667a-b1b7-4d18-83a4-1b75d12a04fd/scratch/sheet_debug.json', JSON.stringify(rows, null, 2));
  console.log('Saved data count:', rows ? rows.length : 0);
}

run().catch(console.error);
