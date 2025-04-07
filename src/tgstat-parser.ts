// src/tgstat-parser.ts
import * as cheerio from 'cheerio';
import type { Bindings } from './app'; // Assuming Bindings includes Env if needed later

const BASE_URL = "https://tgstat.ru";
const SEARCH_URL = `${BASE_URL}/channels/search`;

// --- Interfaces for Data Structures ---
export interface ChannelInfo {
    tgstat_url: string;
    username: string | null;
    title: string;
    avatar_url: string | null;
    subscribers_str: string;
    subscribers: number | null;
    avg_reach_str: string;
    avg_reach: number | null;
    ci_index_str: string;
    ci_index: number | null;
    category: string;
}

export interface PostInfo {
    id: number | null;
    datetime_str: string;
    text: string;
    has_photo: boolean;
    has_video: boolean;
    has_document: boolean;
    image_url: string | null;
    video_url: string | null;
    views_str: string;
    views: number | null;
    shares_str: string;
    shares: number | null;
    forwards_str: string;
    forwards: number | null;
    tgstat_post_url?: string;
    telegram_post_url?: string;
}

interface FetchOptions {
    method?: 'GET' | 'POST';
    headers?: HeadersInit;
    body?: BodyInit | null;
}

interface TGStatAjaxResponse<T> {
    status: 'ok' | string; // Can be other statuses on error
    hasMore?: boolean;
    nextPage?: number | string; // Can be post ID
    nextOffset?: number;
    currentLoadedCount?: number;
    html?: string;
    error?: string;
    // Potentially other fields depending on the endpoint
}

export class TGStatParser {
    private csrfTokenForm: string | null = null;
    private sessionCookies: string = ''; // Store cookies as a string
    private defaultHeaders: HeadersInit;
    private ajaxHeaders: HeadersInit;

    constructor() {
        this.defaultHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3",
            "Accept-Encoding": "gzip, deflate, br, zstd", // Note: fetch might handle this automatically
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "same-origin",
        };
        this.ajaxHeaders = {
            ...this.defaultHeaders, // Base headers
            "Accept": "*/*",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            "Origin": BASE_URL,
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
        };
    }

    private log(level: 'info' | 'warn' | 'error', message: string, data?: any) {
        const timestamp = new Date().toISOString();
        const logFunc = console[level] || console.log;
        if (data) {
            logFunc(`[${timestamp}] [TGStatParser] [${level.toUpperCase()}] ${message}`, data);
        } else {
            logFunc(`[${timestamp}] [TGStatParser] [${level.toUpperCase()}] ${message}`);
        }
    }

    private async _fetch(url: string, options: FetchOptions = {}): Promise<Response> {
        const headers = new Headers(options.headers || this.defaultHeaders);

        // Inject stored cookies
        if (this.sessionCookies) {
            headers.set('Cookie', this.sessionCookies);
        }
         // Ensure Referer is set if needed, especially for AJAX
        if (!headers.has('Referer') && (options.method === 'POST' || headers.get('X-Requested-With') === 'XMLHttpRequest')) {
            headers.set('Referer', BASE_URL + '/'); // Default referer
        }


        this.log('info', `Fetching ${options.method || 'GET'} ${url}`);
        const response = await fetch(url, {
            method: options.method || 'GET',
            headers: headers,
            body: options.body,
            redirect: 'manual', // Handle redirects manually if necessary
        });

        // Update cookies from response
        const setCookieHeader = response.headers.get('set-cookie');
        if (setCookieHeader) {
            // Simple merge: new cookies overwrite old ones with the same name
            // More robust parsing might be needed for complex scenarios (path, domain)
            const newCookies = setCookieHeader.split(', ').map(cookie => cookie.split(';')[0]);
            const currentCookiesMap = new Map(
                this.sessionCookies.split('; ').map(c => c.split('='))
            );
            newCookies.forEach(cookie => {
                const [name, value] = cookie.split('=');
                if (name && value) currentCookiesMap.set(name, value);
            });
            this.sessionCookies = Array.from(currentCookiesMap)
                .map(([name, value]) => `${name}=${value}`)
                .join('; ');
             this.log('info', 'Updated session cookies.');
        }

        return response;
    }


    async initialize(): Promise<boolean> {
        this.log('info', 'Initializing parser and fetching initial CSRF token...');
        return this._refreshCsrfToken();
    }

    private async _refreshCsrfToken(urlToVisit: string = SEARCH_URL): Promise<boolean> {
        this.log('info', `Refreshing CSRF token from ${urlToVisit}...`);
        try {
            const response = await this._fetch(urlToVisit, { headers: { ...this.defaultHeaders, 'Referer': BASE_URL + '/' } });

            if (!response.ok) {
                this.log('error', `Failed to fetch CSRF page ${urlToVisit}: Status ${response.status}`);
                return false;
            }

            const html = await response.text();
            const $ = cheerio.load(html);
            const metaToken = $('meta[name="csrf-token"]').attr('content');
            const inputToken = $('input[name="_tgstat_csrk"]').val();

            this.csrfTokenForm = metaToken || inputToken || null;

            if (this.csrfTokenForm) {
                this.log('info', `Obtained CSRF token: ${this.csrfTokenForm.substring(0, 10)}...`);
                return true;
            } else {
                this.log('error', 'Failed to find CSRF token in meta tag or input field.');
                return false;
            }
        } catch (error: any) {
            this.log('error', `Error refreshing CSRF token from ${urlToVisit}: ${error.message}`, error);
            this.csrfTokenForm = null;
            return false;
        }
    }

    private _parseNumber(text: string | undefined | null): number | null {
        if (!text) return 0;
        const cleanedText = text.toLowerCase().trim().replace(/,/g, '.').replace(/\s/g, '');
        if (!cleanedText || cleanedText === 'n/a' || cleanedText === '0') {
            return 0;
        }
        try {
            if (cleanedText.includes('m')) {
                return Math.round(parseFloat(cleanedText.replace('m', '')) * 1_000_000);
            } else if (cleanedText.includes('k')) {
                return Math.round(parseFloat(cleanedText.replace('k', '')) * 1_000);
            } else {
                // Try parsing directly as float then round
                 const num = parseFloat(cleanedText);
                 return isNaN(num) ? null : Math.round(num);
            }
        } catch (e) {
            this.log('warn', `Could not parse number: '${text}'`);
            return null; // Indicate parsing failure
        }
    }

    // Helper to build x-www-form-urlencoded string, handling repeated keys
    private _buildFormDataString(data: Record<string, string | number | boolean | Array<string | number>> | Array<[string, string | number]>): string {
        const params = new URLSearchParams();
        if (Array.isArray(data)) {
            // Handle list of tuples for precise control & repeated keys
            data.forEach(([key, value]) => {
                params.append(key, String(value)); // append allows repeated keys
            });
        } else {
            // Handle simple record object
            for (const key in data) {
                const value = data[key];
                 if (Array.isArray(value)) {
                    value.forEach(item => params.append(`${key}[]`, String(item))); // Common array format key[]
                 } else if (value !== undefined && value !== null) {
                     params.set(key, String(value)); // set overwrites
                 }
            }
        }
        return params.toString();
         // Note: For strict replication of curl's 0&1 for checkboxes, manual building might be needed
         // Example manual build for checkbox flags:
         /*
         let parts: string[] = [];
         for (const key in data) {
             const value = data[key];
             if (key === 'noRedLabel' && value === true) { parts.push("noRedLabel=0", "noRedLabel=1"); }
             // ... other flags
             else if (value !== undefined && value !== null) {
                 parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
             }
         }
         return parts.join('&');
         */
    }


    async searchChannels(query: string, maxPages: number = 1, sort: string = "participants"): Promise<ChannelInfo[] | null> {
        if (!this.csrfTokenForm && !(await this.initialize())) {
             this.log('error', 'Initialization failed, cannot search channels.');
             return null;
         }

        let allChannels: ChannelInfo[] = [];
        let currentPage = 0;
        let currentOffset = 0;
        let hasMore = true;

        while (currentPage < maxPages && hasMore) {
             if (!this.csrfTokenForm) {
                 this.log('warn', 'CSRF token missing mid-search, attempting refresh...');
                 if (!await this._refreshCsrfToken()) {
                     this.log('error', 'CSRF token refresh failed during search pagination.');
                     break;
                 }
             }
            // Data needs to match the curl structure exactly for flags
            const searchDataList: Array<[string, string | number]> = [
                ["_tgstat_csrk", this.csrfTokenForm!], // Use non-null assertion as we checked/refreshed
                ["view", "list"], ["sort", sort], ["q", query], ["inAbout", "0"],
                ["categories", ""], ["countries", ""],
                ["countries[]", "1"], // Assuming Russia (ID 1) as default like curl
                ["languages", ""], ["channelType", ""], ["age", "0-120"], ["err", "0-100"],
                ["er", "0"], ["male", "0"], ["female", "0"], ["participantsCountFrom", ""],
                ["participantsCountTo", ""], ["avgReachFrom", ""], ["avgReachTo", ""],
                ["avgReach24From", ""], ["avgReach24To", ""], ["ciFrom", ""], ["ciTo", ""],
                ["isVerified", "0"], ["isRknVerified", "0"], ["isStoriesAvailable", "0"],
                ["noRedLabel", "0"], ["noRedLabel", "1"], // Replicate curl flags
                ["noScam", "0"], ["noScam", "1"],
                ["noDead", "0"], ["noDead", "1"],
                ["page", currentPage], // `page` seems to be the logical page number here
                ["offset", currentOffset],
            ];

            const bodyString = searchDataList.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');


            try {
                const response = await this._fetch(SEARCH_URL, {
                    method: 'POST',
                    headers: { ...this.ajaxHeaders, 'Referer': SEARCH_URL },
                    body: bodyString // Use manually built string
                });

                if (!response.ok) {
                    this.log('error', `Search request failed: Status ${response.status}`);
                    if (currentPage === 0) return null; // Fail initial search
                    break; // Stop pagination on error
                }

                const result = await response.json() as TGStatAjaxResponse<any>;

                if (result.status !== 'ok' || !result.html) {
                    this.log('warn', `Search response status not OK or no HTML`, result);
                     if (currentPage === 0 && result.status === 'ok' && !result.html) return []; // No results found
                    break;
                }

                const parsedChannels = this._parseSearchHtml(result.html);
                allChannels = allChannels.concat(parsedChannels);
                this.log('info', `Parsed ${parsedChannels.length} channels on page ${currentPage + 1}. Total: ${allChannels.length}`);

                hasMore = result.hasMore ?? false;
                currentPage = typeof result.nextPage === 'number' ? result.nextPage : currentPage + 1; // Use nextPage if available
                currentOffset = result.nextOffset ?? (currentOffset + 30); // Use nextOffset or estimate

                if (hasMore && currentPage < maxPages) {
                    const sleepTime = Math.random() * 1.5 + 1.0; // 1 to 2.5 seconds
                    this.log('info', `Sleeping for ${sleepTime.toFixed(1)}s`);
                    await new Promise(resolve => setTimeout(resolve, sleepTime * 1000));
                }

            } catch (error: any) {
                this.log('error', `Error during channel search request/parsing: ${error.message}`, error);
                if (currentPage === 0) return null;
                break;
            }
        }

        return allChannels;
    }

    private _parseSearchHtml(htmlContent: string): ChannelInfo[] {
         const $ = cheerio.load(htmlContent);
         const channels: ChannelInfo[] = [];
         // More specific selector if possible, or fallback
         const container = $('#channels-list-holder').length ? $('#channels-list-holder') : $('body');

         container.find('div.peer-item-row').each((index, element) => {
             const card = $(element);
             try {
                 const linkTag = card.find('a[href*="/channel/"][href*="/stat"]').first();
                 const href = linkTag.attr('href');
                 if (!href) {
                     this.log('warn', 'Skipping card, no valid link tag found.');
                     return; // continue loop
                 }

                 const tgstatUrl = href.startsWith('/') ? BASE_URL + href : href;
                 const usernameMatch = href.match(/\/channel\/(@?[\w\d\-]+)\/stat/);
                 const username = usernameMatch ? usernameMatch[1] : null;

                 const titleTag = card.find('.text-truncate.font-16.text-dark').first();
                 const title = titleTag.text().trim() || 'N/A';

                 const imgTag = card.find('img.img-thumbnail');
                 let avatarUrl = imgTag.attr('src') || null;
                 if (avatarUrl && avatarUrl.startsWith('//')) {
                     avatarUrl = 'https:' + avatarUrl;
                 }

                 const statsCols = card.find('.col.col-12.col-sm-7 .row .col.col-4.pt-1');
                 let subscribers_str = 'N/A', avg_reach_str = 'N/A', ci_index_str = 'N/A';
                 let subscribers = null, avg_reach = null, ci_index = null;

                 if (statsCols.length === 3) {
                     subscribers_str = statsCols.eq(0).find('h4').text().trim() || 'N/A';
                     avg_reach_str = statsCols.eq(1).find('h4').text().trim() || 'N/A';
                     ci_index_str = statsCols.eq(2).find('h4').text().trim() || 'N/A';
                 } else {
                     // Fallback: Try finding subscribers directly from the left part
                     const subsDiv = card.find('div.text-truncate.font-14.text-dark');
                     if (subsDiv.length > 0) {
                          const subsMatch = subsDiv.text().match(/^([\d\s,km.]+)/);
                          if (subsMatch) {
                               subscribers_str = subsMatch[1].trim();
                          }
                     }
                 }

                 subscribers = this._parseNumber(subscribers_str);
                 avg_reach = this._parseNumber(avg_reach_str);
                 ci_index = this._parseNumber(ci_index_str);

                 const categoryTag = card.find('.border.rounded.bg-light.px-1').first();
                 const category = categoryTag.text().trim() || 'N/A';


                 channels.push({
                     tgstat_url: tgstatUrl,
                     username: username,
                     title: title,
                     avatar_url: avatarUrl,
                     subscribers_str: subscribers_str,
                     subscribers: subscribers,
                     avg_reach_str: avg_reach_str,
                     avg_reach: avg_reach,
                     ci_index_str: ci_index_str,
                     ci_index: ci_index,
                     category: category,
                 });
             } catch (e: any) {
                 this.log('error', `Error parsing a channel card: ${e.message}`, e);
             }
         });
         return channels;
     }


    async getChannelPosts(channelUsernameOrId: string, maxPosts: number = 50): Promise<PostInfo[] | null> {
        if (!this.csrfTokenForm && !(await this.initialize())) {
            this.log('error', 'Initialization failed, cannot get posts.');
            return null;
        }

        const channelSegment = channelUsernameOrId.startsWith('@') ? channelUsernameOrId.substring(1) : channelUsernameOrId;
        const channelUrl = `${BASE_URL}/channel/@${channelSegment}`; // TGStat uses @ prefix in URL structure

        this.log('info', `Fetching initial posts for ${channelUsernameOrId}...`);
        try {
            // 1. Get Initial Page HTML
            const initialResponse = await this._fetch(channelUrl, { headers: {...this.defaultHeaders, 'Referer': SEARCH_URL }});
            if (!initialResponse.ok) {
                this.log('error', `Failed to fetch initial channel page ${channelUrl}: Status ${initialResponse.status}`);
                return null;
            }
            const initialHtml = await initialResponse.text();

            // Re-check CSRF token after page load
            const $initial = cheerio.load(initialHtml);
            const metaToken = $initial('meta[name="csrf-token"]').attr('content');
             if (metaToken && metaToken !== this.csrfTokenForm) {
                 this.log('info', 'CSRF token updated from channel page.');
                 this.csrfTokenForm = metaToken;
             } else if (!this.csrfTokenForm && metaToken) {
                 this.log('info', 'CSRF token obtained from channel page.');
                 this.csrfTokenForm = metaToken;
             }

            let allPosts = this._parsePostsHtml(initialHtml);
            this.log('info', `Parsed ${allPosts.length} initial posts.`);
            if (allPosts.length === 0) return [];


            // 2. Paginate using AJAX calls
            let lastPostId: number | string | undefined | null = allPosts[allPosts.length - 1]?.id;
             // Estimate initial offset based on initial load - TGStat seems to load 20 initially
            let currentOffset = allPosts.length;
            let hasMore = true; // Assume more initially

             // Check for initial pagination info (might be embedded in JS or specific elements)
             const loadMoreButton = $initial('.lm-button'); // Example selector
             if (loadMoreButton.length === 0) {
                 hasMore = false; // No load more button means no more posts?
                 this.log('info', 'No load more button found on initial page.');
             }


            while (allPosts.length < maxPosts && hasMore && lastPostId) {
                const sleepTime = Math.random() * 2.0 + 1.5; // 1.5 to 3.5 seconds
                this.log('info', `Sleeping for ${sleepTime.toFixed(1)}s before next post batch...`);
                await new Promise(resolve => setTimeout(resolve, sleepTime * 1000));

                 if (!this.csrfTokenForm) {
                     this.log('warn', 'CSRF token missing mid-pagination, attempting refresh...');
                     if (!await this._refreshCsrfToken(channelUrl)) { // Refresh from channel page
                         this.log('error', 'CSRF token refresh failed during pagination.');
                         break;
                     }
                 }


                // Prepare data for the /posts-last request
                const postsDataList: Array<[string, string | number]> = [
                    ["_tgstat_csrk", this.csrfTokenForm!],
                    ["date", "0"], ["q", ""],
                    ["hideDeleted", "0"], ["hideDeleted", "1"], // Match curl
                    ["hideForwards", "0"], // Match curl
                    ["page", String(lastPostId)], // `page` seems to hold the last post ID for the request
                    ["offset", currentOffset],
                ];
                const bodyString = postsDataList.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
                const postsUrl = `${BASE_URL}/channel/@${channelSegment}/posts-last`;

                try {
                    const ajaxResponse = await this._fetch(postsUrl, {
                        method: 'POST',
                        headers: { ...this.ajaxHeaders, 'Referer': channelUrl },
                        body: bodyString
                    });

                    if (!ajaxResponse.ok) {
                        this.log('error', `Load more posts request failed: Status ${ajaxResponse.status}`);
                        break;
                    }

                    const result = await ajaxResponse.json() as TGStatAjaxResponse<any>;


                    if (result.status !== 'ok' || !result.html) {
                         this.log('warn', `Load more response status not OK or no HTML`, result);
                         hasMore = false; // Stop if no HTML even if status is ok
                         break;
                     }

                    const newPosts = this._parsePostsHtml(result.html);
                    if (newPosts.length === 0) {
                        this.log('info', 'Parsing load more HTML yielded 0 posts.');
                        hasMore = false;
                        break;
                    }

                    allPosts = allPosts.concat(newPosts);
                    this.log('info', `Parsed ${newPosts.length} more posts. Total: ${allPosts.length}`);

                    hasMore = result.hasMore ?? false;
                    lastPostId = result.nextPage ?? newPosts[newPosts.length - 1]?.id; // nextPage is the ID for the *next* request's 'page'
                    currentOffset = result.nextOffset ?? (currentOffset + newPosts.length);

                     if (!lastPostId) {
                         this.log('warn', 'Could not determine next post ID for pagination. Stopping.');
                         hasMore = false;
                     }
                     if (!hasMore) {
                         this.log('info', 'API indicated no more posts (hasMore: false).');
                     }

                } catch (error: any) {
                    this.log('error', `Error during load more posts request/parsing: ${error.message}`, error);
                    break;
                }
            } // end while loop

            return allPosts.slice(0, maxPosts);

        } catch (error: any) {
            this.log('error', `Fatal error getting channel posts for ${channelUsernameOrId}: ${error.message}`, error);
            return null;
        }
    }

    private _parsePostsHtml(htmlContent: string): PostInfo[] {
        const $ = cheerio.load(htmlContent);
        const posts: PostInfo[] = [];
        const container = $('.posts-list').length ? $('.posts-list') : $('body'); // Find container

        container.find('div.post-container').each((index, element) => {
            const postTag = $(element);
            const postData: Partial<PostInfo> = {}; // Use Partial initially

            try {
                postData.id = this._extractPostId(postTag.attr('id'));

                const timeTag = postTag.find('.post-header small').first();
                postData.datetime_str = timeTag.text().trim() || 'N/A';

                const textParts = postTag.find('.post-body .post-text');
                postData.text = textParts.map((i, el) => $(el).text().trim()).get().join('\n').trim();

                const body = postTag.find('.post-body').first();
                postData.has_photo = body.find('.post-img, .carousel').length > 0;
                postData.has_video = body.find('.wrapper-thumbnail, .wrapper-video').length > 0;
                postData.has_document = body.hasClass('isDocument'); // Check class on body itself

                const imgTag = body.find('img.post-img-img').first();
                 let imageUrl = imgTag.attr('src');
                 postData.image_url = imageUrl ? (imageUrl.startsWith('//') ? 'https:' + imageUrl : imageUrl) : null;

                 const videoSource = body.find('video source').first();
                 let videoUrl = videoSource.attr('src');
                 postData.video_url = videoUrl ? (videoUrl.startsWith('//') ? 'https:' + videoUrl : videoUrl) : null;

                // Stats parsing (more robust)
                const statsRow = postTag.find('.col.col-12.d-flex').last(); // Usually the last row with buttons
                 postData.views_str = 'N/A'; postData.views = null;
                 postData.shares_str = 'N/A'; postData.shares = null;
                 postData.forwards_str = 'N/A'; postData.forwards = null;

                 if (statsRow.length) {
                     const viewsLink = statsRow.find('a.btn[data-original-title*="Количество просмотров публикации"]').first();
                     if (viewsLink.length) {
                         postData.views_str = viewsLink.text().trim();
                         postData.views = this._parseNumber(postData.views_str);
                     }
                     const sharesLink = statsRow.find('a.btn[data-original-title*="Поделились"]').first();
                     if (sharesLink.length) {
                         postData.shares_str = sharesLink.text().trim();
                         postData.shares = this._parseNumber(postData.shares_str);
                     }
                     const forwardsSpan = statsRow.find('span.btn[data-original-title*="Пересылок всего"]').first();
                     if (forwardsSpan.length) {
                         postData.forwards_str = forwardsSpan.text().trim();
                         postData.forwards = this._parseNumber(postData.forwards_str);
                     }
                 }


                const tgstatLinkTag = postTag.find('a[data-original-title="Постоянная ссылка на публикацию"]').first();
                 const tgstatHref = tgstatLinkTag.attr('href');
                 postData.tgstat_post_url = tgstatHref ? (tgstatHref.startsWith('/') ? BASE_URL + tgstatHref : tgstatHref) : undefined;

                const telegramLinkTag = postTag.find('a.dropdown-item[href*="t.me/"][target="_blank"], a.dropdown-item[href*="ttttt.me/"][target="_blank"]').first();
                postData.telegram_post_url = telegramLinkTag.attr('href') || undefined;


                // Ensure all required fields are present before pushing
                 if (postData.id !== null && postData.datetime_str && postData.text !== undefined) {
                     posts.push(postData as PostInfo); // Cast to full type
                 } else {
                      this.log('warn', `Skipping post due to missing essential data (ID: ${postData.id})`);
                 }

            } catch (e: any) {
                this.log('error', `Error parsing a post card (ID: ${postData.id ?? 'unknown'}): ${e.message}`, e);
            }
        });
        return posts;
    }

     private _extractPostId(idString: string | undefined): number | null {
         if (!idString) return null;
         const match = idString.match(/post-(\d+)/);
         return match ? parseInt(match[1], 10) : null;
     }
}