<template>
  <div class="cBody"
       :style="{ backgroundImage: currentBackground }"
       key="pandora-box-body"
  >
    <div class="left">
      <div :class="isWindows?'top-title win':'top-title'">
        <div class="top-icon"></div>
        <span class="top-title-text">Pandora-Box</span>
      </div>
      <MyEvent/>
      <MyNav/>
      <MyRule/>
      <MyProxy/>
      <MySecNav/>
      <MyBottom/>
    </div>

    <div class="right">
      <router-view/>
      <MyDrop/>
    </div>
  </div>
</template>


<script setup lang="ts">
import {onMounted, ref} from 'vue';
import {useMenuStore} from "@/store/menuStore";
import {preloadBackgroundImage} from "@/util/theme";

const menuStore = useMenuStore();

// 当前背景
const currentBackground = ref("linear-gradient(to bottom, #434343, #000000)");

// 切换背景
const changeBg = (bg: string, useWhite: boolean) => {
  currentBackground.value = bg;
  menuStore.setUseWhite(useWhite);
}

const isWindows = ref(false)
onMounted(() => {
  preloadBackgroundImage(menuStore.background, changeBg);
  // @ts-ignore
  if (window["pxShowBar"]) {
    isWindows.value = true;
  }
});

// 监控背景切换
watch(() => menuStore.background, (nextBackground) => {
  preloadBackgroundImage(nextBackground, changeBg);
});

</script>


<style>
.cBody {
  margin: 0;
  display: flex;
  height: 100vh;
  color: var(--text-color);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  background-attachment: fixed;
  transition: background-image 0.5s ease-in-out, background-color 0.5s ease-in-out;
  background-color: var(--blend-color);
  background-blend-mode: multiply;
}

.left {
  padding-right: 18px;
}

.right {
  overflow-y: hidden;
  overflow-x: hidden;
  position: relative;
  width: 100%;
  flex-grow: 1;
  margin: 15px 15px 15px 0;
  border-radius: 10px;
  background-color: var(--right-bg-color);
  color: var(--text-color);
  transition: background-color 0.3s ease, box-shadow 0.3s ease;
}

.top-title {
  padding-top: 40px;
  padding-left: 23px;
  -webkit-app-region: drag;
}

.win {
  padding-top: 32px;
}

.top-icon {
  width: 28px;
  height: 28px;
  background-image: url("@/assets/images/appicon.png");
  background-size: cover;
  background-position: center;
}

.top-title-text {
  position: absolute;
  margin-left: 40px;
  margin-top: -22px;
}
</style>
