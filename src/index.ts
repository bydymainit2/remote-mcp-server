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
		// Search Channels Tool
		this.server.tool("searchChannels", { 
			query: z.string(), 
			maxPages: z.number().optional(), 
			sort: z.string().optional() 
		}, async (input: any) => {
			const parser = new TGStatParser();
			const channels = await parser.searchChannels(input.query, input.maxPages, input.sort);
			return {
				content: [{ type: "json", json: channels || [] }],
			};
		});

		// Get Channel Posts Tool
		this.server.tool("getChannelPosts", { 
			channelUsernameOrId: z.string(), 
			maxPosts: z.number().optional() 
		}, async (input: any) => {
			const parser = new TGStatParser();
			const posts = await parser.getChannelPosts(input.channelUsernameOrId, input.maxPosts);
			return {
				content: [{ type: "json", json: posts || [] }],
			};
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