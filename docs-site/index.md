---
layout: home

hero:
  name: ClawdCode
  text: 从零实现 AI Coding Agent
  tagline: 深入理解 Coding Agent 的设计原理，一步步构建你自己的 AI 编程助手
  image:
    src: /hero-image.svg
    alt: ClawdCode
  actions:
    - theme: brand
      text: 开始学习
      link: /guide/
    - theme: alt
      text: GitHub
      link: https://github.com/kkkhs/ClawdCode

features:
  - icon: 🧠
    title: 理解核心概念
    details: 深入理解 Coding Agent = LLM + System Prompt + Context + Tools 的设计哲学
  - icon: 🔧
    title: 动手实践
    details: 每一章都有完整可运行的代码，边学边做，循序渐进
  - icon: 🏗️
    title: 工业级架构
    details: 参考 Claude Code 设计，学习无状态 Agent、执行管道、权限控制等最佳实践
  - icon: 📦
    title: 开箱即用
    details: TypeScript + Ink + yargs + OpenAI SDK，现代化技术栈，文档齐全
---

<style>
:root {
  --vp-home-hero-name-color: transparent;
  --vp-home-hero-name-background: -webkit-linear-gradient(120deg, #bd34fe 30%, #41d1ff);

  --vp-home-hero-image-background-image: linear-gradient(-45deg, #bd34fe 50%, #47caff 50%);
  --vp-home-hero-image-filter: blur(44px);
}

@media (min-width: 640px) {
  :root {
    --vp-home-hero-image-filter: blur(56px);
  }
}

@media (min-width: 960px) {
  :root {
    --vp-home-hero-image-filter: blur(68px);
  }
}
</style>
