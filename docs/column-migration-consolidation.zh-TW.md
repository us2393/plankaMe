# 欄位 migration 合併

`20260906` 的四個 migration 已合併為
`server/db/migrations/20260906000000_add_column_layout.js`，保留原本的最終結構：

- `board.column_id`：integer，含索引。
- `list.column_id`：text，含索引；直接建立文字型別，不再經過型別轉換。
- `list.column_position`：double precision，含索引；新安裝時以 `position` 初始化。

## 已使用舊 migration 的資料庫

**重啟後端或執行 `db:migrate` 前，必須先整理執行紀錄。** 否則 Knex 會因找不到舊檔案而中止。不要清空 `migration` 表，也不要 rollback 後重跑，以免失去現有分欄資料。

目前的開發 Compose 將 PostgreSQL 留在容器網路內，請在專案根目錄執行：

```bash
sudo docker compose -f docker-compose-dev.yml run --rm --no-deps planka-server node db/consolidate-column-migrations.js
```

這個一次性工具不是另一個 migration，不會在啟動時自動執行。它會：

1. 以交易鎖定 Knex 的 migration lock；其他遷移正在執行時拒絕處理。
2. 確認四個舊紀錄完整存在，且三個欄位的型別符合最終結構。
3. 將原紀錄備份至 `server/.tmp/migration-backups/`（Compose 中為 `/app/.tmp/migration-backups/`，透過掛載保存在主機）。
4. 將最後一筆舊紀錄改名為新檔名，保留其 batch、時間與 ID，刪除另外三筆舊紀錄；交易失敗時一併回復。

只整理執行紀錄，不改看板、列表、卡片、分欄或排列；不執行新 migration 的 `up`／`down`。重複執行會回報 `already-consolidated`，不再次修改。

只有部分舊 migration 已執行、紀錄重複、混有新舊紀錄或型別不符時，工具會中止；請先恢復四個原檔並檢查，不能強行標記完成。備份 JSON 是執行紀錄備份，不是完整資料庫備份，請另行妥善保存。

成功後可以正常啟動後端或執行既有 migration 指令。其他使用舊 migration 的環境也須各自整理紀錄。

## 全新資料庫

直接使用原本的初始化／遷移流程即可；一次建立上述欄位。沒有舊紀錄時，整理工具只回報 `fresh`，不會建立欄位或假裝 migration 已完成。

## 回滾注意事項

合併後，三個欄位成為同一個遷移單位，無法分別回滾。`down` 會刪除這些欄位及索引，因此會失去分欄與欄排序資料；不會把文字欄 ID 強轉成 integer。本次整理不執行回滾。
