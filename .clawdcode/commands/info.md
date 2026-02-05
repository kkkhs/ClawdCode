---
description: 显示项目状态和信息
---

# 📊 项目状态报告

## 基本信息

- **项目名称**: !`cat package.json | grep '"name"' | head -1 | cut -d'"' -f4`
- **版本**: !`cat package.json | grep '"version"' | head -1 | cut -d'"' -f4`
- **Node 版本**: !`node -v`
- **Bun 版本**: !`bun -v 2>/dev/null || echo "未安装"`

## Git 状态

- **当前分支**: !`git branch --show-current 2>/dev/null || echo "非 Git 仓库"`
- **最近提交**: !`git log -1 --oneline 2>/dev/null || echo "无提交"`
- **未提交改动**: !`git status --short 2>/dev/null | wc -l | tr -d ' '` 个文件

## 代码统计

- **TypeScript 文件**: !`find src -name "*.ts" -o -name "*.tsx" 2>/dev/null | wc -l | tr -d ' '` 个
- **测试文件**: !`find . -name "*.test.ts" -o -name "*.spec.ts" 2>/dev/null | wc -l | tr -d ' '` 个
- **总代码行数**: !`find src -name "*.ts" -o -name "*.tsx" 2>/dev/null | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}'` 行

## 依赖信息

- **依赖数量**: !`cat package.json | grep -c '":'  2>/dev/null || echo "未知"` 个
- **最后安装**: !`stat -f "%Sm" node_modules 2>/dev/null || stat -c "%y" node_modules 2>/dev/null | cut -d' ' -f1 || echo "未安装"`

请根据以上信息，给出项目当前状态的简要总结。
