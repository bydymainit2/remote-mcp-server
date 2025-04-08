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
                }
                main {
                    flex-grow: 1;
                }

				/* Custom styling for markdown content */
				.markdown h1 {
					font-size: 2rem; /* Adjusted size */
					font-weight: 700;
					font-family: "Roboto", system-ui, sans-serif;
					color: #1a202c; /* Darker gray */
					margin-bottom: 1.5rem; /* Increased margin */
                    padding-bottom: 0.5rem; /* Add padding */
                    border-bottom: 1px solid #e2e8f0; /* Add border */
					line-height: 1.2;
				}
				.markdown h2 {
					font-size: 1.5rem;
					font-weight: 600;
					font-family: "Roboto", system-ui, sans-serif;
					color: #2d3748; /* Medium gray */
					margin-top: 2rem; /* Increased margin */
					margin-bottom: 1rem; /* Increased margin */
                    padding-bottom: 0.25rem;
                    border-bottom: 1px solid #e2e8f0;
					line-height: 1.3;
				}
				.markdown h3 {
					font-size: 1.25rem;
					font-weight: 600;
					font-family: "Roboto", system-ui, sans-serif;
					color: #2d3748;
					margin-top: 1.5rem;
					margin-bottom: 0.75rem;
				}
				.markdown p {
					font-size: 1rem; /* Standard size */
					color: #4a5568; /* Lighter gray */
					margin-bottom: 1rem;
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
					padding: 0.75rem 1rem; /* Adjusted padding */
					margin: 1.5rem 0; /* Vertical margin only */
					background-color: #fffbeb; /* Light yellow background */
                    color: #713f12; /* Darker text for contrast */
					font-style: italic;
				}
				.markdown blockquote p {
					margin-bottom: 0.5rem; /* Spacing within blockquote */
                    font-size: 0.95rem; /* Slightly smaller text */
				}
                 .markdown blockquote p:last-child {
                    margin-bottom: 0;
                }
				.markdown ul,
				.markdown ol {
					margin-top: 1rem;
					margin-bottom: 1rem;
					margin-left: 1.75rem; /* Increased indent */
					font-size: 1rem;
					color: #4a5568;
                    line-height: 1.7;
				}
				.markdown li {
					margin-bottom: 0.5rem;
				}
				.markdown ul li::marker { /* Style list markers */
                    color: #3498db;
                }
                .markdown ol li::marker {
                    color: #3498db;
                    font-weight: 500;
                }
				.markdown pre {
					background-color: #f7fafc; /* Very light gray */
					padding: 1rem;
					border-radius: 0.375rem; /* Tailwind's rounded-md */
                    border: 1px solid #e2e8f0; /* Light border */
					margin-top: 1.5rem;
					margin-bottom: 1.5rem;
					overflow-x: auto;
                    font-size: 0.9rem; /* Smaller font for code */
                    line-height: 1.5;
				}
				.markdown code { /* Inline code */
					font-family: 'Courier New', Courier, monospace;
					font-size: 0.9em; /* Relative size */
					background-color: #edf2f7; /* Slightly darker gray */
					padding: 0.15rem 0.3rem; /* Adjusted padding */
					border-radius: 0.25rem; /* Tailwind's rounded-sm */
                    color: #2d3748;
				}
				.markdown pre code { /* Code within pre blocks */
					background-color: transparent;
					padding: 0;
                    border-radius: 0;
                    color: inherit; /* Inherit color from pre */
                    font-size: inherit;
				}
			</style>
		</head>
		<body
			class="bg-gray-100 text-gray-800 font-sans leading-relaxed flex flex-col min-h-screen"
		>
			<header class="bg-white shadow-md mb-8 sticky top-0 z-10"> {/* Make header sticky */}
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
			<main class="container mx-auto px-4 sm:px-6 lg:px-8 pb-12 flex-grow">
				${content}
			</main>
			<footer class="bg-gray-200 py-4 mt-auto"> {/* Footer styles */}
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
    const readmeUrl = new URL("/README.md", origin).toString(); // Construct full URL for fetch
	console.log(`Fetching README from: ${readmeUrl}`); // Log URL being fetched

	try {
        // Use the passed fetcher binding
		const res = await assetsFetcher.fetch(readmeUrl); // Use the full URL

		if (!res.ok) {
			console.error(`Failed to fetch README.md from ASSETS. Status: ${res.status} ${res.statusText}`);
			const errorBody = await res.text().catch(() => "Could not read error body"); // Try reading body for clues
            console.error("Error Body:", errorBody);
			return html`<div class="max-w-4xl mx-auto markdown">
                <h1>Error</h1>
                <p>Could not load README content from static assets. Please ensure the ASSETS binding is configured correctly and README.md exists in the static directory.</p>
                <p>Status: ${res.status} ${res.statusText}</p>
            </div>`;
		}
		const markdown = await res.text();
		const content = await marked(markdown); // Consider using a safer markdown renderer if needed
		return html`
			<div class="max-w-4xl mx-auto markdown">${raw(content)}</div>
		`;
	} catch (error: any) {
		console.error("Error fetching or parsing README.md:", error);
		return html`<div class="max-w-4xl mx-auto markdown">
            <h1>Error</h1>
            <p>An unexpected error occurred while loading content.</p>
            <pre><code>${error.message}</code></pre>
        </div>`;
	}
};

// --- Logged-In Authorization Screen ---
export const renderLoggedInAuthorizeScreen = async (
	oauthScopes: { name: string; description: string }[],
	oauthReqInfo: AuthRequest,
): Promise<HtmlEscapedString> => {
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
                {/* Hidden field to carry OAuth request info */}
				<input
					type="hidden"
					name="oauthReqInfo"
					value="${JSON.stringify(oauthReqInfo)}"
				/>
                {/* Hidden field for the logged-in user's identifier (replace with actual logic) */}
				<input type="hidden" name="email" value="user@example.com" />

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
				<input
					type="hidden"
					name="oauthReqInfo"
					value="${JSON.stringify(oauthReqInfo)}"
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
						class="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-shadow"
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
						class="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-shadow"
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
        html`<svg class="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>` :
        html`<svg class="w-12 h-12 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
    const bgColor = status === 'success' ? 'bg-green-50' : 'bg-red-50';
    const borderColor = status === 'success' ? 'border-green-200' : 'border-red-200';

	return html`
		<div
			class="max-w-md mx-auto ${bgColor} p-6 sm:p-8 rounded-lg shadow-md text-center border ${borderColor}"
		>
			<div class="mb-4 flex justify-center">
                ${icon}
			</div>
			<h1 class="text-xl sm:text-2xl font-heading font-bold mb-4 text-gray-900">
				${message}
			</h1>
			<p class="mb-6 text-gray-600 text-sm sm:text-base">
				You will be redirected back to the application shortly. If not, click the link below.
			</p>
			<a
                href="${redirectUrl}"  {/* Make this link functional */}
				class="inline-block py-2 px-5 bg-primary text-white rounded-md font-semibold hover:bg-blue-600 transition-colors text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
			>
				Continue to Application
			</a>
            {/* Auto-redirect script */}
			${raw(`
				<script>
					setTimeout(() => {
						if (window.location.href !== "${redirectUrl}") { // Prevent loop if already there
							window.location.href = "${redirectUrl}";
						}
					}, 3000); // Increased delay to 3 seconds
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
export const parseApproveFormBody = async (body: Record<string, string | File>): Promise<{
    action: 'approve' | 'login_approve' | 'reject' | string; // Allow other actions?
    oauthReqInfo: AuthRequest | null;
    email: string | null; // Email might not be present if already logged in
    password?: string | null; // Password only present on login form
}> => {
	const action = body.action as string;
	const email = body.email as string || null; // Handle potential absence
	const password = body.password as string || null; // Handle potential absence
	let oauthReqInfo: AuthRequest | null = null;

	try {
        // Ensure body.oauthReqInfo exists and is a string before parsing
        if (typeof body.oauthReqInfo === 'string' && body.oauthReqInfo) {
		    oauthReqInfo = JSON.parse(body.oauthReqInfo) as AuthRequest;
            // Basic validation (can add more checks)
            if (!oauthReqInfo || typeof oauthReqInfo.client_id !== 'string') {
                 console.warn("Parsed oauthReqInfo seems invalid.");
                 oauthReqInfo = null;
            }
        } else {
            console.warn("oauthReqInfo missing or not a string in form body.");
        }
	} catch (e: any) {
        console.error("Failed to parse oauthReqInfo from form body:", e.message);
		oauthReqInfo = null;
	}

	return { action, oauthReqInfo, email, password };
};