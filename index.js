const __filename = import.meta.url;
const __dirname = import.meta.url.substring(8, import.meta.url.lastIndexOf("/"));
import AdbElements from "./elements.js";
import Device from "./device.js";
import { spawn, exec } from "child_process";
import path from "path";
const ADB_PATH = path.resolve(__dirname, "platform-tools", "adb.exe");

class ADB {
    default = {
        ip: "127.0.0.1",
        port: "5037",
    };

    ip;
    port;
    serial;
    options;
    errorCount = 0;

    device = {};

    constructor(options = {}) {
        this.options = options;
        this.initialize();
    }

    get ip() {
        return this._ip || this.default.ip;
    }

    set ip(address) {
        this._ip = address;
        return this._ip;
    }

    get port() {
        return this._port || this.default.port;
    }

    set port(port) {
        this._port = port;
        return this._port;
    }

    async devices() {
        const resp = await this.send("devices");
        if (!resp.includes("List of devices")) return [];
        const lines = resp.split("\n");
        const devices = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (line.includes("device")) devices.push(line.split("\t")[0]);
        }
        this._devices = devices;
        return devices;
    }

    use(deviceSerial) {
        return new Promise((resolve, reject) => {
            if (!this._devices[deviceSerial]) {
                this._devices[deviceSerial] = new Device(this, deviceSerial);
                this._devices[deviceSerial].on("ready", () => resolve(this._devices[deviceSerial]));
            } else {
                resolve(this._devices[deviceSerial]);
            }
        });
    }

    send(cmd) {
        return new Promise((resolve, reject) => {
            const cmdLine = ADB_PATH + ` ${cmd}`;
            //console.log('SEND:', cmdLine);
            exec(cmdLine, (error, stdout, stderr) => {
                if (error) {
                    if (this.errorCount > 5) {
                        this.errorCount = 0;
                        return reject(error);
                    }
                    this.errorCount++;
                    console.log(this.errorCount, "Error executing adb shell:", cmd);

                    return resolve(this.send(cmd));
                }
                this.errorCount = 0;
                resolve(stdout);
            });
        });
    }

    begin(options = {}) {
        let stdoutListener;
        let closeCallback;

        const shellProcess = spawn(`${ADB_PATH}`, ["-s", this.target, "shell"]);

        shellProcess.stdout.on("data", (data) => {
            if (stdoutListener) stdoutListener(data.toString());
        });

        shellProcess.stderr.on("data", (data) => {
            if (stdoutListener) stdoutListener(data.toString());
        });

        shellProcess.on("close", (code) => {
            if (closeCallback) closeCallback(code);
        });

        return {
            listen(fn) {
                stdoutListener = fn;
            },

            send(commands) {
                if (typeof commands === "string") {
                    commands = [commands];
                }

                if (commands) {
                    const command = commands.join("; ");
                    shellProcess.stdin.write(command);
                }
            },

            close(fn) {
                if (fn) {
                    closeCallback = fn;
                }

                shellProcess.stdin.end();
            },
        };
    }

    initialize() {
        const { ip, port } = this.options;

        if (ip) this._ip = ip;
        if (port) this._port = port;
    }
}

export default ADB;
