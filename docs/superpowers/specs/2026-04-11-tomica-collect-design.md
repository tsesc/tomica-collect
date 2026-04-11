# Tomica Collect - Design Specification

## 1. Project Overview

**Tomica Collect** is an open-source, personal Tomica die-cast car collection tracker with AI-powered recognition. Users can photograph a Tomica car (boxed or loose) and have AI identify the model, then track their collection against a complete catalog of all Tomica models.

### Core Value Proposition
- Scan a Tomica box or car body -> AI identifies the exact model -> one-tap add to collection
- Browse the complete Tomica catalog and see at a glance what you own and what you're missing
- BYOK (Bring Your Own Key) model — no vendor lock-in, no subscription

## 2. Technical Architecture

### Stack
- **Frontend**: React SPA (Vite + TypeScript)
- **Backend**: Vercel Edge Functions
- **Database**: Supabase (Auth + PostgreSQL + Storage)
- **AI**: Multi-provider Vision API (OpenAI GPT-4o / Google Gemini / Anthropic Claude) via Edge Function proxy
- **Catalog Data**: Python scraper (offline) -> JSON -> Supabase table

### Architecture Diagram

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   React SPA │────>│ Vercel Edge Func │────>│ OpenAI / Gemini │
│   (Vite)    │     │  /api/identify   │     │ / Claude Vision │
│             │     │  /api/catalog    │     └─────────────────┘
│  - Scan     │     └──────┬───────────┘
│  - Catalog  │            │
│  - Collection│    ┌──────▼───────────┐
│  - Settings │────>│    Supabase      │
└─────────────┘     │  - Auth (email)  │
                    │  - DB (Postgres) │
                    │  - Storage (imgs)│
                    └──────────────────┘
```

### Data Flow
1. User takes photo -> frontend compresses image -> sends to Edge Function
2. Edge Function reads user's encrypted API key from Supabase -> decrypts -> calls selected AI provider
3. AI returns structured recognition -> Edge Function matches against catalog DB -> returns top 5 candidates with details
4. User confirms or corrects via dropdown -> writes to Supabase collection record

## 3. AI Recognition Engine (Target: >95% Accuracy)

### Multi-Stage Pipeline

```
Stage 1: Scene Classification -> Stage 2: Structured Feature Extraction -> Stage 3: Database Matching + Ranking
```

### Stage 1: Scene Classification

Determine input type to select the optimal extraction strategy:

| Input Type | Available Clues | Estimated Accuracy |
|-----------|----------------|-------------------|
| Box front | Model number, car name text, car photo | ~99% (number = direct lookup) |
| Box back | Model number, spec table, series label | ~98% |
| Loose car body | Body shape, color, chassis text | ~85% (needs Stage 2) |
| Chassis closeup | Chassis engravings (model + year) | ~95% |

**Prompt:**
```
你是 Tomica 小汽車鑑定專家。請先判斷這張圖片屬於以下哪種情況：
1. 盒裝正面（可見包裝盒、編號、車名）
2. 盒裝背面（可見規格資訊）
3. 散車車體（無包裝，只有車體）
4. 底盤特寫（可見底部刻字）
5. 其他/無法辨識

回傳 JSON: { "type": 1-5, "confidence": 0-1 }
```

### Stage 2: Structured Feature Extraction

Different specialized prompts per input type. Key principle: extract structured, comparable fields — never ask "what car is this?"

**Box Prompt:**
```
你是 Tomica 小汽車鑑定專家。請從這張 Tomica 包裝圖片中提取以下資訊。
逐項回答，無法辨識的欄位填 null。

1. 型號編號（盒子左上角或右上角的數字，如 "No.23"）
2. 車名（日文或英文車名，如 "日産 GT-R"）
3. 系列名稱（如 "トミカ", "トミカプレミアム", "Dream TOMICA"）
4. 是否為初回特別仕樣（盒子是否有金色/特殊標示）
5. 車體顏色
6. 製造商品牌（如 Toyota, Nissan, BMW）

回傳 JSON:
{
  "model_number": "No.23" | null,
  "car_name": "日産 GT-R" | null,
  "series": "トミカ" | null,
  "is_first_edition": true/false/null,
  "body_color": "紅色" | null,
  "manufacturer": "Nissan" | null
}
```

**Loose Car Prompt:**
```
你是 Tomica 小汽車鑑定專家。這是一台沒有包裝的 Tomica 小汽車。
請仔細觀察並提取以下特徵，這些特徵將用於比對資料庫。

1. 車型類別（轎車/SUV/卡車/巴士/工程車/跑車/其他）
2. 車體顏色（主色 + 副色）
3. 製造商品牌（從車體造型判斷，如 Toyota, Honda, Porsche）
4. 可能的車款名稱（如 "Crown", "Civic", "911"）
5. 車體上的文字或標誌（警察、消防、企業塗裝等）
6. 比例感（一般 Tomica 約 1/64，Premium 約 1/64 更精緻）
7. 底盤是否可見？若可見，刻字內容為何？
8. 特殊特徵（開門機構、可動部件、特殊塗裝）

回傳 JSON: { ... }
```

### Stage 3: Database Matching + Candidate Ranking

Executed in Edge Function, not by AI:

```
1. If model_number exists -> exact match -> ~99% accuracy
2. If no model_number -> multi-field fuzzy match:
   - manufacturer + car_name -> weight 40%
   - body_color            -> weight 20%
   - vehicle_type          -> weight 15%
   - series                -> weight 15%
   - special_features      -> weight 10%
3. Return top 5 candidates with match score and reasoning
```

### Accuracy Enhancement Strategies

| Strategy | Effect |
|----------|--------|
| Reference image comparison | DB stores official image per car; AI second-pass compares top 3 candidates visually |
| Multi-angle prompting | If confidence < 0.8, prompt user to photograph chassis or another angle |
| Recognition history learning | Log corrections as few-shot examples injected into future prompts |
| Catalog-constrained prompts | Inject current series car list into loose-car prompts as selection constraint |

### Confidence-Based UX Flow

```
if top_candidate.confidence > 0.9:
    Show result + "Confirm & Add" button
elif top_candidate.confidence > 0.7:
    Show top 3 + dropdown to correct
else:
    Show top 5 + search box for manual lookup
    + Prompt "拍一張底盤照片可提高準確度"
```

## 4. Data Model

### tomica_catalog
```sql
CREATE TABLE tomica_catalog (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_number    TEXT NOT NULL,        -- "No.23"
  car_name        TEXT NOT NULL,        -- "日産 GT-R"
  car_name_en     TEXT,                 -- "Nissan GT-R"
  series          TEXT NOT NULL,        -- "regular" | "premium" | "limited_vintage" | "dream"
  is_first_edition BOOLEAN DEFAULT FALSE,
  manufacturer    TEXT,                 -- "Nissan"
  vehicle_type    TEXT,                 -- "sedan" | "suv" | "truck" | "bus" | "sports" | ...
  body_color      TEXT[],              -- ARRAY["紅", "黑"]
  release_date    DATE,
  retired         BOOLEAN DEFAULT FALSE,
  image_url       TEXT,                 -- Official image URL
  source          TEXT DEFAULT 'official', -- "official" | "manual"
  metadata        JSONB DEFAULT '{}',  -- Extension (scale, special mechanisms, etc.)
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

### user_collection
```sql
CREATE TABLE user_collection (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  catalog_id      UUID NOT NULL REFERENCES tomica_catalog(id),
  photo_url       TEXT,                 -- User's photo (Supabase Storage)
  condition       TEXT DEFAULT 'good',  -- "mint" | "good" | "fair" | "poor"
  has_box         BOOLEAN DEFAULT FALSE,
  notes           TEXT,
  acquired_date   DATE,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

### recognition_log
```sql
CREATE TABLE recognition_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  image_url       TEXT,
  input_type      TEXT,                 -- "box_front" | "box_back" | "loose" | "chassis"
  ai_provider     TEXT,                 -- "openai" | "gemini" | "claude"
  raw_response    JSONB,
  candidates      JSONB,               -- Top 5 candidates + scores
  final_match     UUID REFERENCES tomica_catalog(id),
  was_corrected   BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### user_settings
```sql
CREATE TABLE user_settings (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id),
  ai_provider     TEXT DEFAULT 'openai',
  api_keys        JSONB DEFAULT '{}',  -- Encrypted API keys
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

**RLS Policy**: All tables use `user_id = auth.uid()` row-level security. `tomica_catalog` is read-only for all authenticated users.

## 5. UI Design

### Design System: "Diecast Heritage"

Stitch generated a bespoke design system named **"Diecast Heritage"** with the philosophy of a **Digital Showroom** — treating Tomica cars as curated artifacts, not just toys.

**Key Design Principles:**
- Intentional Asymmetry — avoid perfectly centered, static layouts
- Tonal Depth — no borders; use light, shadow, and background shifts
- The "Museum" Effect — every element treated as an exhibit

**Color Palette:**
- Primary: `#af101a` (brand moments), Primary Container: `#D32F2F` (interactive elements)
- Heritage Gradient: linear-gradient 135deg from `#D32F2F` to `#B71C1C`
- Surface: `#fff8f7`, Text: `#271816` (never pure black)
- Success/Confidence: `#2E7D32`

**Typography:**
- Headlines: Manrope (geometric, professional)
- Body/Labels: Inter (maximum legibility)

**Components:**
- Cards: 16px radius, no borders, tonal layering
- Buttons: Full-round (9999px), Heritage Gradient for CTAs
- Chips: Minimalist, scale-up on selection

### Stitch Mockups

All mockups are in Stitch project `13230504400483757791`. Direct links to screenshots:

| Screen | Device | Stitch Screen ID | Screenshot |
|--------|--------|-----------------|------------|
| Home / Scan Entry | Mobile | `1b3b7d37beea42c9a88048bdadbd5581` | [View](https://lh3.googleusercontent.com/aida/ADBb0ugBMMf2-ZjKxh1jKdcITuZ6SitjoJryqrNcZ2k3zEq-rK9mx_l_G672PbV6SyAdcgut_jPKR2Eogc0F-s-pN_8dJmIx6yvO8Ab1u5UXyTW7L1Y_28KTYtpVtia3spKsaam9TdLDDdWsN4sB-gBlf5To80vfg-x9PoYhp9sPyPFo-9lA5-XHLzuWMB1aOwMF2yxMz4HWkDTarydY6wQnELhQTuJvFkS7_zl6kBPGH7Kh15Z0RdNRw7oZ94Do) |
| Scan Result | Mobile | `1221e4bbb8974ef48163da46dd6a4a9c` | [View](https://lh3.googleusercontent.com/aida/ADBb0ujkGqpqwFY4bt_y3qd-Mvpnn3e6euf0SaltQFibUmx__wfxP416PrgnkdTkIP0fkQwnipK5QBbcJY5nOARloahp_7v2QJeOzzQ6Ob6Yu0vF09c-ztInbs5DcaTV1yyGvWksm2kmfXJTBkqEhLhSnaVr2l7SV8_qrpfT5OTXuswx7zY-IzeAVzfH7z_IynVm5RkI3RvyfWL-0s5992UrZB8yevjGKJRghnuj501f3NG-rSQuycQLllCnzQs) |
| My Collection | Mobile | `d103be227db04780b91bb1e8a44ebf0d` | [View](https://lh3.googleusercontent.com/aida/ADBb0uiZ-NWMMgG1mUYXbXauCwB1D5RhN0k9bPz_-9lZ3Ejx7fpC4eER_EDU6uDOrf1zBXXSXuOFkXnv3xiU4eCcr41Q5GRorWb8ZD0FnuecNTpRTl_R04X-uWxqAtBjskd_oWsFq0PFAdk2mDq5FajEZF1etost5UAdalciV2kDslEFCYKSeR_xEFD-BnzD1bFtOIcAwS0Aqqf34yo-LbExfZXWj3kRtNdgvyEJC88mU8BFqb6Cx7aEoylOQEKr) |
| Settings | Mobile | `39285868f2c64a049cbe83bef302ec1c` | [View](https://lh3.googleusercontent.com/aida/ADBb0ugu2tQdEWYK2TD2oXS6Ku5XB5KkuN9hpb-OsEXENpO_MeLXOjnBf52VMjnFqGqUGKA8P20AuMGodRNe4HvfEYvPTFYKt4ZrDu5HMXIK_maZFuAw4_1mNyYsdPldhF7iT0eY3lwgAGQIRFCLtU1iCSfeM8aVtn17ZzjzWYSQ1I3W5kt8d68p9ILTdQEu0MWnEk-C53wG1GJCSwOoNJatIFP5xmnrFlBM90bHOhJiQ7qccL4ujdXaB1SjNu3O) |
| Catalog Browse | Desktop | Pending (Stitch timeout) | — |

### Pages & RWD Breakpoints

| Page | Function |
|------|----------|
| Home / Scan | Primary entry: camera hero, stats overview, recent additions |
| Scan Result | AI recognition result + details + correction dropdown + confirm |
| Catalog Browse | Full car database with filter sidebar + card grid |
| My Collection | Owned list, missing list, stats, progress by series |
| Settings | AI provider/key management, account, data export |

| Breakpoint | Layout | Navigation | Catalog Grid |
|-----------|--------|-----------|-------------|
| Mobile (< 640px) | Single column, bottom tabs | Bottom Navigation Bar | 2 columns |
| Tablet (640-1024px) | Sidebar filters + content | Top Nav + Sidebar | 3-4 columns |
| Desktop (> 1024px) | Fixed sidebar + wide content | Top Nav + Sidebar | 5-6 columns + detail panel |

## 6. Catalog Data Source

### Phase 1: Official Scraper (Python)
- Source: takaratomy.co.jp Tomica product pages
- Output: JSON file committed to repo
- Scope: Regular series (No.1 ~ No.160) + First Edition variants
- Fields: model_number, car_name, car_name_en, manufacturer, body_color, image_url, release_date

### Phase 2: Manual Supplement
- Users can submit additions via the app (source = "manual")
- Admin review not needed for personal use

### Future Expansion
- Architecture supports: Tomica Premium, Limited Vintage (TLV), Dream Tomica, special editions
- Series field is extensible; no schema changes needed

## 7. Deployment

- **Frontend**: Vercel (static SPA)
- **Edge Functions**: Vercel Edge Functions (same project)
- **Database**: Supabase (free tier sufficient for personal use)
- **Storage**: Supabase Storage (user photos)
- **Domain**: Custom domain via Vercel

## 8. Security

- API keys encrypted at rest in Supabase (pgcrypto)
- API keys decrypted only in Edge Function memory, never exposed to frontend
- Supabase RLS enforces user data isolation
- No server-side secrets in client bundle
- Rate limiting on Edge Functions to prevent API key abuse

## 9. Non-Goals (Explicit Exclusions)

- No social features (sharing, trading, community)
- No marketplace or pricing data
- No mobile native app (PWA later if needed)
- No multi-language i18n (Chinese + Japanese only)
- No admin panel (personal use tool)
