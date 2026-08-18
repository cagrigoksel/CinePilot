import cloudscraper
import re
import json
import sys

def scrape_all_letterboxd(username, section='watchlist'):
    scraper = cloudscraper.create_scraper()
    all_films = []
    page = 1
    
    base_sub = section
    if section in ['diary', 'films', 'watched']:
        base_sub = 'films'
        
    while True:
        url = f'https://letterboxd.com/{username}/{base_sub}/page/{page}/'
        try:
            res = scraper.get(url, timeout=12)
            if res.status_code != 200:
                break
                
            matches = re.findall(r'data-item-name=\"([^\"]+)\"\s+data-item-slug=\"([^\"]+)\"|data-item-slug=\"([^\"]+)\"\s+data-item-name=\"([^\"]+)\"', res.text)
            if not matches:
                break
                
            for m in matches:
                raw_title = m[0] or m[3]
                slug = m[1] or m[2]
                
                year_match = re.search(r'\((\d{4})\)$', raw_title)
                year = year_match.group(1) if year_match else None
                title = re.sub(r'\s*\(\d{4}\)$', '', raw_title).strip()
                
                if title and slug:
                    all_films.append({
                        'title': title,
                        'year': year,
                        'slug': slug
                    })
                    
            page += 1
            if page > 15: # safety cap at ~1000 films
                break
        except Exception as e:
            sys.stderr.write(f"Error page {page}: {e}\n")
            break
            
    return all_films

def scrape_top_rated_films(username):
    scraper = cloudscraper.create_scraper()
    top_films = []
    page = 1
    
    while page <= 4:
        url = f'https://letterboxd.com/{username}/films/ratings/page/{page}/'
        try:
            res = scraper.get(url, timeout=12)
            if res.status_code != 200:
                break
                
            matches = re.findall(r'data-item-name=\"([^\"]+)\"[\s\S]*?rating\s+-rated-(\d+)|data-item-name=\"([^\"]+)\"[\s\S]*?rated-(\d+)', res.text)
            if not matches:
                break
                
            for m in matches:
                raw_title = m[0] or m[2]
                score = int(m[1] or m[3] or 0)
                
                year_match = re.search(r'\((\d{4})\)$', raw_title)
                year = year_match.group(1) if year_match else None
                title = re.sub(r'\s*\(\d{4}\)$', '', raw_title).strip()
                
                if score >= 7 and title: # 3.5 stars and above
                    top_films.append({
                        'title': title,
                        'year': year,
                        'rating': score
                    })
            page += 1
        except Exception as e:
            break
            
    return top_films

if __name__ == '__main__':
    user = sys.argv[1] if len(sys.argv) > 1 else 'cagrigoksel'
    sec = sys.argv[2] if len(sys.argv) > 2 else 'watchlist'
    
    if sec == 'top_rated':
        data = scrape_top_rated_films(user)
    else:
        data = scrape_all_letterboxd(user, sec)
        
    print(json.dumps(data))
