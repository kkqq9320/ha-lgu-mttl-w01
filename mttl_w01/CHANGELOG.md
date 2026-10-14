# Changelog

## 26.10.0

- First release of this app. It packages the standalone backend 0.2.11-r3 by 투오 of the Naver HA Cafe for Home Assistant, with firmware 1.0.111.
- The web UI opens from the Home Assistant sidebar through Ingress. Port 8080 is still published as 18282 for direct LAN access.
- New start page: a dashboard with device cards, a theme selector and an English/Korean switch. A **HIDDEN DEVICES** section at the bottom shows hidden devices again or deletes their history for good.
- New settings page (**SETTINGS** in the top bar) for the firmware target version, OTA server, firmware files and update jobs, the polling interval and the Home Assistant MQTT connection. It replaces 투오's original page.
- New device window (**DEVICE SETTINGS** on each device card) for the firmware update, voltage and RSSI measurement and the Child Lock re-read.
- No login. Changes are accepted only through the Home Assistant sidebar; port 18282 is for viewing and downloading. See [Access and screen lock](https://github.com/kkqq9320/ha-lgu-mttl-w01/blob/main/docs/install.md#access-and-screen-lock).
- `host_ip` is optional. When it is empty, the app takes the IPv4 address of the primary network interface from the Supervisor.
- Installs as a prebuilt image for amd64 and aarch64 (`ghcr.io/kkqq9320/mttl_w01`). Add the app repository `https://github.com/kkqq9320/ha-apps` to Home Assistant.
- The MQTT service is optional (`mqtt:want`): the app starts without MQTT variables when no broker is available.
- Fixes a hang in 투오's backend: saving the MQTT settings while connected to the broker never finished, and the Home Assistant integration stayed disconnected until the app restarted.
- In Home Assistant, power shows one decimal place and energy two, and the temperature and voltage sensors are listed under Diagnostic.

# 변경 기록

## 26.10.0

- 이 앱의 첫 판입니다. 네이버 HA 카페 투오님의 standalone 백엔드 0.2.11-r3(펌웨어 1.0.111)을 Home Assistant용으로 포장했습니다.
- Ingress로 Home Assistant 사이드바에서 웹 화면을 엽니다. 8080 포트는 LAN 직접 접속용으로 18282에 그대로 연결합니다.
- 첫 화면을 기기 카드, 테마 선택, 영어·한국어 전환이 있는 대시보드로 바꿨습니다. 맨 아래의 **HIDDEN DEVICES** 구역에서 숨긴 기기를 다시 표시하거나 기록을 완전히 삭제합니다.
- 설정 페이지(위쪽 막대의 **SETTINGS**)에서 목표 펌웨어, OTA server, 펌웨어 파일과 업데이트 작업, 읽기 주기, Home Assistant MQTT 연결을 설정합니다. 투오님의 원래 화면을 대신합니다.
- 기기 창(기기 카드의 **DEVICE SETTINGS**)에서 펌웨어 업데이트, 전압·RSSI 측정, Child Lock 다시 읽기를 합니다.
- 로그인은 없습니다. 변경은 Home Assistant 사이드바에서만 받고, 18282 포트는 보기와 내려받기만 됩니다. [접근과 화면 잠금](https://github.com/kkqq9320/ha-lgu-mttl-w01/blob/main/docs/install.ko.md#접근과-화면-잠금)을 참고하세요.
- `host_ip`는 선택 사항입니다. 비우면 Supervisor가 알려 주는 기본 네트워크 인터페이스의 IPv4 주소를 씁니다.
- amd64와 aarch64용 미리 빌드한 이미지(`ghcr.io/kkqq9320/mttl_w01`)로 설치됩니다. Home Assistant에는 앱 저장소 `https://github.com/kkqq9320/ha-apps`를 추가합니다.
- MQTT 서비스는 필수가 아닙니다(`mqtt:want`). 브로커가 없으면 MQTT 변수 없이 시작합니다.
- 투오님 백엔드의 멈춤을 고쳤습니다. 브로커에 연결된 동안 MQTT 설정을 저장하면 저장이 끝나지 않았고, 앱을 다시 시작할 때까지 Home Assistant 연동이 끊긴 채로 남았습니다.
- Home Assistant에서 전력은 소수 첫째 자리, 에너지는 소수 둘째 자리까지 보이고, 온도와 전압 센서는 진단(Diagnostic)으로 분류됩니다.
