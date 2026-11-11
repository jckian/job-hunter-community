# Job Hunter · Community

打開網址即可使用的求職工作台：設定偏好、收藏工作、記錄投遞進度、保留筆記與追蹤日期。繁體中文介面，支援手機與深淺色模式。

此版本從原本的 Job Hunter 介面樣式獨立衍生，重新實作個人資料層。不含任何預載履歷、聯絡資訊、投遞紀錄、API 金鑰或原作者的求職偏好，不連線至原版的本機後端。

## 開始使用

1. 開啟網站，到「Preference」設定目標職稱、地點、技能與排除條件，按「儲存偏好」。預設自動開始掃描。
2. 「職缺」顯示符合偏好的新工作，也可手動加入；加入「待投」後可一鍵標記已投遞。
3. 「紀錄」直接修改投遞日期與進度，或開啟編輯筆記。「統計」查看投遞流向、面試率與依公司／職稱／地點的分類。
4. Preference 分頁設定自己的條件，保留偏好檔連結與持續覆寫功能。
5. 定期從右上角「備份 / 還原」下載完整 JSON 備份。換裝置時匯入即可。

不需安裝、不需帳號、不需 API 金鑰。這份網站提供公開來源掃描與投遞管理，不包含 AI 履歷生成、LINE 通知或原版 Python 後端。

## 依 Preference 自動掃描

「職缺」提供 Glassdoor、Indeed、LinkedIn 與 Google 外部搜尋入口，帶入第一個目標職稱（沒有時用第一個技能）與第一個地點；遠端偏好也會帶入。Glassdoor 的地點併入關鍵字，請在外站確認地點篩選。未設定偏好時仍可開啟各平台。這些入口不計入 17 個自動掃描來源；外站結果需複製職缺網址，透過「＋ 新增職缺」保存。

- 填寫至少一個目標職稱或技能關鍵字。儲存 Preference 後，預設立即讀取公開來源並在瀏覽器內篩選。
- 開啟頁面時，若上次掃描已超過 6 小時會更新。頁面開啟期間每分鐘檢查是否到期；關閉網頁不會背景執行。可在設定中改為僅手動掃描。
- 右上角「立刻掃描」可手動執行。來源資料快取 6 小時，期間再次掃描或改偏好會重新比對快取，避免過量請求。
- 內建 17 個來源：Remote OK、Jobicy（最新 100 筆遠端職缺）、Remotive（遠端職缺，公開 API 約延遲 24 小時）、Arbeitnow（歐洲近期前 300 筆），以及 Stripe、Airbnb、Figma、Notion、Anthropic、Discord、Cloudflare、Databricks、Datadog、MongoDB、Reddit、Pinterest、Duolingo 公開職涯頁。這是起始範圍，**不是全網職缺搜尋，也不是使用者的預設偏好**。
- Preference 可加入最多 20 個 Greenhouse／Ashby 公司職涯頁，或選擇只掃描自己的來源。接受 `https://job-boards.greenhouse.io/<board>`、`https://boards.greenhouse.io/<board>`、`https://jobs.ashbyhq.com/<board>`，也接受其職缺頁連結。
- 公司／產業欄只作為排序偏好，不會自動發現任意公司的官網。要擴大搜尋範圍，請加入對應職涯頁。LinkedIn、Indeed、Workday 等不在此版直接讀取範圍，可手動新增。
- 職稱任一條件符合即可；沒有職稱時改用技能關鍵字。地點與工作型態為篩選條件，排除條件比對職稱與 JD。提供有限的中英文別名（例如軟體工程師／Software Engineer、美國／US）；不是全文翻譯或 AI 語意搜尋。其他詞建議使用職缺原文常見用語。
- 公司／技能／資歷影響掃描職缺排序。只有來源提供可比較的同幣別結構化年薪，且上限低於期待時才排除；其他薪資、簽證、自由文字期待需要人工核對。
- 每次最多新增 300 筆、紀錄總數上限 10,000 筆；瀏覽器容量另有上限。超出範圍或保存失敗會明確提示，可縮小條件並下載備份。
- 掃描不覆寫既有紀錄的職稱、公司、筆記、日期或進度，也不自動刪除舊職缺。新偏好不符合的自動發現項目會在「職缺」暫時隱藏；手動新增、待投與已投遞紀錄仍保留。職缺是否仍開放請查看來源頁面。
- 各來源讀取數、符合數、快取時間和錯誤均可在「各來源結果與搜尋範圍」查看。部分來源失敗不會清除其他結果。

來源文件：[Greenhouse](https://docs.greenhouse.io/job-board.html)、[Ashby](https://developers.ashbyhq.com/docs/public-job-posting-api)、[Remotive](https://github.com/remotive-com/remote-jobs-api)、[Arbeitnow](https://www.arbeitnow.com/blog/job-board-api)。

## 持續修改 preference.json

- 每次「儲存偏好」都會更新這個瀏覽器的資料。
- 桌面 Chrome／Edge 等支援 File System Access API 的瀏覽器，可選擇「建立／連結本機檔案」，由使用者選定 `preference.json` 並授權寫入。之後儲存偏好就會覆寫同一份檔案。
- 如果選擇已有內容的相容偏好檔，工具會先詢問並讀入既有偏好；不會直接用空白內容覆蓋。不相容檔案會拒絕覆寫。
- 瀏覽器可能要求下次開啟時重新授權。未取得授權時，畫面會提示檔案尚未更新；瀏覽器內的偏好仍保留。
- 直接寫檔不可用時，可下載最新版 `preference.json`，或匯入已編輯的 JSON。
- `preference.example.json` 是空白格式範例；可複製成自己的 `preference.json`。Markdown 匯出是閱讀用，不作為 JSON 匯入格式。
- 外部編輯器修改檔案不會自動同步到已開啟的頁面，請再次匯入。避免同時在多個頁面／編輯器修改同一份偏好檔。
- 檔案僅含偏好。**要備份投遞紀錄，請下載完整備份**。
- 匯入偏好不影響工作紀錄；還原完整備份會取代目前偏好與全部工作紀錄，執行前會詢問。

## 資料與隱私

個人資料只存於目前瀏覽器的 localStorage。本機檔案 handle 與公開來源資料快取存在 IndexedDB；檔案讀寫仍由瀏覽器權限管理。掃描使用不帶登入憑證的公開 GET 請求，不會把偏好、姓名、筆記或投遞紀錄傳給來源。來源服務可見一般網路連線資訊與所讀取的公司職涯頁。程式沒有上傳 API、分析追蹤碼、外部字型、第三方 JavaScript 或共用個人資料庫。

每個瀏覽器設定檔／網站來源各自保存資料。不同電腦不會自動同步。同一台電腦使用同一瀏覽器設定檔的人可看到相同資料，請使用各自的設定檔。清除網站資料、無痕模式結束、更換網址或裝置都可能使原本資料不可見；請定期匯出備份。瀏覽器儲存不是加密保險箱，不要記錄密碼或 API 金鑰。

點選外部職缺或搜尋連結時，會前往第三方網站；搜尋連結包含使用者選擇的職稱／地點。GitHub Pages 等主機仍可能保留一般網站存取紀錄；本工具不向主機上傳偏好或工作紀錄。

`.gitignore` 排除了本工具預設的個人偏好、備份檔、資料庫與匯出檔名。請勿將改名後的個人備份上傳到公開 repository。網站發布流程只複製指定的靜態程式檔。

## 符合度如何計算

手動紀錄依職稱、地點、技能及工作型態計分；掃描紀錄另納入公司／產業與資歷。每項內任一文字條件符合即可，未設定的項目不計分。符合項數 ÷ 設定項數，即為顯示百分比。命中排除條件時為 0；完全沒設定條件時不顯示分數。這是文字條件比對，不是 AI 判斷或面試機率。

工作許可及自由文字期待保留為個人備忘；請自行核對職缺原文。來源未提供的資訊不會被當成已確認符合。

## 本機使用與測試

網頁本身無第三方依賴。直接打開 `index.html` 可使用基本功能，但建議使用 HTTPS 網址或本機伺服器，讓儲存來源和檔案權限更穩定。

若已安裝 Node.js 20+：

```sh
npm test
npm start
```

開啟 `http://127.0.0.1:8787/`。開發伺服器只監聽本機，且只提供允許的靜態檔案。它不讀取個人偏好檔或任何其他資料夾。

## 發布到 GitHub Pages

1. 將這個目錄放入新的獨立 repository。
2. 安裝並登入 GitHub CLI（`gh`），確認有此 repository 的寫入與 Pages 管理權限。
3. 在本機執行 `npm test`，通過後執行 `npm run publish:pages -- <username>/<repository>`。
4. 此命令只將指定的公開程式檔發布到 `gh-pages` 分支，並設定 Pages 使用這個分支。原始碼請另以 Git 保存至 `main`。
5. 完成後，網址通常是 `https://<username>.github.io/<repository>/`。

發布指令會先執行資料驗證、掃描篩選／去重、匯出／匯入與偏好檔覆寫測試，再只部署指定的 HTML、CSS、JavaScript、圖示與空白偏好範例。無需額外的 Actions workflow 寫入權限。公開網站的使用者資料不會進入 repository。

參考：[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)、[File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)。

新增來源文件：[Remote OK API](https://remoteok.com/api)、[Jobicy API](https://github.com/Jobicy/remote-jobs-api)。保留來源名稱與原始職缺連結。Jobicy 僅取最新 100 筆；Remote OK 缺少地點時不推定為全球可應徵。
