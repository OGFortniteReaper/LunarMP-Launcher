import fs from "fs";
import path from "path";
import log from "electron-log"

log.transports.file.resolvePathFn = () => path.join(process.env.LOCALAPPDATA, "LunarFN/logs/launcher.log");

export const setup = () => {
    try {
        fs.rmdirSync(path.join(process.env.LOCALAPPDATA, "LunarFN/logs"), { maxRetries: 5 });
    } catch { }
}

export const info = (str) => log.info(str);
export const warn = (str) => log.warn(str);
export const error = (str) => log.error(str); 