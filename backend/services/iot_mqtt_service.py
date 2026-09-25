"""Module 3: Smart Gym Assistant (AI + IoT Integration Layer).

Implements:
- MQTT broker configuration and non-blocking `paho-mqtt` client connection.
- Abstract & concrete `ESP32GymDeviceInterface` for future physical ESP32/sensor integration.
- Simulated smart gym equipment when physical IoT hardware or MQTT broker is unavailable.
- Live telemetry evaluation: equipment status, resistance level, workout intensity, heart rate zone,
  and AI rest/load adjustment recommendations.
- Explicit transparency: never claims physical gym equipment is controlled when running in Simulation Mode.
"""

import json
import os
import random
import time
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Dict, List, Optional

import paho.mqtt.client as mqtt


class IoTDeviceInterface(ABC):
    """Hardware-agnostic interface for ESP32 / MQTT smart gym equipment nodes."""

    @abstractmethod
    def read_telemetry(self) -> Dict:
        """Reads current sensor telemetry from the device."""

    @abstractmethod
    def send_control_command(self, command: Dict) -> Dict:
        """Sends resistance/speed/mode adjustment command to the device."""


class ESP32GymDeviceInterface(IoTDeviceInterface):
    """Standard MQTT interface for ESP32-equipped gym machines.

    Expected ESP32 Firmware Topic Convention:
    - Telemetry Publish Topic: `gym/equipment/<device_id>/telemetry`
      Payload JSON: `{"device_id": "esp32_dumbbell_01", "resistance_kg": 15.0, "rep_velocity_ms": 0.62, "heart_rate_bpm": 134, "battery_pct": 92}`
    - Control Subscribe Topic: `gym/equipment/<device_id>/control`
      Payload JSON: `{"target_resistance_kg": 17.5, "target_speed_kmh": 0.0, "mode": "hypertrophy"}`
    """

    def __init__(self, device_id: str, name: str, device_type: str, topic_prefix: str = "gym/equipment"):
        self.device_id = device_id
        self.name = name
        self.device_type = device_type
        self.telemetry_topic = f"{topic_prefix}/{device_id}/telemetry"
        self.control_topic = f"{topic_prefix}/{device_id}/control"
        self.last_hardware_payload: Optional[Dict] = None
        self.last_hardware_timestamp: Optional[float] = None

    def on_mqtt_message(self, payload: Dict) -> None:
        self.last_hardware_payload = payload
        self.last_hardware_timestamp = time.time()

    def is_hardware_online(self) -> bool:
        if self.last_hardware_timestamp is None:
            return False
        return (time.time() - self.last_hardware_timestamp) < 15.0

    def read_telemetry(self) -> Dict:
        if self.is_hardware_online() and self.last_hardware_payload:
            return {**self.last_hardware_payload, "is_simulated": False, "source": "mqtt_hardware"}
        return {"device_id": self.device_id, "is_simulated": True, "source": "simulation_fallback"}

    def send_control_command(self, command: Dict) -> Dict:
        return {
            "device_id": self.device_id,
            "control_topic": self.control_topic,
            "command": command,
            "hardware_connected": self.is_hardware_online(),
        }


class SmartGymIoTManager:
    """Manages MQTT broker connectivity, ESP32 device interfaces, and simulated equipment telemetry."""

    def __init__(self):
        self.broker_host = os.getenv("MQTT_BROKER_HOST", "localhost")
        self.broker_port = int(os.getenv("MQTT_BROKER_PORT", "1883"))
        self.topic_prefix = os.getenv("MQTT_TOPIC_PREFIX", "gym/equipment")
        self.force_simulation = os.getenv("IOT_SIMULATION_MODE", "true").lower() == "true"

        self.mqtt_connected = False
        self.mqtt_client: Optional[mqtt.Client] = None
        self.telemetry_history: List[Dict] = []

        self.esp32_interfaces: Dict[str, ESP32GymDeviceInterface] = {
            "esp32_dumbbell_01": ESP32GymDeviceInterface(
                "esp32_dumbbell_01", "Smart Adjustable Dumbbell Set", "smart_dumbbell", self.topic_prefix
            ),
            "esp32_cable_02": ESP32GymDeviceInterface(
                "esp32_cable_02", "Digital Cable Resistance Tower", "cable_machine", self.topic_prefix
            ),
            "esp32_treadmill_03": ESP32GymDeviceInterface(
                "esp32_treadmill_03", "Smart Incline Treadmill Pro", "treadmill", self.topic_prefix
            ),
            "esp32_hr_band_04": ESP32GymDeviceInterface(
                "esp32_hr_band_04", "Optical Chest/Wrist Heart Rate Sensor", "hr_sensor", self.topic_prefix
            ),
        }

        self._try_connect_mqtt()

    def _try_connect_mqtt(self) -> None:
        """Attempts a non-blocking connection to the configured MQTT broker; falls back cleanly to simulation."""
        if self.force_simulation:
            self.mqtt_connected = False
            return

        try:
            # Compatible with paho-mqtt 2.x CallbackAPIVersion
            if hasattr(mqtt, "CallbackAPIVersion"):
                client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="ai_gym_assistant_backend")
            else:
                client = mqtt.Client(client_id="ai_gym_assistant_backend")

            def on_connect(c, userdata, flags, rc, *args):
                if rc == 0:
                    self.mqtt_connected = True
                    c.subscribe(f"{self.topic_prefix}/+/telemetry")

            def on_disconnect(c, userdata, *args):
                self.mqtt_connected = False

            def on_message(c, userdata, msg):
                try:
                    payload = json.loads(msg.payload.decode("utf-8"))
                    parts = msg.topic.split("/")
                    if len(parts) >= 3:
                        dev_id = parts[-2]
                        if dev_id in self.esp32_interfaces:
                            self.esp32_interfaces[dev_id].on_mqtt_message(payload)
                except Exception:
                    pass

            client.on_connect = on_connect
            client.on_disconnect = on_disconnect
            client.on_message = on_message
            client.connect_async(self.broker_host, self.broker_port, keepalive=15)
            client.loop_start()
            self.mqtt_client = client
        except Exception:
            self.mqtt_connected = False

    def compute_ai_recommendation(
        self, heart_rate: int, resistance_kg: float, intensity_level: str, rep_velocity_ms: float = 0.55
    ) -> Dict:
        """AI rule engine evaluating live IoT telemetry for optimal resistance and rest intervals."""
        if heart_rate >= 168:
            return {
                "status": "high_strain",
                "intensity_classification": "Peak / Redline Zone (90%+ HRmax)",
                "recommended_rest_seconds": 120,
                "recommended_resistance_delta_kg": -2.5,
                "ai_coaching_note": (
                    "Heart rate is elevated above 168 BPM. Reduce resistance by 2.5 kg on next set "
                    "and take a full 120-second recovery interval with deep nasal breathing."
                ),
            }
        elif heart_rate >= 142 or intensity_level == "High":
            return {
                "status": "optimal_hypertrophy",
                "intensity_classification": "Anaerobic Hypertrophy Zone (75-85% HRmax)",
                "recommended_rest_seconds": 90,
                "recommended_resistance_delta_kg": 0.0 if rep_velocity_ms < 0.65 else 2.5,
                "ai_coaching_note": (
                    f"Optimal training stimulus at {resistance_kg} kg. Maintain current load and rest 90 seconds "
                    "between sets to replenish ATP-CP stores."
                ),
            }
        elif heart_rate < 105:
            return {
                "status": "warmup_low",
                "intensity_classification": "Warm-up / Recovery Zone (<60% HRmax)",
                "recommended_rest_seconds": 45,
                "recommended_resistance_delta_kg": +2.5,
                "ai_coaching_note": (
                    "Cardiovascular load is light. Consider progressive overload (+2.5 kg resistance) "
                    "or shortening rest intervals to 45 seconds."
                ),
            }
        else:
            return {
                "status": "steady_aerobic",
                "intensity_classification": "Aerobic Conditioning Zone (65-75% HRmax)",
                "recommended_rest_seconds": 60,
                "recommended_resistance_delta_kg": 0.0,
                "ai_coaching_note": (
                    "Balanced work output and heart-rate recovery. Rest 60 seconds before initiating your next working set."
                ),
            }

    def simulate_telemetry_step(self, devices_from_db: List) -> Dict:
        """Generates a realistic telemetry snapshot for connected/simulated devices."""
        now_str = datetime.now(timezone.utc).strftime("%H:%M:%S")
        avg_hr = 124
        max_res = 15.0
        device_snapshots = []

        for dev in devices_from_db:
            if dev.is_connected:
                if dev.device_type == "hr_sensor":
                    drift = random.randint(-4, 6)
                    dev.heart_rate_bpm = max(78, min(176, (dev.heart_rate_bpm or 120) + drift))
                    avg_hr = dev.heart_rate_bpm
                elif dev.device_type in ("smart_dumbbell", "cable_machine"):
                    max_res = max(max_res, dev.resistance_kg or 15.0)

            rep_velocity = round(max(0.28, 0.85 - (dev.resistance_kg or 15.0) * 0.012 + random.uniform(-0.04, 0.04)), 2)
            telemetry = {
                "timestamp": now_str,
                "device_id": dev.device_id,
                "name": dev.name,
                "device_type": dev.device_type,
                "mqtt_topic": dev.mqtt_topic,
                "is_connected": dev.is_connected,
                "is_simulated": True if not self.mqtt_connected else dev.is_simulated,
                "resistance_kg": dev.resistance_kg,
                "speed_kmh": dev.speed_kmh,
                "heart_rate_bpm": dev.heart_rate_bpm,
                "rep_velocity_ms": rep_velocity,
                "intensity_level": dev.intensity_level,
                "status": "Simulated Active" if dev.is_connected else "Standby (Disconnected)",
            }
            dev.last_telemetry_json = json.dumps(telemetry)
            device_snapshots.append(telemetry)

        ai_rec = self.compute_ai_recommendation(avg_hr, max_res, "Moderate")
        point = {
            "time": now_str,
            "heart_rate_bpm": avg_hr,
            "resistance_kg": max_res,
            "recommended_rest_sec": ai_rec["recommended_rest_seconds"],
        }
        self.telemetry_history.append(point)
        self.telemetry_history = self.telemetry_history[-30:]

        return {
            "simulation_mode": not self.mqtt_connected,
            "simulation_banner": (
                "SIMULATION MODE ACTIVE: Physical MQTT/ESP32 gym hardware is not connected. "
                "Telemetry values and resistance adjustments below are simulated in software."
                if not self.mqtt_connected
                else "Connected to Live MQTT Broker."
            ),
            "mqtt_broker": {
                "host": self.broker_host,
                "port": self.broker_port,
                "topic_prefix": self.topic_prefix,
                "connected": self.mqtt_connected,
                "protocol": "MQTT v3.1.1 / v5.0 (paho-mqtt)",
            },
            "devices": device_snapshots,
            "ai_recommendation": ai_rec,
            "telemetry_stream": self.telemetry_history,
            "esp32_integration_spec": {
                "publish_topic_pattern": f"{self.topic_prefix}/<device_id>/telemetry",
                "subscribe_topic_pattern": f"{self.topic_prefix}/<device_id>/control",
                "sample_esp32_payload": {
                    "device_id": "esp32_dumbbell_01",
                    "resistance_kg": max_res,
                    "heart_rate_bpm": avg_hr,
                    "rep_velocity_ms": 0.58,
                    "firmware": "ESP32-GymNode-v1.2",
                },
            },
        }


iot_manager = SmartGymIoTManager()
