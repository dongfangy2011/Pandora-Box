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

// 判断是否使用白色文字
const shouldUseWhiteText = (img: HTMLImageElement): boolean =>
    getAverageLuminance(img) < 0.6;

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
    const [h, , l] = baseColor.hsl();
    const useWhiteText = shouldUseWhiteText(img);

    let saturation = l >= 0.85 ? 0.5 : 0.8;
    let lightness = l <= 0.25 ? 0.4 : Math.min(l + 0.2, 1);
    let selectedColor = chroma.hsl(h + 20, saturation, lightness);

    // 混合调整
    const luminance = getPerceivedLuminance(selectedColor.rgb());
    const mixRatio = luminance > 0.75 ? 0.15 : 0.3;
    const finalAlpha = luminance > 0.75 ? 0.95 : 0.85;

    selectedColor = chroma
        .mix(selectedColor, "#3B6FC4", mixRatio)
        .alpha(finalAlpha);

    const backgroundBlendColor = chroma
        .mix(useWhiteText ? "#000" : "#fff", selectedColor, mixRatio)
        .alpha(useWhiteText ? 0.4 : 0.3)
        .css();

    const backgroundRightColor = chroma
        .mix(baseColor, selectedColor, 0.3)
        .darken(0.3)
        .alpha(0.2)
        .css();

    const subtitleColor = useWhiteText
        ? selectedColor.brighten(2).css()
        : selectedColor.darken(2).css();

    setCSSVariables({
        "text-color": useWhiteText ? "#fff" : "#000",
        "top-hr-color": subtitleColor,
        "left-item-selected-bg": selectedColor.css(),
        "blend-color": backgroundBlendColor,
        "right-bg-color": backgroundRightColor,
    });

    return useWhiteText;
};

// ======================== 背景处理工具 ======================== //

const defaultBackground = "url('/images/quang.jpg')";

const extractImageUrl = (style: string): string | null => {
    const match = style.match(/^url\(["']?(.*?)["']?\)$/);
    return match?.[1] || null;
};

export function preloadBackgroundImage(
    bg: string,
    cb: (bg: string, useWhite: boolean) => void
): any {
    if (!bg.startsWith("url(")) {
        return
    }

    const useFallback: any = () => preloadBackgroundImage(defaultBackground, cb)
    const imgUrl = extractImageUrl(bg);
    if (!imgUrl) {
        useFallback()
        return
    }

    const img = new Image();
    img.src = imgUrl;
    img.onload = () => cb(bg, changeTheme(img));
    img.onerror = () => {
        console.error(`Failed to load background image: ${imgUrl}`);
        useFallback();
    };
}
