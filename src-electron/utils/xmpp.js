
import Websocket from "ws";
import { js2xml } from "xml-js";
import xmlparser from "xml-parser"
import crypto from "crypto";

import * as log from "./log.js";
import * as auth from "./auth.js";
import * as utils from "./utils.js";

global.friends_online = 0;

export async function Login() {
    const ws = new Websocket("wss://vantage.lunarfn.org", "xmpp");
    const domain = "vantage.lunarfn.org";
    const { accountId, displayName } = auth.LoadFromDisk();

    const sendXML = (json) => {
        const xml = js2xml(json, { compact: true, ignoreComment: true }).replace("/>", " />");
        ws.send(xml);
    };

    ws.on("open", () => {
        sendXML({
            open: {
                _attributes: {
                    xmlns: "urn:ietf:params:xml:ns:xmpp-framing",
                    to: domain,
                    version: "1.0",
                }
            }
        });
    });

    ws.on("message", (raw) => {
        if (Buffer.isBuffer(raw)) raw = raw.toString();
        const msg = xmlparser(raw);

        switch (msg.root.name) {
            case "open": break;
            case "stream:features": {
                if (msg.root.children[4].name === "auth") {
                    sendXML({
                        auth: {
                            _attributes: {
                                xmlns: "urn:ietf:params:xml:ns:xmpp-sasl",
                                mechanism: "PLAIN"
                            },
                            _text: utils.encodeXMPPAuth(accountId, access_token),
                        }
                    });
                } else if (msg.root.children[4].name === "session") {
                    sendXML({
                        iq: {
                            _attributes: {
                                id: "_xmpp_bind1",
                                type: "set"
                            },
                            bind: {
                                _attributes: {
                                    xmlns: "urn:ietf:params:xml:ns:xmpp-bind"
                                },
                                resource: `V2:Fortnite:WIN::${crypto.randomUUID().replace(/-/ig, "").toUpperCase()}`
                            }
                        }
                    })
                }


                break;
            }
            case "success": {
                sendXML({
                    open: {
                        _attributes: {
                            xmlns: "urn:ietf:params:xml:ns:xmpp-framing",
                            to: "vantage.lunarfn.org",
                            version: "1.0"
                        }
                    }
                })
                break;
            }
            case "iq": {
                try {
                    if (msg.root.children[0].name == "bind") {
                        sendXML(
                            {
                                iq: {
                                    _attributes: {
                                        id: '_xmpp_session1',
                                        type: 'set'
                                    },
                                    session: {
                                        _attributes: {
                                            xmlns: "urn:ietf:params:xml:ns:xmpp-session"
                                        }
                                    }
                                }
                            });
                    }
                } catch {
                    if (msg.root.attributes.id === "_xmpp_session1") {
                        log.info(`Logged into XMPP Server as ${displayName}`);
                        setInterval(() => {
                            // Ping XMPP Server
                            sendXML({
                                iq: {
                                    _attributes: {
                                        id: crypto.randomUUID().replace(/-/ig, "").toUpperCase(),
                                        type: "get",
                                        to: domain,
                                        from: `${accountId}@${domain}/V2:Fortnite:WIN::${crypto.randomUUID().replace(/-/ig, "").toUpperCase()}`,
                                    },
                                    ping: {
                                        _attributes: {
                                            xmlns: "urn:xmpp:ping"
                                        }
                                    }
                                }
                            })
                        }, 30 * 1000)

                        sendXML({
                            presence: {
                                _attributes: {
                                    to: `fortnite@muc.${domain}/${displayName}:015a1b35e80325ebf80630e239115663:V2:Fortnite:WIN::3E9E542F467CE471CBCCDBA346EBAE0 `
                                },
                                x: {
                                    _attributes: {
                                        xmlns: "http://jabber.org/protocol/muc",
                                        history: {
                                            _attributes: {
                                                maxstanzas: "50",
                                            },
                                        },
                                    },
                                },
                            },
                        });
                        sendXML({
                            presence: {
                                status: {
                                    content: JSON.stringify({
                                        "Status": "In Launcher",
                                        "bIsPlaying": false,
                                        "bIsJoinable": false,
                                        "bHasVoiceSupport": false,
                                        "SessionId": "",
                                        "Properties": {
                                            "FortBasicInfo_j": {
                                                "homeBaseRating": 0
                                            },
                                            "FortLFG_I": "0",
                                            "FortPartySize_i": 0,
                                            "FortSubGame_i": 0,
                                            "InUnjoinableMatch_b": false,
                                            "party.joininfodata.0_j": {
                                                "sourceId": crypto.randomUUID().replace(/-/ig, ""),
                                                "sourceDisplayName": displayName,
                                                "sourcePlatform": "WIN",
                                                "partyId": crypto.randomUUID().replace(/-/ig, "").toUpperCase(),
                                                "partyTypeId": 0,
                                                "key": crypto.randomUUID().replace(/-/ig, "").toUpperCase(),
                                                "appId": "Fortnite",
                                                "buildId": "0",
                                                "partyFlags": 0,
                                                "notAcceptingReason": 0
                                            }
                                        }
                                    })
                                },
                                delay: {
                                    _attributes: {
                                        stamp: new Date().toISOString(),
                                        xmlns: "urn:xmpp:delay"
                                    }
                                }
                            }
                        });
                    } else {
                        log.info("Pinged XMPP Server.");
                    }
                }
                break;
            }

            case "presence": {
                if (msg.root.children[0].name === "status") {
                    try {
                        const keyv2 = Object.keys(JSON.parse(msg.root.children[0].content).Properties).find((key) => key.startsWith('party.joininfodata'));
                        const info = JSON.parse(msg.root.children[0].content).Properties[keyv2];
                        log.info(`Updated ${info.sourceDisplayName} in internal friend-list.`)
                        if (info.sourceDisplayName) friends_online++;
                    } catch { }
                }
                break;
            }

            default: {
                console.log(msg);
            }
        }
    })

    ws.on("close", (code, reason) => {
        log.warn(`Logged out from XMPP Server: ${code}, ${reason}`);
    });
}