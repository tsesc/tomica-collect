/** Japanese → English manufacturer name mapping */
const MANUFACTURER_MAP: Record<string, string> = {
  '日産': 'Nissan',
  'ニッサン': 'Nissan',
  'トヨタ': 'Toyota',
  'ホンダ': 'Honda',
  'スズキ': 'Suzuki',
  'マツダ': 'Mazda',
  'スバル': 'Subaru',
  'ダイハツ': 'Daihatsu',
  '三菱': 'Mitsubishi',
  '三菱ふそう': 'Mitsubishi Fuso',
  'いすゞ': 'Isuzu',
  'いすず': 'Isuzu',
  '日野': 'Hino',
  'フェラーリ': 'Ferrari',
  'ランボルギーニ': 'Lamborghini',
  'ポルシェ': 'Porsche',
  'メルセデス': 'Mercedes',
  'メルセデス-AMG': 'Mercedes-AMG',
  'ベンツ': 'Benz',
  'アウディ': 'Audi',
  'BMW': 'BMW',
  'フォルクスワーゲン': 'Volkswagen',
  'ジープ': 'Jeep',
  'ハマー': 'Hummer',
  'シボレー': 'Chevrolet',
  'フォード': 'Ford',
  'キャデラック': 'Cadillac',
  'ロータス': 'Lotus',
  'アストンマーティン': 'Aston Martin',
  'ブガッティ': 'Bugatti',
  'マクラーレン': 'McLaren',
  'パガーニ': 'Pagani',
  'コマツ': 'Komatsu',
  'コベルコ': 'Kobelco',
  '日立建機': 'Hitachi Construction',
  'ヤンマー': 'Yanmar',
  'ふそう': 'Fuso',
  'UDトラックス': 'UD Trucks',
}

/** Japanese vehicle type suffixes → Chinese translation */
const VEHICLE_TYPE_MAP: Record<string, string> = {
  'パトロールカー': '巡邏車',
  '覆面パトロールカー': '便衣巡邏車',
  '白バイ': '交通警察摩托車',
  '救急車': '救護車',
  '消防車': '消防車',
  '消防指揮車': '消防指揮車',
  'レッカー車': '拖吊車',
  'ロードサービスカー': '道路救援車',
  'バス': '巴士',
  '都営バス': '都營巴士',
  'はとバス': '鴿子巴士(觀光)',
  'タクシー': '計程車',
  'トラック': '卡車',
  'ダンプカー': '傾卸車',
  'ミキサー車': '攪拌車',
  'クレーン': '起重機',
  'ショベル': '挖土機',
  '油圧ショベル': '液壓挖土機',
  'ブルドーザ': '推土機',
  'ホイールローダ': '輪式裝載機',
  'フォークリフト': '堆高機',
  'トラクター': '曳引機',
  'キャリアカー': '運輸車',
  'キャンピングカー': '露營車',
  '動物運搬車': '動物運輸車',
  '郵便車': '郵務車',
  '宅配トラック': '宅配卡車',
  'ボトルカー': '造型車',
  'クーペ': '雙門跑車',
  'ハードトップ': '硬頂車',
  'セダン': '轎車',
  'ワゴン': '旅行車',
  'オープンカー': '敞篷車',
  'ロードスター': '敞篷跑車',
  'スーパーカー': '超級跑車',
}

/** Common katakana model name → English */
const MODEL_NAME_MAP: Record<string, string> = {
  'スカイライン': 'Skyline',
  'フェアレディ': 'Fairlady',
  'シルビア': 'Silvia',
  'エクストレイル': 'X-Trail',
  'セレナ': 'Serena',
  'ノート': 'Note',
  'マーチ': 'March',
  'リーフ': 'Leaf',
  'キャラバン': 'Caravan',
  'セドリック': 'Cedric',
  'ローレル': 'Laurel',
  'クラウン': 'Crown',
  'アルファード': 'Alphard',
  'ハイエース': 'HiAce',
  'プリウス': 'Prius',
  'カムリ': 'Camry',
  'カローラ': 'Corolla',
  'ヤリス': 'Yaris',
  'ランドクルーザー': 'Land Cruiser',
  'ハリアー': 'Harrier',
  'シエンタ': 'Sienta',
  'ダイナ': 'Dyna',
  'プレリュード': 'Prelude',
  'シビック': 'Civic',
  'フィット': 'Fit',
  'ステップワゴン': 'Step WGN',
  'ジムニー': 'Jimny',
  'スイフト': 'Swift',
  'ハスラー': 'Hustler',
  'エスクード': 'Escudo',
  'ロードスター': 'Roadster',
  'デミオ': 'Demio',
  'インプレッサ': 'Impreza',
  'レヴォーグ': 'Levorg',
  'フォレスター': 'Forester',
  'コペン': 'Copen',
  'ハイゼット': 'Hijet',
  'タント': 'Tanto',
  'ムーヴ': 'Move',
  'ロッキー': 'Rocky',
  'アウトランダー': 'Outlander',
  'デリカ': 'Delica',
  'パジェロ': 'Pajero',
  'エルガ': 'Erga',
  'プロサングエ': 'Purosangue',
  'カウンタック': 'Countach',
  'ウラカン': 'Huracán',
  'アヴェンタドール': 'Aventador',
  'ラングラー': 'Wrangler',
  'エアロクィーン': 'Aero Queen',
  'エアロクイーン': 'Aero Queen',
  'グランビューバス': 'Grandview Bus',
  'ブルーバード': 'Bluebird',
  'ギャラン': 'Galant',
  'レガシィ': 'Legacy',
  'アクア': 'Aqua',
  'ヴェルファイア': 'Vellfire',
  'ヴォクシー': 'Voxy',
  'ノア': 'Noah',
  'エスティマ': 'Estima',
  'スープラ': 'Supra',
  'センチュリー': 'Century',
  'コースター': 'Coaster',
  'ハイメディック': 'Himedic',
}

/**
 * Translate a Japanese car name into a more readable format for Chinese users.
 * Returns { displayName, details } where displayName is the primary translated name
 * and details is additional context.
 */
export function translateCarName(carName: string, manufacturer?: string | null): {
  displayName: string
  manufacturer: string
  vehicleType: string
} {
  let name = carName
  let mfr = manufacturer || ''
  let vehicleType = ''

  // Extract manufacturer from name if not provided
  if (!mfr) {
    for (const [jp, en] of Object.entries(MANUFACTURER_MAP)) {
      if (name.startsWith(jp)) {
        mfr = en
        name = name.slice(jp.length).trim()
        break
      }
    }
  } else {
    // Remove Japanese manufacturer prefix from name
    for (const jp of Object.keys(MANUFACTURER_MAP)) {
      if (name.startsWith(jp)) {
        name = name.slice(jp.length).trim()
        break
      }
    }
  }

  // Translate vehicle type suffixes
  for (const [jp, zh] of Object.entries(VEHICLE_TYPE_MAP)) {
    if (name.includes(jp)) {
      vehicleType = zh
      break
    }
  }

  // Build display name by replacing known katakana model names
  let displayName = name
  for (const [jp, en] of Object.entries(MODEL_NAME_MAP)) {
    if (displayName.includes(jp)) {
      displayName = displayName.replace(jp, en)
    }
  }

  // Replace known vehicle type suffixes in display name
  for (const [jp, zh] of Object.entries(VEHICLE_TYPE_MAP)) {
    if (displayName.includes(jp)) {
      displayName = displayName.replace(jp, zh)
    }
  }

  return {
    displayName: displayName.trim(),
    manufacturer: mfr,
    vehicleType,
  }
}
