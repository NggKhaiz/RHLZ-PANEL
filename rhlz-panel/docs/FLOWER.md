# Skill Flower RHLZ

Prompt XML để một coding agent **tiếp tục code và hoàn thiện** panel.

- File prompt: [`SKILL-FLOWER-RHLZ.xml`](./SKILL-FLOWER-RHLZ.xml)
- Cách dùng: mở repo, dán **toàn bộ XML** vào agent, rồi nói:

```
Execute Skill Flower RHLZ. Start at petal P0. Do not skip gates.
```

## Thứ tự bắt buộc

| Petal | Việc |
|---|---|
| **P0** | One-click `install.sh --yes` / `update.sh --yes` / `uninstall.sh --yes` / `node.sh --yes` — không menu |
| **P1** | Sửa lệch tên/version/port/secret + bug logic |
| **P4** | Vá lỗ hổng HIGH rồi pentest loop (ledger từ row 51) |
| **P2** | Catalog phần mềm: UI = backend = downloader |
| **P5** | Docs + trang `/docs` bám one-click |
| **P3** | Tách file lớn, template trùng, disk stats giả |
| **P6** | UX |

One-liner mục tiêu sau P0:

```bash
curl -fsSL https://raw.githubusercontent.com/NggKhaiz/RHLZ-PANEL/main/rhlz-panel/install.sh | bash -s -- --yes --runtime docker --admin admin:ChangeMe_now
```
