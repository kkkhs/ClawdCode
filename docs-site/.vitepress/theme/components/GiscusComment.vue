<script setup lang="ts">
import Giscus from '@giscus/vue'
import { useData, useRoute } from 'vitepress'
import { computed } from 'vue'

const { isDark, frontmatter } = useData()
const route = useRoute()

const show = computed(() => {
  // Don't show on homepage or pages that opt out
  if (frontmatter.value?.layout === 'home') return false
  if (frontmatter.value?.comments === false) return false
  return true
})

const theme = computed(() => isDark.value ? 'dark_dimmed' : 'light')
</script>

<template>
  <div v-if="show" class="giscus-wrapper">
    <Giscus
      :key="route.path"
      repo="kkkhs/ClawdCode"
      repo-id="R_kgDORHb3qg"
      category="Announcements"
      category-id="DIC_kwDORHb3qs4C2FC4"
      mapping="pathname"
      strict="0"
      reactions-enabled="1"
      emit-metadata="0"
      input-position="top"
      :theme="theme"
      lang="zh-CN"
      loading="lazy"
    />
  </div>
</template>

<style scoped>
.giscus-wrapper {
  margin-top: 2rem;
  padding-top: 2rem;
  border-top: 1px solid var(--vp-c-divider);
}
</style>
