import axios from "axios";
import download from "download";
import path from "path";
import fs from "fs";
import * as Sentry from "@sentry/electron"

import * as log from "./log.js";
import * as auth from "./auth.js";

export function getEXC(url) {
    const protocol = "lunarfn://";
    const code = url.substring(protocol.length);
    return code.replace(/\/$/, '');
}

export async function DeeplinkAuth(url) {
    const code = getEXC(url);
    const { data } = await axios.post(
        "https://api.v2.prod.lunarfn.org/auth/api/launcher/auth-request",
        { code }
    );

    if (data.success) {
        log.info("Successfully logged in over Deeplink!");
        auth.SaveToDisk(data);
    }
}

export function encodeXMPPAuth(accountId, token) {
    const dataString = `\u0000${accountId}\u0000${token}`;
    return Buffer.from(dataString).toString('base64');
}

export function isPidRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

export async function downloadWithRetry(file, retries, gamePath, bIsRevert) {
    const FinalDestination = path.join(gamePath + file.filePath);

    for (let i = 0; i < retries; i++) {
        try {
            await download(bIsRevert ? file.originalFile : file.fileUrl, FinalDestination, { filename: file.fileName });
            log.info(`Successfully downloaded and replaced ${file.fileName}`);
            return;
        } catch (err) {
            if (err.code === 'EBUSY' && i < retries - 1) {
                log.warn(`Retrying download: ${file.fileName}, attempt ${i + 1}`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
                log.error(err);
                Sentry.captureException(`Download Failed: ${err}`);
            }
        }
    }
}

export function ClearLauncherData() {
    const LocalPath = path.join(process.env.LOCALAPPDATA, "LunarFN");
    const launcher = path.join(LocalPath, "launcher.json");
    const logs = path.join(LocalPath, "logs");

    try {
        fs.rmdirSync(logs, { maxRetries: 5 });
        fs.rmSync(launcher, { maxRetries: 5 });
    } catch (err) {
        if (err !== "EBUSY") Sentry.captureException(`Clear Launcher Data Error: ${err}`);
    }
}