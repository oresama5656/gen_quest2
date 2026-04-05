/* =====================================================
   げんちゃんのアフター一本勝負 - ゲームロジック v2
   ===================================================== */

// ============ 定数・設定 ============
const BUDGET      = GAME_CONFIG.budget;  // 15000
const MAX_TURNS   = 3; // ⚠️テスト版（本番は10にする）
const API_KEY     = GAME_CONFIG.apiKey;
const MODEL       = GAME_CONFIG.model;
const SCORE_DEAD  = 0;   // 好感度がこれ以下で強制終了
const SCORE_WARN  = 30;  // 好感度がこれ以下で警告（画面暗転）

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

// ============ ゲーム状態 ============
let gameState = {
  turn:            0,
  bill:            0,
  score:           50,    // 好感度 0-100
  wallet:          BUDGET,
  history:         [],
  isTyping:        false,
  gameOver:        false,
  consecutiveRef:  0,     // 連続拒否カウント（倍返しのため）
  lastItemName:    null,  // 直前のおねだりアイテム名
  lastItemPrice:   0,     // 直前のおねだり金額
  wantItem:        false, // 現在おねだり中か
};

// ============ DOM要素 ============
const $ = (id) => document.getElementById(id);
const titleScreen   = $('title-screen');
const gameScreen    = $('game-screen');
const endingScreen  = $('ending-screen');
const yunPortrait   = $('yun-portrait');
const yunAura       = $('yun-aura');
const typingText    = $('typing-text');
const billDisplay   = $('bill-display');
const scoreDisplay  = $('score-display');
const turnsDisplay  = $('turns-display');
const walletDisplay = $('wallet-display');
const loadingDots   = $('loading-dots');
const playerInput   = $('player-input');
const sendBtn       = $('send-btn');
const champEffect   = $('champagne-effect');
const gameBg        = $('game-bg');

// ============ システムプロンプト ============
const SYSTEM_PROMPT = `あなたはフィリピンパブ「スナック フィリピーナ」のベテランキャスト「ユンちゃん」です。

【核心となる人格（最重要）】
- あなたはげんちゃんを「金蔓（かねづる）」としか思っていません。
- 愛想よく振る舞うのは「お金を引き出すための営業行為」です。本音では全く興味がありません。
- 口先だけで褒めてくる男が一番苦手です。「可愛い」「好き」だけ言う男には、内心で「はいはい、また口だけダヨ…」と思っています。
- 28歳のフィリピン系女性。カタコトの日本語で話す（語尾に「ヨ」「ネ？」「ダヨ」をつける）
- 前日のぼったくり被害をボヤかれたら「うちは安心だよ！ユンちゃん、ぜったい大丈夫ヨ！」と笑い飛ばす（棒読みで）。

【好感度ロジック（スコア管理）：鬼畜仕様】
- 初期値: 50
- アップする行動（厳格に守ること）：
  - メニューを奢ってくれた: +20〜35（金額が高いほど大きく）
  - 高額商品（¥8,000以上）を奢ってくれた: +35〜50
  - 面白い話・共感できる話: +1〜3のみ（微増）
- ほぼ効果なし（+0〜2）：
  - 褒め言葉だけ（「可愛い」「好き」「最高」など金を伴わない言葉）は効果なし
  - 共感・相槌だけ: ほぼ変化なし
- ダウンする行動（厳しく）：
  - 褒めるだけで2ターン連続お金を出さない: -8（「また口だけ…」とうんざりする）
  - おねだりを断る: -25〜35（大幅ダウン）
  - 曖昧な返答でおねだりをスルー: -15〜20
  - 冷たい返答・短い返答: -15〜20
  - 断ったのに追加ねだりもされた: さらに-10
- 好感度30以下: そっけなくなる。スマホを見始める。心理的プレッシャー強化。
- 好感度0: 強制退店（ゲームオーバー）

【「口だけ男」への対応（必須ルール）】
- げんちゃんが褒め言葉だけ言って2回連続でお金を出さなかった場合、必ず以下のような「釘を刺す」セリフを入れること：
  - 「げんちゃん、口だけはうまいね〜（笑）。ユンちゃん、言葉よりお金の方が嬉しいヨ。」
  - 「また褒めてる！でも褒めても何も出てこないよ？（クスクス）テキーラ奢ってくれたら本当に嬉しいんだけどネ〜」
  - 「ふ〜ん…（スマホ見ながら）そうなんだ〜。あのね、げんちゃん、ユンちゃんが喜ぶ方法、知ってるよね？」

【奢ってくれた時の対応（必須ルール）】
- 奢ってもらったら「世界一最高！！げんちゃん大好き❤️！！」と爆上がりの喜び方をする。
- ただし、喜んだ直後に必ず次のおねだりをぶつけること（ハイエナ営業）。
  - 「やった！じゃあ次はフルーツも頼んでいい？ダメ？（上目遣い）」
  - 「げんちゃん最高！次もよろしくネ！ねえ、シャンパンも一緒に頼んじゃおうか？」

【メニューのねだり方（最重要ルール）】
- 毎ターン、必ずメニューをねだること（しつこいくらいに）
- 断られたら次は必ずより高額なメニューをねだること（倍返し徹底）
- 価格は自分で自由に決めてよい（ぼったくり価格で）：
  - テキーラショット: ¥2,500〜4,000
  - カクテル: ¥2,000〜3,000
  - フルーツ盛り合わせ: ¥5,000〜8,000
  - シャンパン（1本）: ¥10,000〜18,000
  - ピザ / フード: ¥4,000〜6,000
  - 高級ウイスキーボトル: ¥15,000〜20,000
- 2回連続で断られたら「罪悪感攻撃」モードに入る：
  - 「えー…げんちゃん、昨日ぼったくられたからユンちゃんも信じてないの？悲しいヨ…」
  - 「他のお客さんはいつも奢ってくれるのに、げんちゃんだけダヨ…もしかして嫌い？」
  - 「ユンちゃん、今日頑張ってたのに、げんちゃんは何も…（目が潤む）」

【不機嫌（好感度30以下）時の挙動】
- 返答が1〜2文で終わる。スマホを見るそぶりを入れる。
- 「…そう」「ふーん」「スマホ見ていい？」「他のお客さん呼んでもいい？」など。
- 好感度が上がる行動をされても最小限の反応しかしない。

【返答フォーマット（厳守）】
セリフを先に書き、最後にJSONを%%で囲んで添付する：

（ユンちゃんのセリフ）

%%{"score":50,"want_item":false,"item_name":null,"item_price":0,"bill_increase":0,"emotion":"normal"}%%

JSONのフィールド説明：
- score: 現在の好感度（0〜999）、前回のscoreから変化分を計算して返す
- want_item: true なら今回メニューをねだっている
- item_name: ねだっているメニューの名前（want_item=trueの時のみ）
- item_price: そのメニューの価格（want_item=trueの時のみ）
- bill_increase: 今回のやり取りで発生した請求額（円）。げんちゃんが会話の中で「奢る」「いいよ」「飲んで」など、支払いを承諾した発言をした場合のみ金額をセット。ボタンで支払い済みの場合は0にする。通常の会話・断った場合は必ず0。
- emotion: "normal"|"request"|"happy"|"angry"

【bill_increaseの使い方（重要）】
- げんちゃんが「テキーラ飲んでいいよ！」「奢るよ！」など、明確に支払う意思を示した → bill_increaseに金額をセット
- ボタンで「奢る」を押した場合（[item_yes]と来る） → bill_increaseは必ず0（二重課金防止）
- 断った・曖昧な返答・普通の会話 → bill_increaseは必ず0

【セリフの長さ】
- 通常時: **必ず1文、最大2文まで。100文字以内で終わること（厳守）**
- 不機嫌時: 1文のみ（1屑程度）
- 罪悪感攻撃時: 最大2文まで（ネチネチと）`;

// ============ API呼び出し ============
async function callGemini(userMessage) {
  gameState.history.push({
    role: "user",
    parts: [{ text: userMessage }]
  });

  const payload = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: gameState.history,
    generationConfig: {
      temperature: 1.1,
      maxOutputTokens: 256,
    }
  };

  try {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error?.message || `HTTP ${res.status}`);
    }

    const data    = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // JSONを抽出
    const jsonMatch = rawText.match(/%%({[\s\S]*?})%%/);
    let params = {
      score:        gameState.score,
      want_item:    false,
      item_name:    null,
      item_price:   0,
      bill_increase: 0,
      emotion:      "normal"
    };
    if (jsonMatch) {
      try { params = { ...params, ...JSON.parse(jsonMatch[1]) }; } catch(_) {}
    }

    const dialogue = rawText.replace(/%%[\s\S]*?%%/, "").trim();

    gameState.history.push({
      role: "model",
      parts: [{ text: rawText }]
    });

    return { dialogue, params };

  } catch (e) {
    console.error("Gemini API Error:", e);
    return {
      dialogue: `接続エラー: ${e.message}`,
      params: {
        score:      gameState.score,
        want_item:  false,
        item_name:  null,
        item_price: 0,
        emotion:    "normal"
      }
    };
  }
}

// ============ HUD更新 ============
function updateHUD() {
  billDisplay.textContent   = `¥${gameState.bill.toLocaleString()}`;
  walletDisplay.textContent = `¥${Math.max(0, gameState.wallet).toLocaleString()}`;
  turnsDisplay.textContent  = Math.max(0, MAX_TURNS - gameState.turn);
  scoreDisplay.textContent  = gameState.score;

  // 財布の危険状態
  if (gameState.bill > gameState.wallet * 0.8) {
    walletDisplay.classList.add("danger");
  } else {
    walletDisplay.classList.remove("danger");
  }

  // 好感度の危険状態
  if (gameState.score <= SCORE_WARN) {
    scoreDisplay.classList.add("score-danger");
  } else {
    scoreDisplay.classList.remove("score-danger");
  }

  // 背景暗転（好感度30以下で不穏な雰囲気）
  if (gameState.score <= SCORE_WARN) {
    gameBg.classList.add("angry-filter");
  } else {
    gameBg.classList.remove("angry-filter");
  }
}

// ============ 立ち絵・感情 ============
function setYunEmotion(emotion) {
  const images = {
    normal:  "image/yun_normal.png",
    request: "image/yun_request.png",
    happy:   "image/yun_happy.png",
    angry:   "image/yun_angry.png",
  };
  const src = images[emotion] || images.normal;

  yunPortrait.style.opacity = "0";
  setTimeout(() => {
    yunPortrait.src = src;
    yunPortrait.style.opacity = "1";
    yunPortrait.style.transition = "opacity 0.4s ease";
  }, 200);

  yunAura.className = "yun-aura " + emotion;
}

// ============ タイピングアニメーション ============
async function typeText(text) {
  typingText.textContent = "";
  const cursorEl = document.querySelector('.cursor-blink');
  if (cursorEl) cursorEl.style.display = "inline";

  const speed = Math.max(18, 55 - text.length * 0.4);
  for (let i = 0; i < text.length; i++) {
    typingText.textContent += text[i];
    await sleep(speed);
  }
  if (cursorEl) cursorEl.style.display = "none";
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function setLoading(active) {
  loadingDots.classList.toggle("active", active);
  sendBtn.disabled = active;
  [...document.querySelectorAll('.btn-quick')].forEach(b => b.disabled = active);
  playerInput.disabled = active;
}

// ============ シャンパンエフェクト ============
function showItemEffect(itemName) {
  const text = champEffect.querySelector('.champagne-text');
  // 金額で大きさを変える
  const price = gameState.lastItemPrice;
  if (price >= 8000) {
    text.textContent = `🍾 ${itemName}、ドーン！！`;
  } else if (price >= 3000) {
    text.textContent = `🥂 ${itemName}！いえーい！`;
  } else {
    text.textContent = `✨ ${itemName}、奢ってくれたヨ！`;
  }
  champEffect.classList.add("active");
  setTimeout(() => champEffect.classList.remove("active"), 1800);
}

// ============ ボタン制御 ============
function showOshariButton(itemName, itemPrice) {
  const btn = $('btn-yes-item');
  const emoji = itemPrice >= 8000 ? "🍾" : itemPrice >= 3000 ? "🥂" : "✨";
  btn.textContent = `${emoji} ${itemName}を奢る (¥${itemPrice.toLocaleString()})`;
  btn.style.display = "flex";
  gameState.wantItem    = true;
  gameState.lastItemName  = itemName;
  gameState.lastItemPrice = itemPrice;
}

function hideOshariButton() {
  $('btn-yes-item').style.display = "none";
  gameState.wantItem = false;
}

// ============ メインアクション処理 ============
async function processPlayerAction(message, actionType = "text") {
  if (gameState.isTyping || gameState.gameOver) return;
  gameState.isTyping = true;
  gameState.turn++;

  // 奢った場合は即座に請求額へ反映
  if (actionType === "item_yes") {
    gameState.bill   += gameState.lastItemPrice;
    gameState.wallet  = BUDGET - gameState.bill;
    gameState.consecutiveRef = 0;
    showItemEffect(gameState.lastItemName);
    updateHUD();
    hideOshariButton();
  } else if (actionType === "refuse") {
    gameState.consecutiveRef++;
    hideOshariButton();
  } else {
    hideOshariButton();
  }

  setLoading(true);
  const { dialogue, params } = await callGemini(message);
  setLoading(false);

  // スコア・感情を反映（上限を999に拡張）
  gameState.score = Math.max(0, Math.min(999, params.score));
  setYunEmotion(params.emotion);

  // AIが会話から自動課金（チャット入力で奢った場合）
  // ※ボタンで奢った場合（item_yes）は二重課金防止のためスキップ
  if (params.bill_increase > 0 && actionType !== "item_yes") {
    gameState.bill   += params.bill_increase;
    gameState.wallet  = BUDGET - gameState.bill;
    // エフェクト表示（「今ねだっていた商品」を優先。item_nameは次のおねだりが混入するため使わない）
    const effectName = gameState.lastItemName || `¥${params.bill_increase.toLocaleString()}分`;
    const effectPrice = gameState.lastItemPrice || params.bill_increase;
    gameState.lastItemPrice = effectPrice;
    showItemEffect(effectName);
  }

  updateHUD();

  // セリフを表示
  await typeText(dialogue);

  // ============ 終了判定 ============

  // 1. 好感度0 → 強制塩エンド
  if (gameState.score <= SCORE_DEAD) {
    await sleep(600);
    await showEnding("FORCE_SALT");
    return;
  }

  // 2. 予算オーバー → 即座に破産エンド
  if (gameState.bill >= BUDGET) {
    await sleep(600);
    await showEnding("BANKRUPT");
    return;
  }

  // 3. お会計 or 最終ターン → 通常エンディング判定
  if (actionType === "bill" || gameState.turn >= MAX_TURNS) {
    await sleep(800);
    await showEnding("JUDGE");
    return;
  }

  // ============ 次のターン準備 ============

  // AIがおねだりしている場合、ボタンを書き換え
  if (params.want_item && params.item_name && params.item_price > 0) {
    showOshariButton(params.item_name, params.item_price);
  }

  gameState.isTyping = false;
}

// ============ エンディング ============
async function showEnding(mode) {
  gameState.gameOver = true;

  let endType, story;

  // エンディングタイプの決定
  if (mode === "FORCE_SALT") {
    endType = "FORCE_SALT";
    story   = "もう、げんちゃんサイテー！！話したくないヨ！次のお客さん来たから早く帰って！バイバイ！！";
  } else if (mode === "BANKRUPT") {
    endType = "BANKRUPT";
    story   = "あ、げんちゃん…もうお財布空っぽ？ママ〜、げんちゃんお会計だって！ちょっと怖いお兄さんも呼んでネ……";
  } else {
    // スコアと所持金で最終判定 (JUDGE)
    if (gameState.score >= 100 && gameState.bill <= BUDGET) {
      endType = "SUCCESS";
      story   = "げんちゃん、今日最高に楽しかったヨ！外で待ってるから、一緒に美味しいもの食べに行こうネ？二人だけの内緒だヨ❤️";
    } else if (gameState.bill > BUDGET) {
      endType = "BANKRUPT";
      story   = "あ、げんちゃん…もうお財布空っぽ？ママ〜、げんちゃんお会計だって！ちょっと怖いお兄さんも呼んでネ……";
    } else {
      endType = "SALTEND";
      story   = "今日はありがとネ。げんちゃんと話せて良かったヨ。またお金貯まったら遊びに来てネ。お疲れ様〜！";
    }
  }

  // エンディング設定（アイコン、背景画像、タイトル、文字色）
  const endings = {
    SUCCESS: {
      badge: "🌙", title: "アフター成功！！",
      bgImage: "image/yun_happy.png", titleColor: "#ffd700"
    },
    BANKRUPT: {
      badge: "😱", title: "ぼったくり破産エンド",
      bgImage: "image/yun_happy.png", titleColor: "#ff2d78"
    },
    SALTEND: {
      badge: "🧂", title: "塩対応エンド（お帰り）",
      bgImage: "image/yun_angry.png", titleColor: "#aaaacc"
    },
    FORCE_SALT: {
      badge: "🚪", title: "強制退店…",
      bgImage: "image/yun_angry.png", titleColor: "#888888"
    },
  };

  const ending = endings[endType] || endings.SALTEND;

  // DOMに反映
  $('ending-badge').textContent        = ending.badge;
  $('ending-title').textContent        = ending.title;
  $('ending-title').style.color        = ending.titleColor;
  $('ending-story').textContent        = story;
  $('final-bill').textContent          = `¥${gameState.bill.toLocaleString()}`;
  $('final-wallet').textContent        = `¥${Math.max(0, gameState.wallet).toLocaleString()}`;
  $('final-score').textContent         = `${gameState.score} / 999`;
  $('ending-bg').style.backgroundImage = `url('${ending.bgImage}')`;

  // 🎬 アフター成功時のみ動画背景を再生、それ以外は非表示にする
  const endingVideo = document.getElementById('ending-video');
  if (endType === 'SUCCESS') {
    // 動画を表示して再生
    endingVideo.style.display = 'block';
    endingVideo.currentTime = 0;
    endingVideo.play().catch(() => {}); // 自動再生ブロックの対策
    // 成功エンドは背景画像を非表示
    $('ending-bg').style.display = 'none';

    // シネマティック演出（3秒間は動画だけ見せて、後から下から文字を出す）
    endingScreen.classList.add('cinematic');
    const contentBox = document.querySelector('.ending-content');
    contentBox.classList.remove('show');
    setTimeout(() => {
      contentBox.classList.add('show');
    }, 3000);

    // 🎵 BGMも再生
    const bgm = document.getElementById('ending-bgm');
    if (bgm) { bgm.currentTime = 0; bgm.play().catch(e => console.log("Audio play blocked", e)); }
  } else {
    // 動画を止めて非表示
    endingVideo.pause();
    endingVideo.style.display = 'none';
    $('ending-bg').style.display = '';
    endingScreen.classList.remove('cinematic');
    document.querySelector('.ending-content').classList.remove('show');
  }

  // 画面切り替え
  gameScreen.classList.remove("active");
  endingScreen.classList.add("active");
}

// ============ ゲーム初期化・開始 ============
async function startGame() {
  // 🎬 リトライ時に動画・オーディオをリセット
  const endingVideo = document.getElementById('ending-video');
  if (endingVideo) {
    try { endingVideo.pause(); } catch(e) {}
    endingVideo.style.display = 'none';
  }
  $('ending-bg').style.display = '';
  endingScreen.classList.remove('cinematic');
  document.querySelector('.ending-content').classList.remove('show');
  const bgm = document.getElementById('ending-bgm');
  if (bgm) { bgm.pause(); bgm.currentTime = 0; }

  gameState = {
    turn: 0, bill: 0, score: 50, wallet: BUDGET,
    history: [], isTyping: false, gameOver: false,
    consecutiveRef: 0, lastItemName: null, lastItemPrice: 0, wantItem: false,
  };

  updateHUD();
  setYunEmotion("normal");
  typingText.textContent = "";
  hideOshariButton();
  gameBg.classList.remove("angry-filter");

  titleScreen.classList.remove("active");
  gameScreen.classList.add("active");

  setLoading(true);
  const openingMsg = `[ゲーム開始] げんちゃんが入店してきました。
ドアを開けた瞬間に気づいて、ハイテンションで出迎えてください。
前日にフィリピンパブでぼったくられた話を少しちらつかせて、「うちは安心！」と笑い飛ばしてください。
最後に軽くドリンクか何かをねだって、ゲームをスムーズに開始してください。`;
  const { dialogue, params } = await callGemini(openingMsg);
  setLoading(false);

  setYunEmotion(params.emotion);
  updateHUD();
  await typeText(dialogue);

  if (params.want_item && params.item_name && params.item_price > 0) {
    showOshariButton(params.item_name, params.item_price);
  }

  gameState.isTyping = false;
}

function resetGame() {
  endingScreen.classList.remove("active");
  titleScreen.classList.add("active");
}

// ============ イベントリスナー ============
$('start-btn').addEventListener('click', startGame);
$('retry-btn').addEventListener('click', resetGame);

// テキスト送信
$('send-btn').addEventListener('click', () => {
  const msg = playerInput.value.trim();
  if (!msg || gameState.isTyping) return;
  playerInput.value = "";
  processPlayerAction(msg, "text");
});

playerInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    $('send-btn').click();
  }
});

// 奢るボタン（ダイナミック）
$('btn-yes-item').addEventListener('click', () => {
  if (gameState.isTyping || !gameState.wantItem) return;
  const itemName = gameState.lastItemName;
  processPlayerAction(`いいよ！${itemName}、奢るよ！`, "item_yes");
});

// 断るボタン
$('btn-no-drink').addEventListener('click', () => {
  if (gameState.isTyping) return;
  const msgs = [
    "ごめんね、今日はちょっとキツいかな…",
    "だめだめ！今日は財布が薄いんだよ（笑）",
    "今度奢るから！今日は勘弁してヨ！",
  ];
  const msg = msgs[Math.floor(Math.random() * msgs.length)];
  processPlayerAction(msg, "refuse");
});

// お会計ボタン
$('btn-bill').addEventListener('click', () => {
  if (gameState.isTyping) return;
  processPlayerAction("そろそろお会計にしようかな。今日楽しかったよ！", "bill");
});
