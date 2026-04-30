# sudoku-app-api

Vercel serverless function that receives bug/feature reports from the Sudoku app
and creates GitHub issues in [`dadlabs-io/sudoku-app-feedback`](https://github.com/dadlabs-io/sudoku-app-feedback).

This is a 1:1 port of [`soundboard-app-api`](https://github.com/dadlabs-io/soundboard-app-api) —
same endpoint shape, same handler logic. The only thing that differs between the
two apps is the `GITHUB_REPO` env var.

## Endpoint

```
POST https://sudoku-app-api.vercel.app/api/submit-report
Content-Type: application/json
```

### Request body

```json
{
  "title": "Bug title",
  "description": "Detailed description",
  "type": "bug",                       // or "feature"
  "appVersion": "0.7.10",
  "appBuild": "37",
  "deviceInfo": {
    "model": "Pixel 7",
    "manufacturer": "Google",
    "osName": "Android",
    "osVersion": "14"
  },
  "logs": "<last 500 lines, newline-separated>",
  "attachments": [
    { "filename": "screenshot.png", "mimeType": "image/png", "size": 184321, "content": "<base64>" }
  ],
  "timestamp": "2026-04-29T22:05:11Z"
}
```

### Response

```json
{
  "success": true,
  "message": "Report submitted successfully",
  "issueUrl": "https://github.com/dadlabs-io/sudoku-app-feedback/issues/12",
  "issueNumber": 12,
  "attachmentsUploaded": 1
}
```

Errors return `{ "success": false, "error": "..." }` with a 4xx/5xx status.

## Configuration

Set these in Vercel → Settings → Environment Variables (apply to Production +
Preview + Development):

| Variable | Value |
|---|---|
| `GITHUB_TOKEN` | Fine-grained PAT with Issues R/W + Contents R/W on `sudoku-app-feedback` |
| `GITHUB_OWNER` | `dadlabs-io` |
| `GITHUB_REPO` | `sudoku-app-feedback` |

Vercel does **not** auto-redeploy when env vars change — Deployments → ⋯ →
Redeploy after editing them.

## Smoke test

```bash
curl -X POST https://sudoku-app-api.vercel.app/api/submit-report \
  -H "Content-Type: application/json" \
  -d '{"title":"smoke","description":"smoke","type":"bug"}'
```

Expected: HTTP 201 with an `issueUrl`. Close the test issue manually.

## Local dev

```bash
npm install -g vercel
vercel link              # links to the deployed project
vercel dev               # runs the function locally on http://localhost:3000
```

`.env.example` shows the env vars; copy to `.env` for local runs.

## Reference

Full architecture + setup walkthrough lives in the Sudoku app repo:
[`memory-bank/short-term/in-app-bug-reporting-implementation-plan.md`](https://github.com/dadlabs-io/sudoku-app/blob/main/memory-bank/short-term/in-app-bug-reporting-implementation-plan.md)
[`memory-bank/short-term/in-app-bug-reporting-setup-walkthrough.md`](https://github.com/dadlabs-io/sudoku-app/blob/main/memory-bank/short-term/in-app-bug-reporting-setup-walkthrough.md)
