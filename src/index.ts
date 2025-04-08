// src/index.ts
import app from "./app";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { TGStatParser, ChannelInfo, PostInfo } from './tgstat-parser'; // Import the parser
import type { Bindings } from './app'; // Import Bindings

// --- Zod Schemas (remain the same) ---

const SearchChannelsInputSchema = z.object({
    query: z.string().min(1, "Search query cannot be empty."),
    maxPages: z.number().int().positive().optional().default(1).describe("Maximum number of result pages to fetch (default 1)."),
    sort: z.enum([
        "participants", "avg_reach", "ci_index", "members_t",
        "members_y", "members_7d", "members_30d"
    ]).optional().default("participants").describe("Sorting criteria."),
});

const GetChannelPostsInputSchema = z.object({
    channelUsernameOrId: z.string().min(1, "Channel username or ID cannot be empty."),
    maxPosts: z.number().int().positive().optional().default(25).describe("Maximum number of posts to retrieve (default 25)."),
});

const ChannelInfoSchema = z.object({
    tgstat_url: z.string().url(),
    username: z.string().nullable(),
    title: z.string(),
    avatar_url: z.string().url().nullable(),
    subscribers_str: z.string(),
    subscribers: z.number().nullable(),
    avg_reach_str: z.string(),
    avg_reach: z.number().nullable(),
    ci_index_str: z.string(),
    ci_index: z.number().nullable(),
    category: z.string(),
});

const PostInfoSchema = z.object({
    id: z.number().nullable(),
    datetime_str: z.string(),
    text: z.string(),
    has_photo: z.boolean(),
    has_video: z.boolean(),
    has_document: z.boolean(),
    image_url: z.string().url().nullable(),
    video_url: z.string().url().nullable(),
    views_str: z.string(),
    views: z.number().nullable(),
    shares_str: z.string(),
    shares: z.number().nullable(),
    forwards_str: z.string(),
    forwards: z.number().nullable(),
    tgstat_post_url: z.string().url().optional(),
    telegram_post_url: z.string().url().optional(),
});


// --- Agent Definition (Renamed back to MyMCP) ---

// This class MUST be named MyMCP to match wrangler.jsonc durable_objects config
export class MyMCP extends McpAgent {

    // The server definition describes the TOOLS this agent provides
    server = new McpServer({
        name: "TGStat Tools", // Server name can describe the functionality
        version: "1.0.0",
        description: "Provides tools to interact with TGStat.ru for searching channels and retrieving posts.",
    });

    async init() {
        this.log('info', 'Initializing MyMCP (with TGStat tools)...');

        // --- Tool: Search Channels ---
        this.server.tool(
            "searchChannels",
            {
                description: "Searches for Telegram channels on TGStat.ru based on a query and optional filters.",
                input: SearchChannelsInputSchema,
                output: z.object({
                     channels: z.array(ChannelInfoSchema).nullable(),
                     error: z.string().optional(),
                })
            },
            async (input) => {
                 this.log('info', 'Tool call: searchChannels', input);
                 const parser = new TGStatParser(); // Create instance per call
                 const channels = await parser.searchChannels(input.query, input.maxPages, input.sort);

                if (channels === null) {
                     this.log('error', 'searchChannels tool failed.');
                     return {
                         content: [{ type: "text", text: "Error: Failed to search channels on TGStat." }],
                         output: { channels: null, error: "Failed to retrieve search results."}
                     };
                 } else if (channels.length === 0) {
                     this.log('info', 'searchChannels tool found no results.');
                     return {
                         content: [{ type: "text", text: `No channels found matching query "${input.query}".` }],
                         output: { channels: [], error: undefined }
                     };
                 } else {
                     this.log('info', `searchChannels tool found ${channels.length} channels.`);
                     return {
                         content: [{ type: "json", json: channels }],
                         output: { channels: channels, error: undefined }
                     };
                 }
            }
        );

        // --- Tool: Get Channel Posts ---
        this.server.tool(
            "getChannelPosts",
            {
                 description: "Retrieves recent posts from a specific Telegram channel via TGStat.ru.",
                 input: GetChannelPostsInputSchema,
                 output: z.object({
                     posts: z.array(PostInfoSchema).nullable(),
                     error: z.string().optional(),
                 })
            },
            async (input) => {
                 this.log('info', 'Tool call: getChannelPosts', input);
                 const parser = new TGStatParser(); // Create instance per call
                 const posts = await parser.getChannelPosts(input.channelUsernameOrId, input.maxPosts);

                if (posts === null) {
                     this.log('error', 'getChannelPosts tool failed.');
                     return {
                         content: [{ type: "text", text: `Error: Failed to fetch posts for channel ${input.channelUsernameOrId}.` }],
                         output: { posts: null, error: "Failed to retrieve posts."}
                     };
                 } else if (posts.length === 0) {
                     this.log('info', 'getChannelPosts tool found no posts.');
                      return {
                         content: [{ type: "text", text: `No posts found for channel ${input.channelUsernameOrId}.` }],
                         output: { posts: [], error: undefined }
                     };
                 } else {
                      this.log('info', `getChannelPosts tool found ${posts.length} posts.`);
                     return {
                         content: [{ type: "json", json: posts }],
                         output: { posts: posts, error: undefined }
                     };
                 }
            }
        );

         // You could re-add the original 'add' tool here if it's still needed
         // this.server.tool("add", { a: z.number(), b: z.number() }, async ({ a, b }) => ({
         // 	content: [{ type: "text", text: String(a + b) }],
         // }));


         this.log('info', 'MyMCP (with TGStat tools) initialized.');
    }
}

// Export the OAuth handler as the default, mounting the MyMCP Agent
export default new OAuthProvider<Bindings>({ // Add Bindings type
    apiRoute: "/sse", // Your MCP endpoint
    // Mount the MyMCP class, which contains the TGStat tools
    apiHandler: MyMCP.mount("/sse"),
    // Use the existing Hono app for other routes (like OAuth UI)
    defaultHandler: app,
    // OAuth endpoints remain the same
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/token",
    clientRegistrationEndpoint: "/register",
});