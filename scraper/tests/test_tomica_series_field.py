from scraper.tomica import parse_page
from bs4 import BeautifulSoup

HTML = """
<div class="lineup-box">
  <div class="title-box"><p class="CarName">No.1 日産 スカイライン GT-R</p></div>
  <div class="car-pic"><img src="img/test.jpg"></div>
</div>
"""


def test_regular_scrape_sets_series_to_regular():
    soup = BeautifulSoup(HTML, "lxml")
    items = parse_page(soup)
    assert len(items) == 1
    assert items[0]["series"] == "regular"
