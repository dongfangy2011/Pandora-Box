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
    const [h, s, l] = baseColor.hsl();

    const useWhiteText = shouldUseWhiteText(img);
    const textRGB = useWhiteText ? [255, 255, 255] : [0, 0, 0];
    const textColor = useWhiteText ? "#fff" : "#000";

    // ========= 🎯 智能色相偏移逻辑（避免紫） =========
    let hueShifted: number;

    if (h >= 200 && h <= 250) {
        // 如果已经是蓝色基调，就不要往紫色走
        hueShifted = h - 10; // 轻微往青偏
    } else if (h > 250 && h < 320) {
        hueShifted = h - 20; // 避开紫色区
    } else {
        hueShifted = (h + 25) % 360; // 正常提亮
    }

    let selectedColor = chroma.hsl(
        hueShifted,
        Math.min(s + 0.25, 1),
        Math.min(Math.max(l, 0.45), 0.72)
    )
        .saturate(0.4)
        .brighten(0.2)
        .alpha(0.9);

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

    let contrast = getContrast(selectedColor.rgb(), textRGB);
    if (contrast < 3) {
        selectedColor = useWhiteText
            ? selectedColor.darken(0.8)
            : selectedColor.brighten(0.8);
    }

    const contrastWithBase = getContrast(selectedColor.rgb(), baseColor.rgb());
    if (contrastWithBase < 2.5) {
        selectedColor = selectedColor.brighten(0.5);
    }

    // ========= 🎨 背景与边界辅助色 =========
    const backgroundBlendColor = chroma
        .mix(useWhiteText ? "#000" : "#fff", selectedColor, 0.3) // 稍多 selectedColor 的比例
        .set('hsl.s', '*1.1')  // 稍提饱和度
        .set('hsl.l', '*1.05') // 微调亮度，避免混得太灰
        .alpha(useWhiteText ? 0.3 : 0.2) // 稍提透明度，提升存在感
        .css();

    const backgroundRightColor = chroma
        .mix(baseColor, selectedColor, 0.3)
        .set('hsl.s', '*1.2')
        .set('hsl.l', '*1.1')
        .alpha(useWhiteText ? 0.15 : 0.25)
        .css();

    // ========= 🎯 副标题颜色（对比增强 + 可见度控制） =========
    let subtitleBase = useWhiteText
        ? selectedColor.brighten(1.2)
        : selectedColor.darken(0.8);

    if (getContrast(subtitleBase.rgb(), textRGB) < 2.8) {
        subtitleBase = useWhiteText
            ? subtitleBase.brighten(0.5)
            : subtitleBase.darken(0.5);
    }

    const subtitleColor = subtitleBase.alpha(0.9).css();


    // ========= ✅ 应用主题色 =========
    setCSSVariables({
        "text-color": textColor,
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
