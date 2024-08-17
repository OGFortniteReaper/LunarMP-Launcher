import { LoadFromDisk, LoginToBackend } from "./auth.js"

export async function GetAccount() {
    const { accountId, email, password, displayName, banned, created, success } = LoadFromDisk();
    return {
        access_token: global.access_token
            ? global.access_token
            : await LoginToBackend(),
        online_friends: global.friends_online || 0,
        accountId,
        email,
        password,
        displayName,
        banned,
        created,
        success,
    };
}