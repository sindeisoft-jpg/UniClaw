---
name: excel-quotation
description: Generate styled Excel quotation documents (报价单). Use when the user asks to create, make, or generate a quotation/quote/报价单 in Excel format, with a professional layout (title, company, date, line items with 品名/规格/数量/单位/单价/金额, notes). Triggers: 做一份报价单、生成报价单、Excel报价、quotation in Excel, create a quote sheet.
homepage: https://openpyxl.readthedocs.io/
metadata:
  {
    "openclaw": {
      "emoji": "📋",
      "requires": { "bins": ["python3"] },
      "install": [
        {
          "id": "pip",
          "kind": "pip",
          "package": "openpyxl",
          "label": "Install openpyxl (pip)"
        }
      ]
    }
  }
---

# Excel 报价单 (Excel Quotation)

Generate a styled Excel quotation (报价单) from a short description. The script produces a single-sheet workbook with title, company info, date, item table (品名、规格、数量、单位、单价、金额), and optional notes.

## When to use

- User says they want a quotation/quote/报价单 in Excel.
- User describes what the quote is for (e.g. 产品报价、服务报价、项目报价) and optionally items or totals.
- Prefer this skill over hand-writing Excel XML or ad-hoc CSV when the output should be a proper .xlsx with headers and formatting.

## Workflow

1. **Clarify** (if needed): Ask for quotation title, company/seller name, and line items. If the user only gave a theme (e.g. “做一份软件服务报价单”), propose a small set of example items and let them confirm or edit.
2. **Build JSON input**: Assemble a single JSON object for the script (see Input format below). Compute `amount` for each line as `qty * unitPrice`; round to 2 decimals. Optionally add a total row in the script output.
3. **Run script**: Call the script with JSON and an output path under the workspace or user-requested directory.
4. **Confirm**: Tell the user the file path and that they can open it in Excel or attach it.

## Input format

The script accepts JSON (file or stdin) with this shape:

```json
{
  "title": "报价单标题",
  "company": "公司/卖方名称",
  "date": "2025-02-23",
  "items": [
    {
      "name": "品名",
      "spec": "规格型号",
      "qty": 1,
      "unit": "单位",
      "unitPrice": 100.00,
      "amount": 100.00
    }
  ],
  "notes": "备注（可选）"
}
```

- `title`, `company`, `date`, `items` are required. `notes` is optional.
- Each item must have `name`, `spec`, `qty`, `unit`, `unitPrice`, `amount`. `amount` should equal `qty * unitPrice` (script may recalc for consistency).
- Use a clear filename for the output, e.g. `报价单-项目名-日期.xlsx`.

## Quick start

Use the Python that has openpyxl installed. On macOS, prefer the dedicated venv (avoids PEP 668 externally-managed errors):

- **Recommended**: `~/.openclaw/venv-excel/bin/python3` (venv with openpyxl; add this path to exec allowlist if using allowlist mode).

Write JSON to a temp file, then run:

```bash
~/.openclaw/venv-excel/bin/python3 {baseDir}/scripts/generate_quotation.py --json /tmp/quote.json --out /path/to/workspace/报价单.xlsx
```

Or with system python if openpyxl is installed there:

```bash
python3 {baseDir}/scripts/generate_quotation.py --json /tmp/quote.json --out /path/to/workspace/报价单.xlsx
```

Or pipe JSON:

```bash
echo '{"title":"产品报价单","company":"示例公司","date":"2025-02-23","items":[{"name":"产品A","spec":"规格1","qty":2,"unit":"台","unitPrice":500,"amount":1000}]}' | ~/.openclaw/venv-excel/bin/python3 {baseDir}/scripts/generate_quotation.py --out /path/to/报价单.xlsx
```

## Notes

- The script uses openpyxl; install with `pip install openpyxl` if missing.
- Output is styled with a header row, borders, and column widths suitable for 报价单. The user can open the file in Excel or WPS for further edits.
- If the user wants a different column set (e.g. 序号、税率), extend the script or add optional fields in a follow-up.
