import axios from "axios";
import download from "download";
import path from "path";
import fs from "fs";
import * as Sentry from "@sentry/electron";
import * as cprocess from "child_process";

import * as log from "./log.js";

export async function InstallUpdate(updateVersion) {
    const FilePath = path.join(process.env.LOCALAPPDATA, "LunarFN/update");
    const TargetFile = path.join(FilePath, `Lunar-${updateVersion}.exe`);

    try {
        fs.rmdirSync(FilePath, { recursive: true, force: true });
    } catch (err) {
        log.error(`[Versioncheck] Could not delete update dir or user never installed an update before.\n ${err} <- not reported to sentry!`);
    }
    try {
        fs.mkdirSync(FilePath);
    } catch (err) {
        Sentry.captureException(`MKDIR ERROR: ${err}`);
    }

    await download("https://cdn.lunarfn.org/LunarInstaller.exe", FilePath, { filename: `Lunar-Update-${updateVersion}.exe` })
        .then(() => log.info("Downloaded new Update!"))
        .catch((err) => {
            throw new Error(`Download Error: ${err}`);
        });

    cprocess.spawn(TargetFile, { cwd: FilePath, detached: true });
    setTimeout(() => process.exit(0), 500);

    console.log("DEV: INSTALL UPDATE ->", updateVersion)
}