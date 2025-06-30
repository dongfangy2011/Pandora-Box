import ColorThief from "colorthief";
import chroma from "chroma-js";

const colorThief = new ColorThief();

// ======================== 工具函数 ======================== //

// 感知亮度计算
const getPerceivedLuminance = ([r, g, b]: number[]): number =>
    (0.299 * r + 0.587 * g + 0.114 * b) / 255;

// 提取图片主色调调色板并计算平均亮度
const getAverageLuminance = (img: HTMLImageElement, colorCount = 8): number => {
    const palette = colorThief.getPalette(img, colorCount);
    const totalLuminance = palette.reduce((sum, color) => sum + getPerceivedLuminance(color), 0);
    return totalLuminance / palette.length;
};

// 判断是否使用白色文字（更保守）
const shouldUseWhiteText = (img: HTMLImageElement): boolean =>
    getAverageLuminance(img) < 0.55;

// 设置CSS变量
const setCSSVariables = (vars: Record<string, string>) => {
    const root = document.documentElement;
    Object.entries(vars).forEach(([key, value]) => {
        root.style.setProperty(`--${key}`, value);
    });
};

// ======================== 主题应用主逻辑 ======================== //

export const changeTheme = (img: HTMLImageElement): boolean => {
    const baseColor = chroma(colorThief.getColor(img));
    const [h, s, l] = baseColor.hsl();

    const useWhiteText = shouldUseWhiteText(img);
    const textRGB = useWhiteText ? [255, 255, 255] : [0, 0, 0];
    const textColor = useWhiteText ? "#fff" : "#000";

    // ========= 🎯 智能色相偏移逻辑（避免紫） =========
    let hueShifted: number;
    if (h >= 200 && h <= 250) {
        hueShifted = h - 10;
    } else if (h > 250 && h < 320) {
        hueShifted = h - 20;
    } else {
        hueShifted = (h + 25) % 360;
    }

    let selectedColor = chroma.hsl(
        hueShifted,
        Math.min(s + 0.18, 0.85),
        Math.min(Math.max(l, 0.52), 0.66)
    )
        .saturate(0.25)
        .brighten(0.15)
        .alpha(0.88);

    // 🎯 避免偏亮黄色
    if (h > 40 && h < 65 && l > 0.7) {
        selectedColor = selectedColor.darken(0.5).set("hsl.h", (h + 20) % 360);
    }

    // ========= 🔎 对比度保障 =========
    const getContrast = (rgb1: number[], rgb2: number[]): number => {
        const luminance = (rgb: number[]) => {
            const a = rgb.map((v) => {
                v /= 255;
                return v <= 0.03928
                    ? v / 12.92
                    : Math.pow((v + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
        };
        const L1 = luminance(rgb1);
        const L2 = luminance(rgb2);
        return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    };

    const MIN_CONTRAST = 4.5;
    let attempts = 0;
    while (getContrast(selectedColor.rgb(), textRGB) < MIN_CONTRAST && attempts < 5) {
        selectedColor = useWhiteText
            ? selectedColor.darken(0.2)
            : selectedColor.brighten(0.2);
        attempts++;
    }

    const contrastWithBase = getContrast(selectedColor.rgb(), baseColor.rgb());
    if (contrastWithBase < 2.5) {
        selectedColor = selectedColor.brighten(0.5);
    }

    // ========= 🎨 背景与辅助色 =========
    const backgroundBlendColor = chroma
        .mix(useWhiteText ? "#000" : "#fff", selectedColor, 0.25)
        .set("hsl.l", "*1.06")
        .desaturate(0.3)
        .alpha(useWhiteText ? 0.2 : 0.1)
        .css();

    const backgroundRightColor = chroma
        .mix(baseColor, selectedColor, 0.3)
        .set("hsl.s", "*1.2")
        .set("hsl.l", "*1.1")
        .alpha(useWhiteText ? 0.2 : 0.4)
        .css();

    // ========= 副标题颜色更克制 =========
    const MIN_SUBTITLE_CONTRAST_TEXT = 3.2;
    const MIN_SUBTITLE_CONTRAST_BG = 4.0;

    let subtitleBase = useWhiteText
        ? selectedColor.brighten(0.9).desaturate(0.4).set("hsl.h", (h + 10) % 360)
        : selectedColor.darken(0.5).desaturate(0.3).set("hsl.h", (h + 15) % 360);

    let attempt = 0;
    while (attempt < 6) {
        const contrastText = getContrast(subtitleBase.rgb(), textRGB);
        const contrastBg = getContrast(subtitleBase.rgb(), baseColor.rgb());
        if (contrastText >= MIN_SUBTITLE_CONTRAST_TEXT && contrastBg >= MIN_SUBTITLE_CONTRAST_BG) {
            break;
        }
        subtitleBase = useWhiteText
            ? subtitleBase.brighten(0.3).saturate(0.2)
            : subtitleBase.darken(0.3).saturate(0.2);
        attempt++;
    }

    const subtitleColor = subtitleBase.alpha(0.95).css();

    // -------- body-blur-color 更柔 --------
    const bodyBlurColor = chroma(useWhiteText ? "black" : "white")
        .alpha(useWhiteText ? 0.18 : 0.12)
        .mix(baseColor, 0.25)
        .desaturate(0.3)
        .css();

    // ========= ✅ 应用主题色 =========
    setCSSVariables({
        "text-color": textColor,
        "top-hr-color": subtitleColor,
        "left-item-selected-bg": selectedColor.css(),
        "blend-color": backgroundBlendColor,
        "right-bg-color": backgroundRightColor,
        "body-blur-color": bodyBlurColor,
    });

    return useWhiteText;
};


// ======================== 背景处理工具 ======================== //

const defaultBackground = "url('/images/default.jpg')";
const IMAGE_LOAD_TIMEOUT = 15000; // 15秒超时

const extractImageUrl = (style: string): string | null => {
    const match = style.match(/^url\(["']?(.*?)["']?\)$/);
    return match?.[1] || null;
};

let isBgLoading = false;

export function preloadBackgroundImage(
    bg: string,
    cb: (bg: string, useWhite: boolean) => void
): void {
    if (isBgLoading) {
        console.warn("Background is loading, ignore new request:", bg);
        return;
    }

    if (!bg.startsWith("url(")) {
        return;
    }

    const imgUrl = extractImageUrl(bg);
    if (!imgUrl) {
        return preloadBackgroundImage(defaultBackground, cb);
    }

    isBgLoading = true;

    const img = new Image();
    let isResolved = false;

    const timeoutId = setTimeout(() => {
        if (!isResolved) {
            console.error(`Background image load timed out: ${imgUrl}`);
            isResolved = true;
            isBgLoading = false;
            preloadBackgroundImage(defaultBackground, cb); // fallback
        }
    }, IMAGE_LOAD_TIMEOUT);

    img.onload = () => {
        if (isResolved) return;
        clearTimeout(timeoutId);
        isResolved = true;
        isBgLoading = false;
        cb(bg, changeTheme(img));
    };

    img.onerror = () => {
        if (isResolved) return;
        clearTimeout(timeoutId);
        isResolved = true;
        console.error(`Failed to load background image: ${imgUrl}`);
        isBgLoading = false;
        preloadBackgroundImage(defaultBackground, cb); // fallback
    };

    img.src = imgUrl;
}