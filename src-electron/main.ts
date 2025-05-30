import {app, BrowserWindow, BrowserWindowConstructorOptions} from 'electron';
import path from 'node:path';
import {startServer, storeInfo} from "./server";
import {doQuit, initTray, showWindow} from "./tray";
import {startBackend} from "./admin";
import log from './log';
import {initStore, storeGet} from "./store";

// 是否在开发模式
const isDev = !app.isPackaged;


// 主窗口
let mainWindow: BrowserWindow;
// 屏蔽安全警告
process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";
const createWindow = () => {
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

    log.info('准备加载页面:', filePath);
    mainWindow.loadURL(filePath).catch((err) => {
        log.error('页面加载失败:', err);
    });

    // 页面加载完成再显示，避免白屏
    mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.show();
        mainWindow.focus();
        log.info('页面加载成功:', filePath);
    });
};

// 等待 backend 传来的 port 和 secret
let resolveReady: () => void;
const waitForReady = new Promise<void>((resolve) => {
    resolveReady = resolve;
});

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
        // 初始化前端数据库
        initStore(log.getHomeDir())

        // 启动前端静态服务
        startServer(resolveReady, startBackend)

        // 等待后端启动
        await waitForReady;

        // 启动UI
        log.info('准备就绪，启动窗口，port=', storeInfo.port(), ' secret=', storeInfo.secret());
        createWindow();
    });
}