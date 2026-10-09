你的任务：生成「每周周报」，写进当前仓库（info-hub）。周报包含五块：本周精读（AI、仓储物流）、AI 模型怎么选、Skill 与提示词（打分排序）、考研与实习、考研方向对比表。这是在 GitHub Actions 里无人值守运行的任务：没有人会回复你，也没有人能批准任何请求。从头到尾一次做完，不要提问、不要等待。某个工具失败，就换方法继续，不要提前结束。以获取信息为目的，可以读取任何网页。

## 运行环境
- 当前工作目录就是仓库根目录（已检出 main 分支，git 身份已配置好）。
- 写完文件后不要自己 git push，由外层流程负责提交和推送。你只需要保证文件写好、校验通过。
- 可以用 Bash 运行 git clone、python、node、npx playwright（Chromium 已由外层流程安装）。

## 第一步：读规则和上一期
1. 完整读一遍 SCHEMA.md（第 2 版）。「读者是谁」决定你怎么挑、怎么打分、怎么写"对你意味着什么"。
2. 读 data/weekly/ 里最近一期周报：已经收录过的 Skill（按 url）不要重复；上一期的 kaoyanTable 作为这期的底稿，逐行核对更新（没有就从头做）。

## 关于打开网页
- 先 WebSearch，再 WebFetch 打开搜索结果里的链接。打不开就换一个结果，不要卡住。
- GitHub 仓库直接 `git clone --depth 1` 到 /tmp 下读文件，比网页稳定。
- 每条信息都必须基于实际读到的内容，不能只凭搜索标题写。不确定的不写。

用 `TZ=Asia/Shanghai date` 获取北京时间，本周范围 = 过去 7 天。

## 一、本周精读（reading）
材料：data/daily/ 里过去 7 天的日报（里面的精读和速览）；feeds/latest.json；feeds/aihot.json（endpoints.latest7d、weekly 是 AIHOT 的一周精选，data 是 markdown，含原文链接和推荐理由）；再 WebSearch 本周发布的长文：行业报告、深度分析、长访谈（AI 和仓储物流自动化各搜几次，中英文都搜）。
每个分区（ai、wh）：精读 3–4 篇（pick: true）——这一周里最值得读者花时间读全文的，可以和日报精读重合，但要挑出真正最好的；其余速览 6–10 条（一句话）。精读要写 summary、takeaways、why（结合他的情况）、readMinutes。

## 二、AI 模型怎么选（models）
材料：arena.ai 各排行榜（文本、WebDev、视觉/生图等）、Artificial Analysis（智能指数、价格）、Epoch AI（FrontierMath 等）、SuperCLUE（中文）、本周新模型的独立测评。
- news：本周发布或更新的重要模型、榜单的明显变化。厂商自报数据 vendorClaim: true。
- table：7 行固定用途。每行 picks 1–2 个，basis 写清榜单、名次或分数，asOf 写依据的数据日期，released 写每个模型的发布日期，link 写依据链接。
- **防止推荐过时模型（必须做）**：对每个候选模型，查清它的发布日期，以及同一家公司是否已经发布了更新的同级模型（例如某公司已有 6.x，就不要再推 5.x）。榜单数据日期超过 30 天的不能单独作为依据。写完后自己逐行检查一遍：有没有比它更新的版本？依据是不是最近一个月的？

## 三、Skill 与提示词（skills，10–20 个，按 score 从高到低）
类别：网页设计、视频、图片编辑、照片艺术、PPT、写作、研究、编程、其他。每类有好的就收，**视频、图片编辑、PPT 这三类读者特别想要，尽量每类都有**。
材料（都要看）：
- 视频：`git clone --depth 1 https://github.com/yihui-dev/awesome-opus5-5-videos`（475 条 Opus 5.5 做的视频及完整提示词，配套网站 https://skillry.dev/ai-videos/opus-5-5 ）。读 data/videos.json 和 prompts/，挑 3–6 个最好、最可复用的：prompt 填原提示词，video 填原作者帖子或 skillry 上的对应页面，what 写成片是什么样。再看 HyperFrames、Remotion 官方 Agent Skills、https://github.com/joeseesun/opus-video-prompts 、https://github.com/lemomo-ai/lemo-opuscar 。
- 图片编辑 / 照片艺术：GPT Image、Nano Banana 一类的提示词合集（GitHub 上 awesome gpt image prompts、nano banana prompts 等），以及 data/x/ 里过去 7 天 X 精选中的提示词（可以直接收录，保留原链接）。
- PPT、写作、研究、编程：skills.sh 热门、trendshift.io、GitHub anthropics/skills、khazix-skills 等。
每个都要写 score（0–100，**对这位读者**的适合度：他用得上的频率、上手难度、效果、和他方向的相关性）和 scoreWhy（一句话）。按 score 从高到低排列。
网页设计类至少 1 个必须带 demo：读这个 Skill 的 SKILL.md，**真的按它的方法做一个示例网站**，主题和读者相关（仓储自动化、物流数据看板、课程设计展示、个人作品集等，不要冒充真实公司），单个 HTML 文件，不引用国外 CDN 和 Google Fonts，图片用 CSS/SVG。写在 demos/YYYY-MM-DD-英文短名/index.html，用 Playwright 截图检查 1366 和 390 两种宽度，确认没有横向溢出和明显排版问题。
宁缺毋滥，营销或空洞的不要。

## 四、考研与实习（future）
- 考研（type 考研）：研招网和目标院校研招网的公告；只收和读者候选方向（物流工程与管理专硕、管理科学与工程、机械/机器人）、目标院校（北理工这一档的 985，北京优先）有关的：招生目录、复试线、考试科目变化、扩招缩招、报名政策。why 写对 2027 年 12 月考试意味着什么。没有就不写。
- 实习、校招、宣讲会：**只收北京或可远程的**。搜：北京科技大学就业信息网本周宣讲会、双选会；北自科技、今天国际、大福（中国）、极智嘉、海康机器人、京东物流、顺丰科技、菜鸟、美团、字节、明略科技在北京的实习和校招；"AI 产品经理 实习 北京""FDE 实习 北京""供应链 实习 北京"。city 必填，why 写清是否适合大三、和他考研/就业方向的关系，deadline 已过的不收。
- 趋势（type 趋势）：本周有可靠数据支撑的招聘趋势（最多 2 条）。

## 五、考研方向对比表（kaoyanTable，8–15 行）
以上一期的 kaoyanTable 为底稿（没有就从头做），每行一个"院校 × 专业"，覆盖三个候选方向，院校以北京理工大学这一档的 985 为主（北理工、北航、北交（211 但物流强，可作参照）、同济、天大等，北京优先）。字段见 SCHEMA.md：初试科目（考不考数学、数学几、英语一还是二）、招生人数、近一年复试线、fit（结合他：英语偏弱、数学在学、本科物流工程、排名 30% 以后）。数据必须来自院校官网或研招网，查不到写"未查到"，不要估计。checked 写核对日期。上一期写"未查到"的格子，这期优先再试一次（招生目录常是 xlsx/pdf 附件，可以下载后用 python 读）。

## 六、写入（无论如何都要做）
1. 严格按 SCHEMA.md「每周周报」格式写 data/weekly/YYYY-MM-DD.json（北京时间今天的日期；已存在就覆盖）。用 future，不写 kaoyan 和 jobs 字段。notes 里写依据较弱的地方和遇到的问题。
2. 即使有些部分没找到内容，也要写文件，把原因写进 notes。
3. 运行 `node scripts/validate.js`，必须"校验通过"，不通过就改到通过。
4. 不要修改 site/、server/、scripts/、feeds/、.github/、automation/ 里的文件。

## 七、结束时输出
最后用中文输出四行（外层流程会把它用作提交说明和通知）：
- 本周一句话
- 本周精读：AI X 篇、仓储 X 篇；Skill/提示词 X 个（最高分的是 ××）；考研与实习 X 条
- 考研对比表：X 行，本周新补上的格子 X 个
- 完整内容 http://120.55.51.34:8800/#/week

## 规则
不要编造：每条都必须来自实际读过的内容，链接必须真实。
