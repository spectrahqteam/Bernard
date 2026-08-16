# vision —— 给无视觉模型补充"看图"能力的 Claude Code Skill

不用装 MCP、不用 clone、不用 npm/build。一个 `SKILL.md` + 一个纯标准库 Python 脚本，
把图片交给**任意 OpenAI 兼容的视觉模型**去看，再把文字结果返回给当前模型。

适用场景：在 Claude Code 里用的模型本身没有视觉能力（如部分 GLM、Qwen 文本版等），
但你需要它读截图、做 OCR、看图表/UI/报错截图。

## 安装

把整个 `vision/` 目录放到 Claude Code 的 skills 目录下：

- 用户级（全局生效）：`~/.claude/skills/vision/`
- 项目级（仅当前项目）：`<项目>/.claude/skills/vision/`

例如：

```bash
mkdir -p ~/.claude/skills
cp -r vision ~/.claude/skills/
```

目录结构应为：

```
~/.claude/skills/vision/
├── SKILL.md
├── README.md
└── scripts/
    └── see.py
```

## 配置（只需一次）

脚本通过环境变量读取配置，变量名和 vision-mcp-server 一致，方便迁移：

```bash
export VISION_BASE_URL=http://localhost:1234/v1/chat/completions   # 必填，要写完整的 /v1/chat/completions
export VISION_MODEL=Qwen3-VL-32B                                   # 必填，任意视觉模型名
export VISION_API_KEY=sk-xxx                                       # 本地模型可不填或填占位符
```

把这几行加到 `~/.zshrc` / `~/.bashrc`，或在启动 Claude Code 前 export 即可。
常用可选项：`VISION_MAX_TOKENS`、`VISION_TEMPERATURE`、`VISION_DETAIL`(auto/low/high)、`VISION_TIMEOUT`。

> 任意 OpenAI 兼容服务都行：vLLM、Ollama、LM Studio、LMDeploy，或云端 GPT-4o / GLM-4V / 通义千问-VL 等。

## 使用

装好后，模型会在需要看图时自动触发这个 skill。也可手动验证：

```bash
# OCR
python3 ~/.claude/skills/vision/scripts/see.py ./shot.png "把图里所有文字原样转写出来"

# 看报错截图
python3 ~/.claude/skills/vision/scripts/see.py ./error.png "这个报错是什么？可能的原因？"

# 把图表读成表格
python3 ~/.claude/skills/vision/scripts/see.py ./chart.png "把每个标签和数值提取成 markdown 表格"

# 远程图片
python3 ~/.claude/skills/vision/scripts/see.py "https://example.com/a.png" "描述这张图"
```

## 排错

- 提示缺少环境变量 → 按上面把 `VISION_BASE_URL` / `VISION_MODEL` 配上。
- 连不上 endpoint → 确认服务在跑、URL 写了完整的 `/v1/chat/completions`。
- 想只看请求不发送 → 加 `--dry-run`：
  `python3 scripts/see.py --dry-run img.png "test"`
- 本地文件会自动转成 base64 data URL；http(s) 链接直接透传。

## 为什么用 skill 而不是那个 MCP

- 不依赖 clone / npm install / tsc 编译，没有 `npx github:` 冷启动超时或 `dist/index.js` 缺失的问题。
- skill 就是几个文件，拷进目录即用，分发简单。
- 纯 Python 标准库，无需 `pip install`。
