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
  4. `mttl_w01/config.yaml`의 `version`을 올린다.
- 앱 판 번호는 `<투오 백엔드 판>-<우리 판>` 형식이다. 예: `0.2.11-1`. 투오 백엔드를 바꾸지 않고 포장만 고치면 뒤 번호만 올린다.

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
