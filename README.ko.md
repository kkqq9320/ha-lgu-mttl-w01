# Home Assistant용 LG U+ MTTL-W01 앱

[English](README.md)

LG U+ MTTL-W01 멀티탭을 LG U+ 클라우드 없이 집 네트워크 안에서 Home Assistant로 제어하는 앱(애드온)입니다. Home Assistant 사이드바의 대시보드에서 콘센트 네 개를 켜고 끄며 전력, 누적 사용량, 온도를 보고, 설정 페이지에서 펌웨어 업데이트와 MQTT 연결을 관리합니다. Mosquitto broker 앱이 설치되어 있으면 콘센트와 센서가 MQTT 자동 등록(discovery)으로 Home Assistant에도 나타납니다.

멀티탭마다 커스텀 펌웨어 1.0.111을 PC 도구로 한 번 설치해야 합니다. 앱과 멀티탭 준비는 [설치 안내](docs/install.ko.md)에 있습니다. 앱 판 번호는 날짜 판 `<YY>.<M>.<N>`(예: `26.10.0`)이고, 앱이 쓰는 standalone 백엔드 판은 [mttl_w01/config.yaml](mttl_w01/config.yaml)의 `description`에 있습니다.

Home Assistant는 [ha-apps](https://github.com/kkqq9320/ha-apps) 앱 저장소를 통해 이 앱을 미리 빌드한 이미지로 설치하고, 이 저장소는 앱의 코드와 문서를 담습니다.

LG U+나 투오님과 관계없는 비공식 프로젝트입니다.

![예시 모드의 대시보드, 다크 테마](docs/images/dashboard.jpg)

## 지원 환경

- 앱을 실행할 수 있는 Home Assistant(Home Assistant OS 등), amd64 또는 aarch64(예: Home Assistant Green, 라즈베리 파이). aarch64는 아직 실기에서 확인하지 않았습니다.
- LG U+ MTTL-W01 멀티탭.

## 빠른 시작

1. [이 링크](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fkkqq9320%2Fha-apps)로 앱 저장소 `https://github.com/kkqq9320/ha-apps`를 Home Assistant에 추가합니다. 또는 **설정(Settings) → 앱(Apps) → 앱 설치(Install app) → ⋮ → 저장소(Repositories)**에 이 주소를 넣습니다.
2. **LG U+ Multitap (MTTL-W01)**을 설치합니다.
3. 앱의 **정보(Info)** 탭에서 **Watchdog**과 **사이드바에 표시(Show in sidebar)**를 켭니다.
4. 앱을 시작합니다.
5. 사이드바에서 **MTTL-W01**을 엽니다.

그다음 [멀티탭 준비](docs/install.ko.md#멀티탭-준비)에 따라 멀티탭마다 펌웨어를 설치하고 연결합니다.

로그인은 없습니다. 변경은 Home Assistant 로그인이 보호하는 사이드바에서만 되고, 18282 포트는 보기와 내려받기만 됩니다. [접근과 화면 잠금](docs/install.ko.md#접근과-화면-잠금)을 참고하세요.

## 출처

이 앱은 [네이버 HA 카페](https://cafe.naver.com/koreassistant/24088) 투오님이 만든 standalone 백엔드, 커스텀 펌웨어, PC 도구, 안드로이드 설정 앱 위에 만들었습니다. 대시보드는 [af950833 대시보드](https://github.com/af950833/mttl_w01)의 배치와 CSS를 가져와 고쳐 썼습니다. 투오님에게서 온 파일, 그중 고쳐 쓴 파일과 그 이유는 [NOTICE.md](NOTICE.md)에 있습니다.

## 라이선스

이 저장소를 위해 쓴 코드와 문서는 [MIT 라이선스](LICENSE)를 따릅니다. 투오님의 파일과 af950833에서 가져온 부분은 원저작자의 것이며, [NOTICE.md](NOTICE.md)에 적었습니다.
