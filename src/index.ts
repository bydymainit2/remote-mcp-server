// src/index.ts
import app from "./app";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { TGStatParser } from './tgstat-parser'; // Import the parser
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
        name: "Demo",
        version: "1.0.0",
    });

    async init() {
        this.log('info', 'Initializing MyMCP (with TGStat tools)...');

        // Add the original tool to ensure backward compatibility
        this.server.tool("add", { a: z.number(), b: z.number() }, async ({ a, b }) => ({
            content: [{ type: "text", text: String(a + b) }],
        }));

        // TGStat search channels tool
        this.server.tool(
            "searchChannels",
            {
                description: "Searches for Telegram channels on TGStat.ru",
                input: z.object({
                    query: z.string().min(1),
                    maxPages: z.number().int().positive().optional().default(1),
                    sort: z.enum([
                        "participants", "avg_reach", "ci_index", "members_t",
                        "members_y", "members_7d", "members_30d"
                    ]).optional().default("participants"),
                }),
            },
            async (input) => {
                const parser = new TGStatParser();
                const channels = await parser.searchChannels(input.query, input.maxPages, input.sort);

                if (!channels || channels.length === 0) {
                    return {
                        content: [{ type: "text", text: `No channels found for query "${input.query}"` }],
                    };
                }

                return {
                    content: [{ type: "json", json: channels }],
                };
            }
        );

        // TGStat get channel posts tool
        this.server.tool(
            "getChannelPosts",
            {
                description: "Retrieves posts from a Telegram channel via TGStat.ru",
                input: z.object({
                    channelUsernameOrId: z.string().min(1),
                    maxPosts: z.number().int().positive().optional().default(25),
                }),
            },
            async (input) => {
                const parser = new TGStatParser();
                const posts = await parser.getChannelPosts(input.channelUsernameOrId, input.maxPosts);

                if (!posts || posts.length === 0) {
                    return {
                        content: [{ type: "text", text: `No posts found for channel "${input.channelUsernameOrId}"` }],
                    };
                }

                return {
                    content: [{ type: "json", json: posts }],
                };
            }
        );

         // You could re-add the original 'add' tool here if it's still needed
         // this.server.tool("add", { a: z.number(), b: z.number() }, async ({ a, b }) => ({
         // 	content: [{ type: "text", text: String(a + b) }],
         // }));


         this.log('info', 'MyMCP (with TGStat tools) initialized.');
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