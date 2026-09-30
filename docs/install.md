# Install guide

[한국어](install.ko.md)

Addresses in this guide are examples. Use the address of your own Home Assistant machine where `192.0.2.10` appears.

## Install the app

1. Add the repository. Open [this link](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fkkqq9320%2Fha-lgu-mttl-w01), or go to **Settings → Apps → Install app**, open the **⋮** menu, choose **Repositories** and add `https://github.com/kkqq9320/ha-lgu-mttl-w01`.
2. Find **LG U+ Multitap (MTTL-W01)** in the app store and install it.
3. On the app's **Info** tab, turn on **Watchdog**, so that Home Assistant restarts the app when its health check fails. Turn on **Show in sidebar** as well.
4. Select **Start**. The app's **Log** tab shows the address the power strips will connect to, for example `[run] host_ip 192.0.2.10 (auto-detected from Supervisor)`. If the power strips cannot reach that address, set `host_ip` on the **Configuration** tab ([options](../mttl_w01/DOCS.md#options)) and restart the app.
5. Open **MTTL-W01** in the sidebar. Home Assistant shows this sidebar entry to administrators. **Open web UI** on the app page opens the same page.

The same page is also served on port 18282 of the Home Assistant machine, for example `http://192.0.2.10:18282`, for phones and other computers on your network. There it is for viewing and downloading only; see [Access and screen lock](#access-and-screen-lock).

### MQTT

If the Mosquitto broker app is installed, the app passes its connection details to the backend when it starts, and the power strips appear in Home Assistant through MQTT discovery. Without a broker the app starts without MQTT. The **Home Assistant MQTT** card on the dashboard shows the connection state. To change the broker settings later, see [MQTT is not connected](#mqtt-is-not-connected).

## Access and screen lock

The app has no login. Changes are accepted only through the Home Assistant sidebar:

- **Sidebar.** Switching outlets, renaming, the child lock, firmware updates and the MQTT settings work only in **MTTL-W01** in the sidebar, or through **Open web UI** on the app page. Home Assistant's own login protects this page. Any change (POST or PUT) that does not come through the Home Assistant Supervisor gets 403 (`changes are only accepted through the Home Assistant sidebar`).
- **Port 18282.** `http://192.0.2.10:18282` is for viewing and downloading. The dashboard there shows **VIEW ONLY** in place of **Unlock**, and the log page has no **Clear buffer**. Tuo's settings page opens there as well, but saving fails with the same 403. The APK download from the QR code, the PC tool's connection check and the link on each power strip's device page in Home Assistant only read, so they work on this port.
- **Screen lock.** In the sidebar the dashboard opens locked every time. Select **Unlock** in the top bar to switch outlets, rename, set the child lock, refresh or hide a device, and **Lock** to lock it again. The screen lock prevents accidental presses and is not a security measure. Tuo's settings page (**Settings**) has no screen lock.
- **Request header.** A change must also carry the header `X-MTTL-Request: 1`, which a web page on another site cannot send. The dashboard, the log page and Tuo's settings page add it.

What remains open: anyone on the same network who can reach port 18282 can read the device list, the power values and the logs, and download the APK, the PC tool and the firmware files. None of these responses contains a password. Keep ports 10086, 18282 and 49217 within your own network.

Tuo's own documents ([docs/tuo](tuo/README.md) and [mttl_w01/backend/README.md](../mttl_w01/backend/README.md)) describe Tuo's standalone deployment, which has an admin login. This app removes that login and follows the rules above.

## Prepare the power strips

Each power strip needs Tuo's firmware 1.0.111 and the address of Home Assistant. Tuo's PC tool does both in one run: it builds the firmware on your PC, installs it over the power strip's setup Wi-Fi, and then stores your Wi-Fi network and the Home Assistant address on the power strip. Do one power strip at a time. Tuo's [firmware notes](tuo/docs/FIRMWARE_AND_PROVISIONING.md) describe the firmware versions and the tool in detail.

### What you need

- The PC tool: select **Download PC tool** on the dashboard and unzip the file.
- A PC with Wi-Fi and Python 3. The tool runs on Windows, macOS and Linux.
- Internet access on the PC for the first run. The tool downloads the manufacturer's firmware 1.0.105, checks its SHA-256 and keeps it in the tool folder. If the download fails, put an exact copy of firmware 1.0.105 or LG U+ 1.0.66 (`.fwr`) in the tool folder instead.
- TCP port 80 free on the PC, because the tool serves the firmware on it. Run the tool as administrator on Windows, where it also adds a temporary firewall rule, or with `sudo` on macOS and Linux.
- A 2.4 GHz Wi-Fi network with WPA2 security for the power strip. The network name can be up to 32 bytes, and neither the name nor the password may contain `:`.
- The Home Assistant address that the power strips will connect to: the `host_ip` from the app log (step 4 of [Install the app](#install-the-app)).

### Put the power strip in setup mode

Hold the power button for about 10 seconds, until the orange LED blinks quickly. The power strip then opens its own Wi-Fi network named `TONLY_TAP_` followed by a short code. Its password is `LGU_` followed by the same code. The tool looks for this network and connects the PC to it. If it cannot, it asks you to connect to `TONLY_TAP_…` yourself and press Enter.

### Run the PC tool

Open a terminal as administrator in the tool folder, the folder that contains `mttl_setup.py`, and run:

```text
python mttl_setup.py install --version 111
```

Use `python3` instead of `python` where that is the name of Python 3, as on most macOS and Linux systems. On Windows, `INSTALL_WINDOWS.bat` runs the same installation and asks for administrator rights itself.

The tool:

1. builds firmware 1.0.111 and checks its SHA-256,
2. asks for the Home Assistant address (`Backend IPv4`) and the name and password of your Wi-Fi network,
3. connects the PC to the power strip's `TONLY_TAP_…` network,
4. installs the firmware from TCP port 80 of the PC and waits for the power strip to restart,
5. stores the Home Assistant address and your Wi-Fi network on the power strip,
6. waits for the power strip to come online at `http://<Home Assistant address>:18282/api/devices`.

If the tool reports that the firmware is installed but provisioning is pending (exit code 3), the settings of step 5 were not stored. Put the power strip in setup mode again and run `python mttl_setup.py provision-up` (on Windows, `PROVISION_UP_WINDOWS.bat`). Do not install the firmware again. The tool keeps a log of each run in its `logs` folder.

### Check the result

The PC tool checks that the power strip comes online, but not which firmware it runs. Check the power strip's card on the dashboard: the line under the name shows the MAC address followed by `FW 1.0.111`.

## Roll back the firmware

While the power strip still enters setup mode, the PC tool installs Tuo's other two firmware profiles the same way:

```text
python mttl_setup.py install --version 110
python mttl_setup.py install --version 66
```

1.0.110 is Tuo's local-backend firmware without child lock, and 1.0.66 is the LG U+ stock-compatible firmware. Power strips on these versions download firmware over TCP port 80 only, which the app does not publish, so moving them back to 1.0.111 also takes the PC tool.

## Troubleshooting

Tuo's settings page (**Settings** on the dashboard, then **⚙ 설정**) is in Korean. Open it from the sidebar, the only place where it can save. The steps below quote its labels as they appear.

### The Home Assistant address changed

Each power strip stores the Home Assistant address it connects to. After the address changes:

1. Restart the app. With `host_ip` left empty, the app detects the new address; otherwise change `host_ip`.
2. Change the firmware download address as described in [Firmware updates from the app do not start](#firmware-updates-from-the-app-do-not-start).
3. For each power strip, enter [setup mode](#put-the-power-strip-in-setup-mode) and run `python mttl_setup.py provision-up` (on Windows, `PROVISION_UP_WINDOWS.bat`) with the new address. The firmware is not installed again.

A DHCP reservation for the Home Assistant machine keeps its address from changing.

### Firmware updates from the app do not start

The power strips download firmware from the address shown as **OTA server** on the dashboard's **Firmware** card. The backend takes this address from `host_ip` at its first start only and keeps it afterwards. To change it, open **⚙ 설정 → 펌웨어 관리**, enter the address in **UP OTA 다운로드 서버 IPv4** and select **목표/OTA 주소 저장**.

Power strips on firmware 1.0.110 or 1.0.66 cannot update from the app; see [Roll back the firmware](#roll-back-the-firmware).

### MQTT is not connected

The backend stores the Mosquitto connection details once, at the first start that finds a broker, and keeps its stored settings afterwards.

- If the Mosquitto broker app was installed after this app, restart this app. This works while no MQTT settings have been saved in Tuo's settings page.
- To use other broker settings, open **⚙ 설정 → Home Assistant MQTT**, turn on **HA 연동 사용**, enter the broker address (`core-mosquitto` for the Mosquitto broker app), port, user name (**MQTT ID**) and password, and select **저장 / 연결**. **연결 테스트** tests the connection.
