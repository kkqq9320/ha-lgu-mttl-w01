"""Container entrypoint: turn the app options and Supervisor data into environment variables and run the 투오 backend."""

import asyncio
import http.client
import ipaddress
import json
import os
import runpy
import signal
import sys
import urllib.request
from collections.abc import Callable, Mapping

WEB_HOST_PORT = 18282
BACKEND_ARGS = ["/app/backend.py", "--data", "/data"]


def log(message: str) -> None:
    print(f"[run] {message}", file=sys.stderr, flush=True)


def load_options(path: str = "/data/options.json") -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def supervisor_get(token: str | None, url: str, timeout: float = 10.0) -> dict | None:
    """GET a Supervisor API URL and return the response's `data` object, or None after logging a warning.

    Response bodies are never logged: the MQTT service response contains a password.
    """
    if not token:
        log(f"warning: SUPERVISOR_TOKEN is not set, skipping {url}")
        return None
    request = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.load(response)
    except (OSError, http.client.HTTPException) as e:
        log(f"warning: request to {url} failed: {e!r}")
        return None
    except ValueError as e:
        # UnicodeDecodeError.__repr__ embeds the whole response bytes, so log only the type.
        log(f"warning: response from {url} could not be decoded: {type(e).__name__}")
        return None
    if not isinstance(payload, dict) or payload.get("result") != "ok":
        detail = (f"{payload.get('result')} {payload.get('message', '')}".strip()
                  if isinstance(payload, dict) else type(payload).__name__)
        log(f"warning: {url} did not return ok: {detail}")
        return None
    data = payload.get("data")
    if not isinstance(data, dict):
        log(f"warning: {url} response has no data object")
        return None
    return data


def fetch_mqtt_service(token: str | None, url: str = "http://supervisor/services/mqtt",
                       timeout: float = 10.0) -> dict | None:
    data = supervisor_get(token, url, timeout)
    if data is None:
        return None
    if not data.get("host"):
        log("warning: MQTT service response has no host")
        return None
    return data


def pick_primary_ipv4(network: dict) -> str | None:
    """Return the IPv4 address of the first primary, connected interface in a Supervisor network info."""
    interfaces = network.get("interfaces")
    if not isinstance(interfaces, list):
        return None
    for interface in interfaces:
        if not isinstance(interface, dict) or not (interface.get("primary") and interface.get("connected")):
            continue
        ipv4 = interface.get("ipv4")
        addresses = ipv4.get("address") if isinstance(ipv4, dict) else None
        if isinstance(addresses, list) and addresses and isinstance(addresses[0], str):
            return addresses[0].split("/")[0]
        return None
    return None


def fetch_host_ip(token: str | None, url: str = "http://supervisor/network/info",
                  timeout: float = 10.0) -> str | None:
    data = supervisor_get(token, url, timeout)
    if data is None:
        return None
    host_ip = pick_primary_ipv4(data)
    if host_ip is None:
        log("warning: no primary connected interface with an IPv4 address in the network info")
    return host_ip


def _check_ipv4(value: object, origin: str) -> str:
    # IPv4Address(int) accepts integers, so only strings are passed on.
    if isinstance(value, str):
        try:
            ipaddress.IPv4Address(value)
        except ValueError:
            pass
        else:
            return value
    raise ValueError(f"host_ip {origin} is not an IPv4 address: {value!r}")


def _configured_host_ip(options: dict) -> object:
    value = options.get("host_ip")
    return None if value in (None, "") else value


def resolve_host_ip(options: dict, detect: Callable[[], str | None]) -> str:
    """Return the host_ip option if set, otherwise the detected address. Raises ValueError if neither is usable."""
    configured = _configured_host_ip(options)
    if configured is not None:
        return _check_ipv4(configured, "option")
    detected = detect()
    if detected is None:
        raise ValueError("host_ip is not set and could not be detected from Supervisor; "
                         "set host_ip in the app configuration to the IPv4 address of the Home Assistant machine")
    return _check_ipv4(detected, "detected from Supervisor")


def build_env(host_ip: str, options: dict, mqtt: dict | None, base_env: Mapping[str, str]) -> dict[str, str]:
    env = dict(base_env)
    env["OTA_HOST_IP"] = host_ip
    env["MTTL_PUBLIC_WEB_URL"] = f"http://{host_ip}:{WEB_HOST_PORT}"
    env["LOG_LEVEL"] = options.get("log_level") or "INFO"
    if mqtt:
        env["HA_MQTT_HOST"] = str(mqtt["host"])
        env["HA_MQTT_PORT"] = str(mqtt.get("port") or 1883)
        env["HA_MQTT_USERNAME"] = str(mqtt.get("username") or "")
        env["HA_MQTT_PASSWORD"] = str(mqtt.get("password") or "")
        env["HA_MQTT_TLS"] = "true" if mqtt.get("ssl") else "false"
    return env


def _cancel_all_tasks() -> None:
    for task in asyncio.all_tasks():
        task.cancel()


def _stop_backend(signum: int, frame: object) -> None:
    """SIGTERM handler: cancel every task of the backend's event loop so that asyncio.run() ends after the backend's cleanup.

    Cancelling only the main task, as Ctrl-C does, hangs while a power strip is connected: since Python
    3.12.1, a cancelled Server.serve_forever() waits for every client connection to close. Cancelling the
    connection handlers too lets them close their connections. Outside the event loop, stop like Ctrl-C.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        raise KeyboardInterrupt from None
    loop.call_soon_threadsafe(_cancel_all_tasks)


def run_backend(env: Mapping[str, str]) -> None:
    """Run the backend script in this process so that SIGTERM reaches _stop_backend."""
    os.environ.update(env)
    sys.argv = list(BACKEND_ARGS)
    sys.path.insert(0, os.path.dirname(BACKEND_ARGS[0]))
    signal.signal(signal.SIGTERM, _stop_backend)
    try:
        runpy.run_path(BACKEND_ARGS[0], run_name="__main__")
    except (KeyboardInterrupt, asyncio.CancelledError):
        log("backend stopped")


def main() -> None:
    token = os.environ.get("SUPERVISOR_TOKEN")
    try:
        options = load_options()
        host_ip = resolve_host_ip(options, lambda: fetch_host_ip(token))
    except (OSError, ValueError) as e:
        log(f"app configuration error, not starting the backend: {e}")
        sys.exit(1)
    source = "app option" if _configured_host_ip(options) is not None else "auto-detected from Supervisor"
    log(f"host_ip {host_ip} ({source})")
    mqtt = fetch_mqtt_service(token)
    env = build_env(host_ip, options, mqtt, os.environ)
    log(f"starting backend: OTA host {host_ip}, web {env['MTTL_PUBLIC_WEB_URL']}, "
        f"MQTT {env.get('HA_MQTT_HOST', 'none')}")
    run_backend(env)


if __name__ == "__main__":
    main()
