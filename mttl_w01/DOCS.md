# LG U+ Multitap (MTTL-W01)

Korean follows English. 한국어 설명은 영어 설명 뒤에 있습니다.

Installing the app, preparing the power strips, the settings page and device window, and troubleshooting are covered in the [install guide](https://github.com/kkqq9320/ha-lgu-mttl-w01/blob/main/docs/install.md).

## Options

### `host_ip`

The IPv4 address of this Home Assistant machine on your network, which the power strips connect to. Leave it empty to use the address of the primary network interface, which the app reads from the Supervisor at every start. The app log shows the address in use, for example `[run] host_ip 192.0.2.10 (auto-detected from Supervisor)`. Set this option when Home Assistant has several network interfaces and the power strips cannot reach the detected address.

The backend uses this address in two places:

- the address the power strips download firmware from (OTA server). The backend takes it at its first start only; see [Firmware updates from the app do not start](https://github.com/kkqq9320/ha-lgu-mttl-w01/blob/main/docs/install.md#firmware-updates-from-the-app-do-not-start).
- the link on each power strip's device page in Home Assistant, `http://<host_ip>:18282`.

### `log_level`

How much the backend logs: `DEBUG`, `INFO` (default), `WARNING` or `ERROR`. Use `DEBUG` only while troubleshooting. The log appears on the app's **Log** tab and on the dashboard's **Logs** page.

## Network

| Container port | Host port | Use |
|---|---|---|
| 10086/tcp | 10086 | Power strip connection. The firmware always connects to port 10086. |
| 8080/tcp | 18282 | Web UI and API for viewing and downloading from your network. The PC tool's connection check, the device page link and the QR code for the Android setup app use port 18282. |
| 10080/tcp | 49217 | Firmware download (OTA) for firmware 1.0.111, which tries port 49217 first and then port 80. |

Keep the default host ports. The Home Assistant sidebar reaches the web UI through Ingress and does not use port 18282.

## Access

There is no login. Changes work only in the Home Assistant sidebar, which Home Assistant's login protects. Port 18282 is for viewing and downloading: the dashboard there shows **VIEW ONLY**, and anyone on your network who can reach the port can read the device list, the power values and the logs. Details, including the screen lock, are in [Access and screen lock](https://github.com/kkqq9320/ha-lgu-mttl-w01/blob/main/docs/install.md#access-and-screen-lock).

## Credits

- The app runs the standalone backend made by 투오 of the [Naver HA Cafe](https://cafe.naver.com/koreassistant/24088), and redistributes 투오's PC provisioning tool and Android setup app. The custom firmware is also 투오's work.
- The dashboard adapts the layout and CSS of [af950833's dashboard](https://github.com/af950833/mttl_w01).
- The icon and logo use the `power-socket-de` icon of Material Design Icons (Apache License 2.0).
- [NOTICE.md](https://github.com/kkqq9320/ha-lgu-mttl-w01/blob/main/NOTICE.md) lists the files that come from 투오, the changes made to them, and the licenses.

This is an unofficial project, not affiliated with LG U+ or 투오.

# LG U+ 멀티탭 (MTTL-W01)

앱 설치, 멀티탭 준비, 설정 페이지와 기기 창, 문제 해결은 [설치 안내](https://github.com/kkqq9320/ha-lgu-mttl-w01/blob/main/docs/install.ko.md)에 있습니다.

## 옵션

### `host_ip`

멀티탭이 접속할 이 Home Assistant 기기의 네트워크 IPv4 주소입니다. 비워 두면 앱이 시작할 때마다 Supervisor에서 기본 네트워크 인터페이스의 주소를 읽어 씁니다. 앱 로그에 `[run] host_ip 192.0.2.10 (auto-detected from Supervisor)`처럼 쓰는 주소가 나옵니다. Home Assistant에 네트워크 인터페이스가 여럿이고 멀티탭이 감지된 주소에 닿지 않으면 이 옵션을 넣습니다.

백엔드는 이 주소를 두 곳에 씁니다.

- 멀티탭이 펌웨어를 받는 주소(OTA server). 백엔드는 처음 시작할 때만 이 값을 가져옵니다. [앱에서 펌웨어 교체가 시작되지 않을 때](https://github.com/kkqq9320/ha-lgu-mttl-w01/blob/main/docs/install.ko.md#앱에서-펌웨어-교체가-시작되지-않을-때)를 참고하세요.
- Home Assistant 기기 페이지의 멀티탭 링크 `http://<host_ip>:18282`.

### `log_level`

백엔드 로그의 상세 정도: `DEBUG`, `INFO`(기본값), `WARNING`, `ERROR`. `DEBUG`는 문제를 조사할 때만 씁니다. 로그는 앱의 **로그(Log)** 탭과 대시보드의 **Logs** 화면에 나옵니다.

## 네트워크

| 컨테이너 포트 | 호스트 포트 | 용도 |
|---|---|---|
| 10086/tcp | 10086 | 멀티탭 접속. 펌웨어는 언제나 10086 포트로 접속합니다. |
| 8080/tcp | 18282 | 같은 네트워크에서 보기와 내려받기에 쓰는 웹 화면과 API. PC 도구의 접속 확인, 기기 페이지 링크, 안드로이드 설정 앱 QR 코드가 18282 포트를 씁니다. |
| 10080/tcp | 49217 | 펌웨어 1.0.111의 펌웨어 내려받기(OTA). 이 펌웨어는 49217 포트를 먼저 시도하고 다음에 80 포트를 시도합니다. |

호스트 포트는 기본값으로 둡니다. Home Assistant 사이드바는 Ingress로 웹 화면에 닿으므로 18282 포트를 쓰지 않습니다.

## 접근

로그인은 없습니다. 변경은 Home Assistant 로그인이 보호하는 사이드바에서만 됩니다. 18282 포트는 보기와 내려받기용입니다. 이 포트의 대시보드는 **VIEW ONLY**를 보이고, 같은 네트워크에서 이 포트에 닿는 사람은 누구나 기기 목록, 전력 값, 로그를 읽을 수 있습니다. 화면 잠금을 비롯한 자세한 내용은 [접근과 화면 잠금](https://github.com/kkqq9320/ha-lgu-mttl-w01/blob/main/docs/install.ko.md#접근과-화면-잠금)에 있습니다.

## 출처

- 이 앱은 [네이버 HA 카페](https://cafe.naver.com/koreassistant/24088) 투오님이 만든 standalone 백엔드를 실행하고, 투오님의 PC 설정 도구와 안드로이드 설정 앱을 다시 배포합니다. 커스텀 펌웨어도 투오님의 작업입니다.
- 대시보드는 [af950833 대시보드](https://github.com/af950833/mttl_w01)의 배치와 CSS를 가져와 고쳐 썼습니다.
- 아이콘과 로고는 Material Design Icons의 `power-socket-de` 아이콘(Apache License 2.0)을 씁니다.
- 투오님에게서 온 파일, 고친 내용, 라이선스는 [NOTICE.md](https://github.com/kkqq9320/ha-lgu-mttl-w01/blob/main/NOTICE.md)에 있습니다.

LG U+나 투오님과 관계없는 비공식 프로젝트입니다.
