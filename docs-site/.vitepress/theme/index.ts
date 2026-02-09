import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import GiscusComment from './components/GiscusComment.vue'
import PageViewCounter from './components/PageViewCounter.vue'
import { h } from 'vue'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'doc-after': () => [
        h(PageViewCounter),
        h(GiscusComment),
      ],
    })
  },
} satisfies Theme
