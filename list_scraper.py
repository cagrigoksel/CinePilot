import cloudscraper
import re
import json
import sys
import urllib.parse

def scrape_letterboxd_url(url, max_pages=20):
    scraper = cloudscraper.create_scraper()
    all_films = []
    
    # Normalize URL
    parsed = urllib.parse.urlparse(url)
    clean_path = parsed.path.rstrip('/')
    base_url = f"https://letterboxd.com{clean_path}"
    
    for page in range(1, max_pages + 1):
        page_url = f"{base_url}/page/{page}/" if page > 1 else f"{base_url}/"
        try:
            res = scraper.get(page_url, timeout=12)
            if res.status_code != 200:
                break
                
            # Match data-item-name="Title (Year)" or data-film-slug
            matches = re.findall(r'data-item-name=\"([^\"]+)\"\s+data-item-slug=\"([^\"]+)\"|data-item-slug=\"([^\"]+)\"\s+data-item-name=\"([^\"]+)\"|data-item-name=\"([^\"]+)\"', res.text)
            if not matches:
                # Fallback to poster alt texts
                alt_matches = re.findall(r'class=\"[^\"]*film-poster[^\"]*\"[^>]*alt=\"([^\"]+)\"', res.text)
                if alt_matches:
                    for alt in alt_matches:
                        year_match = re.search(r'\((\d{4})\)$', alt)
                        year = year_match.group(1) if year_match else None
                        title = re.sub(r'\s*\(\d{4}\)$', '', alt).strip()
                        if title:
                            all_films.append({'title': title, 'year': year})
                    break
                break
                
            for m in matches:
                raw_title = m[0] or m[3] or m[4]
                slug = m[1] or m[2] if len(m) > 2 else ''
                
                year_match = re.search(r'\((\d{4})\)$', raw_title)
                year = year_match.group(1) if year_match else None
                title = re.sub(r'\s*\(\d{4}\)$', '', raw_title).strip()
                
                if title:
                    all_films.append({
                        'title': title,
                        'year': year,
                        'slug': slug
                    })
        except Exception as e:
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
