<script setup lang="ts">
import { useData } from 'vitepress'
import { onMounted, ref } from 'vue'

const { frontmatter } = useData()

const show = ref(false)

onMounted(() => {
  // Don't show on homepage
  if (frontmatter.value?.layout === 'home') return

  // Load busuanzi script dynamically
  const script = document.createElement('script')
  script.src = '//busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js'
  script.async = true
  document.head.appendChild(script)
  show.value = true
})
</script>

<template>
  <div v-if="show" class="page-view-counter">
    <span>
      👀 本页浏览 <span id="busuanzi_value_page_pv">--</span> 次
      &nbsp;|&nbsp;
      🌐 全站访问 <span id="busuanzi_value_site_uv">--</span> 人
    </span>
  </div>
</template>

<style scoped>
.page-view-counter {
  margin-top: 1.5rem;
  padding-top: 1rem;
  font-size: 0.8125rem;
  color: var(--vp-c-text-3);
  text-align: center;
}
</style>
