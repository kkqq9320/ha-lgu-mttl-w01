# LG U+ Multitap (MTTL-W01)

Korean follows English. 한국어 설명은 영어 설명 뒤에 있다.

This app runs Tuo's standalone backend for LG U+ MTTL-W01 power strips. The power strips connect to Home Assistant over your own network instead of the LG U+ cloud. A dashboard in the Home Assistant sidebar switches the four outlets and shows power, energy and temperature, and a settings page manages firmware updates and the MQTT connection.

## What you need

- LG U+ MTTL-W01 power strips with Tuo's firmware 1.0.111, installed once with Tuo's PC tool.
- Optional: the Mosquitto broker app. With it, the outlets and their sensors also appear in Home Assistant through MQTT discovery.

The [install guide](https://github.com/kkqq9320/ha-lgu-mttl-w01/blob/main/docs/install.md) covers installing the app, preparing the power strips and troubleshooting.

## Credits

- Tuo made the standalone backend, the PC provisioning tool and the Android setup app that this app runs and redistributes.
- The dashboard adapts the layout and CSS of [af950833's dashboard](https://github.com/af950833/mttl_w01).
- The icon and logo use the `power-socket-de` icon of Material Design Icons (Apache License 2.0).
- [NOTICE.md](https://github.com/kkqq9320/ha-lgu-mttl-w01/blob/main/NOTICE.md) lists the files that come from Tuo, the changes made to them, and the licenses.

This is an unofficial project, not affiliated with LG U+ or Tuo.

# LG U+ 멀티탭 (MTTL-W01)

이 앱은 LG U+ MTTL-W01 멀티탭용 투오 standalone 백엔드를 실행한다. 멀티탭은 LG U+ 클라우드 대신 집 네트워크 안에서 Home Assistant에 접속한다. Home Assistant 사이드바의 대시보드에서 콘센트 네 개를 켜고 끄며 전력, 누적 사용량, 온도를 보고, 설정 페이지에서 펌웨어 업데이트와 MQTT 연결을 관리한다.

## 필요한 것

- 투오 펌웨어 1.0.111을 투오 PC 도구로 한 번 설치한 LG U+ MTTL-W01 멀티탭.
- 선택: Mosquitto broker 앱. 있으면 콘센트와 센서가 MQTT 자동 등록(discovery)으로 Home Assistant에도 나타난다.

앱 설치, 멀티탭 준비, 문제 해결은 [설치 안내](https://github.com/kkqq9320/ha-lgu-mttl-w01/blob/main/docs/install.ko.md)에 있다.

## 출처

- 이 앱이 실행하고 다시 배포하는 standalone 백엔드, PC 설정 도구, 안드로이드 설정 앱은 투오(Tuo)가 만들었다.
- 대시보드는 [af950833 대시보드](https://github.com/af950833/mttl_w01)의 배치와 CSS를 가져와 고쳐 썼다.
- 아이콘과 로고는 Material Design Icons의 `power-socket-de` 아이콘(Apache License 2.0)을 쓴다.
- 투오에게서 온 파일, 고친 내용, 라이선스는 [NOTICE.md](https://github.com/kkqq9320/ha-lgu-mttl-w01/blob/main/NOTICE.md)에 있다.

LG U+나 투오와 관계없는 비공식 프로젝트다.
