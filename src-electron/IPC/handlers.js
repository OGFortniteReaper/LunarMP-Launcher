import { BrowserWindow, ipcMain, app, shell, dialog } from "electron"
import path from "path";

import * as log from "../utils/log.js";
import * as auth from "../utils/auth.js";
import * as game from "../utils/game.js";
import * as backend from "../utils/backend.js";
import * as versioncheck from "../utils/versioncheck.js";

const handleWindowClose = (event, callback) => {
    const webContents = event?.sender;
    const window = BrowserWindow.fromWebContents(webContents);
    window.close();
}

const handleWindowMinimize = (event, callback) => {
    const webContents = event?.sender;
    const window = BrowserWindow.fromWebContents(webContents);
    window.minimize();
}

const handleVersionInfo = (event, callback) => {
    const webContents = event?.sender;
    const window = BrowserWindow.fromWebContents(webContents);
    window.webContents.send("SendVersionInfo", app.getVersion());
}

const handleAutoLogin = async (event, callback) => {
    const webContents = event?.sender;
    const window = BrowserWindow.fromWebContents(webContents);
    const resp = await auth.AutoLogin();
    if (resp.success) {
        auth.LoginToBackend();
        window.webContents.send("AutoLoginSuccess", resp);
    }
}

const handleInstallSoftUpdate = async (event, callback) => {
    await versioncheck.InstallUpdate(callback.version);
}

const handleStartGame = (event, callback) => game.StartGame(event, callback);

const handleCloseGame = (event, callback) => game.CloseGame();

const handleFindFortnitePath = async (event, callback) => {
    const webContents = event?.sender;
    const window = BrowserWindow.fromWebContents(webContents);
    const root = await dialog.showOpenDialog(window, { properties: ["openDirectory"] });
    if (!root.canceled) {
        const result = await game.DetectVersion(root);
        window.webContents.send("DetectedFortnitePath", result);
    } else {
        log.info("User canceled game path request.");
    }
}

const handleGetAccount = async (event, callback) => {
    const webContents = event?.sender;
    const window = BrowserWindow.fromWebContents(webContents);
    const account = await backend.GetAccount();
    window.webContents.send("SendAccount", account);
}

const handleGetWindowState = (event, callback) => {
    const webContents = event?.sender;
    const window = BrowserWindow.fromWebContents(webContents);
    const isMinimized = window.isMinimized();
    const isVisible = window.isVisible();
    const isFocused = window.isFocused();

    window.webContents.send("SendWindowState", {
        isMinimized,
        isVisible,
        isFocused,
    });
};

const handleLogoff = async (event, callback) => {
    const webContents = event?.sender;
    const window = BrowserWindow.fromWebContents(webContents);
    if (await auth.Logoff()) return window.webContents.send("LoggedOff");
}

const handleClearLauncherData = async (event, callback) => {
    const webContents = event?.sender;
    const window = BrowserWindow.fromWebContents(webContents);
    window.webContents.send("ClearedLauncherData");
}

const handleOpenLogs = (event, callback) => {
    shell.openExternal(path.join(process.env.LOCALAPPDATA, "LunarFN/logs"));
};

const handleGetInstalledBuilds = (event, callback) => {
    const webContents = event?.sender;
    const window = BrowserWindow.fromWebContents(webContents);
    const result = game.GetInstallations();
    if (result) window.webContents.send("InstalledBuilds", result);
}

const handleDeleteGame = (event, callback) => game.DeleteGame(callback);

const IPCs = [
    {
        event: "WindowClose",
        callback: handleWindowClose,
    },
    {
        event: "WindowMinimize",
        callback: handleWindowMinimize,
    },
    {
        event: "VersionInfo",
        callback: handleVersionInfo,
    },
    {
        event: "AutoLogin",
        callback: handleAutoLogin,
    },
    {
        event: "InstallSoftUpdate",
        callback: handleInstallSoftUpdate,
    },
    {
        event: "StartGame",
        callback: handleStartGame,
    },
    {
        event: "CloseGame",
        callback: handleCloseGame,
    },
    {
        event: "FindFortnitePath",
        callback: handleFindFortnitePath,
    },
    {
        event: "GetAccount",
        callback: handleGetAccount,
    },
    {
        event: "GetWindowState",
        callback: handleGetWindowState,
    },
    {
        event: "Logoff",
        callback: handleLogoff,
    },
    {
        event: "ClearLauncherData",
        callback: handleClearLauncherData,
    },
    {
        event: "OpenLogs",
        callback: handleOpenLogs
    },
    {
        event: "GetInstalledBuilds",
        callback: handleGetInstalledBuilds,
    },
    {
        event: "DeleteGame",
        callback: handleDeleteGame,
    }
];

export const registerIPCHandlers = () => {
    IPCs.forEach((handler) => {
        ipcMain.on(handler.event, handler.callback);
    });
}