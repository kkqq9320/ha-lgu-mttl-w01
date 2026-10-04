"""HAController stops its old MQTT client without a deadlock.

Saving the MQTT settings calls reconfigure(), and the backend calls stop() when it shuts down. Both
stop the running paho client: disconnect() makes paho's network thread call on_disconnect, and
loop_stop() joins that thread. The bridge's callbacks take HAController.lock, so the old client must
be stopped while that lock is free.

ha_bridge.py imports paho-mqtt and cryptography, which the tests do not install. It is loaded under
its own module name with stand-ins in sys.modules, so other tests that import backend.py cannot
change the stand-ins it uses.
"""
import base64
import importlib.util
import queue
import sys
import tempfile
import threading
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "mttl_w01" / "backend"
TIMEOUT = 3.0
MAC = "0a1b2c3d4e5f"
BRIDGE_TOPIC = "mttl/bridge/availability"
CLIENTS = []


def _callback_property(name):
    """A paho callback attribute: assigning it takes the client's callback mutex."""
    attr = "_" + name

    def get(self):
        return getattr(self, attr)

    def set_(self, func):
        with self._callback_mutex:
            setattr(self, attr, func)

    return property(get, set_)


class FakeMessageInfo:
    rc = 0

    def wait_for_publish(self, timeout=None):
        return True


class FakePahoClient:
    """The threading of a paho-mqtt 2.1 client started with loop_start().

    Callbacks run on the network thread while it holds the client's callback mutex. disconnect()
    only queues the DISCONNECT packet: the network thread sends it, calls on_disconnect and ends.
    A connection the broker drops also calls on_disconnect, after which the thread keeps running
    to reconnect. loop_stop() joins the network thread without a timeout.
    """

    on_connect = _callback_property("on_connect")
    on_disconnect = _callback_property("on_disconnect")
    on_message = _callback_property("on_message")

    def __init__(self, *args, client_id=None, protocol=None):
        self._callback_mutex = threading.Lock()
        self._on_connect = self._on_disconnect = self._on_message = None
        self._events = queue.Queue()
        self._thread = None
        self.client_id = client_id
        self.calls = []
        self.errors = []
        self.entered = {"on_connect": threading.Event(), "on_disconnect": threading.Event()}
        self.returned = {"on_connect": threading.Event(), "on_disconnect": threading.Event()}
        CLIENTS.append(self)

    def username_pw_set(self, username, password=None):
        pass

    def tls_set(self):
        pass

    def will_set(self, topic, payload, qos=0, retain=False):
        pass

    def connect_async(self, host, port, keepalive):
        self.calls.append(("connect_async", host, port))

    def subscribe(self, topic, qos=0):
        self.calls.append(("subscribe", topic))

    def publish(self, topic, payload=None, qos=0, retain=False):
        self.calls.append(("publish", topic, payload, retain))
        return FakeMessageInfo()

    def loop_start(self):
        self.calls.append(("loop_start",))
        self._thread = threading.Thread(target=self._network_loop, name="fake-paho-network", daemon=True)
        self._thread.start()

    def disconnect(self):
        self.calls.append(("disconnect",))
        self._events.put(("on_disconnect", ({}, 0, None), True))

    def loop_stop(self):
        self.calls.append(("loop_stop",))
        if self._thread is not None:
            self._events.put((None, (), True))
            self._thread.join()

    def network_thread_alive(self):
        return self._thread is not None and self._thread.is_alive()

    # What the broker does, run on the network thread.
    def connack(self):
        self._events.put(("on_connect", ({}, types.SimpleNamespace(is_failure=False), None), False))

    def broker_drop(self):
        self._events.put(("on_disconnect", ({}, 7, None), False))

    def _network_loop(self):
        while True:
            name, args, last = self._events.get()
            if name is not None:
                with self._callback_mutex:
                    callback = getattr(self, "_" + name)
                    self.entered[name].set()
                    if callback is not None:
                        try:
                            callback(self, None, *args)
                        except Exception as e:
                            self.errors.append(e)
                self.returned[name].set()
            if last:
                return


class HookedLock:
    """An RLock that runs `hook` once, holding the lock, when `thread` first enters it."""

    def __init__(self):
        self._lock = threading.RLock()
        self.thread = None
        self.hook = None

    def __enter__(self):
        self._lock.acquire()
        if self.hook is not None and threading.current_thread() is self.thread:
            hook, self.hook = self.hook, None
            hook()
        return self

    def __exit__(self, *exc):
        self._lock.release()


def _stand_ins():
    fernet = types.ModuleType("cryptography.fernet")

    class Fernet:
        def __init__(self, key):
            self.key = key

        @staticmethod
        def generate_key():
            return base64.urlsafe_b64encode(b"0" * 32)

    fernet.Fernet = Fernet
    fernet.InvalidToken = type("InvalidToken", (Exception,), {})
    cryptography = types.ModuleType("cryptography")
    cryptography.fernet = fernet
    client = types.ModuleType("paho.mqtt.client")
    client.Client = FakePahoClient
    client.CallbackAPIVersion = types.SimpleNamespace(VERSION2=2)
    client.MQTTv311 = 4
    client.MQTT_ERR_SUCCESS = 0
    mqtt = types.ModuleType("paho.mqtt")
    mqtt.client = client
    paho = types.ModuleType("paho")
    paho.mqtt = mqtt
    return {
        "cryptography": cryptography, "cryptography.fernet": fernet,
        "paho": paho, "paho.mqtt": mqtt, "paho.mqtt.client": client,
    }


def _load_ha_bridge():
    stand_ins = _stand_ins()
    saved = {name: sys.modules.get(name) for name in stand_ins}
    sys.modules.update(stand_ins)
    try:
        spec = importlib.util.spec_from_file_location("ha_bridge_under_test", BACKEND_DIR / "ha_bridge.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    finally:
        for name, module_ in saved.items():
            if module_ is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = module_
    return module


ha_bridge = _load_ha_bridge()


class FakeStore:
    def __init__(self, settings):
        self.settings = dict(settings)

    def setting_get(self, key):
        return self.settings.get(key)

    def devices(self):
        return []

    def removed_devices(self):
        return []

    def device(self, mac):
        return None


class StopOldClientTest(unittest.TestCase):
    def setUp(self):
        CLIENTS.clear()
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.store = FakeStore({"ha.enabled": "1", "ha.host": "192.0.2.10"})
        self.bridge = ha_bridge.HAController(self.store, None, Path(tmp.name))

    def connect(self):
        """Start the bridge and let the broker accept it. Returns the connected client."""
        self.bridge.reconfigure()
        self.assertEqual(len(CLIENTS), 1)
        client = CLIENTS[0]
        client.connack()
        self.assertTrue(client.returned["on_connect"].wait(TIMEOUT), "on_connect did not return")
        self.assertEqual(client.errors, [])
        self.assertTrue(self.bridge.connected)
        return client

    def offline_timer(self):
        timer = threading.Timer(60, lambda: None)
        timer.daemon = True
        timer.start()
        self.bridge._offline_timers[MAC] = timer
        return timer

    def run_bounded(self, target, lock=None):
        """Run `target` on its own thread and fail if it has not returned within TIMEOUT."""
        errors = []

        def work():
            try:
                target()
            except BaseException as e:
                errors.append(e)

        worker = threading.Thread(target=work, name=f"worker-{target.__name__}", daemon=True)
        if lock is not None:
            lock.thread = worker
        worker.start()
        worker.join(TIMEOUT)
        self.assertFalse(worker.is_alive(), f"{target.__name__}() did not return within {TIMEOUT:.0f} s (deadlock)")
        if errors:
            raise errors[0]

    def assertStopped(self, old):
        self.assertEqual(old.calls[-3:], [("publish", BRIDGE_TOPIC, "offline", True), ("disconnect",), ("loop_stop",)])
        self.assertFalse(old.network_thread_alive())
        self.assertEqual(old.errors, [])

    def test_reconfigure_while_connected(self):
        old = self.connect()
        timer = self.offline_timer()
        self.run_bounded(self.bridge.reconfigure)
        self.assertStopped(old)
        self.assertTrue(timer.finished.is_set())
        self.assertEqual(self.bridge._offline_timers, {})
        self.assertEqual(len(CLIENTS), 2)
        new = CLIENTS[1]
        self.assertIs(self.bridge.client, new)
        self.assertIn(("loop_start",), new.calls)
        self.assertFalse(self.bridge.connected)
        self.assertIsNone(self.bridge.connected_since)
        self.assertIsNone(self.bridge.last_error)

    def test_reconfigure_to_disabled_starts_no_client(self):
        old = self.connect()
        self.store.settings["ha.enabled"] = "0"
        self.run_bounded(self.bridge.reconfigure)
        self.assertStopped(old)
        self.assertEqual(len(CLIENTS), 1)
        self.assertIsNone(self.bridge.client)
        self.assertFalse(self.bridge.connected)

    def test_stop_while_connected(self):
        old = self.connect()
        timer = self.offline_timer()
        self.run_bounded(self.bridge.stop)
        self.assertStopped(old)
        self.assertTrue(timer.finished.is_set())
        self.assertEqual(len(CLIENTS), 1)
        self.assertIsNone(self.bridge.client)
        self.assertFalse(self.bridge.connected)
        # The old client's on_disconnect came after stop() let it go, so it changed nothing.
        self.assertIsNone(self.bridge.last_error)

    def test_reconfigure_while_broker_drops_connection(self):
        """The broker drops the connection just as reconfigure() takes the lock.

        The network thread is then inside on_disconnect, holding paho's callback mutex and
        waiting for HAController.lock.
        """
        old = self.connect()
        lock = HookedLock()
        self.bridge.lock = lock

        def drop():
            old.broker_drop()
            self.assertTrue(old.entered["on_disconnect"].wait(TIMEOUT), "on_disconnect did not start")

        lock.hook = drop
        self.run_bounded(self.bridge.reconfigure, lock)
        self.assertIsNone(lock.hook, "the broker drop was not simulated")
        self.assertStopped(old)
        self.assertEqual(len(CLIENTS), 2)
        self.assertIs(self.bridge.client, CLIENTS[1])
        self.assertIsNone(self.bridge.last_error)


if __name__ == "__main__":
    unittest.main()
