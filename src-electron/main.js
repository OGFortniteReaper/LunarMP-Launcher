import { BrowserWindow, app, ipcMain, dialog } from "electron";
import { Deeplink } from "electron-deeplink";
import { init } from "@sentry/electron/main";
import * as Sentry from "@sentry/electron"
import { fileURLToPath } from "url";
import path from "path";

import * as log from "./utils/log.js";
import * as auth from "./utils/auth.js";
import * as utils from "./utils/utils.js";
import { registerIPCHandlers } from "./IPC/handlers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

log.setup();

const version = app.getVersion();
log.info(`[Core] Starting Launcher: v${version}`);

init({
    dsn: "https://19d8cedb22aa4e7af43213441ed2139c@sentry.lunarfn.org/2",
    environment: app.isPackaged ? "prod" : "dev",
});

log.info("[Sentry] Setup!");

let Window;

if (app.isPackaged) {
    if (!app.setAsDefaultProtocolClient("lunarfn")) {
        log.error("[Main] Failed to set as default protocol client");
    }
} else {
    log.info("[Core] Electron is running in development mode, disabling hardware acceleration..");
    app.disableHardwareAcceleration();
}

async function Main() {
    log.warn("[Main] Loading BrowserWindow..");
    Window = new BrowserWindow({
        width: 1300,
        height: 710,
        resizable: false,
        frame: false,
        transparent: true,
        icon: path.join(__dirname, `../${app.isPackaged ? "build" : "public"}/assets/favicon.ico`),
        webPreferences: {
            devTools: !app.isPackaged,
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true,
            autoplayPolicy: false,
        },
    });

    Window.webContents.on("before-input-event", (event, input) => {
        if (app.isPackaged && (
            input.key === "F5" ||
            (input.key === "r" && input.control) ||
            (input.key === "r" && input.meta) 
        )) {
            event.preventDefault();
        }
    });


    log.info("[Main] Loaded BrowserWindow! Registering Deeplink..");

    const link = new Deeplink({
        app,
        mainWindow: Window,
        protocol: app.isPackaged ? "lunarfn" : "lunarfndev",
        isDev: !app.isPackaged,
    });

    link.on("received", async (url) => {
        const code = utils.getEXC(url);

        try {
            const data = await auth.MakeAuthRequest(code);
            log.info("Saved Login information, continue login..");
            Window.webContents.send("LoginCall", data);
            await auth.LoginToBackend();
        } catch (err) {
            Sentry.captureException(`Try Error: ${err}`);
        }
    });

    app.isPackaged
        ? Window.loadFile(path.join(__dirname, "../build/index.html"))
        : Window.loadURL("http://127.0.0.1:3000");

    return null;
};

app.on("ready", async () => {
    log.info("[Main] App is ready, initializing IPCs & Main Window");
    registerIPCHandlers();
    await Main();
});

app.on("window-all-closed", () => {
    log.info("[Main] All windows closed, quitting app");
    app.quit();
});

app.on("open-url", (event, url) => {
    event.preventDefault();
    log.info(`[Main] App opened with URL: ${url}`);
    if (Window) {
        Window.webContents.send("open-url", url);
    }
});