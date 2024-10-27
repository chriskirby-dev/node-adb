import EventEmitter from "events";
import AdbElements from "./elements.js";

class Device extends EventEmitter {
    adb;
    serial;
    paths = {};
    detail = {};

    constructor(adbInstance, deviceSerial) {
        super();
        this.adb = adbInstance;
        this.serial = deviceSerial;
        this.errorCount = 0;
        this.initialize().then(() => this.emit("ready"));
    }

    async getTouchScreenDetail() {
        if (this.touchScreenPath) return this.touchScreenPath;
        const response = await this.send(`-s ${this.serial} shell getevent -lp`);
        const lines = response.split("\n");
        let currentDevice = null;
        for (const line of lines) {
            if (line.includes("add device")) {
                currentDevice = line.match(/\/dev\/input\/event\d+/)[0];
            }
            if (line.includes("ABS_MT_POSITION_X")) {
                this.touchScreenPath = currentDevice;
                const max = line.match(/max \d+/)[0];
                this.touchScreenMax = parseInt(max.match(/\d+/)[0]);
                break;
            }
        }
        return this.touchScreenPath;
    }

    async getScreenResolution() {
        const response = await this.send(`shell wm size`);
        const resolutionMatch = response.match(/(\d+)x(\d+)/);
        return {
            width: parseInt(resolutionMatch[1], 10),
            height: parseInt(resolutionMatch[2], 10),
        };
    }

    async elements(extract = null) {
        const response = await this.send(`exec-out uiautomator dump /dev/tty`);

        if (response.includes("ERROR")) {
            return new Promise((resolve) => {
                setTimeout(() => resolve(this.elements(extract)), 500);
            });
        }

        const adbElements = new AdbElements(response);
        return extract ? adbElements.extract(extract) : adbElements;
    }

    async getCurrentActivity() {
        const output = await this.send("shell \"dumpsys window windows | grep -E 'mCurrentFocus|mFocusedApp'\"");
        const regex = /ActivityRecord{[a-f0-9]+\s+u0\s+([^\/]+)\/([^ ]+)\s+t\d+}/;
        const match = output.match(regex);

        if (match) {
            const packageName = match[1];
            const activityName = match[2];
            return { packageName, activityName };
        }

        return null;
    }

    async sendEvent() {
        const session = this.begin("shell sendevent");
        let data = "";
        session.listen((chunk) => {
            data += chunk;
        });
        return data;
    }

    sendKey(keyCode) {
        const keyCodes = {
            BACK: 4,
            HOME: 3,
        };

        if (keyCodes[keyCode]) {
            keyCode = keyCodes[keyCode];
        }

        return this.send(`shell input keyevent ${keyCode}`);
    }

    longPress(xCoord, yCoord, duration = 250) {
        return this.send(`shell input swipe ${xCoord} ${yCoord} ${xCoord} ${yCoord} ${duration}`);
    }

    tap(xCoord, yCoord) {
        return this.send(`shell input tap ${Math.round(xCoord)} ${Math.round(yCoord)}`);
    }

    sendTouch(x, y, duration = null, callback) {
        const touchScreenPath = this.touchScreenPath;
        const downCommands = [];
        const upCommands = [];

        if (this.data.type === "emulator") {
            downCommands.push(`3 53 ${x}`);
            downCommands.push(`3 54 ${y}`);
            downCommands.push(`0 2 0`);
            downCommands.push(`0 0 0`); // Touch down

            upCommands.push(`0 2 0`);
            upCommands.push(`0 0 0`); // Touch up
            upCommands.push(`0 2 0`);
            upCommands.push(`0 0 0`); // Touch up
        } else {
            downCommands.push(`3 57 1381`);
            downCommands.push(`3 53 ${x}`);
            downCommands.push(`3 54 ${y}`);
            downCommands.push(`1 330 1`); // BTN_DOWN
            downCommands.push(`0 0 0`); // SYN_REPORT

            upCommands.push(`3 57 4294967295`);
            upCommands.push(`1 330 0`);
            upCommands.push(`0 0 0`);
        }

        const downCmd = `shell ${downCommands.map((c) => `${touchScreenPath} ${c}`).join("; ")}`;
        this.send(downCmd);

        const touch = {
            up() {
                const upCmd = `shell ${upCommands.map((c) => `${touchScreenPath} ${c}`).join("; ")}`;
                this.send(upCmd);
                if (callback) callback();
            },
        };

        if (duration) {
            setTimeout(touch.up, duration);
        }

        return touch;
    }

    async send(cmd) {
        const adbCmd = `-s ${this.serial} ${cmd}`;
        return this.adb.send(adbCmd);
    }

    push(src, dst) {
        const adbCmd = `push ${src} ${dst}`;
        return this.send(adbCmd);
    }

    async initialize() {
        await Promise.all([this.getTouchScreenDetail(), this.getScreenResolution()]).then(
            ([touchScreenDetail, screenResolution]) => {
                this.detail = {
                    ...this.detail,
                    touchScreenDetail,
                    screenResolution,
                };
            }
        );
    }
}

export default Device;
