import axios from "axios";
import path from "path";
import fs from "fs";

import * as log from "./log.js";
import * as xmpp from "./xmpp.js";
import * as backend from "./backend.js";

// ik this isnt the best but whatever.
global.access_token = "";

export async function MakeAuthRequest(code) {
    const { data } = await axios.post(
        "https://api.v2.prod.lunarfn.org/auth/api/launcher/auth-request",
        { code }
    );

    if (data.success) {
        log.info("Pre Login Success on Backend!");
        SaveToDisk(data);
        return data;
    }

    return false
}

export async function AutoLogin() {
    const { success, accountId, email, password } = await LoadFromDisk();

    if (success) {
        const bIsOK = await CheckLogin(accountId, email, password);

        if (bIsOK) {
            log.info(`Successfully checked login for: ${accountId}`);
            return { success, accountId, email, password }
        } else {
            // idk if we really need this cuz at the end it also returns false but whatever
            return false;
        }
    }

    return false;
}

export async function CheckLogin(accountId, email, password) {
    const { data } = await axios.post("https://api.v2.prod.lunarfn.org/auth/api/launcher/verify-login", {
        accountId,
        email,
        password
    });

    if (data.success) {
        return true;
    }

    return false;
}

export async function LoginToBackend() {
    log.info("Trying to login to Backend..");
    const { email, password } = LoadFromDisk();

    const credentials = await axios.post("https://api.v2.prod.lunarfn.org/account/api/oauth/token", {
        grant_type: "client_credentials",
        token_type: "eg1"
    }, {
        headers: {
            "Authorization": `basic: ${Buffer.from("client_id:launcher_v3_arisavurr-awvr777").toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded"
        }
    }
    ).catch((err) => console.log(err));

    if (credentials.data.access_token) {
        const token = await axios.post("https://api.v2.prod.lunarfn.org/account/api/oauth/token",
            { grant_type: "password", username: email, password, includePerms: true, token_type: "eg1" },
            {
                headers: {
                    "Authorization": `basic: ${Buffer.from("client_id:launcher_v3_arisavurr-awvr777").toString("base64")}`,
                    "Content-Type": "application/x-www-form-urlencoded"
                }
            }
        ).catch((err) => console.log(err));

        if (token.data.access_token) {
            global.access_token = token.data.access_token;
            log.info(`Successfully logged into backend!`);
            //xmpp.Login(); // not perfect but must be enough (fails to kill on vantage)
            return token.data.access_token;
        }
    }
}

export function SaveToDisk(accountInfo) {
    const LocalPath = path.join(process.env.LOCALAPPDATA, "LunarFN");
    const FilePath = path.join(LocalPath, "account.json");
    const FileData = JSON.stringify(accountInfo, null, 2);

    if (!fs.existsSync(LocalPath)) fs.mkdirSync(LocalPath, { recursive: true });
    fs.writeFileSync(FilePath, FileData, "utf8");
}

export function LoadFromDisk() {
    const LocalPath = path.join(process.env.LOCALAPPDATA, "LunarFN");
    const FilePath = path.join(LocalPath, "account.json");

    try {
        const FileContent = fs.readFileSync(FilePath);
        if (FileContent) return JSON.parse(FileContent);
    } catch {
        try {
            if (!fs.existsSync(LocalPath)) fs.mkdirSync(LocalPath)
            if (!fs.existsSync(FilePath)) fs.writeFileSync(FilePath, JSON.stringify({ accountId: "" }, null, 2), "utf8")
        } catch (err) {
            log(`[Auth] Error while trying to load account information from disk: ${err}`);
        }
    }

    return { accountId: "" }
}

export async function Logoff() {
    const LocalPath = path.join(process.env.LOCALAPPDATA, "LunarFN");
    const FilePath = path.join(LocalPath, "account.json");

    try {
        fs.writeFileSync(FilePath, JSON.stringify({ accountId: "" }, null, 2), "utf8");
        return true;
    } catch (err) {
        log.error(`Could not logoff: error ${err}`);
    }

    return false;
}