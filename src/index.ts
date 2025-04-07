// src/index.ts
import app from "./app";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { TGStatParser, ChannelInfo, PostInfo } from './tgstat-parser'; // Import the parser and interfaces
import type { Bindings } from './app'; // Import Bindings if needed elsewhere

// --- Zod Schemas for Tool Input/Output ---

const SearchChannelsInputSchema = z.object({
    query: z.string().min(1, "Search query cannot be empty."),
    maxPages: z.number().int().positive().optional().default(1).describe("Maximum number of result pages to fetch (default 1)."),
    sort: z.enum([ // Add more sort options if needed
        "participants",
        "avg_reach",
        "ci_index",
        "members_t", // Growth today
        "members_y", // Growth yesterday
        "members_7d", // Growth 7d
        "members_30d" // Growth 30d
    ]).optional().default("participants").describe("Sorting criteria."),
});

const GetChannelPostsInputSchema = z.object({
    channelUsernameOrId: z.string().min(1, "Channel username or ID cannot be empty."),
    maxPosts: z.number().int().positive().optional().default(25).describe("Maximum number of posts to retrieve (default 25)."),
});

// Optional: Define Zod schemas for the output structures for validation (good practice)
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
    video_url: z.string().url().nullable(), // Assuming URL if present
    views_str: z.string(),
    views: z.number().nullable(),
    shares_str: z.string(),
    shares: z.number().nullable(),
    forwards_str: z.string(),
    forwards: z.number().nullable(),
    tgstat_post_url: z.string().url().optional(),
    telegram_post_url: z.string().url().optional(),
});


// --- TGStat Agent Definition ---

export class TGStatAgent extends McpAgent {
    // Create a single parser instance for the agent lifecycle if desired,
    // or create one per request within the tool methods.
    // For simplicity and state management (cookies, csrf), one per agent seems reasonable.
    // However, be mindful of potential concurrency issues if the agent instance is shared across requests.
    // For Cloudflare Workers, a new instance per request might be safer if state isn't managed carefully.
    // Let's create it per-tool-call for now to avoid state conflicts between requests.
    // private parser: TGStatParser;

    server = new McpServer({
        name: "TGStat",
        version: "1.0.0",
        description: "Provides tools to interact with TGStat.ru for searching channels and retrieving posts.",
    });

    async init() {
        this.log('info', 'Initializing TGStatAgent...');

        // --- Tool: Search Channels ---
        this.server.tool(
            "searchChannels",
            {
                description: "Searches for Telegram channels on TGStat.ru based on a query and optional filters.",
                input: SearchChannelsInputSchema,
                output: z.object({ // Describe the output structure
                     channels: z.array(ChannelInfoSchema).nullable(),
                     error: z.string().optional(),
                })
            },
            async (input) => {
                 this.log('info', 'Tool call: searchChannels', input);
                 const parser = new TGStatParser(); // Create instance per call
                 const channels = await parser.searchChannels(input.query, input.maxPages, input.sort);

                if (channels === null) {
                     this.log('error', 'searchChannels tool failed to retrieve data.');
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
                     // Return JSON for easy consumption by LLM or other clients
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
                     this.log('error', 'getChannelPosts tool failed to retrieve data.');
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

         this.log('info', 'TGStatAgent initialized with tools.');
    }
}

// Export the OAuth handler as the default, mounting the TGStatAgent
export default new OAuthProvider<Bindings>({ // Add Bindings type
    apiRoute: "/sse", // Your MCP endpoint
    // Mount the new TGStatAgent
    apiHandler: TGStatAgent.mount("/sse"),
    // Use the existing Hono app for other routes (like OAuth UI)
    defaultHandler: app,
    // OAuth endpoints remain the same
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/token",
    clientRegistrationEndpoint: "/register",
});