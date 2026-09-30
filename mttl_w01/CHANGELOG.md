# Changelog

## 0.2.11-1

- First release of this app. It packages the Tuo standalone backend 0.2.11-r3 for Home Assistant, with firmware 1.0.111.
- The web UI opens from the Home Assistant sidebar through Ingress. Port 8080 is still published as 18282 for direct LAN access.
- New start page: a dashboard with device cards, a theme selector and an English/Korean switch. Tuo's original page is still available for firmware and MQTT settings.
- No login. Changes are accepted only through the Home Assistant sidebar; port 18282 is for viewing and downloading. See [Access and screen lock](https://github.com/kkqq9320/ha-lgu-mttl-w01/blob/main/docs/install.md#access-and-screen-lock).
- `host_ip` is optional. When it is empty, the app takes the IPv4 address of the primary network interface from the Supervisor.
- Supports amd64 and aarch64.
- The MQTT service is optional (`mqtt:want`): the app starts without MQTT variables when no broker is available.

# 변경 기록

## 0.2.11-1

- 이 앱의 첫 판이다. 투오 standalone 백엔드 0.2.11-r3(펌웨어 1.0.111)을 Home Assistant용으로 포장했다.
- Ingress로 Home Assistant 사이드바에서 웹 화면을 연다. 8080 포트는 LAN 직접 접속용으로 18282에 그대로 연결한다.
- 첫 화면을 기기 카드, 테마 선택, 영어·한국어 전환이 있는 대시보드로 바꿨다. 펌웨어와 MQTT 설정은 투오 원래 화면에서 한다.
- 로그인은 없다. 변경은 Home Assistant 사이드바에서만 받고, 18282 포트는 보기와 내려받기만 된다. [접근과 화면 잠금](https://github.com/kkqq9320/ha-lgu-mttl-w01/blob/main/docs/install.ko.md#접근과-화면-잠금)을 본다.
- `host_ip`는 선택 사항이다. 비우면 Supervisor가 알려 주는 기본 네트워크 인터페이스의 IPv4 주소를 쓴다.
- amd64와 aarch64를 지원한다.
- MQTT 서비스는 필수가 아니다(`mqtt:want`). 브로커가 없으면 MQTT 변수 없이 시작한다.
