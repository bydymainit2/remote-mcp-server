// src/app.ts
import { Hono } from "hono";
import { html } from "hono/html";
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { User, Client, Session, Code } from "@cloudflare/workers-oauth-provider";
import { OAUTH_KV_PREFIX } from "@cloudflare/workers-oauth-provider"; // Use library prefix if available, else define manually
import type { AuthRequest } from "@cloudflare/workers-oauth-provider";
import {
	layout,
	homeContent,
	renderLoggedInAuthorizeScreen,
	renderLoggedOutAuthorizeScreen,
	renderAuthorizationApprovedContent, // Use specific success renderer
	renderAuthorizationRejectedContent, // Use specific reject/error renderer
	parseApproveFormBody,
} from "./utils"; // Import renderers from utils
import { HTTPException } from 'hono/http-exception'; // Import HTTPException

// Define KV prefixes if not imported
const USER_KV_PREFIX = OAUTH_KV_PREFIX?.USER ?? "user:";
const CLIENT_KV_PREFIX = OAUTH_KV_PREFIX?.CLIENT ?? "client:";
const SESSION_KV_PREFIX = OAUTH_KV_PREFIX?.SESSION ?? "session:";
const CODE_KV_PREFIX = OAUTH_KV_PREFIX?.CODE ?? "code:"; // Prefix for authorization codes

// Define Bindings Interface (Matches wrangler.jsonc and worker-configuration.d.ts)
export interface Bindings {
	OAUTH_KV: KVNamespace;
	MCP_OBJECT: DurableObjectNamespace; // Assuming MyMCP is the class name in index.ts
	ASSETS: Fetcher; // Added ASSETS binding
    // Add other bindings like secrets if needed
    // MY_SECRET: string;
}

// Session cookie name
const SESSION_COOKIE_NAME = "__mcp_session";

const app = new Hono<{ Bindings: Bindings }>();

// --- Password Hashing/Verification Helpers (using Web Crypto API) ---

// Function to hash a password (use this when storing/registering users)
async function hashPassword(password: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(password);
	// Using SHA-256 for simplicity. Consider stronger algorithms like Argon2 or bcrypt if possible,
	// but Web Crypto API primarily offers digests. For stateful sessions, this might be acceptable,
	// but for persistent storage, explore more robust options if your environment allows.
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	// Convert ArrayBuffer to hex string
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
	return hashHex;
}

// Function to verify a password attempt against a stored hash
async function verifyPassword(passwordAttempt: string, storedHash: string): Promise<boolean> {
	const attemptHash = await hashPassword(passwordAttempt);
	// Constant-time comparison is ideal but harder with basic digests.
	// For this example, direct comparison is shown.
	// In a real-world scenario, research and implement constant-time comparison if feasible.
	if (attemptHash.length !== storedHash.length) {
		return false; // Hashes of different lengths can't match
	}
	// Basic comparison (timing attacks are possible in theory, but less likely with SHA-256 hashes compared to direct string comparison)
	let result = 0;
	for (let i = 0; i < attemptHash.length; i++) {
		result |= attemptHash.charCodeAt(i) ^ storedHash.charCodeAt(i);
	}
	return result === 0;
}

// --- User Validation ---
// Uses the verifyPassword helper
const validateUserCredentials = async (
	email: string,
	passwordAttempt: string,
	kv: KVNamespace,
): Promise<boolean> => {
	console.log(`Validating credentials for: ${email}`);
	if (!email || !passwordAttempt) {
		console.log("Validation failed: Missing email or password");
		return false;
	}
	try {
		const userKey = `${USER_KV_PREFIX}${email}`; // Use constant
		const storedDataJson = await kv.get(userKey);

		if (!storedDataJson) {
			console.log(`Validation failed: User not found for key ${userKey}`);
			return false;
		}

		let userData: { passwordHash: string };
		try {
			userData = JSON.parse(storedDataJson);
		} catch (parseError) {
			console.error(`Validation failed: Invalid JSON data for user ${email}`, parseError);
			return false;
		}

		if (!userData || typeof userData.passwordHash !== 'string' || !userData.passwordHash) {
			console.log(`Validation failed: Invalid data format or missing passwordHash for user ${email}`);
			return false;
		}

		// --- CORRECT COMPARISON ---
		const isValidPassword = await verifyPassword(passwordAttempt, userData.passwordHash);

		if (!isValidPassword) {
			console.log(`Validation failed: Incorrect password for user ${email}`);
		} else {
			console.log(`Validation successful for user ${email}`);
		}
		return isValidPassword;

	} catch (error: any) {
		console.error(`Error during credential validation for ${email}: ${error.message}`, error);
		return false;
	}
};

// --- Placeholder Scope Definitions ---
// Replace with your actual scope definitions
const SCOPE_DEFINITIONS: Record<string, string> = {
	"profile:read": "Read your basic profile information.",
	"channel:search": "Search for Telegram channels.",
	"posts:read": "Read posts from channels.",
	// Add more scopes as needed
};

// Function to get scope descriptions
const getScopeDescriptions = (scopeString: string | undefined): { name: string; description: string }[] => {
	if (!scopeString) return [];
	return scopeString
		.split(" ")
		.map((scopeName) => ({
			name: scopeName,
			description: SCOPE_DEFINITIONS[scopeName] || "No description available.",
		}))
		.filter((scope) => scope.name); // Filter out empty strings
};

// --- Routes ---

// Home page - Renders README using ASSETS binding
app.get("/", async (c) => {
	const content = await homeContent(c.req.raw, c.env.ASSETS);
	return c.html(layout(content, "MCP Remote Auth Demo"));
});

// Authorization endpoint (GET) - Shows login/approval screen
app.get("/authorize", async (c) => {
	const query = c.req.query();

	// Basic validation of essential OAuth parameters
	if (
		query.response_type !== "code" ||
		!query.client_id ||
		!query.redirect_uri /*|| !query.scope */ // Scope is often optional initially
	) {
		return c.html(layout(html`<p class="text-red-500">Invalid authorization request. Missing required parameters (response_type=code, client_id, redirect_uri).</p>`, "Invalid Request"), 400);
	}

	// Validate Client ID against KV
	const clientKey = `${CLIENT_KV_PREFIX}${query.client_id}`;
	const client: Client | null = await c.env.OAUTH_KV.get<Client>(clientKey, "json");
	if (!client || !client.redirect_uris?.includes(query.redirect_uri)) {
		console.error(`Invalid client_id (${query.client_id}) or redirect_uri (${query.redirect_uri}) provided.`);
        const errorDetail = !client ? 'Unknown client_id.' : 'Invalid redirect_uri for this client.';
		return c.html(layout(html`<p class="text-red-500">Invalid client configuration. ${errorDetail}</p>`, "Invalid Client"), 400);
	}

	// Store the validated & necessary OAuth request info
	const oauthReqInfo: AuthRequest = {
		response_type: query.response_type,
		client_id: query.client_id,
		redirect_uri: query.redirect_uri,
		scope: query.scope,
		state: query.state,
		code_challenge: query.code_challenge,
		code_challenge_method: query.code_challenge_method,
	};

	const scopes = getScopeDescriptions(oauthReqInfo.scope);

	// Check if user is already logged in via session cookie
	const sessionId = getCookie(c, SESSION_COOKIE_NAME);
	let isLoggedIn = false;
	if (sessionId) {
		const sessionKey = `${SESSION_KV_PREFIX}${sessionId}`;
		const sessionData = await c.env.OAUTH_KV.get(sessionKey);
		if (sessionData) {
			isLoggedIn = true;
			console.log(`User with session ${sessionId} is logged in.`);
		} else {
            console.log(`Invalid or expired session cookie found: ${sessionId}. Clearing cookie.`);
            deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' }); // Clear invalid/expired cookie
        }
	}

	let content: Awaited<ReturnType<typeof renderLoggedInAuthorizeScreen | typeof renderLoggedOutAuthorizeScreen>>;
	if (isLoggedIn) {
		content = await renderLoggedInAuthorizeScreen(scopes, oauthReqInfo);
	} else {
		content = await renderLoggedOutAuthorizeScreen(scopes, oauthReqInfo);
	}

	return c.html(layout(content, "Authorize Application"));
});


// Approval endpoint (POST) - Handles form submission from /authorize
app.post("/approve", async (c) => {
	const body = await c.req.parseBody();
	// Use the refined parseApproveFormBody helper
	const { action, oauthReqInfo, email, password } = await parseApproveFormBody(body);

	if (!action || !oauthReqInfo) {
		console.error("Missing action or oauthReqInfo in /approve POST");
		// Redirect back to a generic error or the home page?
		return c.html(layout(html`<p class="text-red-500">Invalid approval request data. Please try initiating the authorization flow again.</p>`, "Error"), 400);
	}

    // Critical: Ensure redirect_uri is present and matches what the client expects
	const redirectUri = oauthReqInfo.redirect_uri;
    if (!redirectUri) {
        console.error("Missing redirect_uri in oauthReqInfo during /approve POST");
        return c.html(layout(html`<p class="text-red-500">Critical error: Redirect URI is missing. Cannot proceed.</p>`, "Error"), 400);
    }
    const state = oauthReqInfo.state; // Preserve state for redirection

	// Construct the base redirect URL for success/error cases
	let redirectUrl: URL;
	try {
		redirectUrl = new URL(redirectUri);
	} catch (e) {
		console.error(`Invalid redirect_uri provided: ${redirectUri}`);
		return c.html(layout(html`<p class="text-red-500">Invalid Redirect URI configured for the client.</p>`, "Configuration Error"), 400);
	}


	switch (action) {
		case "login_approve": { // Handle login and approval together
			if (!email || !password) {
                 console.log("Login attempt missing email or password");
				 // Re-render login form with an error message
                 const scopes = getScopeDescriptions(oauthReqInfo.scope);
                 const loginContent = await renderLoggedOutAuthorizeScreen(scopes, oauthReqInfo);
				 return c.html(
                    layout(html`
                        <p class="mb-4 text-center text-red-600 bg-red-100 p-3 rounded border border-red-300">Missing email or password.</p>
                        ${loginContent}`,
                    "Login Required"),
                 400);
			}

			const isValid = await validateUserCredentials(email, password, c.env.OAUTH_KV);

			if (!isValid) {
                console.log(`Login failed for user: ${email}`);
				// Re-render login form with invalid credentials error
                const scopes = getScopeDescriptions(oauthReqInfo.scope);
                const loginContent = await renderLoggedOutAuthorizeScreen(scopes, oauthReqInfo);
				return c.html(
					layout(html`
                        <p class="mb-4 text-center text-red-600 bg-red-100 p-3 rounded border border-red-300">Invalid login credentials. Please check your email and password.</p>
                        ${loginContent}`,
                    "Login Failed"),
                 401); // Unauthorized status
			}

			// --- Login successful, now proceed with approval ---
			console.log(`User ${email} logged in successfully. Proceeding to approve.`);

			// 1. Create a session for the logged-in user
			const sessionId = crypto.randomUUID();
			const sessionKey = `${SESSION_KV_PREFIX}${sessionId}`;
			const sessionData = { email: email, /* add other session data if needed */ };
			// Use await for KV operations
			await c.env.OAUTH_KV.put(sessionKey, JSON.stringify(sessionData), { expirationTtl: 3600 }); // e.g., 1 hour expiry

			// 2. Generate the authorization code (link it to the session/user and client)
			const authCode = crypto.randomUUID();
			const codeKey = `${CODE_KV_PREFIX}${authCode}`; // Use constant
			const codeData: Code = { // Use Code type if defined
				clientId: oauthReqInfo.client_id,
				redirectUri: oauthReqInfo.redirect_uri,
				userEmail: email, // Store the user identifier
				scope: oauthReqInfo.scope, // Store requested scopes
                sessionId: sessionId, // Link to the session
				expires: Date.now() + 600 * 1000, // Calculate expiry timestamp (10 mins)
				// Store PKCE challenges if present
				codeChallenge: oauthReqInfo.code_challenge,
				codeChallengeMethod: oauthReqInfo.code_challenge_method,
			};
			// Use await for KV operations
			await c.env.OAUTH_KV.put(codeKey, JSON.stringify(codeData), { expirationTtl: 600 }); // 10 min expiry for code

			// 3. Set session cookie
			setCookie(c, SESSION_COOKIE_NAME, sessionId, {
				path: "/",
				httpOnly: true,
				secure: new URL(c.req.url).protocol === "https:", // Use secure cookies in production
				sameSite: "Lax", // Lax is generally recommended for OAuth flows
				maxAge: 3600, // Match KV expiry (in seconds)
			});

			// 4. Prepare redirect URL with code and state
			redirectUrl.searchParams.set("code", authCode);
            if (state) {
			    redirectUrl.searchParams.set("state", state);
            }
			const finalRedirectUrl = redirectUrl.toString();
			console.log(`Redirecting to client after login_approve: ${finalRedirectUrl}`);

			// Render the success page which will auto-redirect
            return c.html(await renderAuthorizationApprovedContent(finalRedirectUrl));

		} // End case "login_approve"

		case "approve": { // Handle approval when already logged in
			const sessionId = getCookie(c, SESSION_COOKIE_NAME);
			if (!sessionId) {
				console.log("Approval attempt without session cookie. Redirecting to login.");
				// Not logged in, redirect back to authorize to force login, preserving original params
				return c.redirect(generateAuthorizeUrl(oauthReqInfo), 302);
			}

			// Verify session
			const sessionKey = `${SESSION_KV_PREFIX}${sessionId}`;
			const sessionDataJson = await c.env.OAUTH_KV.get(sessionKey);
			if (!sessionDataJson) {
				console.log(`Approval attempt with invalid/expired session ID: ${sessionId}. Redirecting to login.`);
                deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" }); // Clear bad cookie
				return c.redirect(generateAuthorizeUrl(oauthReqInfo), 302);
			}

            let sessionData: { email: string };
            try {
                sessionData = JSON.parse(sessionDataJson);
            } catch (e) {
                console.error(`Failed to parse session data for session ID: ${sessionId}. Redirecting to login.`, e);
                deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
                return c.redirect(generateAuthorizeUrl(oauthReqInfo), 302);
            }

            const userEmail = sessionData.email; // Get user from valid session
            if (!userEmail) {
                 console.error(`Session data for ID ${sessionId} is missing email. Redirecting to login.`);
                 deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
                 return c.redirect(generateAuthorizeUrl(oauthReqInfo), 302);
            }


			console.log(`User ${userEmail} (from session ${sessionId}) approved the request.`);

			// Generate the authorization code (link it to the user and client)
			const authCode = crypto.randomUUID();
			const codeKey = `${CODE_KV_PREFIX}${authCode}`; // Use constant
			const codeData: Code = { // Use Code type
				clientId: oauthReqInfo.client_id,
				redirectUri: oauthReqInfo.redirect_uri,
				userEmail: userEmail, // User from session
				scope: oauthReqInfo.scope,
                sessionId: sessionId, // Link to session
				expires: Date.now() + 600 * 1000, // Expiry timestamp
				codeChallenge: oauthReqInfo.code_challenge,
				codeChallengeMethod: oauthReqInfo.code_challenge_method,
			};
			// Use await for KV operations
			await c.env.OAUTH_KV.put(codeKey, JSON.stringify(codeData), { expirationTtl: 600 }); // 10 min expiry

			// Prepare redirect URL with code and state
			redirectUrl.searchParams.set("code", authCode);
            if (state) {
			    redirectUrl.searchParams.set("state", state);
            }
            const finalRedirectUrl = redirectUrl.toString();
			console.log(`Redirecting to client after approve: ${finalRedirectUrl}`);

            // Render the success page which will auto-redirect
            return c.html(await renderAuthorizationApprovedContent(finalRedirectUrl));
		} // End case "approve"

		case "reject": {
			const sessionId = getCookie(c, SESSION_COOKIE_NAME); // Check session even for rejection
			const userIdentifier = sessionId ? `User (session ${sessionId})` : 'User (not logged in)';
			console.log(`${userIdentifier} rejected the authorization request.`);

			// Redirect back to the client with an access_denied error
			redirectUrl.searchParams.set("error", "access_denied");
			redirectUrl.searchParams.set("error_description", "The resource owner or authorization server denied the request.");
             if (state) {
			    redirectUrl.searchParams.set("state", state);
            }
            const finalRedirectUrl = redirectUrl.toString();
			console.log(`Redirecting to client after reject: ${finalRedirectUrl}`);

            // Render the rejection page which will auto-redirect
            return c.html(await renderAuthorizationRejectedContent(finalRedirectUrl));
        } // End case "reject"

		default:
            console.error(`Unknown action in /approve POST: ${action}`);
			return c.html(layout(html`<p class="text-red-500">Invalid action specified.</p>`, "Error"), 400);
	}
});

// --- Token Endpoint (/token) ---
// Handles exchanging auth code/refresh token for access/refresh tokens
app.post("/token", async (c) => {
	const body = await c.req.parseBody();

	const grantType = body.grant_type as string;
	const clientId = body.client_id as string;
	const clientSecret = body.client_secret as string; // Optional, depending on client type

	// --- Client Authentication ---
	const clientKey = `${CLIENT_KV_PREFIX}${clientId}`;
	const client = await c.env.OAUTH_KV.get<Client>(clientKey, "json");

	if (!client) {
		console.error(`Token request failed: Invalid client_id ${clientId}`);
		return c.json({ error: "invalid_client", error_description: "Client authentication failed." }, 401);
	}
	// Basic secret check (if applicable) - HASH SECRETS in real apps!
	if (client.client_secret && client.client_secret !== clientSecret) {
		console.error(`Token request failed: Invalid client_secret for client ${clientId}`);
		return c.json({ error: "invalid_client", error_description: "Client authentication failed." }, 401);
	}
	// Add checks for client grant types allowed if needed

	// --- Grant Type Handling ---
	switch (grantType) {
		case "authorization_code": {
			const code = body.code as string;
			const redirectUri = body.redirect_uri as string; // MUST match the initial request
			const codeVerifier = body.code_verifier as string; // For PKCE

			if (!code || !redirectUri) {
				return c.json({ error: "invalid_request", error_description: "Missing code or redirect_uri." }, 400);
			}

			// Verify Authorization Code
			const codeKey = `${CODE_KV_PREFIX}${code}`;
			const codeDataJson = await c.env.OAUTH_KV.get(codeKey);
			await c.env.OAUTH_KV.delete(codeKey); // Code must be single-use

			if (!codeDataJson) {
				console.error(`Token request failed: Invalid or expired authorization code ${code}`);
				return c.json({ error: "invalid_grant", error_description: "Authorization code is invalid or expired." }, 400);
			}

			let codeData: Code;
			try {
				codeData = JSON.parse(codeDataJson);
			} catch (e) {
				console.error(`Token request failed: Could not parse code data for code ${code}`, e);
				return c.json({ error: "server_error", error_description: "Failed to process authorization code." }, 500);
			}

			// Validate code details
			if (codeData.clientId !== clientId) {
                 console.error(`Token request failed: Code ${code} client mismatch. Expected ${clientId}, got ${codeData.clientId}`);
				return c.json({ error: "invalid_grant", error_description: "Client ID mismatch." }, 400);
			}
			if (codeData.redirectUri !== redirectUri) {
                 console.error(`Token request failed: Code ${code} redirect_uri mismatch. Expected ${redirectUri}, got ${codeData.redirectUri}`);
				return c.json({ error: "invalid_grant", error_description: "Redirect URI mismatch." }, 400);
			}
			if (codeData.expires && codeData.expires < Date.now()) {
                 console.error(`Token request failed: Code ${code} expired at ${new Date(codeData.expires).toISOString()}`);
				return c.json({ error: "invalid_grant", error_description: "Authorization code expired." }, 400);
			}

            // --- PKCE Verification ---
            if (client.pkceRequired || codeData.codeChallenge) { // Check if client requires PKCE or if challenge was used
                 if (!codeVerifier) {
                     console.error(`Token request failed: Missing code_verifier for PKCE flow for client ${clientId}`);
                     return c.json({ error: 'invalid_request', error_description: 'Code verifier required.' }, 400);
                 }
                 if (!codeData.codeChallengeMethod || !codeData.codeChallenge) {
                      console.error(`Token request failed: Missing code_challenge or method in stored code data for client ${clientId}`);
                      return c.json({ error: 'invalid_grant', error_description: 'Code challenge missing.' }, 400);
                 }

                 let calculatedChallenge: string;
                 if (codeData.codeChallengeMethod === 'S256') {
                     const encoder = new TextEncoder();
                     const data = encoder.encode(codeVerifier);
                     const digest = await crypto.subtle.digest('SHA-256', data);
                     // Convert ArrayBuffer to Base64URL
                     calculatedChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
                         .replace(/\+/g, '-')
                         .replace(/\//g, '_')
                         .replace(/=+$/, '');
                 } else if (codeData.codeChallengeMethod === 'plain') {
                     calculatedChallenge = codeVerifier;
                 } else {
                     console.error(`Token request failed: Unsupported code_challenge_method: ${codeData.codeChallengeMethod}`);
                     return c.json({ error: 'invalid_request', error_description: 'Unsupported code challenge method.' }, 400);
                 }

                 if (calculatedChallenge !== codeData.codeChallenge) {
                     console.error(`Token request failed: Invalid code_verifier. Challenge mismatch for client ${clientId}.`);
                     return c.json({ error: 'invalid_grant', error_description: 'Invalid code verifier.' }, 400);
                 }
                 console.log(`PKCE verification successful for client ${clientId}`);
            }


			// --- Issue Tokens ---
			const accessToken = crypto.randomUUID(); // Simple UUID for demo
			const refreshToken = crypto.randomUUID(); // Simple UUID for demo
			const expiresIn = 3600; // 1 hour

			// Store token data (link to user, client, scopes) - NEED MORE DETAIL HERE
			// Example: Storing access token info
			const accessTokenKey = `accesstoken:${accessToken}`;
			const accessTokenData = {
				userEmail: codeData.userEmail,
				clientId: clientId,
				scope: codeData.scope,
				expires: Date.now() + expiresIn * 1000,
			};
			await c.env.OAUTH_KV.put(accessTokenKey, JSON.stringify(accessTokenData), { expirationTtl: expiresIn });

			// Store refresh token info (link to user, client, potentially longer expiry)
			const refreshTokenKey = `refreshtoken:${refreshToken}`;
			const refreshTokenData = {
				userEmail: codeData.userEmail,
				clientId: clientId,
				// Refresh tokens typically don't expire session-wise but might be revocable
			};
			const refreshTokenExpiry = 86400 * 30; // Example: 30 days
			await c.env.OAUTH_KV.put(refreshTokenKey, JSON.stringify(refreshTokenData), { expirationTtl: refreshTokenExpiry });


			console.log(`Tokens issued for user ${codeData.userEmail} / client ${clientId}`);

			return c.json({
				access_token: accessToken,
				token_type: "Bearer",
				expires_in: expiresIn,
				refresh_token: refreshToken,
				scope: codeData.scope, // Return granted scope
			});
		} // End case "authorization_code"

		case "refresh_token": {
            const refreshTokenAttempt = body.refresh_token as string;
            if (!refreshTokenAttempt) {
                return c.json({ error: "invalid_request", error_description: "Missing refresh_token." }, 400);
            }

            // Verify Refresh Token
            const refreshTokenKey = `refreshtoken:${refreshTokenAttempt}`;
            const refreshTokenDataJson = await c.env.OAUTH_KV.get(refreshTokenKey);

            if (!refreshTokenDataJson) {
                console.error(`Refresh token request failed: Invalid or expired refresh token ${refreshTokenAttempt}`);
                // Security: Optionally revoke related tokens if a compromised refresh token is suspected
                return c.json({ error: "invalid_grant", error_description: "Refresh token is invalid or expired." }, 400);
            }

            let refreshTokenData: { userEmail: string; clientId: string; };
             try {
				refreshTokenData = JSON.parse(refreshTokenDataJson);
			} catch (e) {
				console.error(`Refresh token request failed: Could not parse refresh token data for ${refreshTokenAttempt}`, e);
                 // Consider revoking the token here
				return c.json({ error: "server_error", error_description: "Failed to process refresh token." }, 500);
			}


            // Validate client match
			if (refreshTokenData.clientId !== clientId) {
                console.error(`Refresh token request failed: Refresh token ${refreshTokenAttempt} client mismatch. Expected ${clientId}, got ${refreshTokenData.clientId}`);
                // Security: Revoke the refresh token as it's being used by the wrong client
                await c.env.OAUTH_KV.delete(refreshTokenKey);
				return c.json({ error: "invalid_grant", error_description: "Client ID mismatch for refresh token." }, 400);
			}

            // --- Issue New Access Token (Refresh tokens might grant a new refresh token or re-use) ---
            const newAccessToken = crypto.randomUUID();
            const newAccessTokenExpiresIn = 3600; // 1 hour

            // Store new access token data
            const newAccessTokenKey = `accesstoken:${newAccessToken}`;
			const newAccessTokenData = {
				userEmail: refreshTokenData.userEmail,
				clientId: clientId,
				// scope: refreshTokenData.scope, // Need to retrieve original scope if not stored with refresh token
				expires: Date.now() + newAccessTokenExpiresIn * 1000,
			};
			await c.env.OAUTH_KV.put(newAccessTokenKey, JSON.stringify(newAccessTokenData), { expirationTtl: newAccessTokenExpiresIn });

            // Optionally, issue a new refresh token and revoke the old one (for rotation)
            // const newRefreshToken = crypto.randomUUID();
            // ... store newRefreshTokenData ...
            // await c.env.OAUTH_KV.delete(refreshTokenKey); // Revoke old one

            console.log(`Access token refreshed for user ${refreshTokenData.userEmail} / client ${clientId}`);

            return c.json({
				access_token: newAccessToken,
				token_type: "Bearer",
				expires_in: newAccessTokenExpiresIn,
				// refresh_token: newRefreshToken, // If rotating refresh tokens
                // scope: retrievedScope // Return the scope associated with the token
			});

        } // End case "refresh_token"

		default:
			return c.json({ error: "unsupported_grant_type", error_description: `Grant type '${grantType}' is not supported.` }, 400);
	}
});

// --- Client Registration Endpoint (Placeholder) ---
// For dynamically registering client applications
app.post("/register", async (c) => {
	const body = await c.req.json();

	// Basic validation
	if (!body.client_name || !Array.isArray(body.redirect_uris) || body.redirect_uris.length === 0) {
		return c.json({ error: "invalid_request", error_description: "Missing client_name or redirect_uris." }, 400);
	}

	try {
		const clientId = crypto.randomUUID();
		// HASH client secrets in production! Store the hash.
		const clientSecret = crypto.randomUUID(); // For confidential clients

		const clientData: Client = {
			client_id: clientId,
			client_secret: clientSecret, // Store hashed secret in real app
			client_name: body.client_name,
			redirect_uris: body.redirect_uris,
			grant_types: body.grant_types || ["authorization_code", "refresh_token"], // Default grants
			response_types: body.response_types || ["code"],
			scope: body.scope || "profile:read", // Default scope
			// Add pkceRequired based on client capabilities or policy
            pkceRequired: body.pkceRequired === true, // Default to false if not provided
		};

		const clientKey = `${CLIENT_KV_PREFIX}${clientId}`;
		await c.env.OAUTH_KV.put(clientKey, JSON.stringify(clientData));

		console.log(`Client registered: ${body.client_name} (ID: ${clientId})`);

		// Return client credentials (only needed parts)
		return c.json({
			client_id: clientId,
			client_secret: clientSecret, // Only return secret upon registration
			// Optionally return other registration details
		}, 201); // 201 Created

	} catch (error: any) {
		console.error("Client registration failed:", error);
		return c.json({ error: "server_error", error_description: "Could not register client." }, 500);
	}
});

// --- Error Handling ---
app.onError((err, c) => {
	console.error('Unhandled Error:', err);
	let message = 'Internal Server Error';
	let status = 500;

	if (err instanceof HTTPException) {
		message = err.message;
		status = err.status;
	}

	// Respond with a simple error page or JSON
	return c.html(layout(html`
        <div class="max-w-md mx-auto text-center">
            <h1 class="text-2xl font-bold mb-4 text-danger">Error ${status}</h1>
            <p class="text-gray-700 mb-6">${message}</p>
            ${status === 401 || status === 400 ? html`<a href="/" class="text-primary hover:underline">Go Home</a>` : ''}
        </div>
    `, `Error ${status}`), status);
});

// --- Helper to reconstruct authorize URL for retries ---
function generateAuthorizeUrl(oauthReqInfo: AuthRequest): string {
    const params = new URLSearchParams();
    // Only include parameters that were actually in the original request
    if (oauthReqInfo.response_type) params.set('response_type', oauthReqInfo.response_type);
    if (oauthReqInfo.client_id) params.set('client_id', oauthReqInfo.client_id);
    if (oauthReqInfo.redirect_uri) params.set('redirect_uri', oauthReqInfo.redirect_uri);
    if (oauthReqInfo.scope) params.set('scope', oauthReqInfo.scope);
    if (oauthReqInfo.state) params.set('state', oauthReqInfo.state);
	if (oauthReqInfo.code_challenge) params.set('code_challenge', oauthReqInfo.code_challenge);
	if (oauthReqInfo.code_challenge_method) params.set('code_challenge_method', oauthReqInfo.code_challenge_method);
    // Add other necessary params if they were present

    return `/authorize?${params.toString()}`;
}

export default app;