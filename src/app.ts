// src/app.ts
import { Hono } from "hono";
import {
	layout,
	homeContent,
	parseApproveFormBody,
	renderAuthorizationRejectedContent,
	renderAuthorizationApprovedContent,
	renderLoggedInAuthorizeScreen,
	renderLoggedOutAuthorizeScreen,
} from "./utils";
import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

// Define Env based on wrangler.jsonc bindings + potentially others
interface Env {
    // KV Namespace binding from wrangler.jsonc
    OAUTH_KV: KVNamespace;
    // Assets binding from wrangler.jsonc
    ASSETS: Fetcher;
    // Durable Object binding from wrangler.jsonc
    MCP_OBJECT: DurableObjectNamespace;
    // Add any other environment variables or bindings needed
}

// Bindings type used by Hono and potentially OAuthProvider
export type Bindings = Env & {
	OAUTH_PROVIDER: OAuthHelpers;
};

const app = new Hono<{
	Bindings: Bindings; // Use the defined Bindings including wrangler ones
}>();

// Render a basic homepage placeholder to make sure the app is up
app.get("/", async (c) => {
	// Ensure ASSETS binding is available in context.env
    if (!c.env.ASSETS) {
        return c.text("ASSETS binding not configured.", 500);
    }
	const content = await homeContent(c.req.raw, c.env.ASSETS); // Pass ASSETS fetcher
	return c.html(layout(content, "MCP Remote Auth Demo - Home"));
});

// Render an authorization page
app.get("/authorize", async (c) => {
	// We don't have an actual auth system, so to demonstrate both paths, you can
	// hard-code whether the user is logged in or not. We'll default to true
	const isLoggedIn = true;

	const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
    if (!oauthReqInfo) {
        // Handle cases where parsing might fail (e.g., invalid request)
        return c.html(layout("Invalid authorization request.", "Error"), 400);
    }


	const oauthScopes = [
		{
			name: "read_profile",
			description: "Read your basic profile information",
		},
        // Add specific scopes relevant to TGStat if needed, e.g.:
        { name: "tgstat_search", description: "Search TGStat channels" },
        { name: "tgstat_posts", description: "Read posts from TGStat channels" },
		// Original scopes (keep if relevant elsewhere)
		// { name: "read_data", description: "Access your stored data" },
		// { name: "write_data", description: "Create and modify your data" },
	];

	if (isLoggedIn) {
		const content = await renderLoggedInAuthorizeScreen(oauthScopes, oauthReqInfo);
		return c.html(layout(content, "MCP Remote Auth Demo - Authorization"));
	}

	const content = await renderLoggedOutAuthorizeScreen(oauthScopes, oauthReqInfo);
	return c.html(layout(content, "MCP Remote Auth Demo - Authorization"));
});

// The /authorize page has a form that will POST to /approve
app.post("/approve", async (c) => {
    // Ensure OAUTH_KV is available if the provider needs it for state
    if (!c.env.OAUTH_KV) {
         console.error("OAUTH_KV binding missing!");
         return c.text("Server configuration error.", 500);
    }

	const { action, oauthReqInfo, email, password } = await parseApproveFormBody(
		await c.req.parseBody(),
	);

	if (!oauthReqInfo) {
		return c.html(layout("Invalid request data.", "Error"), 400); // More specific error
	}

	// --- Login Validation (if action is login_approve) ---
	if (action === "login_approve") {
        let isValidLogin = true; // Assume valid for demo
        // Replace with your actual login validation logic here
        // Example: const user = await validateUser(c.env.DB, email, password);
        // if (!user) isValidLogin = false;
        console.log(`Simulating login validation for ${email}... Status: ${isValidLogin}`);

		if (!isValidLogin) {
            // You might want to re-render the login form with an error message
            // For simplicity, just rejecting
			return c.html(
				layout(
					await renderAuthorizationRejectedContent("/authorize"), // Redirect back to auth page
					"MCP Remote Auth Demo - Login Failed",
				),
                401 // Unauthorized status
			);
		}
	} else if (action === 'reject') {
         // Handle explicit rejection
         // The OAuth provider might handle redirection based on reject action internally,
         // or you might need to call a specific reject method if available.
         // For now, render rejected content.
         console.log('User explicitly rejected authorization.');
         // Determine the correct redirect URL for rejection if needed
         const rejectRedirect = oauthReqInfo.redirect_uri + "?error=access_denied"; // Example
         return c.html(
             layout(
                 await renderAuthorizationRejectedContent(rejectRedirect),
                 "MCP Remote Auth Demo - Authorization Rejected",
             ),
         );
     } else if (action !== 'approve' && action !== 'login_approve') {
         return c.html(layout("Invalid action.", "Error"), 400);
     }


	// --- Complete Authorization ---
	// User is considered logged in (or just validated) and action is approve/login_approve
	try {
        // Use the KV binding for state storage if required by the provider
        const kv = c.env.OAUTH_KV;

        // Define metadata - replace with actual user data if available after login
        const userMetadata = { label: "Demo User", source: "TGStatMCP" };
        // Use a consistent user ID, like the validated email or a DB ID
        const userId = email || `demo-user-${Date.now()}`; // Fallback ID

        // Make sure to pass the correct scope (requested vs approved)
        // Here, we approve all originally requested scopes for simplicity
        const approvedScope = oauthReqInfo.scope;

        const completionResult = await c.env.OAUTH_PROVIDER.completeAuthorization({
            request: oauthReqInfo,
            userId: userId,
            metadata: userMetadata,
            scope: approvedScope,
            props: {
                userEmail: email, // Pass extra props if needed by token generation
            },
            // Pass KV store if the provider implementation requires it
            kvStore: kv,
        });

         if (!completionResult || !completionResult.redirectTo) {
             console.error("Failed to complete authorization or get redirect URL.");
             return c.html(layout("Failed to complete authorization.", "Error"), 500);
         }

		return c.html(
			layout(
				await renderAuthorizationApprovedContent(completionResult.redirectTo),
				"MCP Remote Auth Demo - Authorization Status",
			),
		);
	} catch (error: any) {
         console.error("Error completing authorization:", error);
         // Try to redirect with error if possible
         const errorRedirect = oauthReqInfo.redirect_uri + `?error=server_error&error_description=${encodeURIComponent(error.message || 'Unknown error')}`;
         return c.html(
             layout(
                 await renderAuthorizationRejectedContent(errorRedirect), // Use reject content but provide error redirect
                 "MCP Remote Auth Demo - Authorization Error",
             ),
             500
         );
     }
});

export default app;