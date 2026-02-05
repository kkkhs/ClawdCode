---
description: 对当前 Git 改动进行 Code Review
allowed-tools:
  - Bash(git:*)
  - Read
---

请对当前 Git 改动进行 Code Review。

## 当前分支

!`git branch --show-current`

## 改动文件

!`git diff --stat HEAD~1 2>/dev/null || git diff --stat --cached 2>/dev/null || echo "无改动"`

## Diff 内容

```diff
!`git diff HEAD~1 2>/dev/null || git diff --cached 2>/dev/null || echo "无 diff"`
```

## Review 要求

请用中文回复，包含以下内容：

1. **改动概述**：简要描述这次改动做了什么
2. **代码质量**：评估代码质量（优点和可改进的地方）
3. **潜在问题**：指出可能的 bug、安全问题或性能问题
4. **改进建议**：具体的代码改进建议

如果改动很好，也请说明优点。保持简洁专业。
