"""Scrape Dream Tomica from official Takara Tomy pages + curated SP data.

Sources:
1. Main lineup page: /lineup/dream/ (current numbered items + Ride On)
2. Curated SP collection data from official special pages
"""

import httpx
from bs4 import BeautifulSoup
import re

BASE_URL = "https://www.takaratomy.co.jp/products/tomica"
IMAGE_BASE_DREAM = f"{BASE_URL}/lineup/dream/"

HEADERS = {"User-Agent": "TomicaCollect-Scraper/1.0 (personal project)"}


def _make_item(
    model_number: str,
    car_name: str,
    image_url: str | None = None,
    collection: str | None = None,
    price: int | None = None,
) -> dict:
    return {
        "model_number": model_number,
        "car_name": car_name,
        "car_name_en": None,
        "series": "dream",
        "is_first_edition": False,
        "manufacturer": None,
        "vehicle_type": None,
        "body_color": [],
        "release_date": None,
        "retired": False,
        "image_url": image_url,
        "source": "official",
        "metadata": {
            k: v
            for k, v in {"collection": collection, "price": price}.items()
            if v is not None
        },
    }


# Curated SP collections from official Takara Tomy special pages.
# These pages are image-heavy with inconsistent HTML; manual curation is more reliable.
SP_COLLECTIONS: list[dict] = [
    # Studio Ghibli (from /sp/ghibli/)
    _make_item("SP-GBL01", "ジブリがいっぱい01 となりのトトロ ネコバス", collection="ジブリ", price=1320),
    _make_item("SP-GBL02", "ジブリがいっぱい02 紅の豚 サボイアS.21F", collection="ジブリ", price=1320),
    _make_item("SP-GBL03", "ジブリがいっぱい03 千と千尋の神隠し 海原電鉄", collection="ジブリ", price=1320),
    _make_item("SP-GBL04", "ジブリがいっぱい04 天空の城ラピュタ タイガーモス", collection="ジブリ", price=1320),
    _make_item("SP-GBL05", "ジブリがいっぱい05 崖の上のポニョ 宗介のポンポン船", collection="ジブリ", price=1320),
    _make_item("SP-GBL06", "ジブリがいっぱい06 魔女の宅急便 ジジ", collection="ジブリ", price=1320),
    _make_item("SP-GBL07", "ジブリがいっぱい07 となりのトトロ オート三輪", collection="ジブリ", price=1320),
    _make_item("SP-GBL08", "ジブリがいっぱい08 ハウルの動く城 ハウルの城", collection="ジブリ", price=1320),
    _make_item("SP-GBL09", "ジブリがいっぱい09 ハウルの動く城 カルシファー", collection="ジブリ", price=1320),
    _make_item("SP-GBL10", "ジブリがいっぱい10 千と千尋の神隠し カオナシ", collection="ジブリ", price=1320),

    # Dragon Ball (from /sp/dragonball/)
    _make_item("SP-DB01", "ドラゴンボール 孫悟空の筋斗雲", collection="ドラゴンボール", price=1320),
    _make_item("SP-DB02", "ドラゴンボール ブルマのカプセルNo.9バイク", collection="ドラゴンボール", price=1320),
    _make_item("SP-DB03", "ドラゴンボール 亀仙人のワゴン車", collection="ドラゴンボール", price=1320),
    _make_item("SP-DB04", "ドラゴンボール レッドリボン軍の小型戦闘機", collection="ドラゴンボール", price=1320),
    _make_item("SP-DB05", "ドラゴンボール フリーザの小型ポッド", collection="ドラゴンボール", price=1320),
    _make_item("SP-DB06", "ドラゴンボール 牛魔王の車", collection="ドラゴンボール", price=1320),

    # hololive (from /sp/hololive/)
    _make_item("SP-HL01", "hololive 白上フブキ", collection="hololive", price=880),
    _make_item("SP-HL02", "hololive さくらみこ", collection="hololive", price=880),
    _make_item("SP-HL03", "hololive 兎田ぺこら", collection="hololive", price=880),
    _make_item("SP-HL04", "hololive 常闇トワ", collection="hololive", price=880),

    # Sanrio Collection 4 (from /sp/sanrio_collection4/)
    _make_item("SP-SR4-01", "サンリオキャラクターズ4 けろけろけろっぴ", collection="サンリオ", price=880),
    _make_item("SP-SR4-02", "サンリオキャラクターズ4 タキシードサム", collection="サンリオ", price=880),
    _make_item("SP-SR4-03", "サンリオキャラクターズ4 ハンギョドン", collection="サンリオ", price=880),
    _make_item("SP-SR4-04", "サンリオキャラクターズ4 バッドばつ丸", collection="サンリオ", price=880),
    _make_item("SP-SR4-05", "サンリオキャラクターズ4 あひるのペックル", collection="サンリオ", price=880),
    _make_item("SP-SR4-06", "サンリオキャラクターズ4 ポチャッコ", collection="サンリオ", price=880),

    # Sanrio Collection 3
    _make_item("SP-SR3-01", "サンリオキャラクターズ3 マイメロディ", collection="サンリオ", price=880),
    _make_item("SP-SR3-02", "サンリオキャラクターズ3 クロミ", collection="サンリオ", price=880),
    _make_item("SP-SR3-03", "サンリオキャラクターズ3 シナモロール", collection="サンリオ", price=880),
    _make_item("SP-SR3-04", "サンリオキャラクターズ3 ポムポムプリン", collection="サンリオ", price=880),
    _make_item("SP-SR3-05", "サンリオキャラクターズ3 リトルツインスターズ", collection="サンリオ", price=880),
    _make_item("SP-SR3-06", "サンリオキャラクターズ3 ハローキティ", collection="サンリオ", price=880),

    # Picture book (from /sp/ehon/)
    _make_item("SP-EH01", "えほんコレクション はらぺこあおむし", collection="えほん", price=880),
    _make_item("SP-EH02", "えほんコレクション 11ぴきのねこ", collection="えほん", price=880),
    _make_item("SP-EH03", "えほんコレクション ねないこだれだ", collection="えほん", price=880),
    _make_item("SP-EH04", "えほんコレクション パンどろぼう", collection="えほん", price=880),

    # PUI PUI Molcar (from /sp/molcar/)
    _make_item("SP-MC01", "PUI PUI モルカー ポテト", collection="モルカー", price=770),
    _make_item("SP-MC02", "PUI PUI モルカー シロモ", collection="モルカー", price=770),
    _make_item("SP-MC03", "PUI PUI モルカー アビー", collection="モルカー", price=770),
    _make_item("SP-MC04", "PUI PUI モルカー チョコ", collection="モルカー", price=770),
    _make_item("SP-MC05", "PUI PUI モルカー テディ", collection="モルカー", price=770),
    _make_item("SP-MC06", "PUI PUI モルカー ゾンビシロモ", collection="モルカー", price=770),
    _make_item("SP-MC07", "PUI PUI モルカー 痛車アビー", collection="モルカー", price=770),

    # TinyTAN / BTS (from /sp/dream10th/)
    _make_item("SP-TT01", "TinyTAN コレクション RM", collection="TinyTAN", price=880),
    _make_item("SP-TT02", "TinyTAN コレクション Jin", collection="TinyTAN", price=880),
    _make_item("SP-TT03", "TinyTAN コレクション SUGA", collection="TinyTAN", price=880),
    _make_item("SP-TT04", "TinyTAN コレクション j-hope", collection="TinyTAN", price=880),
    _make_item("SP-TT05", "TinyTAN コレクション Jimin", collection="TinyTAN", price=880),
    _make_item("SP-TT06", "TinyTAN コレクション V", collection="TinyTAN", price=880),
    _make_item("SP-TT07", "TinyTAN コレクション Jung Kook", collection="TinyTAN", price=880),

    # Jujutsu Kaisen (from /sp/dream10th/)
    _make_item("SP-JJK01", "呪術廻戦 コレクション 虎杖悠仁", collection="呪術廻戦", price=770),
    _make_item("SP-JJK02", "呪術廻戦 コレクション 伏黒恵", collection="呪術廻戦", price=770),
    _make_item("SP-JJK03", "呪術廻戦 コレクション 釘崎野薔薇", collection="呪術廻戦", price=770),
    _make_item("SP-JJK04", "呪術廻戦 コレクション 五条悟", collection="呪術廻戦", price=770),

    # Sumikko Gurashi 10th Anniversary
    _make_item("SP-SG01", "すみっコぐらし10周年コレクション しろくま", collection="すみっコぐらし", price=770),
    _make_item("SP-SG02", "すみっコぐらし10周年コレクション ねこ", collection="すみっコぐらし", price=770),
    _make_item("SP-SG03", "すみっコぐらし10周年コレクション とんかつ", collection="すみっコぐらし", price=770),
    _make_item("SP-SG04", "すみっコぐらし10周年コレクション ぺんぎん？", collection="すみっコぐらし", price=770),

    # Natsume's Book of Friends
    _make_item("SP-NM01", "夏目友人帳 黒ニャンコ", collection="夏目友人帳", price=770),

    # Ride On Buzz Lightyear
    _make_item("SP-BZ01", "ライドオン バズ・ライトイヤー&XL-15", collection="バズ・ライトイヤー", price=1100),
    _make_item("SP-BZ02", "ライドオン バズ・ライトイヤー ソックス&アルマジロ", collection="バズ・ライトイヤー", price=1100),

    # Pokemon SP
    _make_item("SP-PK01", "ポケモン ピカチュウカー", collection="ポケモン", price=880),

    # Ride On Disney (main lineup page uses RD- numbers, but extra models exist)
    _make_item("RD-06", "ミニーマウス&コンパクトカー", collection="ディズニー", price=1100),
]


def parse_dream_main(soup: BeautifulSoup) -> list[dict]:
    """Parse main Dream Tomica lineup page. Structure: <h4>No.XXX 車名</h4> + <img>."""
    items = []
    for h4 in soup.find_all("h4"):
        text = h4.get_text(strip=True)
        match = re.match(r"((?:No\.\d+|RD-\d+))\s+(.+)", text)
        if not match:
            continue

        model_number = match.group(1)
        car_name = match.group(2).strip()
        image_url = None

        for sibling in h4.find_all_next(limit=5):
            if sibling.name == "img" and sibling.get("src"):
                src = sibling["src"]
                if "btn_" in src or "logo" in src:
                    continue
                if src.startswith("images/"):
                    src = IMAGE_BASE_DREAM + src
                elif not src.startswith("http"):
                    src = IMAGE_BASE_DREAM + src
                image_url = src
                break
            if sibling.name == "h4":
                break

        items.append(_make_item(model_number, car_name, image_url))
    return items


async def scrape_dream_series() -> list[dict]:
    """Scrape Dream Tomica from main lineup + curated SP collections."""
    all_items: list[dict] = []
    seen_keys: set[str] = set()

    async with httpx.AsyncClient(
        headers=HEADERS,
        follow_redirects=True,
        timeout=30,
    ) as client:
        # 1. Main lineup page (numbered items + Ride On)
        main_url = f"{BASE_URL}/lineup/dream/"
        resp = await client.get(main_url)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.content, "lxml")
        main_items = parse_dream_main(soup)
        print(f"  {main_url} → {len(main_items)} items")
        for item in main_items:
            key = item["model_number"]
            if key not in seen_keys:
                seen_keys.add(key)
                all_items.append(item)

    # 2. Add curated SP collections (dedup by model_number)
    sp_count = 0
    for item in SP_COLLECTIONS:
        key = item["model_number"]
        if key not in seen_keys:
            seen_keys.add(key)
            all_items.append(item)
            sp_count += 1

    print(f"  Curated SP collections → {sp_count} items")
    return all_items
