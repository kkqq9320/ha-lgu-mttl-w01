"""MQTT discovery: display precision and entity category of the sensors."""
import tempfile
import unittest
from pathlib import Path

from test_ha_bridge_reconfigure import MAC, ha_bridge


class OneDeviceStore:
    def setting_get(self, key):
        return None

    def devices(self):
        return [self.device(MAC)]

    def removed_devices(self):
        return []

    def device(self, mac):
        return {
            "mac": MAC, "alias": None, "firmware_version": "1.0.111",
            "channels": [{"selector": n, "name": None} for n in range(1, 5)],
        }


class Manager:
    def diagnostic_view(self, mac):
        return {"voltage_enabled": True, "rssi_enabled": True}

    def childlock_supported(self, device):
        return False


class DiscoveryPayloadTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        bridge = ha_bridge.HAController(OneDeviceStore(), Manager(), Path(tmp.name))
        self.cmps = bridge.discovery_payload(MAC)["components"]

    def test_power_shows_one_decimal(self):
        for key in ["power_total"] + [f"power_{n}" for n in range(1, 5)]:
            self.assertEqual(self.cmps[key]["suggested_display_precision"], 1, key)

    def test_energy_shows_two_decimals(self):
        for key in ["energy_total"] + [f"energy_{n}" for n in range(1, 5)]:
            self.assertEqual(self.cmps[key]["suggested_display_precision"], 2, key)

    def test_temperature_and_voltage_are_diagnostic(self):
        for key in ["voltage"] + [f"temperature_{n}" for n in range(1, 5)]:
            self.assertEqual(self.cmps[key].get("entity_category"), "diagnostic", key)


if __name__ == "__main__":
    unittest.main()
