import axios from "axios";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import * as Sentry from "@sentry/electron"
import * as cprocess from "child_process";
import { suspend } from "ntsuspend";
import { dialog } from "electron"
import { ipcMain, BrowserWindow } from "electron"

import * as log from "./log.js";
import * as auth from "./auth.js";
import * as utils from "./utils.js";

export async function StartGame(event, callback) {
    const webContents = event?.sender;
    const window = BrowserWindow.fromWebContents(webContents);
    const versionToStart = callback.version.split("-")[0];
    const diskInfo = LoadInfoFromDisk();
    const { email, password } = auth.LoadFromDisk();
    const { path, backend_data, version } = diskInfo.find((v) => v.version === versionToStart);

    const upadteLoadingBar = (p) => window.webContents.send("UpdateLoadingBar", p);
    const sendError = (e) => window.webContents.send("BreakLaunching", e);

    CloseGame();
    upadteLoadingBar(10);

    // SETUP
    const main_args = ["-noeac", "fromfl=be", "-epicportal", "-fltoken=h1cdhchd10150221h130eB56", "-skippatchcheck", "-PartySystemVersion=1", "-auth_type=epic", `-auth_login=${email}`, `-auth_password=${password}`];
    const anticheat_args = ["-noeac", "fromfl=be", "-epicportal", "-fltoken=h1cdhchd10150221h130eB56", "-skippatchcheck"];
    const dependencies = (await axios.get("https://launcher-service.v3.prod.lunarfn.org/launcher/api/file_replace/prod")).data;

    upadteLoadingBar(20);

    // CHECKING BUILD
    const isOk = fs.existsSync(path)
        && fs.existsSync(`${path}\\FortniteGame\\Binaries\\Win64\\FortniteClient-Win64-Shipping.exe`)
        && fs.existsSync(`${path}\\FortniteGame\\Binaries\\Win64\\FortniteClient-Win64-Shipping_BE.exe`)
        && fs.existsSync(`${path}\\FortniteGame\\Binaries\\Win64\\FortniteLauncher.exe`);

    if (!isOk) {
        sendError("Version is not setup correctly or curruped.");
        dialog.showErrorBox("Failed to Start Game", "Version is not setup correctly or curruped.");
    };
    const isVerified = await verifyGame(path, callback.version);
    if (!isVerified) {
        return upadteLoadingBar(0);
    }

    upadteLoadingBar(40);

    // REPLACE
    for (const file of dependencies) {
        try {
            await utils.downloadWithRetry(file, 5, path, false);
        } catch (err) {
            Sentry.captureException(`Download Error for dependencie: ${file.fileName}\nerr: ${err}`);
        }
    }

    upadteLoadingBar(60);

    // STARTING GAME
    const client = cprocess.spawn(`${path}\\FortniteGame\\Binaries\\Win64\\FortniteClient-Win64-Shipping.exe`, main_args, { cwd: `${path}\\FortniteGame\\Binaries\\Win64` });
    const battleeye = cprocess.spawn(`${path}\\FortniteGame\\Binaries\\Win64\\FortniteClient-Win64-Shipping_BE.exe`, anticheat_args, { cwd: `${path}\\FortniteGame\\Binaries\\Win64` });
    const launcher = cprocess.spawn(`${path}\\FortniteGame\\Binaries\\Win64\\FortniteLauncher.exe`, anticheat_args, { cwd: `${path}\\FortniteGame\\Binaries\\Win64` });

    suspend(battleeye.pid);
    suspend(launcher.pid);
    upadteLoadingBar(80);

    let injectedRedirect = false;
    client.stdout.on("data", (data) => {
        const logable = data.toString();
        if (!injectedRedirect && logable.includes("Region ")) {
            injectedRedirect = true; // at this point fortnite is ready for anything dll
            //const RedirectLOC = "C:\\__storage\\10.40\\Client.dll";
            //injector.InjectDLL(RedirectLOC, client.pid);
        }
    });

    upadteLoadingBar(100);

    const interval = setInterval(async () => {
        if (!utils.isPidRunning(client.pid)) {
            CloseGame();

            for (const file of dependencies) {
                try {
                    await utils.downloadWithRetry(file, 5, path, true);
                } catch (err) {
                    Sentry.captureException(`Download Error for dependencie: ${file.fileName}\nerr: ${err}`);
                }
            }

            log.info("Replaced modified versions of files back to the original ones.");
            clearInterval(interval);
        }
    }, 1000);
}

export function CloseGame() {
    const Processes = [
        "FortniteLauncher.exe",
        "FortniteClient-Win64-Shipping.exe",
        "FortniteClient-Win64-Shipping_BE.exe",
        "FortniteClient-Win64-Shipping_EAC.exe",
    ];

    Processes.forEach((processName) => {
        try {
            cprocess.execSync(`taskkill /f /im ${processName}`);
        } catch { }
    });
}

export async function DetectVersion(root) {
    const rootPath = root.filePaths[0];
    const FortniteGame = path.join(rootPath, "FortniteGame");
    const Engine = path.join(rootPath, "Engine");
    const Shipping = path.join(rootPath, "FortniteGame\\Binaries\\Win64\\FortniteClient-Win64-Shipping.exe");
    const BattleEye = path.join(rootPath, "FortniteGame\\Binaries\\Win64\\FortniteClient-Win64-Shipping_BE.exe");
    const EasyAntiCheat = path.join(rootPath, "FortniteGame\\Binaries\\Win64\\FortniteClient-Win64-Shipping_EAC.exe");
    const Launcher = path.join(rootPath, "FortniteGame\\Binaries\\Win64\\FortniteLauncher.exe");

    const isOk = fs.existsSync(FortniteGame)
        && fs.existsSync(Engine)
        && fs.existsSync(Shipping)
        && fs.existsSync(BattleEye)
        && fs.existsSync(EasyAntiCheat)
        && fs.existsSync(Launcher)

    if (isOk) {
        const gameHash = crypto.createHash("sha512").update(fs.readFileSync(Shipping)).digest("hex");
        const { data } = await axios.get("https://launcher-service.v3.prod.lunarfn.org/game/api/hashes/version_hashes");
        const { version, version_extended } = data.SHA512[gameHash];

        if (data.SHA512[gameHash]) {
            SaveInfoToDisk({
                path: rootPath,
                version,
                version_extended,
            });
            log.info(`Successfully added ${version} to internal saves.`);
            return "SUCCESS";
        } else {
            log.error("Could not find build in version hashes, will not add build to disk.");
        }
    } else {
        log.error(`Game at: ${rootPath} cannot be processed, try reinstalling the build.`);
    }

    return "CANT_DETECT";
}

// at the moment this will overwrite any other build.
export function SaveInfoToDisk(json) {
    const LocalPath = path.join(process.env.LOCALAPPDATA, "LunarFN");
    const FilePath = path.join(LocalPath, "launcher.json");
    if (!fs.existsSync(LocalPath)) fs.mkdirSync(LocalPath, { recursive: true });
    let currentVersions = FilePath.versions || [];

    if (!currentVersions.includes(json.version)) {
        currentVersions.push({
            version: json.version,
            version_extended: json.version_extended,
            path: json.path,
            added: new Date().toISOString(),
        });
    } else {
        log.warn(`Looks like ${json.version} is already setup in launcher config!`);
    }

    try {
        fs.writeFileSync(FilePath, JSON.stringify({ versions: currentVersions }, null, 2), "utf8");
    } catch (err) {
        log.error(`Fatal Error: Could not write launcher.json! ${err}`);
    }
}

export function LoadInfoFromDisk() {
    const LocalPath = path.join(process.env.LOCALAPPDATA, "LunarFN");
    const FilePath = path.join(LocalPath, "launcher.json");

    try {
        const FileContent = fs.readFileSync(FilePath);
        if (FileContent) return (JSON.parse(FileContent)).versions;
    } catch {
        try {
            if (!fs.existsSync(LocalPath)) fs.mkdirSync(LocalPath)
            if (!fs.existsSync(FilePath)) fs.writeFileSync(FilePath, JSON.stringify({}, null, 2), "utf8")
        } catch (err) {
            log(`[Auth] Failed to read game path, also failed to create directory.`);
            Sentry.captureException(`Try Error: ${err}`);
        }
    }

    return null;
}

async function verifyGame(basePath, gameVersion) {
    try {
        const { data, status } = await axios.get(`https://cdn.lunarfn.org/client/v3/sizes/${gameVersion}.json`);
        const discrepancies = [];
        const unexpectedFiles = [];

        if (status === 404) {
            log.error("ERROR 404");
        };

        const expectedFiles = new Set(data.sizes.map(file => path.join(basePath, file.path.replace(/^\.\.\\/, ""))));
        const totalFiles = data.sizes.length;
        let checkedFiles = 0;

        const checkDirectory = (dirPath) => {
            const files = fs.readdirSync(dirPath);
            files.forEach(file => {
                const filePath = path.join(dirPath, file);
                const stats = fs.statSync(filePath);

                if (stats.isDirectory()) {
                    checkDirectory(filePath);
                } else {
                    if (!expectedFiles.has(filePath) && !filePath.includes("PersistentDownloadDir")) {
                        unexpectedFiles.push(filePath);
                    }
                }
            });
        };

        checkDirectory(basePath);

        for (const file of data.sizes) {
            const filePath = path.join(basePath, file.path.replace(/^\.\.\\/, ""));

            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);

                if (stats.size !== Math.round(file.size * 1024)) {
                    discrepancies.push({
                        file: filePath,
                        expectedSize: Math.round(file.size * 1024),
                        actualSize: stats.size
                    });
                }
            } else {
                discrepancies.push({
                    file: filePath,
                    error: "File does not exist"
                });
            }

            checkedFiles++;
        }

        if (discrepancies.length > 0) {
            log.warn("Discrepancies found:", discrepancies);
        } else {
            log.info(`Verified ${gameVersion} successfully`);
        }

        if (unexpectedFiles.length > 0) {
            dialog.showErrorBox("Unverified content found.", `Please remove ${unexpectedFiles} from your gamefiles to continue.`);
            return false;
        }

        return true;
    } catch (err) {
        Sentry.captureException(`Game Verify Failed: ${err}`);
    }
}

export function GetInstallations() {
    const LocalPath = path.join(process.env.LOCALAPPDATA, "LunarFN");
    const File = path.join(LocalPath, "launcher.json");
    try {
        const result = fs.readFileSync(File, { encoding: "utf8" });
        return result;
    } catch (err) {
        log.error(`Fatal Error: Could not load installations, build list will not work! ${err}`);
    }
}

export function DeleteGame(callback) {
    const LocalPath = path.join(process.env.LOCALAPPDATA, "LunarFN");
    const FilePath = path.join(LocalPath, "launcher.json");
    let FileContent = JSON.parse(fs.readFileSync(FilePath, { encoding: "utf8" }));
    FileContent.versions = FileContent.versions.filter(x => x.version_extended !== callback);
    fs.writeFileSync(FilePath, JSON.stringify(FileContent, null, 2), "utf8");
}