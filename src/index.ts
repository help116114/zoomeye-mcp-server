import axios, { AxiosInstance } from "axios";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ErrorCode, ListResourcesRequestSchema, ListToolsRequestSchema, McpError, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const API_KEY = process.env.ZOOMEYE_API_KEY || "";
if (!API_KEY) {
  console.error("Missing ZOOMEYE_API_KEY environment variable");
  process.exit(1);
}

class ZoomEyeClient {
  private axios: AxiosInstance;
  constructor(apiKey: string) {
    this.axios = axios.create({
      baseURL: "https://api.zoomeye.org",
      headers: { "API-KEY": apiKey }
    });
  }

  private sample(data: any, maxItems: number, fields?: string[]) {
    const matches = Array.isArray(data.matches) ? data.matches : [];
    const sliced = matches.slice(0, maxItems);
    return {
      total: data.total,
      matches: fields
        ? sliced.map((item: any) =>
            fields.reduce((acc: any, f: string) => {
              acc[f] = item[f];
              return acc;
            }, {})
          )
        : sliced
    };
  }

  async getAccountInfo() {
    const res = await this.axios.get("/resources-info");
    return res.data;
  }

  async searchHost(query: string, page = 1, facets: string[] = []) {
    const res = await this.axios.get("/host/search", {
      params: { query, page, facet: facets.join(",") }
    });
    return this.sample(res.data, 10);
  }

  async searchWeb(query: string, page = 1, facets: string[] = []) {
    const res = await this.axios.get("/web/search", {
      params: { query, page, facet: facets.join(",") }
    });
    return this.sample(res.data, 10);
  }

  async historyIP(ip: string) {
    // Note: requires paid plan; endpoint documented at zoomeye.org/doc#history-ip-search
    const res = await this.axios.get("/host/history", { params: { ip } });
    return res.data;
  }

  summarize(data: any) {
    // build top countries, ports, etc.
    // ...similar logic as Shodan’s summarizeResults...
    return /* summary */;
  }
}

async function main() {
  const client = new ZoomEyeClient(API_KEY);
  const server = new Server({ name: "zoomeye-mcp-server", version: "0.1.0" }, { capabilities: {resources: {}, tools: {}} });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: "zoomeye://account",
        name: "Account Info",
        description: "ZoomEye account plan and quota",
        mimeType: "application/json"
      }
    ]
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async ({ params }: any) => {
    if (params.uri === "zoomeye://account") {
      const info = await client.getAccountInfo();
      return {
        contents: [{ uri: params.uri, text: JSON.stringify(info, null, 2), mimeType: "application/json" }]
      };
    }
    throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${params.uri}`);
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "get_account_info",
        description: "Fetch ZoomEye plan and quota",
        inputSchema: { type: "object", properties: {}, required: [] }
      },
      {
        name: "search_host",
        description: "Search hosts in ZoomEye database",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            page: { type: "number" },
            facets: { type: "array", items: { type: "string" } }
          },
          required: ["query"]
        }
      },
      {
        name: "search_web",
        description: "Search web resources in ZoomEye database",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            page: { type: "number" },
            facets: { type: "array", items: { type: "string" } }
          },
          required: ["query"]
        }
      },
      {
        name: "get_history_ip",
        description: "(Paid) Fetch historical data for an IP",
        inputSchema: { type: "object", properties: { ip: { type: "string" } }, required: ["ip"] }
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async ({ params }: any) => {
    switch (params.name) {
      case "get_account_info":
        return { content: [{ type: "text", text: JSON.stringify(await client.getAccountInfo(), null, 2) }] };
      case "search_host":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(await client.searchHost(params.arguments.query, params.arguments.page, params.arguments.facets), null, 2)
            }
          ]
        };
      case "search_web":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(await client.searchWeb(params.arguments.query, params.arguments.page, params.arguments.facets), null, 2)
            }
          ]
        };
      case "get_history_ip":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(await client.historyIP(params.arguments.ip), null, 2)
            }
          ]
        };
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${params.name}`);
    }
  });

  await server.connect(new StdioServerTransport());
  console.error("ZoomEye MCP server running");
}

main().catch(e => {
  console.error("Server error:", e);
  process.exit(1);
});
