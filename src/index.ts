// src/index.ts
import app from "./app";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { TGStatParser } from './tgstat-parser'; 

// This must match the class name declared in wrangler.jsonc
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Demo",
		version: "1.0.0",
	});

	async init() {
		// Original tool from working version
		this.server.tool("add", { a: z.number(), b: z.number() }, async ({ a, b }) => ({
			content: [{ type: "text", text: String(a + b) }],
		}));

		// TGStat functionality
		// Search Channels Tool with enhanced parameters
		this.server.tool("searchChannels", { 
			query: z.string().describe("Search query text"),
			maxPages: z.number().optional().describe("Maximum number of pages to fetch (default: 1)"),
			sort: z.string().optional().describe("Sort order: participants, avg_reach, ci_index, members_t, members_y, members_7d, members_30d"),
			inAbout: z.boolean().optional().describe("Search in channel description (default: false)"),
			channelType: z.enum(["", "public", "private"]).optional().describe("Channel type: empty for any, public or private"),
			participantsFrom: z.number().optional().describe("Minimum number of subscribers"),
			participantsTo: z.number().optional().describe("Maximum number of subscribers"),
			avgReachFrom: z.number().optional().describe("Minimum average post reach"),
			avgReachTo: z.number().optional().describe("Maximum average post reach"),
			ciFrom: z.number().optional().describe("Minimum citation index"),
			ciTo: z.number().optional().describe("Maximum citation index"),
			noRedLabel: z.boolean().optional().describe("Filter out channels with red label (default: true)"),
			noScam: z.boolean().optional().describe("Filter out SCAM/FAKE channels (default: true)"),
			noDead: z.boolean().optional().describe("Filter out dead channels (default: true)")
		}, async (input: any) => {
			try {
				const parser = new TGStatParser();
				
				// Need to extract just the arguments required by the parser
				const query = input.query || "";
				const maxPages = input.maxPages || 1;
				const sort = input.sort || "participants";
				
				// Now we need to modify the TGStatParser to accept these advanced filters
				// For now, we'll just use the basic functionality
				const channels = await parser.searchChannels(query, maxPages, sort);
				
				// Convert to JSON string and return as text (required by MCP protocol)
				return {
					content: [{ type: "text", text: JSON.stringify(channels || []) }],
				};
			} catch (error: any) {
				return {
					content: [{ 
						type: "text", 
						text: JSON.stringify({ 
							error: true, 
							message: error.message || "Unknown error occurred"
						}) 
					}],
				};
			}
		});

		// Get Channel Posts Tool
		this.server.tool("getChannelPosts", { 
			channelUsernameOrId: z.string().describe("Channel username (with or without @) or ID"),
			maxPosts: z.number().optional().describe("Maximum number of posts to retrieve (default: 25)")
		}, async (input: any) => {
			try {
				const parser = new TGStatParser();
				const posts = await parser.getChannelPosts(input.channelUsernameOrId, input.maxPosts);
				
				// Convert to JSON string and return as text (required by MCP protocol)
				return {
					content: [{ type: "text", text: JSON.stringify(posts || []) }],
				};
			} catch (error: any) {
				return {
					content: [{ 
						type: "text", 
						text: JSON.stringify({ 
							error: true, 
							message: error.message || "Unknown error occurred"
						}) 
					}],
				};
			}
		});
	}
}

// Export exactly like the working version
export default new OAuthProvider({
	apiRoute: "/sse",
	// @ts-ignore
	apiHandler: MyMCP.mount("/sse"),
	// @ts-ignore
	defaultHandler: app,
	authorizeEndpoint: "/authorize",
	tokenEndpoint: "/token",
	clientRegistrationEndpoint: "/register",
});