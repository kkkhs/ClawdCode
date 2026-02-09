import { defineConfig } from 'vitepress'

const zhSidebar = {
  '/guide/': [
    {
      text: '简介',
      items: [
        { text: '概览', link: '/guide/' },
      ]
    },
    {
      text: '起步',
      collapsed: false,
      items: [
        { text: '01. Coding Agent 概述', link: '/guide/chapter-01' },
        { text: '02. 项目搭建', link: '/guide/chapter-02' },
        { text: '03. CLI 入口', link: '/guide/chapter-03' },
      ]
    },
    {
      text: 'Agent 核心',
      collapsed: false,
      items: [
        { text: '04. Agent 核心', link: '/guide/chapter-04' },
        { text: '05. System Prompt', link: '/guide/chapter-05' },
      ]
    },
    {
      text: '工具与执行',
      collapsed: false,
      items: [
        { text: '06. 工具系统', link: '/guide/chapter-06' },
        { text: '07. 执行管道与权限', link: '/guide/chapter-07' },
        { text: '10. MCP 协议', link: '/guide/chapter-10' },
      ]
    },
    {
      text: '状态与上下文',
      collapsed: false,
      items: [
        { text: '08. 上下文管理', link: '/guide/chapter-08' },
        { text: '11. 状态管理 (Zustand)', link: '/guide/chapter-11' },
        { text: '11b. 命令历史与队列', link: '/guide/chapter-11b' },
      ]
    },
    {
      text: '界面',
      collapsed: false,
      items: [
        { text: '09. UI 系统 (Ink)', link: '/guide/chapter-09' },
        { text: '12c. 流式输出与主题', link: '/guide/chapter-12c' },
      ]
    },
    {
      text: '扩展',
      collapsed: false,
      items: [
        { text: '12a. Slash Commands', link: '/guide/chapter-12a' },
        { text: '12b. 交互式 Commands', link: '/guide/chapter-12b' },
        { text: '12d. Skills 系统', link: '/guide/chapter-12d' },
        { text: '12e. Hooks 系统', link: '/guide/chapter-12e' },
      ]
    },
  ]
}

const enSidebar = {
  '/en/guide/': [
    {
      text: 'Introduction',
      items: [
        { text: 'Overview', link: '/en/guide/' },
      ]
    },
    {
      text: 'Getting Started',
      collapsed: false,
      items: [
        { text: '01. Coding Agent Overview', link: '/en/guide/chapter-01' },
        { text: '02. Project Setup', link: '/en/guide/chapter-02' },
        { text: '03. CLI Entry', link: '/en/guide/chapter-03' },
      ]
    },
    {
      text: 'Agent Core',
      collapsed: false,
      items: [
        { text: '04. Agent Core', link: '/en/guide/chapter-04' },
        { text: '05. System Prompt', link: '/en/guide/chapter-05' },
      ]
    },
    {
      text: 'Tools & Execution',
      collapsed: false,
      items: [
        { text: '06. Tool System', link: '/en/guide/chapter-06' },
        { text: '07. Execution Pipeline', link: '/en/guide/chapter-07' },
        { text: '10. MCP Protocol', link: '/en/guide/chapter-10' },
      ]
    },
    {
      text: 'State & Context',
      collapsed: false,
      items: [
        { text: '08. Context Management', link: '/en/guide/chapter-08' },
        { text: '11. State Management', link: '/en/guide/chapter-11' },
        { text: '11b. Command History & Queue', link: '/en/guide/chapter-11b' },
      ]
    },
    {
      text: 'Interface',
      collapsed: false,
      items: [
        { text: '09. UI System (Ink)', link: '/en/guide/chapter-09' },
        { text: '12c. Streaming & Themes', link: '/en/guide/chapter-12c' },
      ]
    },
    {
      text: 'Extensions',
      collapsed: false,
      items: [
        { text: '12a. Slash Commands', link: '/en/guide/chapter-12a' },
        { text: '12b. Interactive Commands', link: '/en/guide/chapter-12b' },
        { text: '12d. Skills System', link: '/en/guide/chapter-12d' },
        { text: '12e. Hooks System', link: '/en/guide/chapter-12e' },
      ]
    },
  ]
}

export default defineConfig({
  title: 'ClawdCode',
  base: '/ClawdCode/',
  lastUpdated: true,
  cleanUrls: true,

  locales: {
    root: {
      label: '中文',
      lang: 'zh-CN',
      description: '从零构建 AI CLI Coding Agent — 完整教程',
      themeConfig: {
        nav: [
          { text: '教程', link: '/guide/' },
          { text: 'GitHub', link: 'https://github.com/kkkhs/ClawdCode' },
        ],
        sidebar: zhSidebar,
        docFooter: { prev: '上一篇', next: '下一篇' },
        outline: { label: '本页目录', level: [2, 3] },
        lastUpdated: { text: '最后更新' },
        editLink: {
          pattern: 'https://github.com/kkkhs/ClawdCode/edit/main/docs-site/:path',
          text: '在 GitHub 上编辑',
        },
        returnToTopLabel: '返回顶部',
        darkModeSwitchLabel: '外观',
        sidebarMenuLabel: '目录',
      },
    },
    en: {
      label: 'English',
      lang: 'en',
      link: '/en/',
      description: 'Build your own AI CLI Coding Agent — complete tutorial',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/en/guide/' },
          { text: 'GitHub', link: 'https://github.com/kkkhs/ClawdCode' },
        ],
        sidebar: enSidebar,
        docFooter: { prev: 'Previous', next: 'Next' },
        outline: { label: 'On this page', level: [2, 3] },
        lastUpdated: { text: 'Last updated' },
        editLink: {
          pattern: 'https://github.com/kkkhs/ClawdCode/edit/main/docs-site/:path',
          text: 'Edit on GitHub',
        },
        returnToTopLabel: 'Back to top',
        darkModeSwitchLabel: 'Theme',
        sidebarMenuLabel: 'Menu',
      },
    },
  },

  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'ClawdCode',

    socialLinks: [
      { icon: 'github', link: 'https://github.com/kkkhs/ClawdCode' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/clawdcode' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: `Copyright © 2024-${new Date().getFullYear()} ClawdCode`,
    },

    search: {
      provider: 'local',
    },

    externalLinkIcon: true,
  },

  markdown: {
    lineNumbers: true,
    theme: { light: 'github-light', dark: 'one-dark-pro' },
    codeCopyButtonTitle: 'Copy',
  },

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/ClawdCode/logo.svg' }],
    ['meta', { name: 'theme-color', content: '#4338ca' }],
    ['meta', { name: 'og:type', content: 'website' }],
    ['meta', { name: 'og:title', content: 'ClawdCode' }],
  ],

  sitemap: {
    hostname: 'https://kkkhs.github.io/ClawdCode/',
  },
})
