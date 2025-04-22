// export.js
import fs from "fs";
import path from "path";
import axios from "axios";

// Re–declare your client here, or pull it in if you’ve factored it out:
// (This is essentially the same as in build/index.js)
class ZoomEyeClient {
  constructor(apiKey) {
    this.axios = axios.create({
      baseURL: "https://api.zoomeye.org",
      headers: { Authorization: `JWT ${apiKey}` }
    });
  }
  // a simplified sampler: just returns matches[]
  async searchHost(query, page = 1) {
    const res = await this.axios.get("/host/search", {
      params: { query, page }
    });
    return res.data.matches.slice(0, 10);
  }
}

async function main() {
  const key = process.env.ZOOMEYE_API_KEY;
  if (!key) {
    console.error("❌ Set ZOOMEYE_API_KEY in your env first");
    process.exit(1);
  }

  const client = new ZoomEyeClient(key);
  const query = "net:110.111.222.0/22 device_type:webcam";

  console.log(`🔍 Running search: ${query}`);
  const matches = await client.searchHost(query);

  if (!matches.length) {
    console.log("No results found.");
    return;
  }

  // Build CSV header from all unique fields in the first result
  const fields = Object.keys(matches[0]);
  const header = fields.join(",");
  const rows = matches.map(item =>
    fields.map(f => JSON.stringify(item[f] ?? "")).join(",")
  );

  const csv = [header, ...rows].join("\n");
  const outPath = path.resolve(process.cwd(), "results.csv");
  fs.writeFileSync(outPath, csv, "utf8");

  console.log(`✅ Wrote ${matches.length} rows to ${outPath}`);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
