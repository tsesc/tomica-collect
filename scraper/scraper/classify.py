"""Rule-based vehicle attribute classifier — no AI needed.

Extracts structured attributes from car_name + manufacturer + series
using Japanese text pattern matching. Covers ~80% of attributes that
Gemini Vision would extract, at zero cost and instant speed.
"""

import re

# === Vehicle Category Rules ===
# Order matters: more specific patterns first
CATEGORY_RULES: list[tuple[str, str]] = [
    # Emergency
    (r"パトロール|パトカー|警察|覆面|白バイ", "emergency"),
    (r"救急|救護|ハイメディック", "emergency"),
    (r"消防|ポンプ|はしご|レスキュー", "emergency"),
    (r"JAF|ロードサービス", "emergency"),
    # Construction
    (r"ショベル|ブルドーザ|ホイールローダ|ローラ|フォークリフト", "construction"),
    (r"クレーン|ダンプ|ミキサー|除去機|油圧", "construction"),
    (r"コマツ|コベルコ|日立建機|ヤンマー|キャタピラー|CAT", "construction"),
    # Bus
    (r"バス|エルガ|エアロクィーン|エアロクイーン|グランビュー", "bus"),
    (r"都営|交通局|京王|岩手県交通", "bus"),
    # Truck
    (r"トラック|キャリアカー|運搬|配送|輸送|レッカー", "truck"),
    (r"キャブオール|ダイナ|キャンター|グレート|プロフィア", "truck"),
    (r"タンクローリー|荷台|トレーラー", "truck"),
    # Train
    (r"電車|新幹線|鉄道|999号|特急|機関車", "train"),
    # Motorcycle
    (r"バイク|白バイ|VFR|オートバイ", "motorcycle"),
    # Aircraft
    (r"飛行|ヘリ|ジェット|airplane|aircraft", "aircraft"),
    # Boat
    (r"船|ボート|さんふらわあ|フェリー", "boat"),
    # Fantasy (Dream Tomica characters)
    (r"ポケモン|キティ|スヌーピー|リラックマ|トーマス|ドラえもん", "fantasy"),
    (r"ジョージ|しまじろう|マリオ|スポンジ|カービィ|クレヨン", "fantasy"),
    (r"ディズニー|ミッキー|ドナルド|プーさん|チェシャ", "fantasy"),
    (r"ノンタン|トムとジェリー|カップヌードル|たべっ子", "fantasy"),
    (r"すみっコ|夏目友人帳", "fantasy"),
    # Default: car
]

# === Body Style Rules ===
BODY_STYLE_RULES: list[tuple[str, str]] = [
    (r"セダン|サルーン|4ドア|ブロアム|DX|GL|GX", "sedan"),
    (r"SUV|エクストレイル|ハリアー|ランドクルーザー|パジェロ|ジムニー|RAV4|CR-V|フォレスター|エスクード|ロッキー|CX-|ラングラー", "suv"),
    (r"クーペ|GT-R|NSX|スープラ|フェアレディ|RX-7|シルビア|カウンタック|ウラカン|フェラーリ|ランボルギーニ|ポルシェ|マクラーレン|ロータス|ブガッティ|アストンマーティン", "coupe"),
    (r"ワゴン|エステート|レガシィ|ステージア|カローラフィールダー", "wagon"),
    (r"バン|ハイエース|NV|キャラバン|パネルバン|宅配", "van"),
    (r"ピックアップ|ハイラックス|トラック1200|ダットサントラック", "pickup"),
    (r"オープン|ロードスター|コペン|コンバーチブル|S2000|カブリオレ", "convertible"),
    (r"ハッチバック|フィット|ヤリス|マーチ|ノート|デミオ|スイフト|アルト|ジェミニ", "hatchback"),
    (r"キャブオーバー|ふそう|いすゞ|日野|UDトラックス|エルフ", "cab_over"),
]

# === Color Extraction from Japanese ===
COLOR_MAP: dict[str, str] = {
    "赤": "red", "紅": "red", "レッド": "red",
    "青": "blue", "ブルー": "blue", "紺": "navy",
    "白": "white", "ホワイト": "white", "アイボリー": "ivory",
    "黒": "black", "ブラック": "black",
    "銀": "silver", "シルバー": "silver", "グレー": "gray", "灰": "gray",
    "黄": "yellow", "イエロー": "yellow", "金": "gold", "ゴールド": "gold",
    "緑": "green", "グリーン": "green",
    "橙": "orange", "オレンジ": "orange",
    "茶": "brown", "ブラウン": "brown", "ベージュ": "beige", "マルーン": "maroon",
    "ピンク": "pink", "桃": "pink",
    "水色": "light blue", "ライトブルー": "light blue",
    "紫": "purple", "パープル": "purple",
}

# === Feature Detection ===
FEATURE_RULES: list[tuple[str, str]] = [
    (r"パトロール|パトカー|警察|覆面|警燈|回転灯", "police_light"),
    (r"はしご|ラダー", "ladder"),
    (r"翼|翅|ウィング|wing", "wing"),
    (r"ブレード|刃|blade", "blade"),
    (r"クレーン|crane", "crane"),
    (r"アンテナ|antenna", "antenna"),
    (r"デカール|ステッカー|塗装|ラッピング|特別|コカ・コーラ|日通|郵便", "decal"),
    (r"オープン|開放|カブリオレ|ロードスター|コペン", "open_top"),
    (r"タンク|タンクローリー|ガス|燃料", "tank"),
    (r"トレーラー|連結|キャリアカー", "trailer"),
]

# === Era Style Rules ===
ERA_RULES: list[tuple[str, str]] = [
    (r"196\d|195\d|1970|昭和", "classic"),
    (r"197[1-9]|198\d|レトロ|旧車", "retro"),
    (r"202[0-9]|2019|201[5-8]|最新", "modern"),
    (r"未来|コンセプト|EV|電気", "futuristic"),
]


def classify_from_name(
    car_name: str,
    manufacturer: str | None = None,
    series: str = "regular",
    image_url: str | None = None,
    release_start: str | None = None,
) -> dict:
    """Extract vehicle attributes from car name and metadata.

    Returns a VehicleAttributes-compatible dict.
    """
    text = car_name
    if manufacturer:
        text = f"{manufacturer} {text}"

    # Vehicle category
    vehicle_category = "car"  # default
    for pattern, category in CATEGORY_RULES:
        if re.search(pattern, text, re.IGNORECASE):
            vehicle_category = category
            break
    # Dream series override
    if series == "dream":
        vehicle_category = "fantasy"

    # Body style
    body_style = "special" if vehicle_category in ("construction", "bus", "train", "fantasy", "boat", "aircraft") else "sedan"
    for pattern, style in BODY_STYLE_RULES:
        if re.search(pattern, text, re.IGNORECASE):
            body_style = style
            break
    # Truck category often cab_over in Japan
    if vehicle_category == "truck" and body_style == "sedan":
        body_style = "cab_over"

    # Colors from name (e.g., "（赤）", "（白/黒）")
    colors = []
    for jp, en in COLOR_MAP.items():
        if jp in car_name:
            if en not in colors:
                colors.append(en)
    primary_color = colors[0] if colors else "unknown"
    secondary_color = colors[1] if len(colors) > 1 else None

    # Wheel count
    if vehicle_category in ("boat", "aircraft"):
        wheel_count = 0
    elif vehicle_category == "motorcycle":
        wheel_count = 2
    elif re.search(r"トレーラー|大型|連結|8輪", text):
        wheel_count = 8
    elif re.search(r"消防|バス|大型トラック|タンクローリー|6輪", text):
        wheel_count = 6
    else:
        wheel_count = 4

    # Size class
    if vehicle_category in ("bus", "train") or re.search(r"大型|連結|トレーラー", text):
        size_class = "large"
    elif vehicle_category in ("motorcycle",) or series == "dream":
        size_class = "small"
    elif vehicle_category in ("truck", "construction"):
        size_class = "medium"
    elif re.search(r"軽|アルト|ミラ|ワゴンR|タント|フロンテ|360|サンバー|ハスラー|コペン|ジムニー", text):
        size_class = "small"
    else:
        size_class = "medium"

    # Features
    features = []
    for pattern, feature in FEATURE_RULES:
        if re.search(pattern, text, re.IGNORECASE):
            if feature not in features:
                features.append(feature)
    # Livery detection
    has_livery = bool(features) or bool(re.search(r"塗装|ラッピング|コカ|日通|郵便|JR|交通局|消防|警察", text))

    # Era style
    era_style = "modern"  # default
    if release_start:
        year = int(release_start[:4]) if len(release_start) >= 4 else 2020
        if year < 1970:
            era_style = "classic"
        elif year < 1990:
            era_style = "retro"
        elif year < 2015:
            era_style = "retro"
        else:
            era_style = "modern"
    else:
        for pattern, era in ERA_RULES:
            if re.search(pattern, text):
                era_style = era
                break

    # Window style
    if vehicle_category in ("construction",) or body_style == "cab_over":
        window_style = "cab"
    elif vehicle_category in ("fantasy", "boat", "aircraft", "motorcycle"):
        window_style = "none"
    elif body_style == "convertible":
        window_style = "standard"
    else:
        window_style = "standard"

    return {
        "vehicle_category": vehicle_category,
        "body_style": body_style,
        "primary_color": primary_color,
        "secondary_color": secondary_color,
        "wheel_count": wheel_count,
        "size_class": size_class,
        "features": features,
        "era_style": era_style,
        "has_livery": has_livery,
        "window_style": window_style,
    }


def classify_batch(items: list[dict]) -> dict[str, dict]:
    """Classify a batch of items. Returns {id: attributes}."""
    results = {}
    for item in items:
        attrs = classify_from_name(
            car_name=item.get("car_name", ""),
            manufacturer=item.get("manufacturer"),
            series=item.get("series", "regular"),
            release_start=item.get("release_start"),
        )
        results[item["id"]] = attrs
    return results
