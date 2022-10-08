<script setup lang="ts">
import { reactive } from 'vue'

import Editor from './components/Editor.vue'
import TitleBar from './components/TitleBar.vue'
import StatusBar from './components/StatusBar.vue'

</script>
    
<template>
  <link href="../../styles/main.css" rel="stylesheet">
  <div id="root-container">
    <TitleBar title="Qingshu (beta)" />
    <Editor id="editor-container" />
    <StatusBar />
  </div>
</template>
    
<style scoped>
body {
  margin: 0;
  padding: 0;
}

#root-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
}
</style>
    