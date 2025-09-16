import {createApp} from "vue";
import App from "./App.vue";
import router from "@/router";
import {createPinia} from "pinia";
import piniaPluginPersistence from "pinia-plugin-persistedstate";
import {createI18n} from "vue-i18n";
import messages from "@intlify/unplugin-vue-i18n/messages";
import ElementPlus from "element-plus";
import VueApexCharts from "vue3-apexcharts";
import "element-plus/dist/index.css";
import 'element-plus/theme-chalk/dark/css-vars.css'
import "./styles/global.css";
import "./styles/basic.css";
import {useMenuStore} from "@/store/menuStore";
import {useWebStore} from "@/store/webStore";
import {AxiosRequest} from "@/util/axiosRequest";
import {useHomeStore} from "@/store/homeStore";
import {memoryCache} from "@/types/persist"
import {detectLanguage} from "@/util/menu";
import createApi from "@/api";
import {Profile} from "@/types/profile";
import {pError, pLoad, pSuccess} from "@/util/pLoad";
import {isHttpOrHttps} from "@/util/format";

const app = createApp(App);
const lang = detectLanguage();
const DEEP_LINK_IMPORTED_EVENT = 'deeplink-profile-imported';
const DEEP_LINK_HOST = 'install-config';
const KNOWN_DEEP_LINK_EXTRA_KEYS = new Set(['name']);
let deepLinkHandlerRegistered = false;

async function bootstrap() {
    // 加载缓存数据
    // @ts-ignore
    if (window["pxStore"]) {
        const keys = ['menu', 'home', 'proxies', 'setting', 'web'];
        for (const key of keys) {
            // @ts-ignore
            const val = await window["pxStore"].get(key);
            if (val) {
                memoryCache[key] = val;
            }
        }
    }

    // 国际化设置
    const i18n = createI18n({
        locale: lang,
        messages,
        globalInjection: true,
    });

    // 全局状态管理
    const pinia = createPinia();
    pinia.use(piniaPluginPersistence);


    // 加载所需组件
    app.use(pinia);
    app.use(ElementPlus);
    app.use(VueApexCharts);
    app.use(i18n);
    app.use(router);

    // 获取api地址、端口、密钥
    const url = window.location.search;
    const params = new URLSearchParams(url);
    const webStore = useWebStore();
    const host = params.get("host");
    const port = params.get("port");
    const secret = params.get("secret");
    if (host) {
        webStore.setHost(host);
    }
    if (port) {
        webStore.setPort(port);
    }
    if (secret) {
        webStore.setSecret(secret);
    }

    // 注册 Axios 实例到全局
    app.config.globalProperties.$http = new AxiosRequest(
        webStore.baseUrl,
        webStore.secret
    );

    setupDeepLinkHandler();

    // 激活menu
    const menuStore = useMenuStore();
    router.afterEach((to) => {
        const split = to.path.split("/");
        menuStore.setMenu(split[1]);
        if (split.length > 2 && split[1] === "Rule") {
            menuStore.setRuleMenu(split[2]);
        }
    });
    if (!menuStore.language) {
        menuStore.setLanguage(lang);
    }

    // 设置起始时间 和 操作系统类型
    const homeStore = useHomeStore();

    // 获取系统类型
    homeStore.setOS(window.pxOs());

    // 设置软件开始时间
    homeStore.setStartTime(Date.now());

}

type DeepLinkPayload = string | { rawUrl?: string; url?: string; name?: string };

function setupDeepLinkHandler() {
    if (deepLinkHandlerRegistered) {
        return;
    }

    if (!window.pxDeepLink || typeof window.pxDeepLink.onImportProfile !== 'function') {
        return;
    }

    const globalProperties: any = app.config.globalProperties;
    const api = createApi(globalProperties);
    const translate = (key: string) => {
        try {
            return typeof globalProperties.$t === 'function' ? globalProperties.$t(key) : key;
        } catch {
            return key;
        }
    };

    const ensureDeepLinkReady = () => {
        if (typeof window.pxDeepLink?.notifyReady !== 'function') {
            return;
        }

        try {
            window.pxDeepLink.notifyReady();
        } catch (error) {
            console.error('Failed to notify deeplink readiness', error);
        }
    };

    const importProfileFromDeepLink = async (payload: DeepLinkPayload) => {
        const normalized = normalizeDeepLinkPayload(payload);
        const parsed = normalized.rawUrl ? parseDeepLinkUrl(normalized.rawUrl) : null;
        const subscriptionUrl = parsed?.url ?? normalized.directUrl;
        const profileName = normalized.name ?? parsed?.name;

        if (!subscriptionUrl) {
            pError(translate('profiles.deeplink.invalid-url'));
            return;
        }

        if (!isHttpOrHttps(subscriptionUrl)) {
            pError(translate('profiles.deeplink.invalid-url-format'));
            return;
        }

        const profile = new Profile();
        profile.content = subscriptionUrl;
        if (profileName) {
            profile.title = profileName;
        }

        try {
            await pLoad(translate('profiles.deeplink.importing'), async () => {
                const result = await api.addProfileFromInput(profile);
                if (Array.isArray(result) && result.length > 0) {
                    window.dispatchEvent(new CustomEvent(DEEP_LINK_IMPORTED_EVENT, {
                        detail: {profiles: result}
                    }));
                }
            });
            pSuccess(translate('profiles.deeplink.import-success'));
        } catch (error: any) {
            if (error && typeof error === 'object' && 'message' in error && error.message) {
                pError(error.message);
            } else {
                pError(translate('profiles.deeplink.import-failed'));
            }
        }
    };

    window.pxDeepLink.onImportProfile(importProfileFromDeepLink);

    const handleWindowFocus = () => ensureDeepLinkReady();
    const handleVisibilityChange = () => {
        if (!document.hidden) {
            ensureDeepLinkReady();
        }
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    ensureDeepLinkReady();

    deepLinkHandlerRegistered = true;
}

function normalizeDeepLinkPayload(payload: DeepLinkPayload): { rawUrl?: string; directUrl?: string; name?: string } {
    if (typeof payload === 'string') {
        return {rawUrl: payload};
    }

    if (payload && typeof payload === 'object') {
        return {
            rawUrl: payload.rawUrl,
            directUrl: payload.url,
            name: payload.name,
        };
    }

    return {};
}

function parseDeepLinkUrl(link: string): { url: string; name?: string } | null {
    try {
        const parsed = new URL(link);
        if (parsed.protocol !== 'pandora-box:') {
            return null;
        }

        const host = parsed.hostname || parsed.host;
        if (host && host.toLowerCase() !== DEEP_LINK_HOST) {
            return null;
        }

        const query = parsed.search.startsWith('?') ? parsed.search.slice(1) : '';
        if (!query) {
            return null;
        }

        const segments = query.split('&');
        let urlValue: string | null = null;
        const extras: Record<string, string> = {};

        for (const segment of segments) {
            if (!segment) {
                continue;
            }

            const [rawKey, ...rawRest] = segment.split('=');
            const key = rawKey;
            const value = rawRest.join('=');

            if (key === 'url' && urlValue === null) {
                urlValue = value;
                continue;
            }

            if (urlValue !== null && KNOWN_DEEP_LINK_EXTRA_KEYS.has(key)) {
                extras[key] = safeDecode(value);
                continue;
            }

            if (urlValue !== null) {
                urlValue += `&${segment}`;
            }
        }

        if (!urlValue) {
            return null;
        }

        const decodedUrl = safeDecode(urlValue);
        if (!decodedUrl) {
            return null;
        }

        return {
            url: decodedUrl,
            name: extras['name'],
        };
    } catch {
        return null;
    }
}

function safeDecode(value?: string) {
    if (value === undefined) {
        return undefined;
    }

    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

// 🚀 启动应用
bootstrap().then(() => app.mount("#app"));



