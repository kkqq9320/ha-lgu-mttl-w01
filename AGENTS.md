# ha-lgu-mttl-w01 저장소 지침

LG U+ MTTL-W01 멀티탭을 투오 standalone 백엔드로 Home Assistant에서 로컬 운영하는 HA 앱(add-on)을 담는 공개 저장소다.

## 투오 코드 관리

- 가지는 `main`과 `tuo` 두 개다. 투오 배포본 원본은 `tuo` 가지에만 커밋하고, 판마다 `tuo-<투오 백엔드 판>-r<배포 번호>` 태그를 붙인다. 예: `tuo-0.2.11-r3`.
- 우리가 고친 투오 파일은 `main`에서 직접 커밋하고 `NOTICE.md`의 "Modified" 목록에 파일과 이유를 적는다.
- 원본과의 차이는 `git diff tuo main -- mttl_w01/backend`로 본다.
- 투오 새 판 반영 순서
  1. `tuo` 가지에 원본을 커밋하고 태그를 붙인다.
  2. `main`에 `tuo`를 병합한다.
  3. `NOTICE.md`의 "Modified" 목록을 병합 결과와 맞춘다.
  4. `mttl_w01/config.yaml`의 `description`에 적힌 백엔드 판(`based on Tuo standalone <판>`)을 바꾸고, `version`을 새 날짜 판으로 바꾼다.
- 앱 판 번호는 `<연도 두 자리>.<월>.<순번>` 형식이다. 예: `26.10.0`, 같은 달 다음 판 `26.10.1`, 다음 달 첫 판 `26.11.0`. 월 앞에 0을 붙이지 않는다. 한 번 게시한 판 번호는 다시 쓰지 않는다. 앱이 쓰는 투오 백엔드 판은 `config.yaml`의 `description`(`based on Tuo standalone <판>`)에 적는다.

## 저장소에 넣지 않는 것

- LG 펌웨어 파일(`.fwr`)
- 집 네트워크 주소(사설 IP 대역 등 개인 네트워크 정보). 막는 문자열은 `tests/test_repo_hygiene.py`가 정한다.
- 인수인계 파일, 조사 기록, 개인 PC 경로

시험 자료와 문서 예시에는 문서용 주소 `192.0.2.0/24`와 가짜 MAC(`0a1b2c3d4e5f` 등)만 쓴다.

## 코드 규칙

- `mttl_w01/run.py`, `tools/`, `tests/`의 Python은 표준 라이브러리만 쓴다. `mttl_w01/run.py`는 앱 컨테이너의 Python 3.12 문법 안에서 쓴다.
- 대시보드는 빌드 단계, 외부 패키지, 외부 CDN·글꼴 없이 동작한다. HA는 인터넷 없이도 쓸 수 있어야 한다.
- 웹 파일의 경로는 상대 경로만 쓴다. Ingress 주소 밑에서도 열려야 하기 때문이다.
- 기기에서 온 문자열은 `textContent`로만 화면에 넣는다. `innerHTML`은 쓰지 않는다.
- 줄바꿈은 LF다. `.gitattributes`가 정한다.

## 문서와 화면 언어

- 사용자 문서는 영어 파일과 한국어 `*.ko.md` 짝으로 둔다.
- `DOCS.md`, `NOTICE.md`, `CHANGELOG.md`는 한 파일에 영어를 먼저, 한국어를 뒤에 쓴다.
- `run.py` 로그는 영어로 쓰고 줄 앞에 `[run]`을 붙인다.
- 대시보드는 EN/KR 전환을 지원한다.
- `AGENTS.md`(이 파일)는 관리자용이므로 한국어로 쓴다.

## 시험

```bash
python -m unittest discover -s tests -v
node --test "tests/js/*.test.mjs"
```

`node --test`의 경로는 따옴표로 감싼 글롭으로 쓴다. 디렉터리를 인자로 주면 Node 24에서 실패한다.

## 로컬 시험

릴리스 전에 Home Assistant에서 로컬 빌드로 확인한다. Git Bash에서 실행한다. PowerShell 파이프는 바이너리를 바꿀 수 있다.

```bash
python tools/pack_local_app.py | ssh <HA SSH 호스트> 'sudo tar -C /addons --no-same-owner -xf -'
```

- `tools/pack_local_app.py`는 `mttl_w01/`을 `mttl_w01/` 이름으로 묶는다. `config.yaml`의 `image:` 줄을 주석으로 바꿔 HA가 이미지를 받지 않고 빌드하게 한다. HA에서는 슬러그 `local_mttl_w01`로 보인다.
- 로컬 시험판은 MQTT 서비스(`services:` 블록)도 주석으로 바꿔 MQTT 없이 돈다. 빈 DB의 로컬 앱이 같은 MQTT `unique_id`로 에너지 값을 보내면, 본 앱으로 돌아갈 때 HA 에너지 통계에 계량기 초기화와 큰 사용량이 기록될 수 있기 때문이다. MQTT 연동을 바꾼 판은 릴리스 뒤 본 앱 업데이트로 확인한다.
- `--keep-mqtt`는 로컬 앱이 실제 운영 앱일 때만 쓴다.
- 이미지 빌드 맥락은 `mttl_w01/`이다. `Dockerfile`이 복사하는 `NOTICE.md`, `LICENSE`는 저장소 최상위에 있어, 빌드 전에 사본을 `mttl_w01/`에 넣는다. GitHub Actions workflow와 이 스크립트가 넣고, 사본은 `.gitignore`에 있다.
- 로컬 앱과 본 앱은 같은 호스트 포트를 쓴다. 시험하는 동안 본 앱을 멈추고, 끝나면 로컬 앱을 멈추고 본 앱을 다시 시작한다.
