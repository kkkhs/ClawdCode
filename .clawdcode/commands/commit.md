---
description: 自动生成 commit message 并提交
argument-hint: [可选的额外说明]
allowed-tools:
  - Bash(git:*)
  - Read
---

请根据当前 Git 改动生成 commit message 并提交。

## 改动文件

!`git diff --stat --cached 2>/dev/null || git diff --stat 2>/dev/null`

## Diff 内容

```diff
!`git diff --cached 2>/dev/null || git diff 2>/dev/null`
```

## 最近提交风格参考

!`git log -5 --oneline 2>/dev/null || echo "无历史提交"`

## 额外说明

$ARGUMENTS

## 要求

1. 先执行 `git add .` 暂存所有改动
2. 使用英文，遵循 Conventional Commits 格式：
   - `feat:` 新功能
   - `fix:` 修复
   - `docs:` 文档
   - `refactor:` 重构
   - `chore:` 杂项
3. 第一行不超过 50 字符
4. 参考最近提交的风格
5. 执行 `git commit -m "message"`
