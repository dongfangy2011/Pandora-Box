import os from 'os';
import {lookup} from 'dns/promises';
import {app} from 'electron';
// @ts-ignore
import AutoLaunch from 'auto-launch';
import log from './log';

const APP_NAME = 'Pandora-Box';
const BOOT_FLAG = '--boot-launch';

const autoLauncher = new AutoLaunch({
    name: APP_NAME,
    path: app.getPath('exe'),
    args: [BOOT_FLAG],
});

/**
 * 等待网络准备好（DNS能解析指定域名），超时返回 false
 * @param timeout 超时时间（毫秒），默认30秒
 * @param host 要解析的域名，默认 bing.com
 */
export async function waitForNetworkReady(timeout = 30000, host = 'bing.com'): Promise<boolean> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        try {
            await lookup(host);
            return true; // 网络准备好了
        } catch {
            await new Promise(res => setTimeout(res, 1000));
        }
    }
    return false; // 超时无网络
}

/**
 * 判断当前是否开机自启启动
 * - 通过命令行参数 BOOT_FLAG
 * - 通过系统登录项 wasOpenedAtLogin
 * - 通过系统运行时间小于60秒
 */
export async function isBootAutoLaunch(): Promise<boolean> {
    const uptime = os.uptime(); // 单位秒
    const args = process.argv;

    let wasOpenedAtLogin = false;
    try {
        // macOS 和 Windows 支持
        const loginSettings = app.getLoginItemSettings?.();
        wasOpenedAtLogin = loginSettings?.wasOpenedAtLogin ?? false;
    } catch {
        // 某些平台或旧版本Electron可能无此方法，安全忽略
    }

    const launchedByFlag = args.includes(BOOT_FLAG);
    const launchedSoonAfterBoot = uptime < 30;

    return launchedByFlag || wasOpenedAtLogin || launchedSoonAfterBoot;
}

/**
 * 开启开机自启（如果未开启）
 */
export async function enableAutoLaunch(): Promise<void> {
    try {
        const enabled = await autoLauncher.isEnabled();
        if (!enabled) {
            await autoLauncher.enable();
            log.info('✅ 开启开机自启');
        }
    } catch (err) {
        log.error('开启开机自启失败:', err);
    }
}

/**
 * 关闭开机自启（如果已开启）
 */
export async function disableAutoLaunch(): Promise<void> {
    try {
        const enabled = await autoLauncher.isEnabled();
        if (enabled) {
            await autoLauncher.disable();
            log.info('🛑 关闭开机自启');
        }
    } catch (err) {
        log.error('关闭开机自启失败:', err);
    }
}

/**
 * 查询开机自启状态
 */
export async function isAutoLaunchEnabled(): Promise<boolean> {
    try {
        return await autoLauncher.isEnabled();
    } catch (err) {
        log.error('查询开机自启状态失败:', err);
        return false;
    }
}
