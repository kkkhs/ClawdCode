import { defineConfig } from 'vitepress'

export default defineConfig({
  // 站点基础配置
  title: 'ClawdCode',
  description: '从零实现一个 AI CLI Coding Agent - 完整教程',
  
  // GitHub Pages 部署路径
  base: '/ClawdCode/',
  
  // 语言
  lang: 'zh-CN',
  
  // 最后更新时间
  lastUpdated: true,
  
  // 清洁 URL
  cleanUrls: true,
  
  // 主题配置
  themeConfig: {
    // Logo
    logo: '/logo.svg',
    siteTitle: 'ClawdCode',
    
    // 导航栏
    nav: [
      { text: '🏠 首页', link: '/' },
      { text: '📖 教程', link: '/guide/' },
      { 
        text: '🔗 链接',
        items: [
          { text: 'npm', link: 'https://www.npmjs.com/package/clawdcode' },
          { text: 'GitHub', link: 'https://github.com/kkkhs/ClawdCode' },
        ]
      }
    ],

    // 侧边栏
    sidebar: {
      '/guide/': [
        {
          text: '🚀 开始',
          items: [
            { text: '简介', link: '/guide/' },
          ]
        },
        {
          text: '🌱 基础篇',
          collapsed: false,
          items: [
            { text: '第 1 章：Coding Agent 概述', link: '/guide/chapter-01' },
            { text: '第 2 章：项目搭建', link: '/guide/chapter-02' },
            { text: '第 3 章：CLI 入口', link: '/guide/chapter-03' },
          ]
        },
        {
          text: '⚡ 核心篇',
          collapsed: false,
          items: [
            { text: '第 4 章：Agent 核心', link: '/guide/chapter-04' },
            { text: '第 5 章：System Prompt', link: '/guide/chapter-05' },
            { text: '第 6 章：工具系统', link: '/guide/chapter-06' },
            { text: '第 7 章：执行管道', link: '/guide/chapter-07' },
            { text: '第 8 章：上下文管理', link: '/guide/chapter-08' },
          ]
        },
        {
          text: '🚀 进阶篇',
          collapsed: false,
          items: [
            { text: '第 9 章：UI 系统', link: '/guide/chapter-09' },
            { text: '第 10 章：MCP 协议', link: '/guide/chapter-10' },
            { text: '第 11 章：状态管理', link: '/guide/chapter-11' },
            { text: '第 11b 章：命令历史与队列', link: '/guide/chapter-11b' },
            { text: '第 12a 章：Slash Commands', link: '/guide/chapter-12a' },
            { text: '第 12b 章：交互式 Commands', link: '/guide/chapter-12b' },
            { text: '第 12c 章：流式输出与主题持久化', link: '/guide/chapter-12c' },
            { text: '第 12d 章：Skills 系统', link: '/guide/chapter-12d' },
          ]
        }
      ]
    },

    // 社交链接
    socialLinks: [
      { icon: 'github', link: 'https://github.com/kkkhs/ClawdCode' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/clawdcode' }
    ],

    // 页脚
    footer: {
      message: '基于 MIT 许可发布',
      copyright: `Copyright © 2024-${new Date().getFullYear()} ClawdCode`
    },

    // 搜索
    search: {
      provider: 'local',
      options: {
        translations: {
          button: {
            buttonText: '搜索文档',
            buttonAriaLabel: '搜索文档'
          },
          modal: {
            noResultsText: '无法找到相关结果',
            resetButtonTitle: '清除查询条件',
            footer: {
              selectText: '选择',
              navigateText: '切换',
              closeText: '关闭'
            }
          }
        }
      }
    },

    // 文档页脚
    docFooter: {
      prev: '上一章',
      next: '下一章'
    },

    // 大纲
    outline: {
      label: '本页目录',
      level: [2, 3]
    },
    
    // 最后更新时间文字
    lastUpdated: {
      text: '最后更新于',
      formatOptions: {
        dateStyle: 'short',
        timeStyle: 'short'
      }
    },

    // 编辑链接
    editLink: {
      pattern: 'https://github.com/kkkhs/ClawdCode/edit/main/docs-site/:path',
      text: '在 GitHub 上编辑此页'
    },

    // 返回顶部
    returnToTopLabel: '返回顶部',

    // 外观切换
    darkModeSwitchLabel: '外观',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',

    // 侧边栏菜单
    sidebarMenuLabel: '菜单',

    // 外部链接图标
    externalLinkIcon: true
  },

  // Markdown 配置
  markdown: {
    // 代码块行号
    lineNumbers: true,
    
    // 代码块主题
    theme: {
      light: 'github-light',
      dark: 'one-dark-pro'
    },

    // 代码块复制按钮
    codeCopyButtonTitle: '复制代码',

    // 容器标题
    container: {
      tipLabel: '提示',
      warningLabel: '警告',
      dangerLabel: '危险',
      infoLabel: '信息',
      detailsLabel: '详细信息'
    }
  },

  // Head 标签
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/ClawdCode/logo.svg' }],
    ['link', { rel: 'icon', type: 'image/png', href: '/ClawdCode/logo.png' }],
    ['meta', { name: 'theme-color', content: '#6366f1' }],
    ['meta', { name: 'og:type', content: 'website' }],
    ['meta', { name: 'og:title', content: 'ClawdCode - 从零实现 AI Coding Agent' }],
    ['meta', { name: 'og:description', content: '深入理解 Coding Agent 的设计原理，一步步构建你自己的 AI 编程助手' }],
    ['meta', { name: 'og:image', content: 'https://kkkhs.github.io/ClawdCode/og-image.png' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'ClawdCode' }],
    ['meta', { name: 'twitter:description', content: '从零实现 AI Coding Agent 完整教程' }],
  ],

  // 站点地图
  sitemap: {
    hostname: 'https://kkkhs.github.io/ClawdCode/'
  }
})
