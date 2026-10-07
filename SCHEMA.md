# 数据格式说明（定时任务写入前必读）

网站只读取 `data/` 下的 JSON 文件和 `demos/` 下的示例网站。所有文字一律中文（提示词原文除外）。
写完文件后执行 `node scripts/validate.js`，通过了再提交。

## 1. 每日简报 `data/daily/YYYY-MM-DD.json`

```json
{
  "type": "daily",
  "date": "2026-10-07",
  "headline": "今日一句话，一两句",
  "sections": [
    { "key": "ai", "title": "AI", "items": [ /* Item */ ] },
    { "key": "wh", "title": "仓储物流自动化", "items": [ /* Item */ ] }
  ],
  "notes": ["读取失败的源、需要提醒的事"]
}
```

`key` 只能用：`ai`（AI）、`wh`（仓储物流）。

### Item（通用条目）

```json
{
  "title": "中文标题",
  "source": "来源名",
  "published": "2026-10-06",
  "summary": "讲了什么：2–3 句白话，保留关键数字",
  "why": "为什么值得看：1 句",
  "url": "原文真实链接",
  "tags": ["新模型"],
  "vendorClaim": false
}
```

- `tags` 可选，常用：`新模型`、`报告`、`财报`、`数据`、`案例`、`观点`。
- `vendorClaim` 为 true 表示主要是厂商自己的说法，网站会标注"厂商说法"。

## 2. 每周周报 `data/weekly/YYYY-MM-DD.json`

```json
{
  "type": "weekly",
  "date": "2026-10-11",
  "headline": "本周一句话",
  "models": {
    "news": [ /* Item */ ],
    "table": [
      { "use": "写代码/做网页", "picks": ["模型A", "模型B"], "basis": "依据（榜单名或测评来源）", "link": "依据链接" }
    ]
  },
  "skills": [ /* Skill */ ],
  "kaoyan": [ /* Item，why 写"对 2027 年 12 月考试意味着什么" */ ],
  "jobs": [
    { "company": "公司", "role": "岗位", "forWhom": "适合谁（是否大三可投）", "deadline": "2026-10-31 或 未注明", "summary": "一两句", "url": "申请或公告链接" }
  ],
  "notes": []
}
```

`table` 的 `use` 固定 7 行：写代码/做网页、长文写作、中文能力、数学推理、智能体、性价比、国内可直接使用。

### Skill（Skill 与提示词）

```json
{
  "name": "名称",
  "category": "网页设计",
  "what": "它做什么",
  "scene": "适合什么场景",
  "howto": ["第一步", "第二步"],
  "url": "GitHub 仓库或原帖链接",
  "author": "作者",
  "stars": "1.2k",
  "demo": "demos/2026-10-11-xxx/index.html",
  "images": ["效果图链接"],
  "prompt": "提示词原文（照片艺术类必填）",
  "promptZh": "提示词中文翻译"
}
```

- `category` 只能用：`网页设计`、`照片艺术`、`写作`、`PPT`、`研究`、`其他`。
- 网页设计类必须有 `demo`：用这个 Skill 实际做一个示例网站，放在 `demos/<日期>-<英文短名>/index.html`（单文件，图片尽量用 CSS/SVG，不要引用国外 CDN 和 Google Fonts，国内打不开）。
- 照片艺术类必须有 `prompt` 和 `images`（原作者发布的效果图链接）。

## 3. X 晚间精选 `data/x/YYYY-MM-DD.json`

```json
{
  "type": "x",
  "date": "2026-10-07",
  "items": [
    {
      "kind": "prompt",
      "category": "照片艺术",
      "author": "作者名",
      "handle": "@xxx",
      "url": "帖子链接",
      "posted": "2026-10-05",
      "metrics": "65.8 万查看",
      "textZh": "帖子内容的中文翻译或摘要",
      "prompt": "提示词原文（kind 为 prompt 时）",
      "promptZh": "提示词中文翻译",
      "images": ["图片链接"]
    }
  ]
}
```

`kind` 只能用：`prompt`（提示词/Skill）、`news`（资讯）、`opinion`（观点）。
`category` 同 Skill 的取值。

## 规则

- 不要编造：每条都必须来自实际读过的原文，链接必须真实。
- 同一天的文件重复生成时直接覆盖。
- 不要改 `site/`、`server/`、`scripts/` 里的程序文件。
