// src/utils.ts

import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import { marked } from "marked";
import type { AuthRequest } from "@cloudflare/workers-oauth-provider";
// Removed: import { env } from "cloudflare:workers"; - Bindings are passed explicitly

// This file mainly exists as a dumping ground for uninteresting html and CSS
// to remove clutter and noise from the auth logic.

// --- Layout Function ---
export const layout = (content: HtmlEscapedString | string, title: string) => html`
	<!DOCTYPE html>
	<html lang="en">
		<head>
			<meta charset="UTF-8" />
			<meta
				name="viewport"
				content="width=device-width, initial-scale=1.0"
			/>
			<title>${title}</title>
			<!-- Tailwind CSS via CDN -->
			<script src="https://cdn.tailwindcss.com"></script>
			<script>
				tailwind.config = {
					theme: {
						extend: {
							colors: {
								primary: "#3498db", // Blue
								secondary: "#2ecc71", // Green
								accent: "#f39c12", // Orange
								danger: "#e74c3c", // Red
							},
							fontFamily: {
								sans: ["Inter", "system-ui", "sans-serif"],
								heading: ["Roboto", "system-ui", "sans-serif"],
							},
						},
					},
				};
			</script>
			<!-- Google Fonts and Custom Styles -->
			<style>
				@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto:wght@400;500;700&display=swap");

				/* Basic body styling */
				body {
                    min-height: 100vh;
                    display: flex;
                    flex-direction: column;
                    background-color: #f3f4f6; /* bg-gray-100 */
                    color: #1f2937; /* text-gray-800 */
                    font-family: "Inter", system-ui, sans-serif; /* font-sans */
                    line-height: 1.625; /* leading-relaxed */
                }
                main {
                    flex-grow: 1;
                    padding-bottom: 3rem; /* pb-12 */
                }
                header {
                    background-color: white;
                    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1); /* shadow-md */
                    margin-bottom: 2rem; /* mb-8 */
                    position: sticky;
                    top: 0;
                    z-index: 10;
                }
                footer {
                    background-color: #e5e7eb; /* bg-gray-200 */
                    padding-top: 1rem; /* py-4 */
                    padding-bottom: 1rem;
                    margin-top: auto;
                }

				/* Custom styling for markdown content */
				.markdown {
                    max-width: 56rem; /* max-w-4xl */
                    margin-left: auto;
                    margin-right: auto;
                }
				.markdown h1 {
					font-size: 2rem; /* text-3xl (approx) */
					font-weight: 700;
					font-family: "Roboto", system-ui, sans-serif;
					color: #1a202c; /* Darker gray */
					margin-bottom: 1.5rem; /* mb-6 */
                    padding-bottom: 0.5rem; /* pb-2 */
                    border-bottom: 1px solid #e2e8f0; /* border-gray-200 */
					line-height: 1.2;
				}
				.markdown h2 {
					font-size: 1.5rem; /* text-2xl */
					font-weight: 600;
					font-family: "Roboto", system-ui, sans-serif;
					color: #2d3748; /* Medium gray */
					margin-top: 2rem; /* mt-8 */
					margin-bottom: 1rem; /* mb-4 */
                    padding-bottom: 0.25rem; /* pb-1 */
                    border-bottom: 1px solid #e2e8f0; /* border-gray-200 */
					line-height: 1.3;
				}
				.markdown h3 {
					font-size: 1.25rem; /* text-xl */
					font-weight: 600;
					font-family: "Roboto", system-ui, sans-serif;
					color: #2d3748;
					margin-top: 1.5rem; /* mt-6 */
					margin-bottom: 0.75rem; /* mb-3 */
				}
				.markdown p {
					font-size: 1rem; /* text-base */
					color: #4a5568; /* Lighter gray (text-gray-600) */
					margin-bottom: 1rem; /* mb-4 */
					line-height: 1.7; /* Slightly increased line height */
				}
				.markdown a {
					color: #3498db; /* Primary blue */
					font-weight: 500;
					text-decoration: none;
                    transition: color 0.2s ease-in-out;
				}
				.markdown a:hover {
					color: #2980b9; /* Darker blue on hover */
					text-decoration: underline;
				}
				.markdown blockquote {
					border-left: 4px solid #f39c12; /* Accent orange */
					padding: 0.75rem 1rem; /* py-3 px-4 */
					margin: 1.5rem 0; /* my-6 mx-0 */
					background-color: #fffbeb; /* Light yellow background (e.g., yellow-50) */
                    color: #713f12; /* Darker text for contrast (e.g., yellow-900) */
					font-style: italic;
                    border-radius: 0.25rem; /* rounded-sm */
				}
				.markdown blockquote p {
					margin-bottom: 0.5rem; /* mb-2 */
                    font-size: 0.95rem; /* Slightly smaller text */
				}
                 .markdown blockquote p:last-child {
                    margin-bottom: 0;
                }
				.markdown ul,
				.markdown ol {
					margin-top: 1rem; /* mt-4 */
					margin-bottom: 1rem; /* mb-4 */
					margin-left: 1.75rem; /* ml-7 */
					font-size: 1rem; /* text-base */
					color: #4a5568; /* text-gray-600 */
                    line-height: 1.7;
				}
				.markdown li {
					margin-bottom: 0.5rem; /* mb-2 */
				}
				.markdown ul { list-style-type: disc; }
				.markdown ol { list-style-type: decimal; }
				.markdown ul li::marker { /* Style list markers */
                    color: #3498db; /* primary */
                }
                .markdown ol li::marker {
                    color: #3498db; /* primary */
                    font-weight: 500;
                }
				.markdown pre {
					background-color: #f7fafc; /* Very light gray (gray-50) */
					padding: 1rem; /* p-4 */
					border-radius: 0.375rem; /* rounded-md */
                    border: 1px solid #e2e8f0; /* border-gray-200 */
					margin-top: 1.5rem; /* mt-6 */
					margin-bottom: 1.5rem; /* mb-6 */
					overflow-x: auto;
                    font-size: 0.9rem; /* Slightly smaller font for code */
                    line-height: 1.5;
				}
				.markdown code { /* Inline code */
					font-family: 'Courier New', Courier, monospace;
					font-size: 0.9em; /* Relative size */
					background-color: #edf2f7; /* Slightly darker gray (gray-200) */
					padding: 0.15rem 0.3rem; /* Adjusted padding */
					border-radius: 0.25rem; /* rounded-sm */
                    color: #2d3748; /* text-gray-700 */
                    word-break: break-word; /* Prevent long code strings from overflowing */
				}
				.markdown pre code { /* Code within pre blocks */
					background-color: transparent;
					padding: 0;
                    border-radius: 0;
                    color: inherit; /* Inherit color from pre */
                    font-size: inherit;
                    font-family: inherit; /* Use pre's font family */
                    word-break: normal; /* Allow normal breaks in code blocks */
				}
                .container {
                    width: 100%;
                    margin-left: auto;
                    margin-right: auto;
                    padding-left: 1rem; /* px-4 */
                    padding-right: 1rem;
                }
                @media (min-width: 640px) { /* sm */
                    .container {
                         max-width: 640px;
                         padding-left: 1.5rem; /* sm:px-6 */
                         padding-right: 1.5rem;
                    }
                     .markdown { max-width: 640px; }
                }
                @media (min-width: 768px) { /* md */
                     .container { max-width: 768px; }
                     .markdown { max-width: 768px; }
                }
                 @media (min-width: 1024px) { /* lg */
                     .container {
                         max-width: 1024px;
                         padding-left: 2rem; /* lg:px-8 */
                         padding-right: 2rem;
                     }
                     .markdown { max-width: 1024px; } /* Adjust if needed */
                 }
                 @media (min-width: 1280px) { /* xl */
                    .container { max-width: 1280px; }
                    .markdown { max-width: 56rem; } /* Keep markdown constrained */
                }
                @media (min-width: 1536px) { /* 2xl */
                    .container { max-width: 1536px; }
                 }
			</style>
		</head>
		<body>
			<header>
				<div
					class="container mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center"
				>
					<a
						href="/"
						class="text-lg sm:text-xl font-heading font-bold text-primary hover:text-primary/80 transition-colors"
						>MCP Remote Auth (TGStat)</a {/* Updated title */}
					>
                    {/* Optional: Add navigation links here */}
				</div>
			</header>
			<main class="container mx-auto px-4 sm:px-6 lg:px-8">
				${content}
			</main>
			<footer>
				<div class="container mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-600 text-sm">
					<p>
						© ${new Date().getFullYear()} MCP Remote Auth Demo.
					</p>
				</div>
			</footer>
		</body>
	</html>
`;

// --- Home Page Content (Renders README.md) ---
// Modified to accept ASSETS fetcher binding explicitly
export const homeContent = async (req: Request, assetsFetcher: Fetcher): Promise<HtmlEscapedString> => {
	const origin = new URL(req.url).origin;
    // IMPORTANT: Ensure the path matches how assets are served.
    // If wrangler serves from root, /README.md is correct.
    // If it serves from a subdirectory, adjust accordingly (e.g., /static/README.md).
    const readmeUrl = new URL("/README.md", origin).toString();
	console.log(`Fetching README from: ${readmeUrl}`); // Log URL being fetched

	try {
        // Use the passed fetcher binding
		const res = await assetsFetcher.fetch(readmeUrl); // Use the full URL

		if (!res.ok) {
			console.error(`Failed to fetch README.md from ASSETS. Status: ${res.status} ${res.statusText}`);
			const errorBody = await res.text().catch(() => "Could not read error body"); // Try reading body for clues
            console.error("Error Body:", errorBody);
			return html`<div class="max-w-4xl mx-auto markdown">
                <h1>Error Loading Content</h1>
                <p>Could not load README.md from static assets. Please ensure:</p>
                <ul>
                    <li>The <code>ASSETS</code> binding in <code>wrangler.jsonc</code> points to the correct directory (e.g., <code>./static/</code>).</li>
                    <li>A file named <code>README.md</code> exists directly within that directory.</li>
                    <li>The Worker has been deployed/restarted after changes.</li>
                </ul>
                <p><strong>Attempted URL:</strong> <code>${readmeUrl}</code></p>
                <p><strong>Status:</strong> ${res.status} ${res.statusText}</p>
                 ${errorBody ? html`<p><strong>Response Body:</strong></p><pre><code>${errorBody}</code></pre>` : ''}
            </div>`;
		}
		const markdown = await res.text();
        // Use 'marked' with async option if available, or keep as is if sync is intended
		// const content = await marked.parse(markdown); // Prefer async parse if using newer marked
        let contentHtml: string;
        try {
            // marked() is synchronous by default in older versions, async in newer
            const markedResult = marked(markdown);
            if (typeof markedResult === 'string') {
                 contentHtml = markedResult;
            } else { // Handle promise if marked is async
                contentHtml = await markedResult;
            }
        } catch (markedError: any) {
             console.error("Error parsing Markdown:", markedError);
             return html`<div class="max-w-4xl mx-auto markdown">
                <h1>Markdown Parsing Error</h1>
                <p>Could not parse the content of README.md.</p>
                <pre><code>${markedError.message}</code></pre>
             </div>`;
        }

		return html`
			<div class="markdown">${raw(contentHtml)}</div>
		`;
	} catch (error: any) {
		console.error("Error fetching or parsing README.md:", error);
        // Log the full error if possible
        console.error(error);
		return html`<div class="max-w-4xl mx-auto markdown">
            <h1>Unexpected Error</h1>
            <p>An unexpected error occurred while loading content.</p>
            <pre><code>${error.message}</code></pre>
            ${error.stack ? html`<p>Stack Trace:</p><pre><code>${error.stack}</code></pre>` : ''}
        </div>`;
	}
};

// --- Logged-In Authorization Screen ---
export const renderLoggedInAuthorizeScreen = async (
	oauthScopes: { name: string; description: string }[],
	oauthReqInfo: AuthRequest,
): Promise<HtmlEscapedString> => {
	// Serialize only necessary parts of oauthReqInfo, avoid potential circular refs or large objects
	const relevantReqInfo = {
		response_type: oauthReqInfo.response_type,
		client_id: oauthReqInfo.client_id,
		redirect_uri: oauthReqInfo.redirect_uri,
		scope: oauthReqInfo.scope,
		state: oauthReqInfo.state,
		code_challenge: oauthReqInfo.code_challenge,
		code_challenge_method: oauthReqInfo.code_challenge_method,
	};
	return html`
		<div class="max-w-lg mx-auto bg-white p-6 sm:p-8 rounded-lg shadow-lg border border-gray-200">
			<h1 class="text-2xl font-heading font-bold mb-6 text-center text-gray-900">
				Authorize Application
			</h1>
            <p class="text-center text-gray-600 mb-6">
                The application <code class="text-sm bg-gray-100 p-1 rounded">${oauthReqInfo.client_id || 'Unknown Client'}</code> requests permission to access your account.
            </p>

			<div class="mb-8 p-4 bg-gray-50 rounded border border-gray-200">
				<h2 class="text-lg font-semibold mb-3 text-gray-800">
                    Requested Permissions:
				</h2>
				<ul class="space-y-3">
					${oauthScopes.length > 0
						? oauthScopes.map(
								(scope) => html`
									<li class="flex items-start">
										<svg class="w-5 h-5 mr-2 mt-1 text-secondary flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"> <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path> </svg>
										<div>
											<p class="font-medium text-gray-700">${scope.name}</p>
											<p class="text-gray-600 text-sm">
												${scope.description}
											</p>
										</div>
									</li>
								`,
							)
						: html`<li class="text-gray-500 italic">No specific permissions requested.</li>`}
				</ul>
			</div>
			<form action="/approve" method="POST" class="space-y-4">
                {/* Hidden field to carry OAuth request info - Properly escape JSON */}
				<input
					type="hidden"
					name="oauthReqInfo"
					value='${JSON.stringify(relevantReqInfo)}'
				/>
                {/* No email/password needed here as user is logged in */}

                {/* Action Buttons */}
				<button
					type="submit"
					name="action"
					value="approve"
					class="w-full py-3 px-4 bg-secondary text-white rounded-md font-semibold hover:bg-green-600 transition-colors focus:outline-none focus:ring-2 focus:ring-secondary focus:ring-offset-2"
				>
					Allow Access
				</button>
				<button
					type="submit"
					name="action"
					value="reject"
					class="w-full py-3 px-4 border border-gray-300 text-gray-700 rounded-md font-semibold hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
				>
					Deny Access
				</button>
			</form>
		</div>
	`;
};

// --- Logged-Out Authorization Screen (Includes Login) ---
export const renderLoggedOutAuthorizeScreen = async (
	oauthScopes: { name: string; description: string }[],
	oauthReqInfo: AuthRequest,
): Promise<HtmlEscapedString> => {
	// Serialize only necessary parts of oauthReqInfo
	const relevantReqInfo = {
		response_type: oauthReqInfo.response_type,
		client_id: oauthReqInfo.client_id,
		redirect_uri: oauthReqInfo.redirect_uri,
		scope: oauthReqInfo.scope,
		state: oauthReqInfo.state,
		code_challenge: oauthReqInfo.code_challenge,
		code_challenge_method: oauthReqInfo.code_challenge_method,
	};
	return html`
		<div class="max-w-lg mx-auto bg-white p-6 sm:p-8 rounded-lg shadow-lg border border-gray-200">
			<h1 class="text-2xl font-heading font-bold mb-6 text-center text-gray-900">
				Log In to Authorize
			</h1>
            <p class="text-center text-gray-600 mb-6">
                Please log in to grant <code class="text-sm bg-gray-100 p-1 rounded">${oauthReqInfo.client_id || 'Unknown Client'}</code> access.
            </p>

            {/* Display Requested Permissions */}
			<div class="mb-8 p-4 bg-gray-50 rounded border border-gray-200">
				<h2 class="text-lg font-semibold mb-3 text-gray-800">
                    Requested Permissions:
				</h2>
				<ul class="space-y-3">
                     ${oauthScopes.length > 0
                        ? oauthScopes.map(
                            (scope) => html`
                                <li class="flex items-start">
                                    <svg class="w-5 h-5 mr-2 mt-1 text-secondary flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"> <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path> </svg>
                                    <div>
                                        <p class="font-medium text-gray-700">${scope.name}</p>
                                        <p class="text-gray-600 text-sm">
                                            ${scope.description}
                                        </p>
                                    </div>
                                </li>
                            `,
                        )
                    : html`<li class="text-gray-500 italic">No specific permissions requested.</li>`}
				</ul>
			</div>

            {/* Login and Approval Form */}
			<form action="/approve" method="POST" class="space-y-6"> {/* Increased space */}
				{/* Hidden field to carry OAuth request info - Properly escape JSON */}
                <input
					type="hidden"
					name="oauthReqInfo"
					value='${JSON.stringify(relevantReqInfo)}'
				/>
                {/* Email Input */}
				<div>
					<label
						for="email"
						class="block text-sm font-medium text-gray-700 mb-1"
						>Email Address</label
					>
					<input
						type="email"
						id="email"
						name="email"
						required
                        placeholder="you@example.com"
						class="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-shadow shadow-sm"
                        autocomplete="email"
					/>
				</div>
                {/* Password Input */}
				<div>
					<label
						for="password"
						class="block text-sm font-medium text-gray-700 mb-1"
						>Password</label
					>
					<input
						type="password"
						id="password"
						name="password"
						required
                        placeholder="••••••••"
						class="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-shadow shadow-sm"
                        autocomplete="current-password"
					/>
				</div>

                {/* Action Buttons */}
                <div class="pt-2 space-y-4"> {/* Add padding top */}
                    <button
                        type="submit"
                        name="action"
                        value="login_approve"
                        class="w-full py-3 px-4 bg-primary text-white rounded-md font-semibold hover:bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                    >
                        Log In and Allow Access
                    </button>
                    <button
                        type="submit"
                        name="action"
                        value="reject"
                        class="w-full py-3 px-4 border border-gray-300 text-gray-700 rounded-md font-semibold hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
                    >
                        Cancel and Deny Access
                    </button>
                </div>
			</form>
		</div>
	`;
};

// --- Generic Approve/Reject Result Screen ---
export const renderApproveContent = async (
	message: string,
	status: "success" | "error",
	redirectUrl: string,
): Promise<HtmlEscapedString> => {
    // Generate appropriate icon and colors based on status
	const icon = status === "success" ?
        html`<svg class="w-12 h-12 text-green-600" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"></path></svg>` :
        html`<svg class="w-12 h-12 text-red-600" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"></path></svg>`;
    const bgColor = status === 'success' ? 'bg-green-50' : 'bg-red-50';
    const borderColor = status === 'success' ? 'border-green-200' : 'border-red-200';
    const titleColor = status === 'success' ? 'text-green-800' : 'text-red-800';

    // Ensure redirectUrl is properly encoded for use in JS and href
    const encodedRedirectUrl = encodeURI(decodeURI(redirectUrl)); // Decode first to handle already encoded chars, then re-encode

	return html`
		<div
			class="max-w-md mx-auto ${bgColor} p-6 sm:p-8 rounded-lg shadow-md text-center border ${borderColor}"
		>
			<div class="mb-4 flex justify-center">
                ${icon}
			</div>
			<h1 class="text-xl sm:text-2xl font-heading font-bold mb-4 ${titleColor}">
				${message}
			</h1>
			<p class="mb-6 text-gray-600 text-sm sm:text-base">
				You will be redirected back to the application shortly.
			</p>
			<a
                href="${encodedRedirectUrl}"  /* Use encoded URL */
				class="inline-block py-2 px-5 bg-primary text-white rounded-md font-semibold hover:bg-blue-600 transition-colors text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
			>
				Continue to Application
			</a>
            {/* Auto-redirect script */}
			${raw(`
				<script>
                    // Ensure the redirect URL is properly escaped for JavaScript string literal
                    const redirectTarget = ${JSON.stringify(redirectUrl)};
					setTimeout(() => {
                        // Check if the current location is *exactly* the target to prevent loops if already redirected
						if (window.location.href !== redirectTarget) {
							window.location.href = redirectTarget;
						}
					}, 3000); // 3-second delay
				</script>
			`)}
		</div>
	`;
};

// --- Specific Success Screen ---
export const renderAuthorizationApprovedContent = async (redirectUrl: string): Promise<HtmlEscapedString> => {
	return renderApproveContent("Authorization Approved!", "success", redirectUrl);
};

// --- Specific Rejection/Error Screen ---
export const renderAuthorizationRejectedContent = async (redirectUrl: string): Promise<HtmlEscapedString> => {
	return renderApproveContent("Authorization Denied or Failed", "error", redirectUrl);
};

// --- Helper to Parse Form Body ---
// Ensures data from the /approve form POST is parsed correctly
export const parseApproveFormBody = async (body: Record<string, string | File>): Promise<{
    action: 'approve' | 'login_approve' | 'reject' | string; // Allow potential other actions
    oauthReqInfo: AuthRequest | null;
    email: string | null; // Email might not be present if already logged in
    password?: string | null; // Password only present on login form
}> => {
    // Safely access potential form fields
	const action = typeof body.action === 'string' ? body.action : '';
	const email = typeof body.email === 'string' ? body.email : null;
	const password = typeof body.password === 'string' ? body.password : null;
	let oauthReqInfo: AuthRequest | null = null;

	try {
        // Ensure body.oauthReqInfo exists and is a non-empty string before parsing
        if (typeof body.oauthReqInfo === 'string' && body.oauthReqInfo.trim() !== '') {
            const parsed = JSON.parse(body.oauthReqInfo) as Partial<AuthRequest>;

            // Basic validation: Check for essential fields expected in AuthRequest
            if (parsed &&
                typeof parsed.client_id === 'string' &&
                typeof parsed.redirect_uri === 'string' &&
                typeof parsed.response_type === 'string'
                /* add other required fields */ )
            {
                 // Cast to AuthRequest if validation passes (make assumptions or add more checks)
                 oauthReqInfo = parsed as AuthRequest;
            } else {
                 console.warn("Parsed oauthReqInfo from form is missing required fields or has incorrect types.");
                 oauthReqInfo = null;
            }
        } else {
            console.warn("oauthReqInfo missing, not a string, or empty in form body.");
        }
	} catch (e: any) {
        console.error("Failed to parse oauthReqInfo JSON from form body:", e.message);
		oauthReqInfo = null; // Ensure it's null on error
	}

    // Return the parsed (or null) values
	return {
        action,
        oauthReqInfo, // This will be null if parsing failed or validation checks didn't pass
        email,
        password
    };
};