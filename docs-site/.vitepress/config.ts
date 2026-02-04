import { defineConfig } from 'vitepress'

export default defineConfig({
  // 站点基础配置
  title: 'ClawdCode 教程',
  description: '从零实现一个 AI CLI Coding Agent',
  
  // GitHub Pages 部署路径（如果是 username.github.io/repo-name 格式）
  base: '/ClawdCode/',
  
  // 语言
  lang: 'zh-CN',
  
  // 最后更新时间
  lastUpdated: true,
  
  // 主题配置
  themeConfig: {
    // 导航栏
    nav: [
      { text: '首页', link: '/' },
      { text: '教程', link: '/guide/' },
      { text: 'GitHub', link: 'https://github.com/kkkhs/ClawdCode' }
    ],

    // 侧边栏
    sidebar: {
      '/guide/': [
        {
          text: '开始',
          items: [
            { text: '简介', link: '/guide/' },
          ]
        },
        {
          text: '基础篇',
          items: [
            { text: '第 1 章：Coding Agent 概述', link: '/guide/chapter-01' },
            { text: '第 2 章：项目搭建', link: '/guide/chapter-02' },
            { text: '第 3 章：CLI 入口', link: '/guide/chapter-03' },
          ]
        },
        {
          text: '核心篇',
          items: [
            { text: '第 4 章：Agent 核心', link: '/guide/chapter-04' },
            { text: '第 5 章：System Prompt', link: '/guide/chapter-05' },
            { text: '第 6 章：工具系统', link: '/guide/chapter-06' },
            { text: '第 7 章：执行管道', link: '/guide/chapter-07' },
            { text: '第 8 章：上下文管理', link: '/guide/chapter-08' },
          ]
        },
        {
          text: '进阶篇',
          collapsed: false,
          items: [
            { text: '第 9 章：UI 系统', link: '/guide/chapter-09' },
            { text: '第 10 章：MCP 协议', link: '/guide/chapter-10' },
            { text: '第 11 章：状态管理', link: '/guide/chapter-11' },
            { text: '第 11b 章：命令历史与队列', link: '/guide/chapter-11b' },
            { text: '第 12a 章：Slash Commands', link: '/guide/chapter-12a' },
          ]
        }
      ]
    },

    // 社交链接
    socialLinks: [
      { icon: 'github', link: 'https://github.com/kkkhs/ClawdCode' }
    ],

    // 页脚
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024 ClawdCode'
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
              navigateText: '切换'
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

    // 大纲标题
    outlineTitle: '本页目录',
    
    // 最后更新时间文字
    lastUpdatedText: '最后更新',

    // 编辑链接
    editLink: {
      pattern: 'https://github.com/kkkhs/ClawdCode/edit/main/docs-site/:path',
      text: '在 GitHub 上编辑此页'
    }
  },

  // Markdown 配置
  markdown: {
    // 代码块行号
    lineNumbers: true,
    
    // 代码块主题
    theme: {
      light: 'github-light',
      dark: 'github-dark'
    }
  },

  // Head 标签
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
    ['meta', { name: 'theme-color', content: '#5f67ee' }],
  ]
})
