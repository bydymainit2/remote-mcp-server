import requests
from bs4 import BeautifulSoup
import json
import re
import time
from urllib.parse import unquote, parse_qs, urlencode
import random
import logging # Import logging

# --- Setup Logging ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
# Use logging.debug for verbose, logging.info for standard messages, logging.warning/error for issues


class TGStatParser:
    """
    A class to interact with TGStat.ru for searching channels and fetching posts.
    Handles CSRF tokens and session management.
    """
    BASE_URL = "https://tgstat.ru"
    SEARCH_URL = f"{BASE_URL}/channels/search"
    DEFAULT_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Priority": "u=0, i",
    }
    AJAX_HEADERS = {
        "Accept": "*/*",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Origin": BASE_URL,
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Priority": "u=0",
    }

    def __init__(self, verbose=True): # verbose flag is now handled by logging level
        """
        Initializes the parser with a requests session and fetches the initial CSRF token.
        """
        self.session = requests.Session()
        self.session.headers.update(self.DEFAULT_HEADERS)
        self.csrf_token_form = None # Token specifically for POST request data bodies
        if not self._refresh_csrf_token():
             logging.error("Failed to initialize TGStatParser: Could not obtain CSRF token.")
             raise ConnectionError("Failed to initialize TGStatParser: Could not obtain CSRF token.")

    def _refresh_csrf_token(self, url_to_visit=None):
        """
        Fetches a page to update session cookies and extract the necessary CSRF token.
        Returns True if successful, False otherwise.
        """
        url = url_to_visit or self.SEARCH_URL # Use search page by default
        logging.info(f"Refreshing CSRF token from {url}...")
        headers = self.DEFAULT_HEADERS.copy()
        headers["Referer"] = self.BASE_URL + "/" # Add a generic referer

        try:
            response = self.session.get(url, headers=headers, timeout=20)
            response.raise_for_status()

            soup = BeautifulSoup(response.text, 'html.parser')
            meta_tag = soup.find('meta', {'name': 'csrf-token'})

            if meta_tag and 'content' in meta_tag.attrs:
                self.csrf_token_form = meta_tag['content']
                logging.info(f"Obtained CSRF token for forms: {self.csrf_token_form[:10]}...")
                if '_tgstat_csrk' in self.session.cookies:
                    logging.info("Session cookie '_tgstat_csrk' is set.")
                else:
                     logging.warning("Warning: Session cookie '_tgstat_csrk' was not explicitly found after GET, but session might still handle it.")
                return True
            else:
                input_tag = soup.find('input', {'name': '_tgstat_csrk'})
                if input_tag and 'value' in input_tag.attrs:
                    self.csrf_token_form = input_tag['value']
                    logging.info(f"Obtained CSRF token from input: {self.csrf_token_form[:10]}...")
                    return True
                else:
                    logging.error("Failed to find CSRF token in meta tag or input field.")
                    self.csrf_token_form = None
                    return False

        except requests.exceptions.RequestException as e:
            logging.error(f"Error refreshing CSRF token: {e}")
            self.csrf_token_form = None
            return False
        except Exception as e:
            logging.error(f"Unexpected error during CSRF refresh: {e}", exc_info=True)
            self.csrf_token_form = None
            return False

    def _make_search_request(self, query, page=0, offset=0, sort="participants", country_id=1):
        """
        Internal method to perform the actual channel search POST request.
        """
        if not self.csrf_token_form:
            logging.warning("No CSRF form token found. Attempting to refresh...")
            if not self._refresh_csrf_token():
                 logging.error("Failed to refresh CSRF token. Search aborted.")
                 return None

        search_data = {
            "_tgstat_csrk": self.csrf_token_form,
            "view": "list",
            "sort": sort,
            "q": query,
            "inAbout": "0",
            "categories": "",
            "countries": "",
            # Use f-string for dynamic key based on country_id
            f"countries[{country_id}]": str(country_id),
            "languages": "",
            "channelType": "",
            "age": "0-120",
            "err": "0-100",
            "er": "0",
            "male": "0",
            "female": "0",
            "participantsCountFrom": "",
            "participantsCountTo": "",
            "avgReachFrom": "",
            "avgReachTo": "",
            "avgReach24From": "",
            "avgReach24To": "",
            "ciFrom": "",
            "ciTo": "",
            "isVerified": "0",
            "isRknVerified": "0",
            "isStoriesAvailable": "0",
            # Using list of tuples for repeated keys, ensure urlencode is used
            # "noRedLabel": "1", # Simpler if only '1' is needed
            # "noScam": "1",
            # "noDead": "1",
            "page": page,
            "offset": offset,
        }
        # Use list of tuples ONLY if multiple values for the same key are strictly needed
        search_data_list = [
            ("_tgstat_csrk", self.csrf_token_form),
            ("view", "list"), ("sort", sort), ("q", query), ("inAbout", "0"),
            ("categories", ""), ("countries", ""),
            # Correctly handle array format for country - using the country_id as the key value pair target
            # This format `countries[ID]=ID` is strange but matches the initial curl
            (f"countries[{country_id}]", str(country_id)),
            # If the simpler format `countries[]=ID` is desired, use this instead:
            # ("countries[]", str(country_id)),
            ("languages", ""), ("channelType", ""), ("age", "0-120"), ("err", "0-100"),
            ("er", "0"), ("male", "0"), ("female", "0"), ("participantsCountFrom", ""),
            ("participantsCountTo", ""), ("avgReachFrom", ""), ("avgReachTo", ""),
            ("avgReach24From", ""), ("avgReach24To", ""), ("ciFrom", ""), ("ciTo", ""),
            ("isVerified", "0"), ("isRknVerified", "0"), ("isStoriesAvailable", "0"),
            # Include all necessary flags as per curl
            ("noRedLabel", "0"), ("noRedLabel", "1"),
            ("noScam", "0"), ("noScam", "1"),
            ("noDead", "0"), ("noDead", "1"),
            ("page", page), ("offset", offset),
        ]


        headers = self.session.headers.copy()
        headers.update(self.AJAX_HEADERS)
        headers["Referer"] = self.SEARCH_URL

        logging.info(f"Searching channels with query: '{query}', page: {page}, offset: {offset}")
        try:
            # Use urlencode with doseq=True when data is a list of tuples
            response = self.session.post(
                self.SEARCH_URL,
                data=urlencode(search_data_list, doseq=True),
                # data=search_data, # Use this if search_data is a dict
                headers=headers,
                timeout=20
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logging.error(f"Search request failed: {e}")
            return None
        except json.JSONDecodeError:
            logging.error(f"Failed to decode JSON response from search.")
            logging.debug(f"Response Text: {response.text[:500]}...")
            return None

    def _parse_search_html(self, html_content):
        """Parses the HTML returned by the search request."""
        soup = BeautifulSoup(html_content, 'html.parser')
        channels = []
        # Find the main container for channel cards if direct selection fails
        container = soup.find('div', id='channels-list-holder') or soup
        channel_cards = container.find_all('div', class_='peer-item-row', recursive=False) # Look only for direct children

        if not channel_cards:
             logging.warning("Could not find 'peer-item-row' divs directly. Searching deeper.")
             # Fallback to searching anywhere if the structure is nested differently
             channel_cards = soup.find_all('div', class_='peer-item-row')

        logging.info(f"Found {len(channel_cards)} potential channel cards in search HTML.")

        for card in channel_cards:
            try:
                channel_info = {}
                link_tag = card.find('a', href=re.compile(r'/channel/(@[\w_]+|[\w\d\-]+)/stat')) # Allow hyphens in ID
                if not link_tag:
                    logging.warning("Skipping card, no valid link tag found.")
                    continue

                href = link_tag['href']
                # FIX: Correct URL construction
                if href.startswith('/'):
                    channel_info['tgstat_url'] = self.BASE_URL + href
                elif href.startswith('http'):
                    channel_info['tgstat_url'] = href # Already absolute
                else:
                    # Handle unexpected format, maybe log a warning
                    logging.warning(f"Unexpected href format: {href}. Prepending base URL.")
                    channel_info['tgstat_url'] = f"{self.BASE_URL}/{href}" # Best guess

                match = re.search(r'/channel/(@[\w_]+|[\w\d\-]+)/stat', href)
                channel_info['username'] = match.group(1) if match else None

                # FIX: More specific selector for title based on provided HTML
                title_tag = card.find('div', class_='text-truncate font-16 text-dark mt-n1')
                channel_info['title'] = title_tag.text.strip() if title_tag else 'N/A'
                if channel_info['title'] == 'N/A':
                     logging.warning(f"Could not find title for {channel_info.get('username','N/A')}. Check selector: 'div.text-truncate.font-16.text-dark.mt-n1'")


                img_tag = card.find('img', class_='img-thumbnail')
                channel_info['avatar_url'] = img_tag['src'] if img_tag and img_tag.get('src') else None
                if channel_info['avatar_url'] and channel_info['avatar_url'].startswith('//'):
                     channel_info['avatar_url'] = 'https:' + channel_info['avatar_url']

                # Extract stats
                stats_container = card.select_one('.col.col-12.col-sm-7')
                channel_info['subscribers'] = None
                channel_info['subscribers_str'] = 'N/A'
                channel_info['avg_reach'] = None
                channel_info['avg_reach_str'] = 'N/A'
                channel_info['ci_index'] = None
                channel_info['ci_index_str'] = 'N/A'

                if stats_container:
                     stats_cols = stats_container.select('.col.col-4.pt-1')
                     if len(stats_cols) == 3:
                         try:
                             subs_text = stats_cols[0].select_one('h4').text.strip().replace(' ', '')
                             channel_info['subscribers_str'] = subs_text
                             channel_info['subscribers'] = self._parse_number(subs_text)
                         except AttributeError: pass # Ignore if h4 not found

                         try:
                             reach_text = stats_cols[1].select_one('h4').text.strip()
                             channel_info['avg_reach_str'] = reach_text
                             channel_info['avg_reach'] = self._parse_number(reach_text)
                         except AttributeError: pass

                         try:
                             ci_text = stats_cols[2].select_one('h4').text.strip().replace(' ', '')
                             channel_info['ci_index_str'] = ci_text
                             channel_info['ci_index'] = self._parse_number(ci_text)
                         except AttributeError: pass
                     else:
                         logging.warning(f"Expected 3 stats columns, found {len(stats_cols)} for {channel_info.get('username','N/A')}")

                # Fallback if stats columns not found/parsed correctly
                if channel_info['subscribers'] is None:
                     subs_div = card.find('div', class_='text-truncate font-14 text-dark')
                     if subs_div:
                          subs_match = re.search(r'([\d\s,km.]+)', subs_div.text) # Extract leading number part
                          if subs_match:
                               subs_text = subs_match.group(1).strip().replace(' ', '')
                               channel_info['subscribers_str'] = subs_text
                               channel_info['subscribers'] = self._parse_number(subs_text)

                category_tag = card.find('span', class_='border rounded bg-light px-1')
                channel_info['category'] = category_tag.text.strip() if category_tag else 'N/A'

                channels.append(channel_info)
            except Exception as e:
                logging.error(f"Error parsing a channel card: {e}", exc_info=True)
                continue # Skip this card

        return channels

    def _parse_number(self, text):
        """Helper to parse numbers like '2m', '38.2k', '9279489'."""
        text = text.lower().strip().replace(',', '.').replace(' ', '')
        if not text or text == 'n/a' or text == '0':
            return 0
        try:
            if 'm' in text:
                return int(float(text.replace('m', '')) * 1_000_000)
            elif 'k' in text:
                return int(float(text.replace('k', '')) * 1_000)
            else:
                # Attempt direct conversion first
                try:
                    return int(text)
                except ValueError:
                     # If direct int fails, try float then int (handles cases like '59.5')
                     return int(float(text))
        except ValueError:
            logging.warning(f"Could not parse number: '{text}'")
            return None # Indicate parsing failure

    def search_channels(self, query, max_pages=1, sort="participants"):
        """
        Searches for channels on TGStat.

        Args:
            query (str): The search term.
            max_pages (int): Maximum number of result pages to fetch.
            sort (str): Sorting criteria (e.g., 'participants', 'avg_reach', 'ci_index').

        Returns:
            list: A list of dictionaries, each containing info about a channel,
                  or None if the initial search fails. Returns [] if search works but finds nothing.
        """
        all_channels = []
        current_page = 0
        current_offset = 0
        has_more = True

        while current_page < max_pages and has_more:
            search_result = self._make_search_request(query, current_page, current_offset, sort)

            if not search_result or search_result.get('status') != 'ok':
                logging.error("Search request failed or returned error status.")
                if current_page == 0:
                     return None
                else:
                     break # Stop pagination if a later page fails

            html_content = search_result.get('html', '')
            if not html_content:
                 logging.warning("No HTML content in search response.")
                 break # Stop if no HTML

            parsed_channels = self._parse_search_html(html_content)

            if not parsed_channels and current_page == 0:
                 logging.info(f"No channels found for query '{query}'.")
                 return [] # Return empty list

            all_channels.extend(parsed_channels)
            logging.info(f"Found {len(parsed_channels)} channels on page {current_page + 1}. Total: {len(all_channels)}")

            has_more = search_result.get('hasMore', False)
            current_page = search_result.get('nextPage', current_page + 1)
            current_offset = search_result.get('nextOffset', current_offset + 30) # Default to 30 if not provided

            if has_more and current_page < max_pages:
                sleep_time = random.uniform(1.5, 3.0)
                logging.info(f"Sleeping for {sleep_time:.2f} seconds before next page...")
                time.sleep(sleep_time) # Politeness delay

        return all_channels

    def _get_initial_posts_html(self, channel_username_or_id):
        """Fetches the initial HTML page for a channel."""
        # Determine segment: remove @ if present
        channel_segment = channel_username_or_id.lstrip('@')
        channel_url = f"{self.BASE_URL}/channel/@{channel_segment}" # TGStat URL structure often uses @ prefix

        logging.info(f"Fetching initial posts page: {channel_url}")
        headers = self.session.headers.copy()
        headers.update(self.DEFAULT_HEADERS)
        headers["Referer"] = self.SEARCH_URL # Referer from search results or main page

        try:
            response = self.session.get(channel_url, headers=headers, timeout=20)
            response.raise_for_status()
            # Optional: Refresh CSRF token based on this page if needed for subsequent actions
            # soup = BeautifulSoup(response.text, 'html.parser')
            # meta_tag = soup.find('meta', {'name': 'csrf-token'})
            # if meta_tag and 'content' in meta_tag.attrs:
            #     self.csrf_token_form = meta_tag['content']
            #     logging.info(f"Refreshed CSRF token from channel page: {self.csrf_token_form[:10]}...")
            return response.text
        except requests.exceptions.RequestException as e:
            logging.error(f"Failed to fetch initial channel page {channel_url}: {e}")
            return None

    def _make_more_posts_request(self, channel_username_or_id, last_post_id, offset):
        """Internal method to perform the 'load more posts' POST request."""
        if not self.csrf_token_form:
            logging.warning("No CSRF form token found for loading more posts. Attempting refresh...")
            # Refresh using the channel page itself
            if not self._refresh_csrf_token(f"{self.BASE_URL}/channel/@{channel_username_or_id.lstrip('@')}"):
                logging.error("Failed to refresh CSRF token. Load more aborted.")
                return None

        channel_segment = channel_username_or_id.lstrip('@')
        posts_url = f"{self.BASE_URL}/channel/@{channel_segment}/posts-last"
        channel_page_url = f"{self.BASE_URL}/channel/@{channel_segment}"

        posts_data = {
            "_tgstat_csrk": self.csrf_token_form,
            "date": "0",
            "q": "",
            "hideDeleted": "1",
            "hideForwards": "0",
            "page": last_post_id,
            "offset": offset,
        }
        # Use list of tuples if needed for multi-value params (like hideDeleted=0&hideDeleted=1)
        posts_data_list = [
             ("_tgstat_csrk", self.csrf_token_form),
             ("date", "0"), ("q", ""),
             ("hideDeleted", "0"), ("hideDeleted", "1"), # As per curl
             ("hideForwards", "0"), # As per curl
             ("page", last_post_id), ("offset", offset),
        ]


        headers = self.session.headers.copy()
        headers.update(self.AJAX_HEADERS)
        headers["Referer"] = channel_page_url

        logging.info(f"Requesting more posts for {channel_username_or_id}, page (last_id): {last_post_id}, offset: {offset}")
        try:
            response = self.session.post(
                posts_url,
                data=urlencode(posts_data_list, doseq=True), # Use list for multi-value
                # data=posts_data, # Use dict if no multi-value needed
                headers=headers,
                timeout=20
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logging.error(f"'Load more posts' request failed: {e}")
            return None
        except json.JSONDecodeError:
            logging.error(f"Failed to decode JSON response from 'load more posts'.")
            logging.debug(f"Response Text: {response.text[:500]}...")
            return None

    def _extract_post_id(self, post_tag):
        """Extracts numeric post ID from tag id like 'post-71374303853'."""
        post_id_str = post_tag.get('id', '')
        match = re.search(r'post-(\d+)', post_id_str)
        return int(match.group(1)) if match else None

    def _parse_posts_html(self, html_content):
        """Parses HTML containing one or more post cards."""
        soup = BeautifulSoup(html_content, 'html.parser')
        posts = []
        # Find container first
        container = soup.find('div', class_='posts-list') or soup
        post_containers = container.find_all('div', class_='post-container', recursive=False) # Find direct children first

        if not post_containers:
            # Fallback if structure is different (e.g., posts directly under body or another div)
            post_containers = soup.find_all('div', class_='post-container')
            if not post_containers:
                 logging.warning("No 'post-container' divs found in the provided HTML.")
                 return []

        logging.info(f"Found {len(post_containers)} potential post cards in posts HTML.")

        for post_tag in post_containers:
            post_data = {}
            try:
                post_data['id'] = self._extract_post_id(post_tag)

                # --- Header Info ---
                header = post_tag.find('div', class_='post-header')
                if header:
                     time_tag = header.find('small')
                     post_data['datetime_str'] = time_tag.text.strip() if time_tag else 'N/A'

                # --- Body Info ---
                body = post_tag.find('div', class_='post-body')
                if body:
                     text_parts = body.find_all('div', class_='post-text')
                     # Combine text, handling potential None values from get_text
                     post_data['text'] = "\n".join(
                         filter(None, (part.get_text(separator='\n', strip=True) for part in text_parts))
                     ).strip()


                     post_data['has_photo'] = bool(body.find('div', class_='post-img')) or bool(body.find('div', class_='carousel'))
                     post_data['has_video'] = bool(body.find('div', class_='wrapper-thumbnail')) or bool(body.find('div', class_='wrapper-video'))
                     post_data['has_document'] = 'isDocument' in body.get('class', [])

                     img_tag = body.find('img', class_='post-img-img')
                     post_data['image_url'] = img_tag['src'] if img_tag and img_tag.get('src') else None
                     if post_data['image_url'] and post_data['image_url'].startswith('//'):
                         post_data['image_url'] = 'https:' + post_data['image_url']

                     video_tag = body.find('video')
                     if video_tag and video_tag.find('source') and video_tag.find('source').get('src'):
                          post_data['video_url'] = video_tag.find('source')['src']
                          if post_data['video_url'].startswith('//'):
                               post_data['video_url'] = 'https:' + post_data['video_url']
                     else:
                          post_data['video_url'] = None

                # --- Footer Info (Stats) --- FIX: Use specific selectors
                post_data['views_str'] = 'N/A'
                post_data['views'] = None
                post_data['shares_str'] = 'N/A'
                post_data['shares'] = None
                post_data['forwards_str'] = 'N/A'
                post_data['forwards'] = None

                # Find the container for the stat buttons (usually the last row or a specific div)
                # Looking at the provided HTML for posts, they are in a div with class 'col col-12 d-flex'
                stats_row = post_tag.select_one('.col.col-12.d-flex')
                if stats_row:
                    views_link = stats_row.select_one('a.btn[data-original-title*="Количество просмотров публикации"]')
                    if views_link:
                        text = views_link.text.strip()
                        post_data['views_str'] = text
                        post_data['views'] = self._parse_number(text)

                    shares_link = stats_row.select_one('a.btn[data-original-title*="Поделились"]')
                    if shares_link:
                        text = shares_link.text.strip()
                        post_data['shares_str'] = text
                        post_data['shares'] = self._parse_number(text)

                    forwards_span = stats_row.select_one('span.btn[data-original-title*="Пересылок всего"]')
                    if forwards_span:
                         text = forwards_span.text.strip()
                         post_data['forwards_str'] = text
                         post_data['forwards'] = self._parse_number(text)
                else:
                     logging.warning(f"Could not find stats row for post ID {post_data.get('id', 'N/A')}")


                # --- Direct Link ---
                link_icon = post_tag.find('a', {'data-original-title': 'Постоянная ссылка на публикацию'})
                if link_icon and link_icon.get('href'):
                    href = link_icon['href']
                    post_data['tgstat_post_url'] = self.BASE_URL + href if href.startswith('/') else href # Handle relative/absolute

                # --- Telegram Link ---
                # Try finding from dropdown first as it seems more reliable in provided HTML
                dropdown_link = post_tag.find('a', {'class': 'dropdown-item', 'target': '_blank', 'href': re.compile(r'https://t(?:elegram)?\.(?:me|org)/|https://ttttt\.me/')})
                if dropdown_link:
                     post_data['telegram_post_url'] = dropdown_link['href']
                else: # Fallback
                    tg_link_icon = post_tag.find('a', title=lambda x: x and 'Открыть в Telegram' in x)
                    if tg_link_icon and tg_link_icon.get('href'):
                          post_data['telegram_post_url'] = tg_link_icon['href']


                posts.append(post_data)
            except Exception as e:
                 logging.error(f"Error parsing post card (ID: {post_data.get('id', 'N/A')}): {e}", exc_info=True)
                 continue # Skip this post

        return posts

    def get_channel_posts(self, channel_username_or_id, max_posts=50):
        """
        Fetches posts from a specific channel page, handling pagination.

        Args:
            channel_username_or_id (str): The channel's username (e.g., '@rian_ru') or its TGStat ID.
            max_posts (int): The approximate maximum number of posts to retrieve.

        Returns:
            list: A list of dictionaries, each containing info about a post,
                  or None if the initial page fetch fails. Returns [] if no posts found.
        """
        if not channel_username_or_id:
             logging.error("Channel username or ID cannot be empty.")
             return None

        # 1. Get Initial Posts
        initial_html = self._get_initial_posts_html(channel_username_or_id)
        if not initial_html:
            return None # Error already logged

        all_posts = self._parse_posts_html(initial_html)
        if not all_posts:
            logging.info(f"No initial posts found or parsed for {channel_username_or_id}.")
            return [] # Return empty list

        logging.info(f"Fetched {len(all_posts)} initial posts for {channel_username_or_id}.")

        last_post_id = all_posts[-1].get('id')
        current_offset = len(all_posts) # Initial offset is the number of posts already loaded
        has_more = True # Assume more unless told otherwise

        # 2. Loop for More Posts
        while len(all_posts) < max_posts and has_more and last_post_id:
            sleep_time = random.uniform(2.0, 4.0)
            logging.info(f"Sleeping for {sleep_time:.2f} seconds before next post batch...")
            time.sleep(sleep_time)

            more_posts_result = self._make_more_posts_request(channel_username_or_id, last_post_id, current_offset)

            if not more_posts_result or more_posts_result.get('status') != 'ok':
                logging.error("Failed to load more posts or received error status.")
                break # Stop

            html_content = more_posts_result.get('html', '')
            if not html_content:
                logging.warning("No HTML content in 'load more' response.")
                # Sometimes hasMore is true but html is empty, treat as end
                has_more = False
                break

            new_posts = self._parse_posts_html(html_content)
            if not new_posts:
                 logging.info("No more posts found in the loaded content.")
                 has_more = False # Explicitly set based on parsing result
                 break # Stop

            all_posts.extend(new_posts)
            logging.info(f"Fetched {len(new_posts)} more posts. Total: {len(all_posts)}")

            # Update pagination info from the JSON response
            has_more = more_posts_result.get('hasMore', False)
            # Use the 'nextPage' from the response as the ID for the *next* request's 'page' parameter
            next_page_id = more_posts_result.get('nextPage')
            if next_page_id is None: # If nextPage isn't in response, fallback to last parsed post ID
                 last_post_id = new_posts[-1].get('id')
                 logging.warning(f"nextPage not found in response, using last parsed post ID: {last_post_id}")
            else:
                 last_post_id = next_page_id

            # Update offset based on response or calculation
            current_offset = more_posts_result.get('nextOffset', current_offset + len(new_posts))

            if not last_post_id:
                 logging.warning("Could not determine next post ID for pagination. Stopping.")
                 break

            if not has_more:
                 logging.info("'hasMore' is false in response. Reached end of posts.")


        return all_posts[:max_posts] # Return up to max_posts


# --- Main execution block ---
if __name__ == "__main__":
    try:
        parser = TGStatParser()

        # --- Example 1: Search for channels ---
        search_query = "новости"
        print(f"\n--- Searching for channels matching '{search_query}' ---")
        channels = parser.search_channels(search_query, max_pages=1)

        if channels:
            print(f"\nFound {len(channels)} channels:")
            for i, ch in enumerate(channels[:5]): # Print details of first 5 found
                print(f"{i+1}. Title: {ch['title']}") # <-- Check this output
                print(f"   Username: {ch['username']}")
                print(f"   Subscribers: {ch.get('subscribers_str', 'N/A')} ({ch.get('subscribers', 'N/A')})")
                print(f"   Avg. Reach: {ch.get('avg_reach_str', 'N/A')} ({ch.get('avg_reach', 'N/A')})")
                print(f"   CI Index: {ch.get('ci_index_str', 'N/A')} ({ch.get('ci_index', 'N/A')})")
                print(f"   Category: {ch['category']}")
                print(f"   TGStat URL: {ch['tgstat_url']}") # <-- Check this output
                print("-" * 15)

            # --- Example 2: Get posts from a specific channel (e.g., @rian_ru) ---
            # Let's target @rian_ru directly since it's in the example and likely exists
            target_channel_user = "@rian_ru"
            # Or uncomment below to use the first search result if needed
            # target_channel_user = None
            # if channels and channels[0].get('username'):
            #     target_channel_user = channels[0]['username']
            # elif channels:
            #     # Fallback using ID from URL
            #     match = re.search(r'/channel/(?:\@)?([\w\d\-]+)/stat', channels[0]['tgstat_url'])
            #     target_channel_user = match.group(1) if match else None

            if target_channel_user:
                print(f"\n--- Fetching posts for channel: {target_channel_user} ---")
                # Fetch more posts for testing pagination
                posts = parser.get_channel_posts(target_channel_user, max_posts=45)

                if posts:
                    print(f"\nFetched {len(posts)} posts for {target_channel_user}:")
                    for i, post in enumerate(posts[:10]): # Print details of first 10 posts
                        print(f"\nPost {i+1} (ID: {post.get('id', 'N/A')})")
                        print(f"  Time: {post.get('datetime_str', 'N/A')}")
                        print(f"  Views: {post.get('views_str', 'N/A')}")     # <-- Check this output
                        print(f"  Shares: {post.get('shares_str', 'N/A')}")    # <-- Check this output
                        print(f"  Forwards: {post.get('forwards_str', 'N/A')}") # <-- Check this output
                        text_preview = post.get('text', '')
                        if len(text_preview) > 150:
                             text_preview = text_preview[:150] + "..."
                        print(f"  Text: {text_preview}")
                        if post.get('image_url'): print(f"  Image: Yes ({post['image_url']})")
                        if post.get('video_url'): print(f"  Video: Yes ({post['video_url']})")
                        if post.get('has_document'): print(f"  Document: Yes")
                        print(f"  TGStat Link: {post.get('tgstat_post_url', 'N/A')}")
                        print(f"  Telegram Link: {post.get('telegram_post_url', 'N/A')}")
                        print("-" * 15)
                elif posts == []:
                     print(f"\n[*] No posts found for channel {target_channel_user}.")
                else:
                     print(f"\n[!] Failed to fetch posts for {target_channel_user}.")
            else:
                 print("[!] Could not determine a target channel.")

        elif channels == []:
             print(f"\n[*] No channels found matching '{search_query}'.")
        else:
             print(f"\n[!] Failed to perform channel search.")

    except ConnectionError as e:
         print(f"\n[!] Initialization Error: {e}")
    except Exception as e:
         print(f"\n[!] An unexpected error occurred: {e}")
         import traceback
         traceback.print_exc() # Print full traceback for unexpected errors
