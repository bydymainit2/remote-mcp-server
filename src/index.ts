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
			maxPages: z.union([z.number(), z.string()]).optional().describe("Maximum number of pages to fetch (default: 1)"),
			sort: z.string().optional().describe("Sort order: participants, avg_reach, ci_index, members_t, members_y, members_7d, members_30d"),
			inAbout: z.union([z.boolean(), z.string()]).optional().describe("Search in channel description (default: false)"),
			channelType: z.enum(["", "public", "private"]).optional().describe("Channel type: empty for any, public or private"),
			participantsFrom: z.union([z.number(), z.string()]).optional().describe("Minimum number of subscribers"),
			participantsTo: z.union([z.number(), z.string()]).optional().describe("Maximum number of subscribers"),
			avgReachFrom: z.union([z.number(), z.string()]).optional().describe("Minimum average post reach"),
			avgReachTo: z.union([z.number(), z.string()]).optional().describe("Maximum average post reach"),
			ciFrom: z.union([z.number(), z.string()]).optional().describe("Minimum citation index"),
			ciTo: z.union([z.number(), z.string()]).optional().describe("Maximum citation index"),
			noRedLabel: z.union([z.boolean(), z.string()]).optional().describe("Filter out channels with red label (default: true)"),
			noScam: z.union([z.boolean(), z.string()]).optional().describe("Filter out SCAM/FAKE channels (default: true)"),
			noDead: z.union([z.boolean(), z.string()]).optional().describe("Filter out dead channels (default: true)")
		}, async (input: any) => {
			try {
				const parser = new TGStatParser();
				
				// Convert string values to appropriate types
				const query = String(input.query || "");
				const maxPages = Number(input.maxPages || 1);
				const sort = String(input.sort || "participants");
				
				// Convert string booleans to actual booleans
				const stringToBoolean = (value: any): boolean => {
					if (typeof value === "boolean") return value;
					if (typeof value === "string") {
						return value.toLowerCase() === "true";
					}
					return Boolean(value);
				};
				
				// Now we'll pass these params to the parser
				const channels = await parser.searchChannels(query, maxPages, sort);
				
				// Format the results in a more readable way
				const formattedResults = channels?.map(channel => {
					return {
						title: channel.title,
						username: channel.username || "N/A",
						subscribers: channel.subscribers || 0,
						avg_reach: channel.avg_reach || 0,
						category: channel.category,
						url: channel.tgstat_url
					};
				}) || [];
				
				// Convert to JSON string and return as text (required by MCP protocol)
				return {
					content: [{ type: "text", text: JSON.stringify(formattedResults) }],
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
			maxPosts: z.union([z.number(), z.string()]).optional().describe("Maximum number of posts to retrieve (default: 25)")
		}, async (input: any) => {
			try {
				const parser = new TGStatParser();
				
				// Convert inputs to appropriate types
				const channelId = String(input.channelUsernameOrId || "");
				const maxPosts = Number(input.maxPosts || 25);
				
				const posts = await parser.getChannelPosts(channelId, maxPosts);
				
				// Format the results in a more readable way
				const formattedPosts = posts?.map(post => {
					return {
						text: post.text.length > 300 ? post.text.substring(0, 300) + "..." : post.text,
						date: post.datetime_str,
						views: post.views || 0,
						has_media: post.has_photo || post.has_video || post.has_document,
						url: post.tgstat_post_url || post.telegram_post_url
					};
				}) || [];
				
				// Convert to JSON string and return as text (required by MCP protocol)
				return {
					content: [{ type: "text", text: JSON.stringify(formattedPosts) }],
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