# Home Assistant용 LG U+ MTTL-W01 앱

[English](README.md)

LG U+ MTTL-W01 멀티탭용 투오 standalone 백엔드를 실행하는 Home Assistant 앱(애드온)이다. 멀티탭은 LG U+ 클라우드 대신 집 네트워크 안에서 Home Assistant에 접속한다. Home Assistant 사이드바의 대시보드에서 콘센트 네 개를 켜고 끄며 전력, 누적 사용량, 온도를 본다. Mosquitto broker 앱이 설치되어 있으면 콘센트와 센서가 MQTT 자동 등록(discovery)으로 Home Assistant에도 나타난다.

멀티탭마다 투오 펌웨어 1.0.111을 투오 PC 도구로 한 번 설치해야 한다. 앱과 멀티탭 준비는 [설치 안내](docs/install.ko.md)에 있다. 앱 판 번호는 투오 백엔드 판 뒤에 포장 판을 붙인 것이다([mttl_w01/config.yaml](mttl_w01/config.yaml)의 `version`).

LG U+나 투오와 관계없는 비공식 프로젝트다.

![예시 모드의 대시보드, 다크 테마](docs/images/dashboard.jpg)

## 지원 환경

- 앱을 실행할 수 있는 Home Assistant(Home Assistant OS 등), amd64 또는 aarch64(예: Home Assistant Green, 라즈베리 파이). aarch64는 아직 실기에서 확인하지 않았다.
- LG U+ MTTL-W01 멀티탭.

## 빠른 시작

1. [이 링크](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fkkqq9320%2Fha-lgu-mttl-w01)로 이 저장소를 Home Assistant에 추가한다. 또는 **설정(Settings) → 앱(Apps) → 앱 설치(Install app) → ⋮ → 저장소(Repositories)**에 `https://github.com/kkqq9320/ha-lgu-mttl-w01`을 넣는다.
2. **LG U+ Multitap (MTTL-W01)**을 설치한다.
3. 앱의 **정보(Info)** 탭에서 **Watchdog**과 **사이드바에 표시(Show in sidebar)**를 켠다.
4. 앱을 시작한다.
5. 사이드바에서 **MTTL-W01**을 연다.

그다음 [멀티탭 준비](docs/install.ko.md#멀티탭-준비)에 따라 멀티탭마다 펌웨어를 설치하고 연결한다.

로그인은 없다. 같은 네트워크에서 18282 포트에 닿는 사람은 누구나 콘센트를 켜고 끌 수 있고, 대시보드의 화면 잠금은 실수로 누르는 것만 막는다. [접근과 화면 잠금](docs/install.ko.md#접근과-화면-잠금)을 본다.

## 출처

이 앱은 투오의 standalone 백엔드, PC 도구, 안드로이드 설정 앱 위에 만들었다. 대시보드는 [af950833 대시보드](https://github.com/af950833/mttl_w01)의 배치와 CSS를 가져와 고쳐 썼다. 투오에게서 온 파일, 그중 고쳐 쓴 파일과 그 이유는 [NOTICE.md](NOTICE.md)에 있다.

## 라이선스

이 저장소를 위해 쓴 코드와 문서는 [MIT 라이선스](LICENSE)를 따른다. 투오의 파일과 af950833에서 가져온 부분은 원저작자의 것이며, [NOTICE.md](NOTICE.md)에 적었다.
