# 丟垃圾：單機效能量測與優化（2026-11-17）

本次涵蓋單機及多人，測量實際 Canvas 繪製、控制器更新、DOM 變更與瀏覽器工作時間。
目前固定以 **60 FPS** 為繪圖目標，已依需求移除 30 FPS 選項及舊裝置偏好。
下方 30／60 FPS 表格保留本日較早版本的歷史量測；不是目前提供的模式選單。
繪圖快取、HUD 差異更新等優化持續套用，畫布像素密度上限保持 2x。

## 找到的工作與處理方式

| 工作 | 是否需要 | 本次處理 |
| --- | --- | --- |
| 物理、碰撞、回合與清潔判定 | 需要 | 維持每秒 60 次更新，每次四個物理小步；規則檔未修改 |
| 角色移動、飛行、鏡頭、風雨 | 需要 | 依 60 FPS 目標更新繪圖，保留實際遊戲狀態 |
| 沒變的 HUD 標籤及 hidden/disabled 屬性 | 不必重寫 | 狀態改變才同步；蓄力與角度只更新自己的控制項 |
| 桶身、刻度、固定姿勢的玩家、靜止垃圾 | 不必每幀重算向量圖形 | 快取小型圖片，場景、解析度、姿勢或旋轉變更時重建 |
| 鏡頭外的完整角色、垃圾、桶 | 不必繪製 | 先檢查範圍再畫；碰撞與全場小圖仍包含它們 |
| 全場小圖再次計算同一幀障礙物 | 不必 | 與主畫面共用該幀的幾何資料 |
| 每次蓄力變更進度條寬度 | 不必引發寬度布局變更 | 固定寬度，使用 scaleX 顯示蓄力比例 |
| 大面積透明快取邊界 | 不必 | 縮小圖片範圍，降低透明像素拷貝與記憶體成本 |

Canvas 的靜態圖形快取、適當畫布尺寸與不需要透明時使用不透明繪圖表面，
也是 [MDN 的 Canvas 效能建議](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)。
這裡使用標準 Canvas，不需要額外套件。
桶與垃圾的快取使用 WeakMap，避免長時間自由練習時把舊回合的圖片一直留在記憶體。

未開始或暫停時，原本的遊戲迴圈已經停止；這不是本次新增的省電效果。
單機未開啟連線房間時，房間服務的輪詢尚未啟動。測試以本地替身停用 Firebase，
避免把帳號／網路變動混進單機畫面量測。

## 如何重跑

需要 Node.js 與 Chrome；不需要真實帳號，不會存取正式 Firebase。

```bash
# 發燙問題優化前：原先目標 60 FPS、畫布過大且每幀畫完整場景
node tools/trash-toss/performance-check.js --revision=df0f60a --output=/tmp/trash-original60.json
# 昨天的手機限速版本：30 FPS
node tools/trash-toss/performance-check.js --revision=7f094e8 --output=/tmp/trash-before30.json
# 目前版本：固定 60 FPS
node tools/trash-toss/performance-check.js --output=/tmp/trash-current60.json
# 遊戲行為及實際像素比較
node tools/trash-toss/session-check.js
node tools/trash-toss/view-check.js
node tools/trash-toss/render-browser-check.js /usr/bin/google-chrome
node tools/trash-toss/room-check.js
```

Chrome 路徑可用 `--chrome=/path/to/chrome`，CPU 倍率可用 `--throttle=4`，
裝置 DPR 可用 `--dpr=2`。歷史比較只替換丟垃圾的控制器、繪圖器、規則和 CSS，
其餘測試頁與測試儀器相同。測試插樁只存在於本地測試伺服器，不會加入正式遊戲。
應依序執行效能量測，避免其他壓力測試或瀏覽器同時搶 CPU。

## 本日較早版本的歷史結果

使用桌面 headless Chrome、390×844、DPR 2、CPU 四倍降速、固定場景種子 42。
每項先暖機約 350 ms，再測兩秒。街頭與工地壓力測試放置 40 件靜止垃圾。
CPU 降速是[瀏覽器的效能測試工具](https://developer.chrome.com/docs/devtools/performance/overview/)，
不能當成某款 iPhone 的硬體或 Safari 模擬。

| 場景／狀態 | 原始 60 目標版 | 昨天限 30 版 | 新省電模式 | 新流暢模式 |
| --- | ---: | ---: | ---: | ---: |
| 辦公室／未開始 | 0.0 FPS | 0.0 FPS | 0.0 FPS | 0.0 FPS |
| 辦公室／瞄準 | 47.4 FPS | 27.9 FPS | 30.0 FPS | 60.0 FPS |
| 辦公室／蓄力 | 47.6 FPS | 27.5 FPS | 30.0 FPS | 60.0 FPS |
| 辦公室／飛行 | 53.0 FPS | 27.0 FPS | 30.0 FPS | 59.5 FPS |
| 街頭／40 件垃圾 | 38.0 FPS | 27.5 FPS | 30.0 FPS | 59.5 FPS |
| 工地／40 件垃圾 | 47.4 FPS | 29.0 FPS | 30.0 FPS | 60.0 FPS |

下面是同一段兩秒測試的瀏覽器主執行緒工作時間（毫秒）；不是溫度或耗電量。

| 場景／狀態 | 原始 60 目標版 | 昨天限 30 版 | 新省電模式 | 新流暢模式 |
| --- | ---: | ---: | ---: | ---: |
| 辦公室／瞄準 | 2024 | 466 | 475 | 887 |
| 辦公室／蓄力 | 2026 | 586 | 608 | 1039 |
| 辦公室／飛行 | 2015 | 440 | 469 | 810 |
| 街頭／40 件垃圾 | 2056 | 719 | 708 | 1352 |
| 工地／40 件垃圾 | 2025 | 569 | 498 | 924 |

狀態列 DOM 變更（每兩秒）：昨天的瞄準狀態約 900 次 → 0 次；蓄力約 1,200 次 → 180 次。
這是單次短測，時間數字有執行環境波動，應用來定位成本與比較方向。

原始數據在 [performance-results.json](performance-results.json)。
FPS 是 Canvas 實際繪圖呼叫頻率，不是實體螢幕呈現率。每幀成本是 JavaScript
提交繪圖指令的時間；巢狀計時不可全部相加。瀏覽器 TaskDuration 也包含其他主執行緒工作，
但不等於整支手機 CPU/GPU、瓦數或溫度。

重要取捨：優化後 60 FPS 比原始 60 FPS 版本有效率，但增加刷新次數仍有成本，
不能聲稱它比限速 30 FPS 版更省電。後續依使用者需求固定採用 60 FPS，移除 30 FPS 選項。
畫布清晰度沒有為了提高數字而繼續降低。

固定像素比較跑過五個場景、50 種靜止物件、快取重用／失效、玩家姿勢、平移與 QA 尺寸切換，
共 30 組。快取與直接向量繪圖的最大平均色差為 0.721/255；色差超過 32 的像素最多 0.59%，
主要是小幅反鋸齒差異。目前控制器測試確認 120 Hz 螢幕遵守 60 FPS 上限，
舊的省電偏好不再生效；原有計分與雙方同步測試也通過。

## 另一個一次性重工作：電腦思考

`cpuPlan()` 每個電腦回合模擬 277 個候選投擲，測得辦公室約 0.42 秒、工地約 0.76 秒
（同樣為四倍 CPU 降速環境）。這是先前同步實作的量測，不是每幀執行的成本。
目前改由 `js/games/trash-toss/cpu.js` 背景 Worker 執行同一套搜尋；無法載入 Worker 時，
使用規則模組的 generator，每批最多八個候選或約 4 ms 後交還主執行緒。
回合切換或重開會取消舊工作；搜尋使用送出時的場景與垃圾快照。
若計算晚於原預定出手時間，保留 0.15 秒可見的出手準備，仍受十二秒回合上限限制。
JSON 的 `cpuPlanning` 保留直接呼叫同步規則的成本，用來觀察搜尋工作量，
不代表遊戲主執行緒仍同步執行整段搜尋。

## 飛行橫移與畫面時間

平均 Canvas 繪圖頻率達到 60 FPS，仍可能因固定物理步進與 RAF 時序抖動，
出現重複位置後再跳兩步。先前控制器未使用 shell 傳入的剩餘時間比例。
目前對移動物件與鏡頭目標做顯示插值，人物動畫與鏡頭緩動也使用相同的顯示時間。
物理、碰撞與計分仍保持 60 Hz／240 Hz 小步；線上使用共享時鐘做相同的顯示處理。
這會增加最多約一個物理 tick（16.7 ms）的顯示延遲，不會更改投擲輸入。
繪圖截止時間在漏幀後仍維持累積，不再重新設定排程相位。
原本只有 0.5 ms 的提早容許量，會把正常 60 Hz 的較早回呼誤判成應跳過的幀。
目前容許四分之一間隔（約 4.2 ms），仍跳過 120 Hz 的中間回呼。
控制器重播兩秒、120 次輕微早晚交錯的 RAF 回呼：舊版繪圖 102 次（約 51 FPS），
修正版 120 次（60 FPS）；這是可重現的人工時序，不是使用者裝置的實測。

```bash
node tools/trash-toss/performance-check.js --motion --revision=HEAD --throttle=1 --output=/tmp/trash-motion-before.json
node tools/trash-toss/performance-check.js --motion --throttle=1 --output=/tmp/trash-motion-after.json
node tools/trash-toss/performance-check.js --desktop --cpu --throttle=1 --dpr=1 --output=/tmp/trash-desktop-cpu.json
node tools/trash-toss/view-check.js
node tools/trash-toss/cpu-check.js
```

比較前應將 `HEAD` 換成預定比較的舊版本。motion 數據另記錄顯示時間、物件與鏡頭座標，
以及未抵達鏡頭邊界時的重複鏡頭幀，避免僅用平均 FPS 推論平順度。
view check 使用正負 1 ms 的 RAF 時序抖動，與連續時間參考畫面比較。
穩定的桌面 headless RAF 無法代表 iPhone、Safari、120 Hz 顯示器或真機發熱時的表現。
`--desktop --cpu` 使用 1200×900 畫面，等待真正的電腦回合自行選招、蓄力、出手後取樣，
並另外記錄出手前的主執行緒 long tasks，區分換手卡頓與飛行橫移。

## 真機確認

用同一台 iPhone、相同亮度、充電狀態、場景和操作順序，遊玩目前 60 FPS 版本數分鐘，
比較流暢度、發燙感與電量下降。需要在開始溫度相近時比較，先測自由練習，再測挑戰電腦。
本地結果支持減少重複工作，尚未證明手機溫度下降多少。

## 多人連線的追加優化與驗證

共用的繪圖快取、鏡頭範圍裁切、HUD 差異更新與 60 FPS 排程，同樣套用到真人連線。
此外針對連線流程處理了：

- 全場沒有飛行物／移動垃圾時，直接把世界時間推進到下一個清潔事件或顯示時間，
  跳過不會改變狀態的物理重播。清除、離場、下次清潔的觸發 tick 保持一致。
- 在線心跳等內容未變的快照仍更新房間連線狀態，但不再重跑遊戲設定、寫入偏好或強制同步 HUD。
- 房間視窗蓋住場地時，停止當地畫面的重播；關閉視窗時先重建當前狀態再畫。
  期限檢查、在線心跳與對手遊戲持續進行。

這些改動沒有降低碰撞頻率、延長心跳間隔或省略同步資料。物理移動時仍逐格模擬。

```bash
node tools/trash-toss/network-performance-check.js --output=/tmp/trash-network.json
node tools/trash-toss/performance-check.js --online --room-revision=7f094e8 --throttle=1 --output=/tmp/trash-online-before.json
node tools/trash-toss/performance-check.js --online --throttle=1 --output=/tmp/trash-online-after.json
```

固定資料的差異測試涵蓋五個場景、靜止與移動垃圾、桶滿清潔、浮點時間邊界與飛行，
275 組快照／軌跡與舊版完全一致。辦公室靜止世界補播 60 秒時，清潔判斷由 3,600 次降為 1 次；
有移動物體時的碰撞更新次數相同。

兩個實際遊戲頁面以本地 RTDB 替身連線，加入 200 ms 快照延遲。兩頁在瞄準與飛行階段均約
60 FPS；20 次重複快照原本造成每頁 20 次遊戲回呼及 20 次偏好寫入，現在皆為 0。
房主開啟房間視窗的採樣期間，其場地繪圖與當地重播皆為 0；對手仍約 60 FPS。
開房、加入、準備、出手、回合／分數一致、離開判勝與房間換圖都通過；首次可見出手位置為 x=96、age=0。

多人數據在 [network-performance-results.json](network-performance-results.json)。
這是同一桌面 Chrome 裡的兩個 375×812 頁面、DPR 2，沒有 CPU 降速；不能當成兩台 iPhone 的實測。
單機表格的四倍降速數字應獨立解讀。

後續的再戰、出手手勢及斷線提示修正見 [房間與輸入修正紀錄](ROOM-FIXES.md)。
