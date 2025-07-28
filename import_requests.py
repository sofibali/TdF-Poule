import requests
from bs4 import BeautifulSoup

def get_stage_results(year, stage):
    url = f"https://www.procyclingstats.com/race/tour-de-france/{year}/stage-{stage}"
    r = requests.get(url)
    soup = BeautifulSoup(r.text, 'html.parser')
    results = []
    for row in soup.select('table.results tr'):
        cols = row.find_all('td')
        if cols:
            pos = cols[0].text.strip()
            rider = cols[2].text.strip()
            team = cols[3].text.strip()
            results.append({'position': pos, 'rider': rider, 'team': team})
    return results

# Example usage:
print(get_stage_results(2023, 1))