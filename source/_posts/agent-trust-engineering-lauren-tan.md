---
title: 从 Agent 信任到工程落地：解读 Lauren Tan 的规模化 Agent 开发方法
date: 2026-11-12 12:00:00
tags:
  - Agent
  - Cursor
  - 工程实践
---

## 1 引言

基于大语言模型的编码智能体 (coding agent) 已能独立完成一个议题 (issue) 的修改。工程问题因此从“单个 Agent 能否写对代码”转向“一名工程师能否同时调度大量 Agent 并维持产出质量”。Cursor 工程师 Lauren Tan (GitHub 账号 potetto) 的公开演讲为此提供了一个可分析的案例。据其中文译稿，她称上个月向生产环境合入约 2,000 个 pull request (PR)，译稿标题写作 2,500，一张幻灯片另写“6 个月 5,000+ 个 PR” [1]。三处口径不一致，本文只将其作为量级参考。

本文有三个目标。一是梳理该演讲的方法论主张。二是核查演讲所涉工具 (pstack、Control Glass、control-ui) 的公开状态和内容。三是在资源有限的个人开发情境下给出可执行的落地路径。译稿中出现的 “Grok Bot” 与 pstack 文档所述作者任职单位 Cursor 不一致 [3][7]，本文以后者为准。

## 2 核心论点：规模受限于信任，信任来自可验证性

演讲的中心命题是，并行 Agent 的数量上限取决于工程师是否无需逐一监督就能信任其产出 [1]。演讲者将这一关系称为 trust curve，Agent 数量依次从 1 个、1–5 个、5–10 个、10–20 个扩展到上百乃至上千个。在曲线低端，工程师需要监督并频繁纠正 Agent。信任不足时扩大规模，产生的是低质量 PR、性能回退和线上缺陷 [1]。由此可以推出，增加 token 预算本身并不能提高有效产出。

提高信任的途径是使 Agent 的产出可验证。演讲给出了一个由低到高的验证谱系。低端是让 Agent 自行运行应用，通过 Chrome DevTools Protocol (CDP) 录制 trace、采集堆快照 (heap snapshot) 并调试。高端是形式化方法 (formal methods)，例如检验业务逻辑的不变量 (invariant)。演讲者认为后者仍是开放问题，在实践中很少可行 [1]。

验证只能证明功能正确，不能证明代码性能良好或结构合理。演讲者为此另行维护了一组从真实工作流中提炼的 skill 与操作手册 (playbook)，即 pstack，用于约束 Agent 的编码方式 [1]。第 5 节将对其内容作具体分析。

## 3 纠错层级与代码库治理

演讲主张，每次纠正 Agent 时应按约束强度由强到弱选择修复位置，演讲者称之为 correction ladder [1]。四个层级如下。

1. 代码库本身。通过更合适的数据结构和设计模式使错误在结构上无法发生，依据是 Agent 倾向于模仿已读到的代码。
2. 静态分析 (static analysis)。以 linter、编译器诊断和持续集成 (continuous integration, CI) 作强制约束，同类错误反复出现时新增 lint 规则。
3. 规则文件、自动审查工具 (Bugbot) 与 skill。Agent 通常会遵循，但可能忽略或遗忘。
4. 风格指南。主要依靠人工代码审查执行，无法随 PR 数量扩展。它适合用来发现缺失的约束，不宜作为主要修复手段。

```text
图 1　correction ladder 的四个层级 (据 [1] 绘制)

  强 ┌──────────────────────────────┐
     │ 1 代码库本身（结构上不可能出错）│
     │ 2 静态分析（lint / 编译 / CI） │
     │ 3 规则文件 / Bugbot / skill    │
  弱 │ 4 风格指南（依赖人工审查）     │
     └──────────────────────────────┘
```

图 1 中层级越靠上，约束越不依赖 Agent 或审查者的注意力，因此越能随 PR 数量扩展。

这一排序与制造业质量管理中的防错设计 (poka-yoke) 思想相近，即优先在源头消除出错可能，其次才是事后检查 [10]。这一对应是本文的类比，演讲本身未作此引证。

**代码库治理。** 演讲者指出，Agent 会复制既有模式，临时性的变通代码 (workaround) 一旦被复制便成为事实标准 [1]。这使技术债 (technical debt) [8] 在 Agent 协作中扩散得更快。她给出三条应对原则。一是清理既有技术债。二是只保留一条推荐路径 (paved path)，使 Agent 不必猜测。三是发现不良模式时先用 lint 规则阻止扩散，再逐步清理 [1]。

**面向 Agent 的架构。** 演讲以其团队的框架 Dune 为例 [1]。该框架把每个应用组织为 feature、entrypoint、transcript card、client 与 host 五类概念，每类只有一个存放位置和一种运行时职责。进程边界由目录结构和 import 规则强制执行，渲染进程的单个任务需控制在约 16 ms (60 fps) 或 8 ms (120 fps) 以内。组件不直接处理 IPC 通道、进程启动或重试逻辑。框架还禁止代码注释，理由是 Agent 会引用邻近注释为临时补丁辩护 [1]。

这些设计服务于同一目标，即使最省事的写法就是正确的写法。这种约束对人类工程师可能显得严格，但能降低上下文有限的 Agent 以及设计师、产品经理等非工程角色的出错概率 [1]。演讲者的概括是，应将团队的隐性知识和审查意见编码进框架与代码库，而不是留在审查评论里 [1]。

## 4 作为 Agent 接口的命令行工具

演讲者的第一个验证 skill 名为 Control Glass，由两部分组成 [1]。一是命令行工具 (command-line interface, CLI)，负责以可复现的方式运行应用并收集证据。它放在 skill 目录中，使 Agent 不必在每个会话临时编写脚本。二是功能地图 (feature map)，记录应用有哪些功能、用户通过哪些路由、快捷键或 DOM 元素到达这些功能以及各功能的用途，并由自动化流程维护 [1]。二者结合，使 Agent 能够理解表述模糊的缺陷报告，并自行验证修改结果。

以下关于 CLI 与临时脚本的比较是本文的分析，并非演讲原文。两者的根本区别在于 CLI 提供了稳定的接口，而脚本只是一次性的动作。Agent 不具备跨会话记忆，临时脚本每次重写，行为难以复现。CLI 的优势可归纳为五点。

- 接口稳定。命令、参数与输出格式固定，调用方无需理解内部实现。
- 可自我发现。`--help` 的输出即文档。
- 上下文开销低。一行调用即可替代阅读数百行脚本。
- 改进可累积。一次修复对后续所有会话生效。
- 便于权限控制。可只放行特定命令前缀，符合最小权限原则 (principle of least privilege) [9]。

据此，本文提出以下设计准则，其有效性尚待实践检验。

1. 非交互且设超时，避免 Agent 因等待输入而挂起。
2. 输出结构化 (如 `--json`) 且有长度上限。完整日志写入文件，只返回路径和摘要。
3. 退出码语义明确，例如 0 表示通过，1 表示验证失败，2 表示环境错误。
4. 错误信息给出下一步操作，而不仅是堆栈信息。
5. 证据 (截图、trace、堆快照) 写入固定目录，供审查者事后查看。
6. 操作幂等 (idempotent)，重复执行收敛到同一终态。

在本地开发与验证场景中，CLI 的上下文成本通常低于 Model Context Protocol (MCP) 工具，后者更适合需要认证的远程服务。这一判断基于二者调用方式的差异，尚无系统测量。

## 5 pstack 与 potetto-mode

### 5.1 公开状态

pstack 位于 Cursor 官方插件仓库 cursor/plugins 的 `pstack/` 目录。该仓库公开，采用 MIT 许可证，访问时约有 13.5k star [2]。pstack 可直接 clone，也可在 Claude Code 中安装 [3]。

```
/plugin marketplace add cursor/plugins
/plugin install pstack@cursor-plugins
/pstack:setup-pstack
```

setup 将各角色的模型配置写入 `~/.claude/rules/pstack-models.md`，依赖 Cursor 专有功能 (bugbot、automations) 的步骤会被跳过 [3]。社区另有面向 Claude Code、Codex 等工具的移植版 pstack-claude [5]。

Control Glass 未见公开版本。pstack README 未提及这一名称，仓库中也未检索到相关目录 [2][3]。本文推测它是针对 Cursor 自身桌面界面 Cursor Glass 的内部验证 skill，这一推测尚未得到证实。功能上最接近的公开实现是 cursor-team-kit 插件中的 control-ui 与 control-cli，pstack README 也建议与 cursor-team-kit 一并安装 [3]。pstack 内的 `/create-verification-skill` 则用于为任意项目生成同类的验证 skill [3]。

### 5.2 结构

README 列出约 40 个 skill、23 个 playbook、24 条原则和 2 个子 Agent (potetto-agent 与 comment-sicko) [3]。入口 `/potetto-mode` 是一个路由 skill。用户描述期望结果后，它匹配对应的 playbook，将其步骤原样复制进待办清单，未执行的步骤保留并注明跳过原因 [4]。这一机制使执行过程可以审计。使用时应描述结果与验收方式，而非具体步骤，例如“双击发送按钮会发出两次请求，先复现，再修复并验证”。

### 5.3 硬性规则

以下条目选自 potetto-mode 的 SKILL.md，与质量控制关系最为直接 [4]。

- 编写任何代码前先说明数据形状。跨函数边界的改动先用 architect skill 并行探索设计。
- 可通过运行观察得到的事实不询问用户，改用原型实验验证。只有无法通过实验解决的产品或偏好判断才提问。
- 修复缺陷前先在同一界面亲自复现。
- CI 通过不等于安全，每个 PR 须经独立验证后才能设置自动合并。
- 对自动审查工具的评论逐条判断，以具体理由驳回噪音，不盲目修改代码。
- 每个论断须在同一句中标明证据类型，即测得、推断或猜测。

### 5.4 原则

24 条原则分为 core、architecture、verification、delegation、meta 五组 [4]。表 1 列出与本文论点关系最密切的 6 条。

| 原则 | 适用情形 | 要点 |
| --- | --- | --- |
| Prove It Works | 宣布完成之前 | 以真实产物验证，不以“能编译”等代理指标代替 |
| Fix Root Causes | 调试 | 将症状追溯到系统最初出错处并在该处修复 |
| Build the Lever | 非平凡工作 | 编写可重复运行的工具 (codemod、脚本、生成器)，而非手工操作 |
| Encode Lessons in Structure | 同一指令第二次出现 | 将其编码为 lint、运行时检查或脚本，而非追加文字说明 |
| Sequence Work into Verifiable Units | 多步工作与 PR 堆叠 | 拆为各自以检查结束的小单元，逐个验证 |
| Never Block on the Human | 可逆工作 | 直接执行并展示结果，由人纠正方向 |

Encode Lessons in Structure 与第 3 节的纠错层级是同一主张在 skill 层面的表达。

### 5.5 子 Agent 调度

potetto-mode 对子 Agent 的调度有以下规定 [4]。

- 新工作默认交给全新的子 Agent，并整合原始任务说明、后续指令以及前一个 Agent 的报告和分支。理由是串联续接会在不知不觉中丢失指令。
- 主 Agent 对子 Agent 的结果负责，需审查 diff 并自行撰写总结，不转述子 Agent 的自述。
- 传递文件路径而非内联内容，以控制上下文窗口的占用。
- 以同一提示在不同模型上运行的结果作为第二意见，结果一致则视为高可信度。
- 可逆操作直接执行。强推共享分支、部署、删除数据、向客户发送消息等不可逆操作必须暂停。

在 Cursor 中，代码角色的默认模型为 grok-4.7-xhigh-fast，判断与写作角色为 claude-opus-5-5-xhigh，二者都可通过 setup-pstack 修改 [4]。在无法调用 Grok 的环境中，可将代码角色设为 inherit-parent，即沿用当前对话的模型。

## 6 基于 CDP 的 UI 缺陷复现

control-ui 用于复现依赖真实焦点、键盘输入、滚动、缩放或渲染行为的 UI 缺陷，并为修复提供前后对比证据 [6]。它是第 4 节所述验证 CLI 的一种公开实现。

### 6.1 流程

skill 要求先查找仓库已有的测试设施 (Playwright、Cypress、Storybook 等)，没有时才临时搭建 [6]。Web 应用直接连接本地地址。Electron 或 Chromium 应用以 `--remote-debugging-port=<port>` 启动后经 CDP 连接，并以稳定的应用标记 (marker) 而非标签页顺序选定页面 [6]。

交互采用固定循环 [6]。操作前截图或获取无障碍树快照 (accessibility snapshot)，依据最新的页面结构选定目标，每次只执行一个动作，操作后重新采集并核验状态变化。元素定位优先使用 ARIA role、label 和 `data-*` 属性，避免坐标点击 [6]。

### 6.2 启动带调试端口的浏览器或应用

skill 只给出了调试端口参数，下列完整命令为本文补充。为 Chrome 指定独立的 `--user-data-dir`，可避免与日常使用的浏览器配置相互干扰。

```bash
# Chrome (macOS)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 --user-data-dir=/tmp/cdp-profile

# Electron 应用
npx electron . --remote-debugging-port=9222

# 确认端口可用
curl http://127.0.0.1:9222/json/version
```

连接并按标记选定页面的写法来自 skill 原文 [6]，选择器需替换为当前项目的稳定标记。

```js
import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const pages = browser.contexts().flatMap(c => c.pages());
let page;
for (const p of pages) {
  if (await p.locator("[data-app-root]").count()) { page = p; break; }
}
if (!page) throw new Error("No matching app page found");
```

### 6.3 示例：重复提交缺陷

下例为本文编写的示意脚本，地址与接口名称均为假设。脚本通过统计 POST 请求数判断双击是否导致重复提交，并以退出码表达结果。

```js
// repro-double-submit.mjs
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const posts = [];
page.on("request", r => {
  if (r.method() === "POST" && r.url().includes("/api/send")) posts.push(r.url());
});
page.on("console", m => console.log("[console]", m.type(), m.text()));

await page.goto("http://127.0.0.1:3000/contact");
await page.screenshot({ path: "/tmp/before.png" });
await page.getByLabel("Message").fill("hello");
await page.getByRole("button", { name: /send/i }).dblclick();
await page.waitForTimeout(1000);
await page.screenshot({ path: "/tmp/after.png" });

console.log(JSON.stringify({ postCount: posts.length }));
await browser.close();
process.exit(posts.length === 1 ? 0 : 1);
```

修复前脚本应返回 1 且 `postCount` 为 2，修复后应返回 0。两次运行的输出与截图构成修复前后对比证据，脚本本身也可保留为回归测试 (regression test)。

### 6.4 证据类型与注意事项

skill 列出的证据包括截图、无障碍树快照、console 与网络日志、CPU profile 与 trace、布局偏移 (layout shift)，以及配合强制垃圾回收的堆快照 [6]。通过原生 CDP 还可模拟网络节流、视口变化、配色方案和减少动效设置，用于复现只在特定环境下出现的缺陷 [6]。

使用时需注意以下几点 [6]。导航或页面结构变化后不应复用旧的元素引用。只有在刚截图之后才可使用坐标点击。不应为一次性探测把 Playwright 加入项目依赖。结束后应关闭开发服务器、调试会话和临时配置。涉及隐私的工作区，未经同意不保存截图或堆快照。

## 7 资源约束下的落地路径

本节面向使用订阅制额度 (例如 Claude Code Pro) 的个人开发者。在这一约束下，合理的目标不是并行上百个 Agent，而是让 2–4 个 Agent 并行工作，且其 PR 无需逐行审查即可合并。这一规模是本文的判断，尚待实践检验。额度分配上，可将规划、架构和审查等判断性任务交给能力较强的模型，将机械性修改交给成本较低的模型。

下列四周计划按顺序执行，每一阶段达到完成标准后再进入下一阶段。

1. **第 1 周，建立验证闭环。** 安装 pstack 与 cursor-team-kit，阅读 potetto-mode 及 Prove It Works、Fix Root Causes、Encode Lessons in Structure 三条原则。编写约 80 行以内的 `CLAUDE.md`，只记录 Agent 无法自行推断的信息。实现 `verify` 命令，一次运行类型检查、lint 与单元测试，并用 Stop hook 要求 Agent 结束前执行。再实现应用启停命令和第一个复现脚本。
   - 完成标准：对一个真实缺陷运行 Bug fix playbook，仅凭最终 diff 与证据即可决定合并。
2. **第 2 周，实施纠错层级。** 记录每一次对 Agent 的纠正，每周将记录逐条升级为 lint 规则、类型约束或 verify 检查，无法升级的才写入规则文件。
   - 完成标准：同类错误不再重复出现。
3. **第 3 周，引入并行。** 用 git worktree 为每个任务建立独立工作区，每个 PR 控制在数百行以内且须通过 verify。另设独立会话审查 diff，人工只处理审查会话标出的问题。
   - 完成标准：每日合并 5–10 个 PR，且不依赖逐行人工审查。
4. **第 4 周，建立功能地图与自动化。** 维护功能、路由、入口文件与检查脚本的对应表。以无头模式 (`claude -p`) 结合 GitHub Actions，使带有特定标签的议题自动触发复现与修复。
   - 完成标准：提交议题后可收到附带复现证据的 PR。

计划执行中应坚持三条纪律。第一，verify 稳定通过之前不增加 Agent 数量。第二，每次纠正都考虑能否转化为结构性约束。第三，保持较小的 PR 粒度，这既是高产出的前提，也是人工审查得以跟上的前提。

## 8 结论与局限

本文认为，大规模并行 Agent 开发的瓶颈在于信任，而信任建立在可验证性与结构性约束之上。演讲者自述其产出来自对代码库大量而琐碎的改造，而非某种特殊技巧 [1]。pstack 将这一方法编码为可安装的 skill，control-ui 则提供了 UI 层面验证的公开实现，二者均可在 Claude Code 中使用 [3][6]。

本文有三点局限。第一，对演讲内容的理解基于中文译稿，未核对原始视频，译稿中的 PR 数量口径也不一致。第二，Control Glass 的性质属于推测。第三，第 4 节的设计准则和第 7 节的计划是本文的建议，未经量化评估。此外，PR 数量是产出的代理指标，不等同于交付价值，以 PR 数量衡量效率时应同时关注缺陷率和回退率。

## 参考文献

1. Hyperindex Blog. [土豆姐 @potato：我是怎么一个月向生产环境发 2,000+ 个 PR 的（演讲全文中文版）](https://blog.hyperindex.org/potetto-2000-prs-a-month-trust-agents/).
2. Cursor. [cursor/plugins](https://github.com/cursor/plugins). GitHub repository, MIT License.
3. Tan, L. [pstack README](https://raw.githubusercontent.com/cursor/plugins/main/pstack/README.md). cursor/plugins.
4. Tan, L. [potetto-mode SKILL.md](https://raw.githubusercontent.com/cursor/plugins/main/pstack/skills/potetto-mode/SKILL.md). cursor/plugins.
5. Denyer, M. [pstack-claude README](https://raw.githubusercontent.com/michael-denyer/pstack-claude/main/README.md). GitHub repository.
6. Cursor. [control-ui SKILL.md](https://raw.githubusercontent.com/cursor/plugins/main/cursor-team-kit/skills/control-ui/SKILL.md). cursor-team-kit, cursor/plugins.
7. Copes, F. [What is potetto-mode in pstack?](https://flaviocopes.com/potetto-mode/) flaviocopes.com.
8. Cunningham, W. (1992). The WyCash portfolio management system. *OOPSLA '92 Addendum to the Proceedings*, 29–30.
9. Saltzer, J. H., & Schroeder, M. D. (1975). The protection of information in computer systems. *Proceedings of the IEEE*, 63(9), 1278–1308.
10. Shingo, S. (1986). *Zero Quality Control: Source Inspection and the Poka-yoke System*. Productivity Press.
