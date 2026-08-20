import cloudscraper
import re
import json
import sys
import urllib.parse

def scrape_user_period_films(base_url):
    scraper = cloudscraper.create_scraper()
    all_films = []
    seen = set()

    # Decade & Year periods to completely bypass Cloudflare's /page/2/ blocking
    periods = [
        'decade/2020s',
        'year/2019', 'year/2018', 'year/2017', 'year/2016', 'year/2015',
        'year/2014', 'year/2013', 'year/2012', 'year/2011', 'year/2010',
        'decade/2000s',
        'decade/1990s',
        'decade/1980s',
        'decade/1970s',
        'decade/1960s',
        'decade/1950s'
    ]

    for p in periods:
        url = f"{base_url.rstrip('/')}/{p}/"
        try:
            res = scraper.get(url, timeout=12)
            if res.status_code == 200:
                matches = re.findall(r'data-item-name=\"([^\"]+)\"', res.text)
                for raw_title in matches:
                    if raw_title in seen:
                        continue
                    seen.add(raw_title)
                    year_match = re.search(r'\((\d{4})\)$', raw_title)
                    year = year_match.group(1) if year_match else None
                    title = re.sub(r'\s*\(\d{4}\)$', '', raw_title).strip()
                    if title:
                        all_films.append({'title': title, 'year': year})
        except Exception:
            continue

    return all_films

def scrape_user_watchlist_decades(base_url):
    scraper = cloudscraper.create_scraper()
    all_films = []
    seen = set()

    decades = [
        'decade/2020s',
        'decade/2010s',
        'decade/2000s',
        'decade/1990s',
        'decade/1980s',
        'decade/1970s',
        'decade/1960s',
        'decade/1950s'
    ]

    for d in decades:
        url = f"{base_url.rstrip('/')}/{d}/"
        try:
            res = scraper.get(url, timeout=12)
            if res.status_code == 200:
                matches = re.findall(r'data-item-name=\"([^\"]+)\"', res.text)
                for raw_title in matches:
                    if raw_title in seen:
                        continue
                    seen.add(raw_title)
                    year_match = re.search(r'\((\d{4})\)$', raw_title)
                    year = year_match.group(1) if year_match else None
                    title = re.sub(r'\s*\(\d{4}\)$', '', raw_title).strip()
                    if title:
                        all_films.append({'title': title, 'year': year})
        except Exception:
            continue

    return all_films

def scrape_letterboxd_url(url, max_pages=15):
    scraper = cloudscraper.create_scraper()
    parsed = urllib.parse.urlparse(url)
    clean_path = parsed.path.rstrip('/')
    base_url = f"https://letterboxd.com{clean_path}"

    # If it's a user's personal film diary (/films/)
    if clean_path.endswith('/films'):
        return scrape_user_period_films(base_url)

    # If it's a user's personal watchlist (/watchlist/)
    if clean_path.endswith('/watchlist'):
        return scrape_user_watchlist_decades(base_url)

    # Otherwise standard public custom list
    all_films = []
    seen = set()

    for page in range(1, max_pages + 1):
        page_url = f"{base_url}/page/{page}/" if page > 1 else f"{base_url}/"
        try:
            res = scraper.get(page_url, timeout=12)
            if res.status_code != 200:
                break
                
            matches = re.findall(r'data-item-name=\"([^\"]+)\"', res.text)
            if not matches:
                alt_matches = re.findall(r'class=\"[^\"]*film-poster[^\"]*\"[^>]*alt=\"([^\"]+)\"', res.text)
                if alt_matches:
                    for alt in alt_matches:
                        if alt in seen:
                            continue
                        seen.add(alt)
                        year_match = re.search(r'\((\d{4})\)$', alt)
                        year = year_match.group(1) if year_match else None
                        title = re.sub(r'\s*\(\d{4}\)$', '', alt).strip()
                        if title:
                            all_films.append({'title': title, 'year': year})
                break
                
            for raw_title in matches:
                if raw_title in seen:
                    continue
                seen.add(raw_title)
                year_match = re.search(r'\((\d{4})\)$', raw_title)
                year = year_match.group(1) if year_match else None
                title = re.sub(r'\s*\(\d{4}\)$', '', raw_title).strip()
                if title:
                    all_films.append({'title': title, 'year': year})
        except Exception:
            break
            
    return all_films

def scrape_universal_list(url_or_user, list_type='letterboxd'):
    if 'letterboxd.com' in url_or_user or list_type == 'letterboxd':
        url = url_or_user if url_or_user.startswith('http') else f"https://letterboxd.com/{url_or_user}/watchlist/"
        return scrape_letterboxd_url(url)
    else:
        return scrape_letterboxd_url(url_or_user if url_or_user.startswith('http') else f"https://letterboxd.com/{url_or_user}/watchlist/")

if __name__ == '__main__':
    target = sys.argv[1] if len(sys.argv) > 1 else 'cagrigoksel'
    mode = sys.argv[2] if len(sys.argv) > 2 else 'letterboxd'
    
    results = scrape_universal_list(target, mode)
    print(json.dumps(results))
