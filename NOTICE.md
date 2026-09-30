# Notice / 출처 표기

## Tuo / 투오

Tuo released custom firmware 1.0.111 for the LG U+ MTTL-W01 together with the MTTL-W01 UP Standalone package: a standalone backend, a PC provisioning tool and an Android setup app. The tools build the firmware on the user's own machine from the manufacturer's firmware image. This app runs Tuo's standalone backend, redistributes the PC tool and the Android app that come with it, and draws heavily on Tuo's work, including the documents kept in [docs/tuo](docs/tuo/README.md).

투오(Tuo)는 LG U+ MTTL-W01용 커스텀 펌웨어 1.0.111을 MTTL-W01 UP Standalone 묶음과 함께 공개했다. 묶음에는 standalone 백엔드, PC 설정 도구, 안드로이드 설정 앱이 들어 있다. 펌웨어는 이 도구들이 제조사 펌웨어 이미지로 사용자 기기에서 만든다. 이 앱은 투오의 standalone 백엔드를 실행하고, 백엔드에 함께 든 PC 도구와 안드로이드 앱을 다시 배포하며, [docs/tuo](docs/tuo/README.md)에 둔 문서를 비롯한 투오의 작업물을 많이 참고했다.

Tuo's release is kept unchanged on the `tuo` branch, with one tag per release (for example `tuo-0.2.11-r3`). The two lists below cover every file on that branch except `.gitattributes`.

투오 배포본 원본은 `tuo` 가지에 그대로 두고, 배포본마다 태그를 붙인다(예: `tuo-0.2.11-r3`). 아래 두 목록은 그 가지의 파일 중 `.gitattributes`를 뺀 전부다.

## Unmodified Tuo files / 그대로 쓴 투오 파일

These files are the same as on the `tuo` branch. `provision.zip` is the PC tool and `provision-android.apk` is the Android setup app.

이 파일들은 `tuo` 가지의 원본과 같다. `provision.zip`은 PC 도구, `provision-android.apk`는 안드로이드 설정 앱이다.

- `docs/tuo/README.md`
- `docs/tuo/RELEASE_NOTES.md`
- `docs/tuo/VERSION.txt`
- `docs/tuo/docs/BACKEND_0.2.10_CLEANUP_2026-09-16.md`
- `docs/tuo/docs/BACKEND_0.2.11_REGRESSION_AUDIT_2026-09-17.md`
- `docs/tuo/docs/BACKEND_0.2.9_RESILIENCE_SCENARIOS_2026-09-16.md`
- `docs/tuo/docs/FIRMWARE_AND_PROVISIONING.md`
- `docs/tuo/docs/FIRMWARE_ENDPOINT_PROFILES.md`
- `docs/tuo/docs/FIRMWARE_LPS_PATCH_FEASIBILITY_2026-09-17.md`
- `docs/tuo/docs/HARDWARE_IDENTIFICATION.md`
- `docs/tuo/docs/OPERATIONS.md`
- `docs/tuo/docs/TECHNICAL_DESIGN.md`
- `docs/tuo/docs/WIFI_BLACKOUT_FW66_LPS_EVIDENCE_2026-09-17.md`
- `docs/tuo/docs/WIFI_BLACKOUT_ROOT_CAUSE_2026-09-16.md`
- `mttl_w01/backend/.env.example`
- `mttl_w01/backend/CONTROL_CONCURRENCY.md`
- `mttl_w01/backend/Dockerfile`
- `mttl_w01/backend/README.md`
- `mttl_w01/backend/backup_manager.py`
- `mttl_w01/backend/backup_restore.sh`
- `mttl_w01/backend/deploy.sh`
- `mttl_w01/backend/docker-compose.yaml`
- `mttl_w01/backend/firmware_manager.py`
- `mttl_w01/backend/firmware_patch.py`
- `mttl_w01/backend/ha_bridge.py`
- `mttl_w01/backend/requirements.txt`
- `mttl_w01/backend/static/mttl-up-card.js`
- `mttl_w01/backend/static/provision-android.apk`
- `mttl_w01/backend/static/provision.zip`

## Modified Tuo files / 고쳐 쓴 투오 파일

`git diff tuo main -- <path>` shows each change.

바뀐 내용은 `git diff tuo main -- <경로>`로 본다.

- `mttl_w01/backend/backend.py` — No admin login: `AuthManager.valid()` is always true and `status()` reports every request as signed in. POST and PUT need the `X-MTTL-Request: 1` header, so that pages on other sites cannot send them, and are accepted only through the Home Assistant sidebar (from the Supervisor, `172.30.32.2`), so that other devices on the network can neither change settings nor obtain the stored MQTT password by pointing the MQTT connection test at their own address. `X-Frame-Options` is `SAMEORIGIN` instead of `DENY` so that the page opens in the Home Assistant sidebar. The route table serves our dashboard at `/` and `/dashboard.html`, Tuo's page at `/tuo.html`, our log page at `/logs.html` and `/logview.html`, and our scripts and stylesheet; Tuo's `/logs.js` route is removed. / 관리자 로그인 제거: `AuthManager.valid()`는 항상 참이고 `status()`는 모든 요청을 로그인한 상태로 답한다. POST와 PUT은 다른 사이트의 페이지가 보내지 못하도록 `X-MTTL-Request: 1` 헤더가 있어야 하고, 같은 네트워크의 다른 기기가 설정을 바꾸거나 MQTT 연결 시험을 자기 주소로 돌려 저장된 MQTT 암호를 받아 가지 못하도록 Home Assistant 사이드바(Supervisor `172.30.32.2`)로 온 것만 받는다. Home Assistant 사이드바 안에서 열리도록 `X-Frame-Options`를 `DENY`에서 `SAMEORIGIN`으로 바꿨다. 경로표는 `/`와 `/dashboard.html`에 우리 대시보드, `/tuo.html`에 투오 화면, `/logs.html`과 `/logview.html`에 우리 로그 화면, 그리고 우리 스크립트와 스타일시트를 준다. 투오 `/logs.js` 경로는 뺐다.
- `mttl_w01/backend/static/app.js` — API paths are relative so that they work under the Ingress address, and `api()` adds the `X-MTTL-Request: 1` header. / Ingress 주소 밑에서 동작하도록 API 경로를 상대 경로로 바꿨고, `api()`가 `X-MTTL-Request: 1` 헤더를 붙인다.
- `mttl_w01/backend/static/index.html` — Relative links for Ingress: `app.js`, `logs.html`, `provision.zip`, `provision-android.apk` and `mttl-up-card.js`. / Ingress용 상대 경로: `app.js`, `logs.html`, `provision.zip`, `provision-android.apk`, `mttl-up-card.js`.
- `mttl_w01/backend/static/logs.html` — Relative links for Ingress: `logs.js` and `./`. The backend no longer serves this file. / Ingress용 상대 경로: `logs.js`, `./`. 백엔드는 이제 이 파일을 내보내지 않는다.
- `mttl_w01/backend/static/logs.js` — Relative paths for Ingress: `api/logs` and `./`. The backend no longer serves this file. / Ingress용 상대 경로: `api/logs`, `./`. 백엔드는 이제 이 파일을 내보내지 않는다.

## af950833

af950833 wrote a local server and an Android setup app for the MTTL-W01, published at <https://github.com/af950833/mttl_w01>. The dashboard of this app adapts the layout and CSS of af950833's dashboard. Each entry below names what was taken and the file of ours that holds it.

af950833은 MTTL-W01용 로컬 서버와 안드로이드 설정 앱을 <https://github.com/af950833/mttl_w01>에 공개했다. 이 앱의 대시보드는 af950833 대시보드의 배치와 CSS를 가져와 고쳐 썼다. 아래 항목마다 가져온 것과 그것을 담은 우리 파일을 적는다.

- `web/index.html`, `web/style.css` → `mttl_w01/backend/static/dashboard.html`, `mttl_w01/backend/static/dashboard.css` — Dashboard layout and CSS. The log page (`logview.html`) uses the same stylesheet. / 대시보드 배치와 CSS. 로그 화면(`logview.html`)도 같은 스타일시트를 쓴다.

## Copyright / 저작권

The MIT License in [LICENSE](LICENSE) covers the code and documents written for this repository, such as `mttl_w01/run.py`, `tools/`, `tests/`, our documents and our dashboard files. It does not cover Tuo's files listed above, modified or not, or the parts of our dashboard adapted from af950833. Their copyright stays with their authors.

[LICENSE](LICENSE)의 MIT 라이선스는 `mttl_w01/run.py`, `tools/`, `tests/`, 우리 문서와 대시보드 파일처럼 이 저장소를 위해 쓴 코드와 문서에 적용된다. 위 목록의 투오 파일(고쳐 쓴 것 포함)과, 우리 대시보드 중 af950833에서 가져온 부분에는 적용되지 않는다. 그 저작권은 원저작자에게 있다.
