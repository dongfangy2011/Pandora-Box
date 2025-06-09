import {app, BrowserWindow, BrowserWindowConstructorOptions, session} from 'electron';
import path from 'node:path';
import {startServer, storeInfo} from "./server";
import {doQuit, initTray, showWindow} from "./tray";
import {startBackend} from "./admin";
import log from './log';
import {initStore, storeGet} from "./store";
import {isBootAutoLaunch, updateAutoLaunchRegistration, waitForNetworkReady} from "./launch";

// 是否在开发模式
const isDev = !app.isPackaged;

// 主窗口
let mainWindow: BrowserWindow;
// 屏蔽安全警告
process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";
const createWindow = (isBoot: boolean) => {
    let windowOptions: BrowserWindowConstructorOptions = {
        minWidth: 960,
        minHeight: 660,
        width: 1100,
        height: 760,
        show: false, // 先不显示窗口
        center: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            webSecurity: false,
            nodeIntegrationInWorker: true
        },
        ...(process.platform !== 'darwin' ? {
            titleBarStyle: 'hidden'
        } : {
            titleBarStyle: 'hiddenInset'
        })
    };

    // 恢复上次窗口位置
    const savedBounds: any = storeGet('windowBounds');
    if (savedBounds && savedBounds.x !== undefined && savedBounds.y !== undefined) {
        windowOptions = {
            ...windowOptions,
            ...savedBounds
        };
    }

    mainWindow = new BrowserWindow(windowOptions);

    // 隐藏菜单栏
    mainWindow.setMenu(null);

    // 托盘
    initTray(mainWindow);

    // 页面加载
    const filePath = isDev
        ? `http://localhost:5173?port=${storeInfo.port()}&secret=${storeInfo.secret()}`
        : `http://${storeInfo.listenAddr()}/index.html?port=${storeInfo.port()}&secret=${storeInfo.secret()}`;

    log.info('准备加载页面');
    mainWindow.loadURL(filePath).catch((err) => {
        log.error('页面加载失败:', err);
    });

    // 页面加载完成再显示，避免白屏
    mainWindow.webContents.once('did-finish-load', () => {
        if (isBoot) {
            log.info('静默启动完成');
        } else {
            mainWindow.show();
            mainWindow.focus();
            log.info('页面加载成功');
        }
    });
};

// 等待 backend 传来的 port 和 secret
let resolveReady: () => void;
const waitForReady = new Promise<void>((resolve) => {
    resolveReady = resolve;
});

// 生成一个随机 UA
const version = Math.floor(Math.random() * 20 + 85); // 统一版本号
const agents = [
    {
        ua: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/${version}.0.0.0 Safari/537.36`,
        platform: `"Windows"`,
        secChUa: `"Google Chrome";v="${version}", "Chromium";v="${version}", "Not_A Brand";v="99"`
    },
    {
        ua: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_${Math.floor(Math.random() * 9 + 10)}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version}.0.0.0 Safari/537.36`,
        platform: `"macOS"`,
        secChUa: `"Google Chrome";v="${version}", "Chromium";v="${version}", "Not_A Brand";v="99"`
    },
    {
        ua: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version}.0.0.0 Safari/537.36`,
        platform: `"Linux"`,
        secChUa: `"Google Chrome";v="${version}", "Chromium";v="${version}", "Not_A Brand";v="99"`
    }
];

// 单例模式
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    doQuit()
} else {
    // 试图启动第二个应用实例
    app.on('second-instance', showWindow);

    // 监听应用被激活
    app.on('activate', showWindow);

    app.whenReady().then(async () => {
        // 判断是否开机启动
        const isBoot = await isBootAutoLaunch();
        log.info('是否开机启动:', isBoot);

        // 如果是开机启动，则等待网络就绪（最多30秒）
        if (isBoot) {
            // 先隐藏dock
            app.dock?.hide()

            log.info('开机启动，等待网络准备...');
            const networkReady = await waitForNetworkReady(30000, 'bing.com');
            if (!networkReady) {
                log.warn('网络检测超时，继续启动但可能无网络');
            } else {
                log.info('网络已准备好');
            }
        }

        // 初始化前端数据库
        initStore(log.getHomeDir())

        // 启动前端静态服务
        startServer(resolveReady, startBackend)

        // 等待后端启动
        await waitForReady;

        // 设置请求头 Referer
        const agent = agents[Math.floor(Math.random() * agents.length)];
        session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
            details.requestHeaders['Referer'] = new URL(details.url).origin // 只发送域名
            details.requestHeaders['User-Agent'] = agent.ua;
            details.requestHeaders['sec-ch-ua-platform'] = agent.platform;
            details.requestHeaders['sec-ch-ua'] = agent.secChUa;
            callback({requestHeaders: details.requestHeaders})
        })

        // 启动UI
        log.info('准备就绪，启动窗口，port=', storeInfo.port(), ' secret=', storeInfo.secret());
        createWindow(isBoot);

        // 更新开机自启路径
        await updateAutoLaunchRegistration()
    });
}