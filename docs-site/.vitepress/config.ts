import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'ClawdCode',
  description: 'Build your own AI CLI Coding Agent — a complete tutorial',
  base: '/ClawdCode/',
  lang: 'zh-CN',
  lastUpdated: true,
  cleanUrls: true,

  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'ClawdCode',

    nav: [
      { text: 'Guide', link: '/guide/' },
      { text: 'GitHub', link: 'https://github.com/kkkhs/ClawdCode' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Overview', link: '/guide/' },
          ]
        },
        {
          text: 'Getting Started',
          collapsed: false,
          items: [
            { text: '01. Coding Agent 概述', link: '/guide/chapter-01' },
            { text: '02. 项目搭建', link: '/guide/chapter-02' },
            { text: '03. CLI 入口', link: '/guide/chapter-03' },
          ]
        },
        {
          text: 'Agent Core',
          collapsed: false,
          items: [
            { text: '04. Agent 核心', link: '/guide/chapter-04' },
            { text: '05. System Prompt', link: '/guide/chapter-05' },
          ]
        },
        {
          text: 'Tools & Execution',
          collapsed: false,
          items: [
            { text: '06. 工具系统', link: '/guide/chapter-06' },
            { text: '07. 执行管道与权限', link: '/guide/chapter-07' },
            { text: '10. MCP 协议', link: '/guide/chapter-10' },
          ]
        },
        {
          text: 'State & Context',
          collapsed: false,
          items: [
            { text: '08. 上下文管理', link: '/guide/chapter-08' },
            { text: '11. 状态管理 (Zustand)', link: '/guide/chapter-11' },
            { text: '11b. 命令历史与队列', link: '/guide/chapter-11b' },
          ]
        },
        {
          text: 'Interface',
          collapsed: false,
          items: [
            { text: '09. UI 系统 (Ink)', link: '/guide/chapter-09' },
            { text: '12c. 流式输出与主题', link: '/guide/chapter-12c' },
          ]
        },
        {
          text: 'Extensions',
          collapsed: false,
          items: [
            { text: '12a. Slash Commands', link: '/guide/chapter-12a' },
            { text: '12b. 交互式 Commands', link: '/guide/chapter-12b' },
            { text: '12d. Skills 系统', link: '/guide/chapter-12d' },
            { text: '12e. Hooks 系统', link: '/guide/chapter-12e' },
          ]
        },
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/kkkhs/ClawdCode' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/clawdcode' }
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: `Copyright © 2024-${new Date().getFullYear()} ClawdCode`
    },

    search: {
      provider: 'local',
    },

    docFooter: {
      prev: 'Previous',
      next: 'Next'
    },

    outline: {
      label: 'On this page',
      level: [2, 3]
    },

    lastUpdated: {
      text: 'Last updated',
    },

    editLink: {
      pattern: 'https://github.com/kkkhs/ClawdCode/edit/main/docs-site/:path',
      text: 'Edit on GitHub'
    },

    returnToTopLabel: 'Back to top',
    darkModeSwitchLabel: 'Theme',
    sidebarMenuLabel: 'Menu',
    externalLinkIcon: true
  },

  markdown: {
    lineNumbers: true,
    theme: {
      light: 'github-light',
      dark: 'one-dark-pro'
    },
    codeCopyButtonTitle: 'Copy',
  },

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/ClawdCode/logo.svg' }],
    ['meta', { name: 'theme-color', content: '#4338ca' }],
    ['meta', { name: 'og:type', content: 'website' }],
    ['meta', { name: 'og:title', content: 'ClawdCode — Build your own AI Coding Agent' }],
    ['meta', { name: 'og:description', content: 'A deep-dive open source tutorial on building a CLI coding agent from scratch.' }],
  ],

  sitemap: {
    hostname: 'https://kkkhs.github.io/ClawdCode/'
  }
})
