"""CLI entry point for the Tomica scraper."""

from pathlib import Path
from .tomica import scrape_regular_series
from .output import write_json, write_sql_seed

def main():
    print("Scraping Tomica regular series...")
    items = scrape_regular_series()
    print(f"Found {len(items)} items")
    data_dir = Path(__file__).parent.parent / "data"
    write_json(items, data_dir / "catalog.json")
    write_sql_seed(items, data_dir / "seed.sql")
    print("Done!")

if __name__ == "__main__":
    main()
