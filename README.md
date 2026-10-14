# LG U+ MTTL-W01 for Home Assistant

[한국어](README.ko.md)

A Home Assistant app (add-on) that controls LG U+ MTTL-W01 power strips on your own network, without the LG U+ cloud. A dashboard in the Home Assistant sidebar switches the four outlets and shows power, energy and temperature, and a settings page manages firmware updates and the MQTT connection. With the Mosquitto broker app installed, the outlets and their sensors also appear in Home Assistant through MQTT discovery.

Each power strip needs the custom firmware 1.0.111, installed once with the PC tool. The [install guide](docs/install.md) covers the app and the power strips. App versions are calendar versions `<YY>.<M>.<N>` (for example `26.10.0`); the standalone backend version the app uses is in `description` in [mttl_w01/config.yaml](mttl_w01/config.yaml).

Home Assistant installs the app from the [ha-apps](https://github.com/kkqq9320/ha-apps) app repository as a prebuilt image; this repository holds its code and documents.

This is an unofficial project, not affiliated with LG U+ or 투오.

![Dashboard in demo mode, dark theme](docs/images/dashboard.jpg)

## Supported systems

- Home Assistant OS, or another installation that runs apps, on amd64 or aarch64 (for example Home Assistant Green and Raspberry Pi). aarch64 has not been tested on real hardware yet.
- LG U+ MTTL-W01 power strips.

## Quick start

1. Add the app repository `https://github.com/kkqq9320/ha-apps` to Home Assistant with [this link](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fkkqq9320%2Fha-apps), or add it under **Settings → Apps → Install app → ⋮ → Repositories**.
2. Install **LG U+ Multitap (MTTL-W01)**.
3. On the app's **Info** tab, turn on **Watchdog** and **Show in sidebar**.
4. Start the app.
5. Open **MTTL-W01** in the sidebar.

Then install the firmware on each power strip and connect it, as described in [Prepare the power strips](docs/install.md#prepare-the-power-strips).

There is no login. Changes work only in the Home Assistant sidebar, which Home Assistant's login protects, and port 18282 is for viewing and downloading. See [Access and screen lock](docs/install.md#access-and-screen-lock).

## Credits

This app is built on the standalone backend, custom firmware, PC tool and Android setup app made by 투오 of the [Naver HA Cafe](https://cafe.naver.com/koreassistant/24088). Its dashboard adapts the layout and CSS of [af950833's dashboard](https://github.com/af950833/mttl_w01). [NOTICE.md](NOTICE.md) lists the files that come from 투오, which of them are modified, and why.

## License

The code and documents written for this repository are under the [MIT License](LICENSE). 투오's files and the parts adapted from af950833 belong to their authors, as described in [NOTICE.md](NOTICE.md).
