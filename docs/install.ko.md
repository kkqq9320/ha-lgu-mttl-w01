# 설치 안내

[English](install.md)

이 안내의 주소는 예시다. `192.0.2.10` 자리에는 자기 Home Assistant 기기의 주소를 쓴다.

## 앱 설치

1. 저장소를 추가한다. [이 링크](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fkkqq9320%2Fha-lgu-mttl-w01)를 열거나, **설정(Settings) → 앱(Apps) → 앱 설치(Install app)**에서 **⋮** 메뉴의 **저장소(Repositories)**를 골라 `https://github.com/kkqq9320/ha-lgu-mttl-w01`을 추가한다.
2. 앱 스토어에서 **LG U+ Multitap (MTTL-W01)**을 찾아 설치한다.
3. 앱의 **정보(Info)** 탭에서 **Watchdog**을 켠다. 상태 검사가 실패하면 Home Assistant가 앱을 다시 시작한다. **사이드바에 표시(Show in sidebar)**도 켠다.
4. **시작(Start)**을 누른다. 앱의 **로그(Log)** 탭에 멀티탭이 접속할 주소가 `[run] host_ip 192.0.2.10 (auto-detected from Supervisor)`처럼 나온다. 멀티탭이 이 주소에 닿지 않으면 **구성(Configuration)** 탭에서 `host_ip`를 넣고([옵션](../mttl_w01/DOCS.md#옵션)) 앱을 다시 시작한다.
5. 사이드바에서 **MTTL-W01**을 연다. 이 사이드바 메뉴는 Home Assistant 관리자에게 보인다. 앱 화면의 **웹 UI 열기(Open web UI)**도 같은 화면을 연다.

같은 화면이 Home Assistant 기기의 18282 포트에서도 열린다(예: `http://192.0.2.10:18282`). 같은 네트워크의 휴대폰과 다른 컴퓨터는 이 주소를 쓴다.

### MQTT

Mosquitto broker 앱이 설치되어 있으면 앱이 시작할 때 그 접속 정보를 백엔드에 넘기고, 멀티탭이 MQTT 자동 등록(discovery)으로 Home Assistant에 나타난다. 브로커가 없으면 MQTT 없이 시작한다. 대시보드의 **Home Assistant MQTT** 카드가 연결 상태를 보인다. 나중에 브로커 설정을 바꾸는 방법은 [MQTT가 연결되지 않을 때](#mqtt가-연결되지-않을-때)에 있다.

## 접근과 화면 잠금

앱에는 로그인이 없다. 대신 다음 장치를 둔다.

- **화면 잠금.** 대시보드는 열 때마다 잠긴 상태로 시작하고, 잠긴 동안에는 값만 보인다. 위쪽 막대의 **Unlock**을 누르면 콘센트 켜기·끄기, 이름 바꾸기, 잠금(child lock) 설정, 새로고침, 기기 숨기기를 할 수 있고, **Lock**을 누르면 다시 잠긴다. 화면 잠금은 실수로 누르는 것을 막는 장치이고 보안 장치가 아니다. 화면을 연 사람은 누구나 풀 수 있고, 투오 설정 화면(**Settings**)에는 화면 잠금이 없다.
- **요청 헤더.** 무언가를 바꾸는 요청(POST, PUT)은 `X-MTTL-Request: 1` 헤더가 있어야 하고, 없으면 백엔드가 403으로 거절한다. 다른 사이트의 웹 페이지는 이 헤더를 붙여 앱에 보낼 수 없다. 대시보드, 로그 화면, 투오 설정 화면은 이 헤더를 붙인다. API를 부르는 스크립트도 붙여야 한다.
- **주소 이름 검사.** 18282 포트에서 POST와 PUT은 화면을 IP 주소, `localhost`, `.local`로 끝나는 이름으로 열었을 때만 된다. 예: `http://192.0.2.10:18282`, `http://homeassistant.local:18282`. 다른 이름으로 열면 값은 보이지만 모든 조작이 403(`host not allowed`)으로 실패한다. `homeassistant` 같은 한 단어 이름, `ha.lan`이나 `ha.home.arpa` 같은 공유기 DNS 이름, 리버스 프록시 뒤의 자기 도메인이 모두 여기에 든다. 이 검사는 나쁜 웹 페이지가 자기 도메인을 Home Assistant 주소로 돌리는 DNS 리바인딩을 막는다. 사이드바 화면은 Home Assistant 로그인이 보호하므로 언제나 조작할 수 있다.

남는 위험: 같은 네트워크에서 18282 포트에 닿는 사람은 누구나 콘센트를 켜고 끄고, 멀티탭에 펌웨어를 설치하고, MQTT 설정을 바꿀 수 있다. 조회(GET)는 주소 이름을 검사하지 않으므로 DNS 리바인딩 페이지도 기기 목록과 로그를 읽을 수 있다. 둘 다 암호는 담지 않는다. 10086, 18282, 49217 포트는 집 네트워크 밖으로 열지 않는다.

## 멀티탭 준비

멀티탭마다 투오 펌웨어 1.0.111과 Home Assistant 주소가 필요하다. 투오 PC 도구가 한 번 실행으로 둘 다 처리한다. PC에서 펌웨어를 만들고, 멀티탭의 설정용 Wi-Fi로 설치한 뒤, 집 Wi-Fi와 Home Assistant 주소를 멀티탭에 저장한다. 멀티탭은 한 대씩 진행한다. 펌웨어 판과 도구의 자세한 내용은 투오의 [펌웨어 문서](tuo/docs/FIRMWARE_AND_PROVISIONING.md)(영어)에 있다.

### 준비물

- PC 도구: 대시보드의 **PC 도구 내려받기**로 받아 압축을 푼다.
- Wi-Fi가 있고 Python 3이 설치된 PC. 도구는 Windows, macOS, Linux에서 동작한다.
- 처음 실행할 때 PC의 인터넷 연결. 도구가 제조사 펌웨어 1.0.105를 내려받아 SHA-256을 확인하고 도구 폴더에 둔다. 내려받기에 실패하면 펌웨어 1.0.105나 LG U+ 1.0.66의 원본 파일(`.fwr`)을 도구 폴더에 넣는다.
- PC의 TCP 80 포트가 비어 있어야 한다. 도구가 이 포트로 펌웨어를 내보낸다. Windows에서는 관리자 권한으로 실행하고(임시 방화벽 규칙도 이때 더한다), macOS와 Linux에서는 `sudo`로 실행한다.
- 멀티탭이 붙을 2.4GHz, WPA2 보안의 Wi-Fi. 네트워크 이름은 32바이트까지이고, 이름과 암호 모두 `:`를 쓸 수 없다.
- 멀티탭이 접속할 Home Assistant 주소: 앱 로그의 `host_ip`([앱 설치](#앱-설치)의 4단계).

### 설정 모드로 바꾸기

전원 버튼을 주황 LED가 빠르게 깜빡일 때까지 약 10초 누른다. 그러면 멀티탭이 `TONLY_TAP_` 뒤에 짧은 부호가 붙은 이름의 Wi-Fi를 연다. 암호는 `LGU_` 뒤에 같은 부호를 붙인 것이다. 도구가 이 네트워크를 찾아 PC를 연결한다. 연결하지 못하면 직접 `TONLY_TAP_…`에 연결하고 Enter를 누르라고 안내한다.

### PC 도구 실행

도구 폴더(`mttl_setup.py`가 있는 폴더)에서 관리자 권한 터미널을 열고 다음을 실행한다.

```text
python mttl_setup.py install --version 111
```

대부분의 macOS와 Linux처럼 Python 3의 이름이 `python3`이면 `python` 대신 `python3`을 쓴다. Windows에서는 `INSTALL_WINDOWS.bat`이 같은 설치를 실행하고 관리자 권한도 스스로 요청한다.

도구가 하는 일:

1. 펌웨어 1.0.111을 만들고 SHA-256을 확인한다.
2. Home Assistant 주소(`Backend IPv4`)와 집 Wi-Fi 이름·암호를 묻는다.
3. PC를 멀티탭의 `TONLY_TAP_…` 네트워크에 연결한다.
4. PC의 TCP 80 포트로 펌웨어를 설치하고 멀티탭이 다시 켜지기를 기다린다.
5. Home Assistant 주소와 집 Wi-Fi를 멀티탭에 저장한다.
6. 멀티탭이 `http://<Home Assistant 주소>:18282/api/devices`에 온라인으로 나타나기를 기다린다.

도구가 펌웨어는 설치됐지만 설정(provisioning)이 남았다고 알리며 끝나면(종료 코드 3), 5단계의 설정이 저장되지 않은 것이다. 멀티탭을 다시 설정 모드로 바꾸고 `python mttl_setup.py provision-up`(Windows는 `PROVISION_UP_WINDOWS.bat`)을 실행한다. 펌웨어는 다시 설치하지 않는다. 도구는 실행할 때마다 `logs` 폴더에 기록을 남긴다.

### 결과 확인

PC 도구는 멀티탭이 온라인이 되는지만 확인하고 펌웨어 판은 확인하지 않는다. 대시보드의 멀티탭 카드에서 이름 아래 줄에 MAC 주소와 `FW 1.0.111`이 나오는지 본다.

## 펌웨어 되돌리기

멀티탭이 아직 설정 모드로 들어가면, PC 도구로 투오의 다른 두 펌웨어 프로필을 같은 방법으로 설치할 수 있다.

```text
python mttl_setup.py install --version 110
python mttl_setup.py install --version 66
```

1.0.110은 잠금(child lock)이 없는 투오의 로컬 백엔드용 펌웨어이고, 1.0.66은 LG U+ 순정 호환 펌웨어다. 이 판의 멀티탭은 TCP 80 포트로만 펌웨어를 받는데 앱은 이 포트를 열지 않으므로, 1.0.111로 돌아갈 때도 PC 도구를 쓴다.

## 문제 해결

투오 설정 화면(대시보드의 **Settings**, 이어서 **⚙ 설정**)은 한국어다. 아래 단계는 화면의 이름을 그대로 적는다.

### Home Assistant 주소가 바뀌었을 때

멀티탭은 접속할 Home Assistant 주소를 저장해 둔다. 주소가 바뀌면 다음을 한다.

1. 앱을 다시 시작한다. `host_ip`를 비워 두었으면 앱이 새 주소를 찾고, 넣어 두었으면 `host_ip`를 고친다.
2. [앱에서 펌웨어 교체가 시작되지 않을 때](#앱에서-펌웨어-교체가-시작되지-않을-때)에 따라 펌웨어 내려받기 주소를 바꾼다.
3. 멀티탭마다 [설정 모드](#설정-모드로-바꾸기)로 바꾸고 `python mttl_setup.py provision-up`(Windows는 `PROVISION_UP_WINDOWS.bat`)을 실행해 새 주소를 넣는다. 펌웨어는 다시 설치하지 않는다.

공유기에서 Home Assistant 기기에 고정 주소(DHCP 예약)를 주면 주소가 바뀌지 않는다.

### 앱에서 펌웨어 교체가 시작되지 않을 때

멀티탭은 대시보드 **펌웨어** 카드의 **OTA server** 주소에서 펌웨어를 받는다. 백엔드는 이 주소를 처음 시작할 때만 `host_ip`에서 가져오고 그 뒤로는 저장한 값을 쓴다. 바꾸려면 **⚙ 설정 → 펌웨어 관리**의 **UP OTA 다운로드 서버 IPv4**에 주소를 넣고 **목표/OTA 주소 저장**을 누른다.

펌웨어 1.0.110이나 1.0.66의 멀티탭은 앱에서 교체할 수 없다. [펌웨어 되돌리기](#펌웨어-되돌리기)를 본다.

### MQTT가 연결되지 않을 때

백엔드는 브로커를 찾은 첫 시작 때 Mosquitto 접속 정보를 한 번 저장하고, 그 뒤로는 저장한 설정을 쓴다.

- 이 앱보다 Mosquitto broker 앱을 나중에 설치했으면 이 앱을 다시 시작한다. 투오 설정 화면에서 MQTT 설정을 저장한 적이 없을 때만 된다.
- 다른 브로커 설정을 쓰려면 **⚙ 설정 → Home Assistant MQTT**에서 **HA 연동 사용**을 켜고 브로커 주소(Mosquitto broker 앱은 `core-mosquitto`), 포트, 사용자 이름(**MQTT ID**), 암호를 넣은 뒤 **저장 / 연결**을 누른다. **연결 테스트**로 연결을 시험한다.
