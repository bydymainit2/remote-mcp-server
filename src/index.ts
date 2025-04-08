// src/index.ts
import app from "./app";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { TGStatParser } from './tgstat-parser'; 

export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Demo",
		version: "1.0.0",
	});

	async init() {
		this.server.tool("add", { a: z.number(), b: z.number() }, async ({ a, b }) => ({
			content: [{ type: "text", text: String(a + b) }],
		}));

		// Search Channels Tool
		this.server.tool("searchChannels", { 
			query: z.string(), 
			maxPages: z.number().optional(), 
			sort: z.string().optional() 
		}, async ({ query, maxPages, sort }) => {
			const parser = new TGStatParser();
			const channels = await parser.searchChannels(query, maxPages, sort);
			return {
				content: [{ type: "json", json: channels || [] }],
			};
		});

		// Get Channel Posts Tool
		this.server.tool("getChannelPosts", { 
			channelUsernameOrId: z.string(), 
			maxPosts: z.number().optional() 
		}, async ({ channelUsernameOrId, maxPosts }) => {
			const parser = new TGStatParser();
			const posts = await parser.getChannelPosts(channelUsernameOrId, maxPosts);
			return {
				content: [{ type: "json", json: posts || [] }],
			};
		});
	}
}

// Export the OAuth handler as the default
export default new OAuthProvider({
	apiRoute: "/sse",
	// TODO: fix these types
	// @ts-ignore
	apiHandler: MyMCP.mount("/sse"),
	// @ts-ignore
	defaultHandler: app,
	authorizeEndpoint: "/authorize",
	tokenEndpoint: "/token",
	clientRegistrationEndpoint: "/register",
});