# LG U+ Multitap (MTTL-W01)

Korean follows English. 한국어 설명은 영어 설명 뒤에 있다.

This app runs Tuo's standalone backend for LG U+ MTTL-W01 power strips. Installing the app, preparing the power strips and troubleshooting are covered in the [install guide](https://github.com/kkqq9320/ha-lgu-mttl-w01/blob/main/docs/install.md).

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
| 8080/tcp | 18282 | Web UI and API for direct access from your network. The PC tool's connection check, the device page link and the QR code for the Android setup app use port 18282. |
| 10080/tcp | 49217 | Firmware download (OTA) for firmware 1.0.111, which tries port 49217 first and then port 80. |

Keep the default host ports. The Home Assistant sidebar reaches the web UI through Ingress and does not use port 18282.

## Access

There is no login. The dashboard opens with its controls locked; **Unlock** in the top bar enables them. This screen lock prevents accidental presses and is not a security measure.

On port 18282, controls work only when the page is opened by an IP address, `localhost` or a name ending in `.local`. Opened by any other name, such as `homeassistant`, `ha.lan` or a domain behind a reverse proxy, the page is view-only and controls fail with 403. The sidebar always works.

Anyone on your network who can reach port 18282 can switch the outlets, install firmware on the power strips and change the MQTT settings. Reading (GET) is not name-checked. Details are in [Access and screen lock](https://github.com/kkqq9320/ha-lgu-mttl-w01/blob/main/docs/install.md#access-and-screen-lock).

# LG U+ 멀티탭 (MTTL-W01)

이 앱은 LG U+ MTTL-W01 멀티탭용 투오 standalone 백엔드를 실행한다. 앱 설치, 멀티탭 준비, 문제 해결은 [설치 안내](https://github.com/kkqq9320/ha-lgu-mttl-w01/blob/main/docs/install.ko.md)에 있다.

## 옵션

### `host_ip`

멀티탭이 접속할 이 Home Assistant 기기의 네트워크 IPv4 주소. 비워 두면 앱이 시작할 때마다 Supervisor에서 기본 네트워크 인터페이스의 주소를 읽어 쓴다. 앱 로그에 `[run] host_ip 192.0.2.10 (auto-detected from Supervisor)`처럼 쓰는 주소가 나온다. Home Assistant에 네트워크 인터페이스가 여럿이고 멀티탭이 감지된 주소에 닿지 않으면 이 옵션을 넣는다.

백엔드는 이 주소를 두 곳에 쓴다.

- 멀티탭이 펌웨어를 받는 주소(OTA server). 백엔드는 처음 시작할 때만 이 값을 가져온다. [앱에서 펌웨어 교체가 시작되지 않을 때](https://github.com/kkqq9320/ha-lgu-mttl-w01/blob/main/docs/install.ko.md#앱에서-펌웨어-교체가-시작되지-않을-때)를 본다.
- Home Assistant 기기 페이지의 멀티탭 링크 `http://<host_ip>:18282`.

### `log_level`

백엔드 로그의 상세 정도: `DEBUG`, `INFO`(기본값), `WARNING`, `ERROR`. `DEBUG`는 문제를 조사할 때만 쓴다. 로그는 앱의 **로그(Log)** 탭과 대시보드의 **Logs** 화면에 나온다.

## 네트워크

| 컨테이너 포트 | 호스트 포트 | 용도 |
|---|---|---|
| 10086/tcp | 10086 | 멀티탭 접속. 펌웨어는 언제나 10086 포트로 접속한다. |
| 8080/tcp | 18282 | 같은 네트워크에서 직접 여는 웹 화면과 API. PC 도구의 접속 확인, 기기 페이지 링크, 안드로이드 설정 앱 QR 코드가 18282 포트를 쓴다. |
| 10080/tcp | 49217 | 펌웨어 1.0.111의 펌웨어 내려받기(OTA). 이 펌웨어는 49217 포트를 먼저 시도하고 다음에 80 포트를 시도한다. |

호스트 포트는 기본값으로 둔다. Home Assistant 사이드바는 Ingress로 웹 화면에 닿으므로 18282 포트를 쓰지 않는다.

## 접근

로그인은 없다. 대시보드는 조작이 잠긴 상태로 열리고, 위쪽 막대의 **Unlock**을 눌러야 조작할 수 있다. 이 화면 잠금은 실수로 누르는 것을 막는 장치이고 보안 장치가 아니다.

18282 포트에서는 화면을 IP 주소, `localhost`, `.local`로 끝나는 이름으로 열었을 때만 조작이 된다. `homeassistant`, `ha.lan`, 리버스 프록시 뒤의 도메인처럼 다른 이름으로 열면 보기만 되고 조작은 403으로 실패한다. 사이드바 화면은 언제나 조작할 수 있다.

같은 네트워크에서 18282 포트에 닿는 사람은 누구나 콘센트를 켜고 끄고, 멀티탭에 펌웨어를 설치하고, MQTT 설정을 바꿀 수 있다. 조회(GET)는 주소 이름을 검사하지 않는다. 자세한 내용은 [접근과 화면 잠금](https://github.com/kkqq9320/ha-lgu-mttl-w01/blob/main/docs/install.ko.md#접근과-화면-잠금)에 있다.
