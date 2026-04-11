"""CLI entry point for the Tomica scraper."""

import sys
from pathlib import Path
from .tomica import scrape_regular_series
from .history import scrape_all_history
from .output import write_json, write_sql_seed


def main():
    data_dir = Path(__file__).parent.parent / "data"

    if len(sys.argv) > 1 and sys.argv[1] == "history":
        print("Scraping historical Tomica lineup (all generations)...")
        items = scrape_all_history()
        print(f"Found {len(items)} historical variants")
        write_json(items, data_dir / "history.json")
        print("Done!")
    else:
        print("Scraping current Tomica regular series...")
        items = scrape_regular_series()
        print(f"Found {len(items)} items")
        write_json(items, data_dir / "catalog.json")
        write_sql_seed(items, data_dir / "seed.sql")
        print("Done!")
        print("\nTip: Run 'scrape history' to also fetch all historical generations.")


if __name__ == "__main__":
    main()
