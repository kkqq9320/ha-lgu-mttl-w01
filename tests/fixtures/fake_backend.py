"""종료 구조가 투오 백엔드(backend.py)와 같은 시험용 백엔드.

인자: <DB 경로> <기록 파일 경로> [before-loop]

- asyncio.run 안에서 TCP 서버를 serve_forever로 돌리고 연결 하나를 열어 둔다. 기기가 붙어 있는 상태다.
- SQLite DB를 WAL 모드로 열고 닫지 않은 채 클래스 속성에 둔다. backend.py의 Web.store와 같다.
- 연결 처리와 amain이 정리 단계에 들어가면 기록 파일에 한 줄씩 남긴다.
- 준비가 끝나면 표준 출력에 "ready"를 쓴다. before-loop를 주면 이벤트 루프를 시작하기 전에 쓰고 기다린다.
"""

import asyncio
import sqlite3
import sys
import time

DB_PATH, LOG_PATH = sys.argv[1], sys.argv[2]


class Web:
    store = None


def record(text):
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(text + "\n")


async def handle(reader, writer):
    print("ready", flush=True)
    try:
        await reader.read()
    finally:
        record("connection closed")
        writer.close()


async def amain():
    Web.store = sqlite3.connect(DB_PATH)
    Web.store.execute("PRAGMA journal_mode=WAL")
    Web.store.execute("CREATE TABLE t(x)")
    Web.store.commit()
    srv = await asyncio.start_server(handle, "127.0.0.1", 0)
    device = await asyncio.open_connection("127.0.0.1", srv.sockets[0].getsockname()[1])
    try:
        async with srv:
            await srv.serve_forever()
    finally:
        record("backend cleaned up")
        device[1].close()


if sys.argv[3:] == ["before-loop"]:
    print("ready", flush=True)
    time.sleep(30)
asyncio.run(amain())
