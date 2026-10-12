// Dashboard and log page logic without DOM access, including the backend requests.
// dashboard.mjs and logview.mjs wire it to the pages; tests/js/*.test.mjs run it under Node.

// firmware-core.mjs imports this module too. Each side only calls the other's functions from inside
// its own functions, never while the module loads, so the cycle is safe in either load order.
import { deviceFirmware, jobStateKey, needsPcTool } from "./firmware-core.mjs";

/** Shown for any missing or unmeasured value, in both languages. */
export const NA = "N/A";

export const STRINGS = {
  en: {
    demo: "Demo",
    backend: "Backend {v}",
    online_count: "{n}/{total} devices online",
    server_online: "Server online",
    server_offline: "Server offline",
    server_checking: "Checking server",
    unlock: "Unlock",
    relock: "Lock",
    unlock_hint: "Controls are locked. Unlock to switch outlets and rename.",
    relock_hint: "Controls are live. Lock to prevent accidental presses.",
    view_only: "View only",
    view_only_hint: "Changes are made only from the Home Assistant sidebar.",
    settings: "Settings",
    logs: "Logs",
    theme: "Theme",
    theme_auto: "Auto",
    theme_dark: "Dark",
    theme_light: "Light",
    language: "Language",
    sum_mqtt: "Home Assistant MQTT",
    mqtt_connected: "Connected",
    mqtt_disconnected: "Disconnected",
    mqtt_off: "Off",
    unknown: "Unknown",
    mqtt_broker: "Broker",
    mqtt_topic: "Topic prefix",
    mqtt_discovery: "Discovery prefix",
    sum_fw: "Firmware",
    fw_target_label: "Target version",
    fw_pending_label: "Devices to update",
    fw_pending_count: "{n}",
    fw_ota_host: "OTA server",
    fw_badge_pending: "Update {n}",
    fw_badge_ok: "Up to date",
    open_settings: "Open settings",
    open_logs: "View logs",
    sum_app: "Android setup app",
    apk_download: "Download APK",
    pc_download: "Download PC tool",
    app_by_tuo_link: "Tuo of the Naver HA Cafe",
    app_by_tuo: " made this Android setup app and PC tool. They are unchanged from Tuo's release.",
    qr_label: "QR code for {url}",
    empty: "Waiting for an MTTL-W01 device.",
    online: "Online",
    offline: "Offline",
    offline_note: "Offline · last received values",
    total_power: "Total power",
    total_energy: "Energy",
    voltage: "Voltage",
    rssi: "RSSI",
    all_on: "All ON",
    all_off: "All OFF",
    refresh: "Refresh",
    outlet: "Outlet {n}",
    power: "Power",
    energy: "Energy",
    temp: "Temp",
    on: "ON",
    off: "OFF",
    rename: "Rename",
    hide_device: "Hide device",
    hide_confirm: "Confirm hide",
    hide_hint: "Removes the device from the dashboard and Home Assistant. Show it again under Hidden devices.",
    hide_note: "Show it again under Hidden devices below",
    lock: "Child lock",
    lock_all: "All",
    lock_pending: "Waiting for sync",
    lock_bit: "Lock {name}",
    device_settings: "Device settings",
    dw_measure: "Measurement",
    hidden_title: "Hidden devices",
    fw_job_notice: "OTA · {state}",
    lock_mask: "Mask {n}",
    close: "Close",
    dw_fw_current: "Current version",
    dw_fw_match: "Matches the target version.",
    dw_job: "Latest job",
    dw_locked: "Locked. Unlock the dashboard to change these settings.",
    dw_offline: "Offline. These settings stay read-only until the device reconnects.",
    dw_not_ready: "The custom firmware file is not ready. Register it again on the Settings page.",
    dw_auto_prepare: "Official firmware is prepared and verified when the update starts.",
    dw_port80: "This power strip receives firmware only over TCP 80, which the app does not open. Install firmware with the PC tool.",
    dw_ota_update: "Updates this device from {from} to {to}. Do not cut power during the update. The device goes offline for a moment while the backend reconnects and checks the version.",
    dw_ota_downgrade: "Downgrades this device from {from} to {to}. Do not cut power during the update. The device goes offline for a moment while the backend reconnects and checks the version.",
    dw_ota_reflash: "Reinstalls {to}. The version is the same, but the installed build differs from the target build, so the verified build is installed again. Do not cut power during the update.",
    dw_ota_custom: "This is a custom file. Only its structure was checked; it is not guaranteed to run on a real strip.",
    pc_return: "Returning to 1.0.111 needs the PC tool.",
    dw_ota_queued: "Update queued.",
    dw_voltage: "Measure voltage",
    dw_rssi: "Measure Wi-Fi RSSI",
    dw_interval: "Measurement interval",
    dw_measure_note: "Only the measurements you turn on are read, and only they show a value on the dashboard card and in Home Assistant. The default is both off, every 1 min.",
    dw_apply: "Apply",
    lock_reread: "Read again",
    lock_status: "Status",
    lock_stale: "The last known mask {n} is kept, but it is not verified on the current connection, so it is not used for control.",
    lock_note: "Locks only short presses of the master and outlet buttons. Remote control and protection stay active. The long-press factory and RESET_AP recovery is not locked.",
    lock_reread_ok: "Read from the device: Mask {n}.",
    lock_err_busy: "The device is busy with another request. Try again in a moment.",
    lock_err_channel_quarantined: "Child Lock is paused until the device reconnects.",
    lock_err_device_timeout: "The device did not answer in time.",
    lock_err_state_unresolved: "The device could not confirm its Child Lock state.",
    lock_err_invalid_device_mask: "The device returned a value that is not a valid mask.",
    lock_err_observed_mismatch: "The device reported a different mask than requested.",
    lock_err_indeterminate: "The backend gave up waiting for the device. Read again later.",
    hidden_note: "Hiding keeps the name and accumulated energy, so the device can be shown again. Deleting the history removes them for good.",
    hidden_kept: "Kept {kwh}",
    restore: "Show again",
    purge: "Delete history",
    purge_warn: "Deletes the name, accumulated energy, history, measurement settings and Home Assistant registration of {name}. This cannot be undone. If the device is online it may appear again right away as a new device.",
    purge_type: "Type DELETE to enable the button",
    purge_do: "Delete permanently",
    purge_cancel: "Cancel",
    restore_done: "{name} is shown again.",
    purge_done: "Deleted the history of {name}.",
    fw_update: "Firmware update → {v}",
    fw_downgrade: "Firmware downgrade → {v}",
    fw_reflash: "Reinstall firmware {v}",
    job_queued: "Queued",
    job_preparing: "Preparing",
    job_command_sent: "Command sent",
    job_acked: "Device acknowledged",
    job_downloading: "Downloading",
    job_transferred: "Transferred",
    job_reconnecting: "Reconnecting",
    job_verifying: "Verifying",
    job_success: "Success",
    job_delayed_success: "Success (confirmed late)",
    job_cancelled_restart: "Cancelled by restart",
    job_result_unknown: "Result unknown",
    job_failed_prepare: "Failed: prepare",
    job_failed_config: "Failed: config",
    job_failed_offline: "Failed: device offline",
    job_failed_busy: "Failed: device busy",
    job_failed_ack: "Failed: no acknowledgement",
    job_failed_download: "Failed: download",
    job_failed_version: "Failed: version mismatch",
    job_failed_internal: "Failed: internal error",
    hint_111: "Physical-button Child Lock. OTA tries TCP 49217 first, then 80.",
    hint_110: "Local backend support. A strip on this version receives firmware only over TCP 80, which the app does not open, so returning to 1.0.111 needs the PC tool.",
    hint_66: "Stock LG U+ firmware. A strip on this version receives firmware only over TCP 80, which the app does not open, so returning to 1.0.111 needs the PC tool.",
    hint_custom: "A file that only passed structure validation.",
    fwr_ext: "Choose a .fwr file.",
    fwr_size: "The file must be 327,944 bytes.",
    action_failed: "Request failed: {msg}",
    nav_dashboard: "Dashboard",
    card_fw: "Firmware",
    card_files: "Firmware files",
    card_jobs: "Firmware jobs",
    card_poll: "Polling",
    card_mqtt: "Home Assistant MQTT",
    btn_save: "Save",
    press_again: "Press again",
    working: "Working…",
    saved: "Saved.",
    unit_s: "{n} s",
    unit_min: "{n} min",
    fw_target: "Target firmware",
    fw_ota_host_label: "OTA server IPv4",
    fw_ota_host_note: "The address the strips download firmware from. Blank keeps the saved address.",
    fw_prepare: "Prepare and verify",
    fw_update_all: "Update all ({n})",
    fw_save_first: "Save the target and address before updating.",
    fw_prepared: "Firmware prepared and verified.",
    fw_all_warn: "Updates these devices one at a time. Do not cut power during an update.",
    fw_all_pc: "will fail, PC tool needed",
    fw_all_started: "Queued updates for {n} device(s).",
    fw_target_mark: "Target",
    fw_ready: "Ready",
    fw_not_ready: "Needs prep",
    fw_download: "Download FWR",
    fw_delete: "Delete",
    fw_delete_warn: "Deletes the file and its entry. If it is the target, the target goes back to 1.0.111.",
    fw_deleted: "Deleted.",
    fw_custom: "Custom {v}",
    fw_upload_title: "Custom FWR",
    fw_choose: "Choose .fwr file",
    fw_no_file: "No file chosen",
    fw_upload: "Upload and verify",
    fw_upload_note: "The file is checked here first, then by the backend. An uploaded file is not chosen as the target.",
    fw_uploaded: "Registered {name}.",
    fw_demo_download: "Downloads are not available in the demo.",
    jobs_note: "Latest 20 jobs, running ones first.",
    jobs_empty: "No firmware jobs yet.",
    poll_label: "Read interval",
    poll_note: "How often power and state are read from each strip. The same for all devices. Default 15 s.",
    mqtt_pw: "Password",
    mqtt_pw_set: "Stored",
    mqtt_pw_unset: "Not set",
    mqtt_last_error: "Last error",
    mqtt_no_error: "None",
    mqtt_enable: "Use the Home Assistant integration",
    mqtt_port: "Port",
    mqtt_user: "MQTT ID",
    mqtt_password: "Password",
    mqtt_password_ph: "Leave blank to keep",
    mqtt_tls: "TLS",
    mqtt_report: "Reporting",
    mqtt_power_threshold: "Power min change",
    mqtt_power_interval: "Power report interval",
    mqtt_energy_threshold: "Energy min change",
    mqtt_energy_interval: "Energy report interval",
    mqtt_report_note: "At each report interval, a value is sent only if it changed by at least the minimum change.",
    mqtt_advanced: "Advanced",
    mqtt_birth: "Birth topic",
    mqtt_test: "Test connection",
    mqtt_sync: "Resend discovery",
    mqtt_save_warn: "Turning the integration off or changing the broker, port or topics deletes the Home Assistant entities of the previous broker.",
    mqtt_test_ok: "Connected to the broker.",
    mqtt_test_failed: "Connection failed: {msg}",
    mqtt_synced: "Discovery and states sent again.",
    lovelace: "Lovelace card",
    lovelace_download: "Download mttl-up-card.js",
    lovelace_install: "Copy it to /config/www/, then add /local/mttl-up-card.js as a JavaScript module resource in Home Assistant.",
    err_ipv4: "Enter an IPv4 address such as 192.0.2.10, without leading zeros.",
    err_required: "Required while the integration is on.",
    err_port: "The port must be 1 to 65535.",
    err_topic: "Cannot be empty or contain + or #.",
    log_title: "Backend log",
    log_note: "Memory keeps the latest 5,000 rows. DEBUG and above also go to backend.log (5 MB, 3 files).",
    log_back: "Dashboard",
    log_level: "Level",
    log_level_DEBUG: "DEBUG+ detailed",
    log_level_INFO: "INFO+ brief",
    log_level_WARNING: "WARNING+",
    log_level_ERROR: "ERROR",
    log_category: "Category",
    log_cat_all: "All",
    log_cat_ota: "OTA",
    log_cat_wire: "Wire TX/RX",
    log_cat_control: "Control",
    log_cat_childlock: "Child Lock",
    log_cat_ha: "Home Assistant",
    log_cat_connection: "Connection",
    log_cat_storage: "DB/backup",
    log_cat_other: "Other",
    log_view: "View",
    log_view_compact: "Compact",
    log_view_text: "Text",
    log_view_json: "JSON",
    log_limit: "Rows",
    log_auto: "Auto 2 s",
    log_refresh: "Refresh",
    log_copy: "Copy logs",
    log_copied: "Copied ({n} rows)",
    log_copy_failed: "Could not copy to the clipboard.",
    log_clear: "Clear buffer",
    log_clear_confirm: "Press again to clear",
    log_status: "{n} rows · {time}",
    log_error: "Error: {msg}",
    log_empty: "No log rows for this filter.",
  },
  ko: {
    view_only_hint: "변경은 Home Assistant 사이드바에서만 할 수 있습니다.",
    sum_mqtt: "Home Assistant MQTT",
    mqtt_connected: "Connected",
    mqtt_disconnected: "Disconnected",
    mqtt_off: "Off",
    unknown: "Unknown",
    mqtt_broker: "Broker",
    mqtt_topic: "Topic prefix",
    mqtt_discovery: "Discovery prefix",
    sum_fw: "펌웨어",
    fw_target_label: "목표 버전",
    fw_pending_label: "업데이트 대상",
    job_queued: "대기 중",
    job_preparing: "준비 중",
    job_command_sent: "명령 전송",
    job_acked: "기기 응답",
    job_downloading: "내려받는 중",
    job_transferred: "전송 완료",
    job_reconnecting: "다시 연결 중",
    job_verifying: "확인 중",
    job_success: "성공",
    job_delayed_success: "성공(늦게 확인)",
    job_cancelled_restart: "재시작으로 취소",
    job_result_unknown: "결과를 알 수 없음",
    job_failed_prepare: "실패: 준비",
    job_failed_config: "실패: 설정",
    job_failed_offline: "실패: 기기 Offline",
    job_failed_busy: "실패: 기기 사용 중",
    job_failed_ack: "실패: 기기 응답 없음",
    job_failed_download: "실패: 내려받기",
    job_failed_version: "실패: 버전 불일치",
    job_failed_internal: "실패: 내부 오류",
    hint_111: "물리 버튼 Child Lock. OTA는 TCP 49217을 먼저, 실패하면 80.",
    hint_110: "로컬 백엔드 지원. 이 판을 쓰는 멀티탭은 TCP 80으로만 펌웨어를 받는데 앱은 이 포트를 열지 않으므로, 1.0.111로 돌아오려면 PC 도구가 필요합니다.",
    hint_66: "LG U+ 순정. 이 판을 쓰는 멀티탭은 TCP 80으로만 펌웨어를 받는데 앱은 이 포트를 열지 않으므로, 1.0.111로 돌아오려면 PC 도구가 필요합니다.",
    hint_custom: "구조 검증만 통과한 파일.",
    fwr_ext: ".fwr 파일을 고르세요.",
    fwr_size: "파일 크기가 327,944바이트여야 합니다.",
    btn_save: "저장",
    press_again: "한 번 더 누르기",
    working: "처리 중…",
    saved: "저장했습니다.",
    unit_s: "{n}초",
    unit_min: "{n}분",
    fw_target: "목표 펌웨어",
    fw_ota_host_label: "OTA server IPv4",
    fw_ota_host_note: "멀티탭이 펌웨어를 내려받을 주소입니다. 비워 두면 저장된 주소를 그대로 둡니다.",
    fw_prepare: "준비·검증",
    fw_update_all: "모두 순차 업데이트 ({n}대)",
    fw_save_first: "업데이트하기 전에 목표와 주소를 먼저 저장하세요.",
    fw_prepared: "펌웨어를 준비하고 검증했습니다.",
    fw_all_warn: "아래 기기를 한 대씩 업데이트합니다. 업데이트 중에는 전원을 끄지 마세요.",
    fw_all_pc: "실패 예정, PC 도구 필요",
    fw_all_started: "{n}대의 업데이트를 시작했습니다.",
    fw_target_mark: "목표",
    fw_ready: "준비됨",
    fw_not_ready: "준비 필요",
    fw_download: "FWR 내려받기",
    fw_delete: "삭제",
    fw_delete_warn: "파일과 판 정보가 지워집니다. 목표였다면 1.0.111로 돌아갑니다.",
    fw_deleted: "삭제했습니다.",
    fw_custom: "사용자 지정 {v}",
    fw_upload_title: "사용자 지정 FWR",
    fw_choose: ".fwr 파일 고르기",
    fw_no_file: "고른 파일 없음",
    fw_upload: "올리고 검증",
    fw_upload_note: "먼저 이 화면에서, 이어서 백엔드가 검증합니다. 올린 파일은 목표로 자동 선택되지 않습니다.",
    fw_uploaded: "{name}을(를) 등록했습니다.",
    fw_demo_download: "예시 화면에서는 내려받을 수 없습니다.",
    jobs_note: "최근 작업 20개, 진행 중인 작업이 위에 있습니다.",
    jobs_empty: "펌웨어 작업이 없습니다.",
    poll_label: "읽기 주기",
    poll_note: "각 멀티탭의 소비전력과 상태를 읽는 주기입니다. 모든 기기에 같게 적용됩니다. 기본값은 15초입니다.",
    mqtt_pw: "암호",
    mqtt_pw_set: "저장됨",
    mqtt_pw_unset: "없음",
    mqtt_last_error: "마지막 오류",
    mqtt_no_error: "없음",
    mqtt_enable: "Home Assistant 연동 사용",
    mqtt_port: "Port",
    mqtt_user: "MQTT ID",
    mqtt_password: "암호",
    mqtt_password_ph: "비우면 기존 암호 유지",
    mqtt_tls: "TLS",
    mqtt_report: "보고 기준",
    mqtt_power_threshold: "Power 최소 변화량",
    mqtt_power_interval: "Power 보고 주기",
    mqtt_energy_threshold: "Energy 최소 변화량",
    mqtt_energy_interval: "Energy 보고 주기",
    mqtt_report_note: "보고 주기마다 값을 확인해, 최소 변화량 이상 바뀐 경우에만 보냅니다.",
    mqtt_advanced: "고급",
    mqtt_birth: "Birth topic",
    mqtt_test: "연결 시험",
    mqtt_sync: "Discovery 다시 보내기",
    mqtt_save_warn: "연동을 끄거나 브로커·포트·토픽을 바꾸면 이전 브로커의 Home Assistant 엔티티가 지워집니다.",
    mqtt_test_ok: "브로커에 연결했습니다.",
    mqtt_test_failed: "연결 실패: {msg}",
    mqtt_synced: "Discovery와 상태를 다시 보냈습니다.",
    lovelace: "Lovelace 카드",
    lovelace_download: "mttl-up-card.js 내려받기",
    lovelace_install: "Home Assistant의 /config/www/에 복사한 뒤, 대시보드 리소스에 /local/mttl-up-card.js를 JavaScript 모듈로 추가하세요.",
    err_ipv4: "192.0.2.10 같은 IPv4 주소를 앞자리 0 없이 입력하세요.",
    err_required: "연동을 켜면 꼭 필요합니다.",
    err_port: "포트는 1~65535여야 합니다.",
    err_topic: "비울 수 없고 +, #를 쓸 수 없습니다.",
    fw_pending_count: "{n}대",
    fw_ota_host: "OTA server",
    fw_badge_pending: "Update {n}",
    fw_badge_ok: "Up to date",
    open_settings: "설정 열기",
    open_logs: "로그 보기",
    sum_app: "안드로이드 설정 앱",
    apk_download: "APK 내려받기",
    pc_download: "PC 도구 내려받기",
    app_by_tuo_link: "네이버 HA 카페",
    app_by_tuo: " 투오님께서 만드신 안드로이드 설정 앱과 PC 도구입니다. 투오님 배포본 그대로입니다.",
    qr_label: "{url} QR 코드",
    empty: "MTTL-W01 기기를 기다리는 중입니다.",
    online: "Online",
    offline: "Offline",
    offline_note: "Offline · 마지막으로 받은 값",
    total_power: "전체 전력",
    total_energy: "누적 사용량",
    voltage: "전압",
    all_on: "전체 켜기",
    all_off: "전체 끄기",
    refresh: "새로고침",
    outlet: "콘센트 {n}",
    power: "전력",
    energy: "누적",
    temp: "온도",
    on: "ON",
    off: "OFF",
    rename: "이름 바꾸기",
    hide_hint: "대시보드와 Home Assistant에서 빠집니다. 아래 HIDDEN DEVICES에서 다시 표시할 수 있습니다.",
    hide_note: "아래 HIDDEN DEVICES에서 다시 표시할 수 있음",
    lock_all: "전체",
    lock_pending: "동기화 대기",
    lock_bit: "{name} 잠금",
    close: "닫기",
    dw_fw_current: "현재 버전",
    dw_fw_match: "목표 버전과 일치합니다.",
    dw_job: "최근 작업",
    dw_locked: "잠겨 있습니다. 설정을 바꾸려면 대시보드 잠금을 푸세요.",
    dw_offline: "Offline 상태라 기기가 다시 연결될 때까지 바꿀 수 없습니다.",
    dw_not_ready: "사용자 지정 펌웨어 파일이 준비되지 않았습니다. 설정 페이지에서 다시 등록하세요.",
    dw_auto_prepare: "공식 펌웨어는 업데이트를 시작할 때 준비하고 검증합니다.",
    dw_port80: "이 멀티탭은 TCP 80으로만 펌웨어를 받는데, 앱은 이 포트를 열지 않습니다. 펌웨어는 PC 도구로 설치하세요.",
    dw_ota_update: "이 기기를 {from}에서 {to}로 업데이트합니다. 업데이트 중에는 전원을 끄지 마세요. 기기가 잠시 Offline이 되며, 백엔드가 다시 연결해 버전을 확인합니다.",
    dw_ota_downgrade: "이 기기를 {from}에서 {to}로 다운그레이드합니다. 업데이트 중에는 전원을 끄지 마세요. 기기가 잠시 Offline이 되며, 백엔드가 다시 연결해 버전을 확인합니다.",
    dw_ota_reflash: "{to}를 다시 설치합니다. 버전은 같지만 설치된 빌드가 목표 빌드와 달라, 검증된 빌드로 다시 설치합니다. 업데이트 중에는 전원을 끄지 마세요.",
    dw_ota_custom: "사용자 지정 파일입니다. 구조만 검증했고, 실제 기기에서 동작하는지는 보장하지 않습니다.",
    pc_return: "1.0.111로 돌아오려면 PC 도구가 필요합니다.",
    dw_ota_queued: "업데이트를 시작했습니다.",
    dw_voltage: "전압 측정",
    dw_rssi: "Wi-Fi RSSI 측정",
    dw_interval: "측정 주기",
    dw_measure_note: "켠 측정만 읽으며, 그 값만 대시보드 카드와 Home Assistant에 나타납니다. 기본은 둘 다 끔, 1분입니다.",
    dw_apply: "적용",
    lock_reread: "다시 읽기",
    lock_status: "상태",
    lock_stale: "마지막으로 확인한 Mask {n}은 보존하지만 현재 연결에서 검증되지 않아 제어에 쓰지 않습니다.",
    lock_note: "마스터와 콘센트 버튼의 짧은 누름만 잠급니다. 원격 제어와 보호 기능은 그대로 동작합니다. 오래 눌러 복구하는 Factory와 RESET_AP 동작은 잠그지 않습니다.",
    lock_reread_ok: "기기에서 읽었습니다: Mask {n}.",
    lock_err_busy: "기기가 다른 요청을 처리하는 중입니다. 잠시 뒤에 다시 시도하세요.",
    lock_err_channel_quarantined: "기기가 다시 연결될 때까지 Child Lock을 쓸 수 없습니다.",
    lock_err_device_timeout: "기기가 제때 응답하지 않았습니다.",
    lock_err_state_unresolved: "기기가 Child Lock 상태를 확인해 주지 못했습니다.",
    lock_err_invalid_device_mask: "기기가 올바른 마스크가 아닌 값을 돌려주었습니다.",
    lock_err_observed_mismatch: "기기가 요청과 다른 마스크를 보고했습니다.",
    lock_err_indeterminate: "백엔드가 기기의 응답을 기다리다 포기했습니다. 잠시 뒤에 다시 읽으세요.",
    hidden_note: "숨기면 이름과 누적 에너지가 보존되어 다시 표시할 수 있습니다. 기록을 완전 삭제하면 모두 지워지고 되돌릴 수 없습니다.",
    hidden_kept: "보존 누적 {kwh}",
    restore: "다시 표시",
    purge: "기록 완전 삭제",
    purge_warn: "{name}의 별명, 누적 에너지, 기록, 측정 설정, Home Assistant 등록이 지워집니다. 되돌릴 수 없습니다. 기기가 Online이면 새 기기로 곧바로 다시 나타날 수 있습니다.",
    purge_type: "DELETE를 입력하면 버튼이 켜집니다",
    purge_do: "완전 삭제",
    purge_cancel: "취소",
    restore_done: "{name}을(를) 다시 표시합니다.",
    purge_done: "{name}의 기록을 완전히 삭제했습니다.",
    action_failed: "요청 실패: {msg}",
    log_title: "Backend log",
    log_note: "메모리에 최근 5,000줄을 둡니다. DEBUG 이상은 backend.log 파일(5MB, 3개)에도 남습니다.",
    log_level: "Level",
    log_level_DEBUG: "DEBUG+ 상세",
    log_level_INFO: "INFO+ 간략",
    log_level_WARNING: "WARNING+",
    log_level_ERROR: "ERROR",
    log_category: "분류",
    log_cat_all: "전체",
    log_cat_ota: "OTA",
    log_cat_wire: "통신 TX/RX",
    log_cat_control: "제어",
    log_cat_childlock: "Child Lock",
    log_cat_ha: "Home Assistant",
    log_cat_connection: "연결",
    log_cat_storage: "DB/백업",
    log_cat_other: "기타",
    log_view: "보기",
    log_view_compact: "간략",
    log_view_text: "텍스트",
    log_view_json: "JSON",
    log_limit: "줄 수",
    log_auto: "자동 2초",
    log_refresh: "새로고침",
    log_copy: "현재 로그 복사",
    log_copied: "복사됨 ({n}줄)",
    log_copy_failed: "클립보드에 복사하지 못했습니다.",
    log_clear: "버퍼 지우기",
    log_clear_confirm: "한 번 더 누르면 지웁니다",
    log_status: "{n}줄 · {time}",
    log_error: "오류: {msg}",
    log_empty: "이 조건에 맞는 로그가 없습니다.",
  },
};

/** Shown in English in both languages: the top bar, the firmware update banner, card and window titles and some labels. */
export const ENGLISH_ONLY = [
  "demo", "server_online", "server_offline", "server_checking", "backend", "online_count",
  "unlock", "relock", "view_only", "settings", "logs", "theme", "theme_auto", "theme_dark", "theme_light",
  "language", "log_back", "unlock_hint", "relock_hint", "fw_update", "fw_downgrade", "fw_reflash",
  "rssi", "lock", "hide_device", "hide_confirm",
  "nav_dashboard", "card_fw", "card_files", "card_jobs", "card_poll", "card_mqtt",
  "device_settings", "dw_measure", "hidden_title", "fw_job_notice", "lock_mask",
];
for (const key of ENGLISH_ONLY) STRINGS.ko[key] = STRINGS.en[key];

export function t(lang, key, vars = {}) {
  const text = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole));
}

const HANGUL = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;

/**
 * Language of a rendered string by its script: "ko" when it has Hangul, else "en".
 * Pages set it as the element's lang so the same English looks the same in EN and KR.
 */
export function scriptLang(text) {
  return HANGUL.test(String(text ?? "")) ? "ko" : "en";
}

/**
 * Two-press confirm: the first press arms, a second press within `windowMs` confirms.
 * `armedAt` is the time of the arming press or null. Returns the next state.
 */
export function pressConfirm(armedAt, now, windowMs = 4000) {
  if (armedAt !== null && now - armedAt <= windowMs) return { armedAt: null, confirmed: true };
  return { armedAt: now, confirmed: false };
}

export function pickLang(saved, navigatorLanguage) {
  if (saved === "en" || saved === "ko") return saved;
  return String(navigatorLanguage ?? "").toLowerCase().startsWith("ko") ? "ko" : "en";
}

export function resolveTheme(pref, haDark, osPrefersLight) {
  if (pref === "dark" || pref === "light") return pref;
  if (typeof haDark === "boolean") return haDark ? "dark" : "light";
  return osPrefersLight ? "light" : "dark";
}

export function normalizeMac(s) {
  if (typeof s !== "string") return null;
  const hex = s.trim().replace(/[:-]/g, "").toLowerCase();
  return /^[0-9a-f]{12}$/.test(hex) ? hex : null;
}

export function fmtMac(mac) {
  return (normalizeMac(mac) ?? "").toUpperCase().replace(/(..)(?!$)/g, "$1:");
}

// Backend values are numbers or null; anything else is shown as missing.
function num(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") return Number(v);
  return NaN;
}

function fmtScaled(v, scale, digits, unit) {
  const n = num(v) / scale;
  return Number.isFinite(n) ? `${n.toFixed(digits)} ${unit}` : NA;
}

export function fmtWatts(mw) {
  return fmtScaled(mw, 1000, 1, "W");
}

export function fmtKwh(wh) {
  return fmtScaled(wh, 1000, 2, "kWh");
}

export function fmtVolt(mv) {
  return fmtScaled(mv, 1000, 1, "V");
}

export function fmtTemp(c) {
  const n = num(c);
  if (!Number.isFinite(n)) return NA;
  return `${Number.isInteger(n) ? n : n.toFixed(1)} °C`;
}

/** Whole seconds since `lastSeen` (epoch seconds), like Tuo's card; English in both languages. */
export function fmtAge(lastSeen, now) {
  const seen = num(lastSeen);
  if (!Number.isFinite(seen) || !Number.isFinite(now)) return NA;
  return `${Math.max(0, Math.floor(now - seen))} s ago`;
}

export function fmtRssi(dbm) {
  return fmtScaled(dbm, 1, 0, "dBm");
}

function sum(values) {
  let total = 0;
  let any = false;
  for (const v of values) {
    const n = num(v);
    if (Number.isFinite(n)) {
      total += n;
      any = true;
    }
  }
  return any ? total : NaN;
}

function text(v) {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function onState(v) {
  if (v === 1 || v === true) return true;
  if (v === 0 || v === false) return false;
  return null;
}

export const FW_ACTIONS = ["update", "downgrade", "reflash"];

/** A device's name as the dashboard shows it: the alias, else MTTL and the last six digits of the MAC. */
export function deviceTitle(device) {
  return text(device?.alias) ?? `MTTL ${String(device?.mac ?? "").slice(-6).toUpperCase()}`;
}

/** Selector 1..4 → channel. Other selectors (0 is the whole strip) are ignored. */
function outletChannels(device) {
  const bySel = new Map();
  for (const ch of Array.isArray(device.channels) ? device.channels : []) {
    const n = Number(ch?.selector);
    if (Number.isInteger(n) && n >= 1 && n <= 4 && !bySel.has(n)) bySel.set(n, ch);
  }
  return bySel;
}

export function cardModel(device, { authenticated, unlocked, lang }) {
  const d = device ?? {};
  const admin = authenticated === true;
  const open = admin && unlocked === true;
  const online = d.online === true;
  const mac = String(d.mac ?? "");
  const channels = outletChannels(d);
  const outlets = [1, 2, 3, 4].map((n) => {
    const ch = channels.get(n) ?? {};
    return {
      n,
      name: text(ch.name) ?? t(lang, "outlet", { n }),
      on: onState(ch.on_state),
      // An offline strip's last power reading is stale; energy and temperature stay as last received.
      w: online ? fmtWatts(ch.power_mw) : NA,
      kwh: fmtKwh(ch.energy_lifetime_wh),
      temp: fmtTemp(ch.temperature_c),
    };
  });
  const rows = [...channels.values()];
  const diag = d.diagnostics ?? {};
  const mask = d.childlock_mask;
  const maskKnown = Number.isInteger(mask) && mask >= 0 && mask < 32;
  return {
    mac,
    title: deviceTitle(d),
    firmware: d.firmware_version ?? null,
    online,
    lastSeen: Number.isFinite(num(d.last_seen)) ? num(d.last_seen) : null,
    ip: admin ? text(d.peer_ip) : null,
    totalW: online ? fmtWatts(sum(rows.map((ch) => ch.power_mw))) : NA,
    totalKwh: fmtKwh(sum(rows.map((ch) => ch.energy_lifetime_wh))),
    voltage: diag.voltage_enabled === true ? fmtVolt(diag.voltage_mv) : null,
    rssi: diag.rssi_enabled === true ? fmtRssi(diag.rssi_dbm) : null,
    outlets,
    lock: admin
      ? {
          supported: d.childlock_supported === true,
          synced: d.childlock_synced === true,
          bits: [0, 1, 2, 3, 4].map((bit) => maskKnown && (mask & (1 << bit)) !== 0),
        }
      : null,
    editable: open,
    controls: open && online,
  };
}

/** Values for the top bar and the summary card row. */
export function summaryModel(resp, ha) {
  const devices = Array.isArray(resp?.devices) ? resp.devices : [];
  const admin = resp?.authenticated === true;
  const cfg = admin && ha ? ha : null;
  let mqtt = "unknown";
  if (cfg) mqtt = cfg.enabled !== true ? "off" : cfg.connected === true ? "connected" : "disconnected";
  const host = text(cfg?.host);
  return {
    version: text(resp?.backend_version),
    online: devices.filter((d) => d?.online === true).length,
    total: devices.length,
    admin,
    mqtt,
    broker: host ? (cfg.port ? `${host}:${cfg.port}` : host) : null,
    topic: text(cfg?.topic_prefix),
    discovery: text(cfg?.discovery_prefix),
    fwTarget: admin
      ? (devices.map((d) => text(d?.firmware_target?.version)).find(Boolean) ?? text(resp?.firmware?.target_profile))
      : null,
    fwPending: admin ? devices.filter((d) => FW_ACTIONS.includes(d?.firmware_action)).length : null,
    otaHost: admin ? text(resp?.firmware?.ota_host_ip) : null,
  };
}

// ---- Device window, hidden devices, card notice ----

/** Measurement intervals in seconds that the backend accepts (backend.py ALLOWED_DIAG_POLL), and the one it starts with. */
export const DIAG_INTERVALS = Object.freeze([30, 60, 120, 300, 600, 1800]);
export const DIAG_DEFAULT = 60;

/**
 * What the device window shows for one device. `firmware` is the backend's `firmware` object (`jobs`).
 * `fw` is deviceFirmware(); `pcTool` is true when the strip's firmware is below 1.0.111, so only the PC tool installs
 * firmware on it; `measure` holds the voltage and RSSI settings; `lock` is the Child Lock status of a 1.0.111 strip,
 * else null; `controls` is true while the window's buttons and fields can be used.
 */
export function deviceWindowModel(device, firmware, { unlocked, viewOnly } = {}) {
  const d = device ?? {};
  const diag = d.diagnostics ?? {};
  const interval = num(diag.poll_interval);
  const mask = d.childlock_mask;
  const online = d.online === true;
  return {
    fw: deviceFirmware(device, firmware),
    pcTool: needsPcTool(d.firmware_version),
    measure: {
      voltage: diag.voltage_enabled === true,
      rssi: diag.rssi_enabled === true,
      interval: Number.isFinite(interval) ? interval : DIAG_DEFAULT,
    },
    lock: d.childlock_supported === true
      ? {
          mask: Number.isInteger(mask) && mask >= 0 && mask < 32 ? mask : null,
          synced: d.childlock_synced === true,
          canReread: online && d.childlock_probe_safe === true,
        }
      : null,
    controls: unlocked === true && viewOnly !== true && online,
  };
}

/**
 * The measurement form: what the device holds (`saved`, the `measure` of deviceWindowModel) with the fields
 * the user changed (`edits`, only those keys) laid over it. `dirty` is true while a field differs from the device.
 */
export function measureForm(saved, edits = {}) {
  const form = { voltage: saved.voltage, rssi: saved.rssi, interval: saved.interval };
  let dirty = false;
  for (const key of Object.keys(form)) {
    if (key in edits && edits[key] !== saved[key]) {
      form[key] = edits[key];
      dirty = true;
    }
  }
  return { ...form, dirty };
}

/** Body of `PUT api/devices/<mac>/diagnostics`: the three values together. */
export function measurePayload(form) {
  return { voltage_enabled: form.voltage === true, rssi_enabled: form.rssi === true, poll_interval: Number(form.interval) };
}

/** Child Lock read states of the backend that have a plain text (`lock_err_<state>`). */
const LOCK_ERRORS = new Set(["busy", "channel_quarantined", "device_timeout", "state_unresolved", "invalid_device_mask", "observed_mismatch", "indeterminate"]);

/** Key of the STRINGS entry for a Child Lock read state, or null for a state this page does not know (show the backend's text). */
export function lockErrorKey(state) {
  return LOCK_ERRORS.has(state) ? `lock_err_${state}` : null;
}

/**
 * Keys of the STRINGS entries that warn before an update starts; they take {from} and {to}. A downgrade to a version below
 * 1.0.111 adds that the PC tool is the way back, and a custom file adds its note.
 */
export function otaWarnKeys(action, target) {
  if (!FW_ACTIONS.includes(action)) return [];
  return [
    `dw_ota_${action}`,
    ...(action === "downgrade" && needsPcTool(target?.version) ? ["pc_return"] : []),
    ...(target?.kind === "custom" ? ["dw_ota_custom"] : []),
  ];
}

/**
 * Key of the note under the version lines of the device window, or null. A strip below 1.0.111 gets no update note
 * (`pcTool`): its update cannot start from the app, and dw_port80 says why, so "prepared when the update starts" would mislead.
 */
export function fwNoteKey(fw, target, pcTool) {
  if (fw.target === null) return null;
  if (fw.action === null) return "dw_fw_match";
  if (pcTool) return null;
  if (fw.block === "not_ready") return "dw_not_ready";
  return target?.kind === "official" && target.ready !== true ? "dw_auto_prepare" : null;
}

/** Text of an OTA job state; a state this page does not know is shown as the backend sent it. */
export function jobLabel(lang, state) {
  const key = jobStateKey(state);
  if (key) return t(lang, key);
  return text(state === null || state === undefined ? null : String(state)) ?? NA;
}

/**
 * What the card's notice slot shows: a running OTA job (a strip that reboots during its job is offline, but the
 * job is what matters), else the offline note, else the firmware update link, else nothing. `live` is true for a job.
 */
export function cardNotice(device, firmware, { authenticated, lang }) {
  const fw = authenticated === true ? deviceFirmware(device, firmware) : null;
  if (fw?.active) return { kind: "fw", text: t(lang, "fw_job_notice", { state: jobLabel(lang, fw.job.state) }), live: true };
  if (device?.online !== true) return { kind: "offline", text: "", live: false };
  if (fw?.action) return { kind: "fw", text: t(lang, `fw_${fw.action}`, { v: fw.target ?? NA }), live: false };
  return { kind: "none", text: "", live: false };
}

/**
 * The line a page shows for what is due and for what happened last. `warning` is the warning of a two-press action
 * that is under way (it is due while the action is open); `result` is the outcome of a request. A failure always
 * wins, so a failed permanent delete, whose word box stays open and keeps its warning due, still shows why it failed.
 * Both are `{kind, keys, vars}` or null.
 */
export function pickAlert(warning, result) {
  if (result?.kind === "bad") return result;
  return warning ?? result ?? null;
}

/** The hidden devices' rows: name, MAC, and the energy kept since they were hidden (the sum of their outlets). */
export function hiddenModel(removed) {
  const rows = [];
  for (const d of Array.isArray(removed) ? removed : []) {
    const mac = normalizeMac(d?.mac);
    if (!mac) continue;
    rows.push({
      mac,
      name: deviceTitle({ ...d, mac }),
      macText: fmtMac(mac),
      kwh: fmtKwh(sum([...outletChannels(d).values()].map((ch) => ch.energy_lifetime_wh))),
    });
  }
  return rows;
}

/** True when the typed text is the word that allows deleting a device's history for good. */
export function deleteWordOk(word) {
  return String(word ?? "").trim().toUpperCase() === "DELETE";
}

/** Unit of an interval: whole minutes from 60 s up, else seconds. `key` is a STRINGS entry that takes {n}. */
export function intervalUnit(seconds) {
  return seconds >= 60 && seconds % 60 === 0 ? { key: "unit_min", n: seconds / 60 } : { key: "unit_s", n: seconds };
}

/** Time since `ts` (epoch seconds) in the largest whole unit; English in both languages, like the device cards. */
export function fmtAgo(ts, now) {
  const then = num(ts);
  if (!Number.isFinite(then) || !Number.isFinite(now)) return NA;
  const s = Math.max(0, Math.floor(now - then));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

// The Supervisor serves the Home Assistant sidebar page under /api/hassio_ingress/<token>/.
const INGRESS_PATH = /\/api\/hassio_ingress\//;

/** True for a page opened in the Home Assistant sidebar (Ingress). */
export function isIngressPath(pathname) {
  return INGRESS_PATH.test(String(pathname ?? ""));
}

/**
 * The backend accepts changes only through the sidebar, so a page opened on port 18282 is view only.
 * Demo controls change only the screen and stay available everywhere.
 */
export function isViewOnly({ pathname, demo }) {
  return demo !== true && !isIngressPath(pathname);
}

// The multi-outlet strip's Android app is served on the backend's own port (host 18282 -> app 8080),
// which a phone can reach directly; the Ingress address needs a Home Assistant login.
const APK_PORT = 18282;
const APK_FILE = "provision-android.apk";

/** APK address on a given host: the OTA host address from the backend, else `hostname`. */
export function apkUrlForHost(firmware, hostname) {
  const host = text(firmware?.ota_host_ip) ?? hostname;
  return `http://${host}:${APK_PORT}/${APK_FILE}`;
}

/** Address to put in the QR code. `loc` is window.location or an object with the same fields. */
export function apkUrl(firmware, loc) {
  if (!isIngressPath(loc.pathname)) return new URL(APK_FILE, loc.href).href;
  return apkUrlForHost(firmware, loc.hostname);
}

// ---- Requests, polling and controls ----

/**
 * Headers of every POST and PUT. backend.py refuses a state-changing request without X-MTTL-Request:
 * a page on another site cannot add the header without a CORS preflight, which the backend never allows.
 */
export const SEND_HEADERS = Object.freeze({ "X-MTTL-Request": "1", "Content-Type": "application/json" });

async function jsonOf(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** GET a JSON answer: `{status, body}` (body null when it is not JSON), or `{error}` when the request fails. */
export async function apiGet(url) {
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    return { status: res.status, body: await jsonOf(res) };
  } catch (err) {
    return { error: err?.message ?? String(err) };
  }
}

/**
 * The JSON answer of a POST or PUT; rejects with the backend's error text when the status is not 2xx.
 * The error also carries the backend's `state` (null when it sent none) and the HTTP `status`.
 */
async function answerOf(res) {
  const answer = (await jsonOf(res)) ?? {};
  if (!res.ok) {
    const err = new Error(String(answer.error || answer.reason || answer.state || `HTTP ${res.status}`));
    err.state = typeof answer.state === "string" ? answer.state : null;
    err.status = res.status;
    throw err;
  }
  return answer;
}

/** POST or PUT `body` as JSON. Resolves with the answer; rejects with the backend's error text. */
export async function apiSend(method, url, body = {}) {
  return answerOf(await fetch(url, { method, headers: { ...SEND_HEADERS }, body: JSON.stringify(body), credentials: "same-origin" }));
}

/**
 * POST `bytes` (an ArrayBuffer or Uint8Array) as they are, with the file name in X-Filename.
 * Answers and failures are the same as apiSend. A browser's fetch throws for a header value outside
 * ISO-8859-1, so every character outside printable ASCII in the name becomes "_".
 */
export async function apiSendRaw(url, bytes, filename) {
  const headers = {
    ...SEND_HEADERS,
    "Content-Type": "application/octet-stream",
    "X-Filename": String(filename ?? "").replace(/[^\x20-\x7e]/gu, "_"),
  };
  return answerOf(await fetch(url, { method: "POST", headers, body: bytes, credentials: "same-origin" }));
}

/**
 * The live calls of the device window and the hidden devices. Each resolves with the backend's answer and
 * rejects like apiSend, so a failed Child Lock reread carries the backend's `state` (`busy`, `device_timeout`, ...).
 */
export function createDeviceAdminApi() {
  const dev = (mac) => `api/devices/${mac}`;
  return {
    ota: (mac, profileId) => apiSend("POST", `${dev(mac)}/ota`, { profile_id: profileId }),
    diagnostics: (mac, body) => apiSend("PUT", `${dev(mac)}/diagnostics`, body),
    rereadLock: (mac) => apiSend("POST", `${dev(mac)}/childlock/refresh`),
    restore: (mac) => apiSend("POST", `${dev(mac)}/restore`),
    purge: (mac) => apiSend("POST", `${dev(mac)}/delete`),
  };
}

/**
 * Next poll state after reading `api/devices`. `state` is `{devices, authenticated, stale, resp}`;
 * `result` is `{status, body}` or `{error}`. A 200 answer replaces everything; anything else keeps
 * the last devices on screen and marks them stale.
 */
export function reducePoll(state, result) {
  const body = result?.status === 200 ? result.body : null;
  if (!body || typeof body !== "object") return { ...state, stale: true };
  return {
    devices: Array.isArray(body.devices) ? body.devices : [],
    authenticated: body.authenticated === true,
    stale: false,
    resp: body,
  };
}

/**
 * Poll state with one device replaced by a fresh `api/devices/<mac>` answer, or dropped when
 * `device` is null or hidden. A device that is not in the list is not added; the next poll adds it.
 */
export function withDevice(state, mac, device) {
  const gone = !device || device.removed === true;
  const devices = [];
  for (const d of state.devices) {
    if (normalizeMac(d?.mac) !== mac) devices.push(d);
    else if (!gone) devices.push(device);
  }
  return { ...state, devices, resp: state.resp ? { ...state.resp, devices } : state.resp };
}

/** Cards to add and to remove when the device list changes from `prev` to `next` (MAC lists). */
export function diffMacs(prev, next) {
  const before = new Set(prev);
  const after = new Set(next);
  return {
    added: [...after].filter((mac) => !before.has(mac)),
    removed: [...before].filter((mac) => !after.has(mac)),
  };
}

/** Child Lock can change only from a mask read over the current connection (Tuo does the same). */
export function canToggleLock(device) {
  const mask = device?.childlock_mask;
  return device?.childlock_synced === true && Number.isInteger(mask) && mask >= 0 && mask < 32;
}

export function toggleMask(mask, bit, on) {
  return on ? mask | (1 << bit) : mask & ~(1 << bit);
}

/**
 * The device as the screen shows it while requests are out: each pending control
 * (`{kind: "power", n, on}` with n 0 for all, `{kind: "alias", value}`, `{kind: "outletName", n, value}`,
 * `{kind: "lock", mask}`) overrides the last answer. The answer itself is not changed.
 */
export function applyPending(device, ops) {
  if (!ops?.length) return device;
  const d = { ...device, channels: (Array.isArray(device.channels) ? device.channels : []).map((ch) => ({ ...ch })) };
  const channel = (n) => d.channels.find((ch) => Number(ch.selector) === n);
  for (const op of ops) {
    if (op.kind === "power") {
      for (const ch of d.channels) if (op.n === 0 || Number(ch.selector) === op.n) ch.on_state = op.on ? 1 : 0;
    } else if (op.kind === "alias") {
      d.alias = op.value;
    } else if (op.kind === "outletName") {
      const ch = channel(op.n);
      if (ch) ch.name = op.value;
    } else if (op.kind === "lock") {
      d.childlock_mask = op.mask;
    }
  }
  return d;
}

/**
 * What closing a name field does: "save" sends the name, "cancel" closes it without a request,
 * "keep" leaves it open. `how` is "enter", "blur", "escape" or "relock". Enter that ends a Korean
 * IME composition keeps the field open, and nothing is saved once the screen is locked again.
 */
export function nameEditOutcome({ how, composing = false, unlocked, value, current }) {
  if (how === "enter" && composing) return "keep";
  if (how === "enter" || how === "blur") {
    if (unlocked !== true) return "cancel";
    return String(value ?? "").trim() === String(current ?? "").trim() ? "cancel" : "save";
  }
  if (how === "escape" || how === "relock") return "cancel";
  return "keep";
}

// ---- Log page (logview.html) ----

export const LOG_LEVELS = ["DEBUG", "INFO", "WARNING", "ERROR"];
export const LOG_CATEGORIES = ["all", "ota", "wire", "control", "childlock", "ha", "connection", "storage", "other"];
export const LOG_LIMITS = [100, 300, 500, 1000];
const LEVEL_NUMBER = { DEBUG: 10, INFO: 20, WARNING: 30, ERROR: 40, CRITICAL: 50 };

/** Filters for `api/logs`, clamped the way backend.py does it. */
export function logFilters({ level, category, limit }) {
  const lv = String(level ?? "").toUpperCase();
  const n = Number.parseInt(limit, 10);
  return {
    level: LOG_LEVELS.includes(lv) ? lv : "INFO",
    category: LOG_CATEGORIES.includes(category) ? category : "all",
    limit: Number.isFinite(n) ? Math.max(1, Math.min(1000, n)) : 300,
  };
}

/** Query string for `api/logs`. */
export function logQuery(filters) {
  const f = logFilters(filters);
  return new URLSearchParams({ level: f.level, category: f.category, limit: String(f.limit) }).toString();
}

/** Same selection as backend.py UILogHandler.snapshot: minimum level, category, newest `limit` rows. */
export function filterLogs(rows, filters) {
  const f = logFilters(filters);
  const min = LEVEL_NUMBER[f.level];
  const picked = rows.filter((r) => (LEVEL_NUMBER[r.level] ?? 0) >= min && (f.category === "all" || r.category === f.category));
  return picked.slice(-f.limit);
}

/** "YYYY-MM-DD HH:MM:SS.mmm" in the viewer's time zone (or `timeZone`). */
export function fmtLogTime(ts, timeZone) {
  const date = new Date(Number(ts) * 1000);
  if (Number.isNaN(date.getTime())) return NA;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "00";
  const ms = String(date.getUTCMilliseconds()).padStart(3, "0");
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}.${ms}`;
}

/** One row as text, the same layout as Tuo's text view and copy. */
export function logLine(row, timeZone) {
  return `${fmtLogTime(row.ts, timeZone)} ${String(row.level ?? "").padEnd(7)} [${row.category || "other"}] ${row.message ?? ""}`;
}

/**
 * Identity of a log row across reads. backend.py numbers rows from 1 again after every start,
 * so `seq` alone would match a new row to a row of the previous run; the timestamp tells them apart.
 */
export function logRowKey(row) {
  return `${row.seq}|${row.ts}`;
}

/** The text a view shows and "copy" puts on the clipboard. */
export function logText(rows, view, timeZone) {
  if (view === "json") return JSON.stringify(rows, null, 2);
  return rows.map((r) => logLine(r, timeZone)).join("\n");
}

// ---- Demo data (`?demo`). Same keys as an administrator's `api/devices` response. ----

const DEMO_NOW = 1790682546.5;

function demoChannel(mac, selector, name, on, powerMw, tempC, lifetimeWh, seen = DEMO_NOW) {
  return {
    mac,
    selector,
    name,
    on_state: on ? 1 : 0,
    power_mw: powerMw,
    temperature_c: tempC,
    energy_raw_wh: lifetimeWh,
    energy_lifetime_wh: lifetimeWh,
    energy_highwater_wh: lifetimeWh,
    energy_epoch: 0,
    last_seen: seen,
  };
}

function demoTarget() {
  return { profile_id: "official-111", version: "1.0.111", label: "Official 1.0.111", kind: "official", ready: true };
}

/** Fixed-looking hex digits for sample hashes and ids, so the demo does not need a real file. */
export function demoHex(seed, length) {
  let x = 2166136261;
  for (let i = 0; i < seed.length; i++) x = Math.imul(x ^ seed.charCodeAt(i), 16777619) >>> 0; // every character of the seed counts
  let out = "";
  while (out.length < length) {
    x = Math.imul(x ^ (x >>> 15), 2246822519) >>> 0;
    x = Math.imul(x ^ (x >>> 13), 3266489917) >>> 0;
    out += ((x ^ (x >>> 16)) >>> 0).toString(16).padStart(8, "0");
  }
  return out.slice(0, length);
}

function demoProfile(fields) {
  return {
    kind: "official",
    sha256: demoHex(fields.id, 64),
    size: 327944,
    model: "LGU+-TAP-HW002",
    filename: null,
    original_filename: null,
    created_at: DEMO_NOW - 86400 * 40,
    updated_at: DEMO_NOW - 86400 * 40,
    ready: false,
    selected: false,
    ...fields,
  };
}

/** The four firmware files of the demo: three official ones (one prepared) and one custom file. */
function demoProfiles() {
  const custom = demoHex("custom-1.0.112", 64);
  return [
    demoProfile({
      id: "official-111", version: "1.0.111", label: "UP + Child Lock · 1.0.111", sha256: `3f9c1e${demoHex("111", 58)}`,
      filename: "official_1.0.111.fwr", ready: true, selected: true,
    }),
    demoProfile({ id: "official-110", version: "1.0.110", label: "UP · 1.0.110", filename: "official_1.0.110.fwr" }),
    demoProfile({ id: "official-66", version: "1.0.66", label: "LG U+ Stock · 1.0.66", filename: "official_1.0.66.fwr" }),
    demoProfile({
      id: `custom-${custom.slice(0, 16)}`, kind: "custom", version: "1.0.112", label: "사용자 지정 1.0.112", sha256: custom,
      filename: `custom-${custom.slice(0, 16)}.fwr`, original_filename: "lgu-tap-hw002-1.0.112.fwr",
      created_at: DEMO_NOW - 86400 * 5, updated_at: DEMO_NOW - 86400 * 5, ready: true,
    }),
  ];
}

function demoJob(fields) {
  return {
    id: demoHex(`${fields.mac}-${fields.queued_at}`, 32),
    profile_id: "official-111",
    target_version: "1.0.111",
    firmware_sha256: `3f9c1e${demoHex("111", 58)}`,
    detail: null,
    started_at: fields.queued_at + 4,
    completed_at: null,
    ...fields,
  };
}

/**
 * Three jobs: one still running, one finished, one that failed. The running one belongs to a strip that is rebooting
 * into 1.0.111: it is offline and still reports 1.0.66, the version the job started from.
 */
function demoJobs() {
  const garage = "0a1b2c3d4e62";
  const living = "0a1b2c3d4e5f";
  const office = "0a1b2c3d4e60";
  return [
    demoJob({
      mac: garage, from_version: "1.0.66", state: "RECONNECTING", queued_at: DEMO_NOW - 210, updated_at: DEMO_NOW - 8,
      detail: "전송 완료 후 OTA 재부팅/TCP10086 재접속 대기",
    }),
    demoJob({
      mac: office, from_version: "1.0.66", state: "FAILED_DOWNLOAD", queued_at: DEMO_NOW - 3 * 3600, updated_at: DEMO_NOW - 3 * 3600 + 40,
      completed_at: DEMO_NOW - 3 * 3600 + 40, detail: "장치가 /ota.bin을 요청하지 않았습니다",
    }),
    demoJob({
      mac: living, from_version: "1.0.110", state: "SUCCESS", queued_at: DEMO_NOW - 26 * 3600, updated_at: DEMO_NOW - 26 * 3600 + 95,
      completed_at: DEMO_NOW - 26 * 3600 + 95, detail: "목표 버전 1.0.111 확인",
    }),
  ];
}

function demoDevice(fields) {
  const fw = fields.firmware_version;
  const lockable = fw === "1.0.111";
  return {
    mac: fields.mac,
    peer_ip: fields.peer_ip,
    session_id: fields.online ? `demo-${fields.mac.slice(-4)}` : null,
    soft_version: fw,
    firmware_version: fw,
    online: fields.online,
    last_seen: fields.last_seen ?? DEMO_NOW,
    first_seen: DEMO_NOW - 86400 * 30,
    alias: fields.alias,
    removed_at: null,
    removed: false,
    channels: fields.channels,
    diagnostics: {
      voltage_enabled: false,
      rssi_enabled: false,
      poll_interval: 60,
      ...fields.diagnostics,
    },
    childlock_mask: lockable ? fields.childlock_mask : null,
    childlock_supported: lockable,
    childlock_verified: lockable && Number.isInteger(fields.childlock_mask),
    childlock_synced: lockable && fields.online && Number.isInteger(fields.childlock_mask),
    childlock_probe_safe: lockable,
    firmware_target: demoTarget(),
    firmware_current_normalized: fw,
    firmware_build_current: fw === "1.0.111",
    firmware_action: fw === "1.0.111" ? null : "update",
    ota_job: null,
    ota_applied: null,
  };
}

/** A device hidden from the dashboard: its energy history is kept until it is restored or deleted for good. */
function demoHidden() {
  const mac = "0a1b2c3d4e63";
  const away = DEMO_NOW - 86400 * 3;
  return {
    ...demoDevice({
      mac, alias: "Guest Room", firmware_version: "1.0.111", online: false, peer_ip: "192.0.2.25", last_seen: away, childlock_mask: 0,
      channels: [
        demoChannel(mac, 1, "Lamp", false, 0, 23, 12480, away),
        demoChannel(mac, 2, "Fan", false, 0, 23, 3320, away),
        demoChannel(mac, 3, null, false, 0, 22, 0, away),
        demoChannel(mac, 4, null, false, 0, 22, 0, away),
      ],
    }),
    removed: true,
    removed_at: DEMO_NOW - 86400 * 2,
  };
}

export function demoResponse() {
  const a = "0a1b2c3d4e5f";
  const b = "0a1b2c3d4e60";
  const c = "0a1b2c3d4e61";
  const d = "0a1b2c3d4e62";
  const away = DEMO_NOW - 3 * 3600;
  return {
    authenticated: true,
    backend_version: "0.2.11",
    devices: [
      demoDevice({
        mac: a, alias: "Living Room", firmware_version: "1.0.111", online: true, peer_ip: "192.0.2.21",
        childlock_mask: 0b00100,
        diagnostics: { voltage_enabled: true, rssi_enabled: true, voltage_mv: 221400, voltage_updated_at: DEMO_NOW - 20, rssi_dbm: -54, rssi_updated_at: DEMO_NOW - 20 },
        channels: [
          demoChannel(a, 1, "TV", true, 84300, 31, 48210),
          demoChannel(a, 2, "Soundbar", true, 12800, 29, 9340),
          demoChannel(a, 3, null, false, 0, 27, 1275),
          demoChannel(a, 4, "Router", true, 7100, 30, 22480),
        ],
      }),
      demoDevice({
        mac: b, alias: "Office Desk", firmware_version: "1.0.66", online: true, peer_ip: "192.0.2.22",
        channels: [
          demoChannel(b, 1, "Monitor", true, 23600, 30, 15320),
          demoChannel(b, 2, "PC", true, 118400, 33, 96150),
          demoChannel(b, 3, "Desk lamp", false, 0, 28, 2040),
          demoChannel(b, 4, "Charger", false, 0, 27, 610),
        ],
      }),
      demoDevice({
        mac: c, alias: null, firmware_version: "1.0.111", online: true, peer_ip: "192.0.2.23",
        childlock_mask: 0,
        channels: [
          demoChannel(c, 1, "Kettle", false, 0, 26, 30120),
          demoChannel(c, 2, "Toaster", false, 0, 26, 4410),
          demoChannel(c, 3, null, false, 0, 25, 0),
          demoChannel(c, 4, null, false, 0, 25, 0),
        ],
      }),
      demoDevice({
        mac: d, alias: "Garage", firmware_version: "1.0.66", online: false, peer_ip: "192.0.2.24",
        last_seen: away,
        channels: [
          demoChannel(d, 1, "Freezer", true, 61200, 24, 187650, away),
          demoChannel(d, 2, "Heater", false, 0, 22, 35890, away),
          demoChannel(d, 3, null, false, 0, 22, 0, away),
          demoChannel(d, 4, null, false, 0, 22, 0, away),
        ],
      }),
    ],
    removed: [demoHidden()],
    firmware: {
      target_profile: "official-111",
      profiles: demoProfiles(),
      active: null,
      jobs: demoJobs(),
      queue_depth: 0,
      ota_host_ip: "192.0.2.10",
      release: "1.0.111-canonical",
      release_status: "HARDWARE_OTA_BOOT_VERIFIED",
      ota_primary_port: 49217,
      ota_fallback_port: 80,
    },
  };
}

/** Demo answer for `api/ha`. */
export function demoHa() {
  return {
    enabled: true,
    host: "192.0.2.10",
    port: 1883,
    username: "mttl",
    tls: false,
    topic_prefix: "mttl",
    discovery_prefix: "homeassistant",
    birth_topic: "homeassistant/status",
    power_threshold_w: 0.1,
    power_interval_s: 30,
    energy_threshold_wh: 1,
    energy_interval_s: 60,
    password_set: true,
    connected: true,
    last_error: null,
    connected_since: DEMO_NOW - 7200,
  };
}

/** Demo answer for `api/config`. */
export function demoConfig() {
  return {
    version: "0.2.11",
    poll_interval: 15,
    allowed: [10, 15, 30, 60, 120, 300],
    diagnostic_allowed: [30, 60, 120, 300, 600, 1800],
  };
}

// ---- Demo firmware: what the backend does when a target is chosen and an update runs ----
// These functions change the demo data they are given (an `api/devices` body) in place. They never read the
// clock or draw random numbers: the caller passes the time, so the same calls give the same demo.

/**
 * The states a demo job passes through, in order. They are firmware-core's JOB_STATES up to SUCCESS; a test
 * keeps the two in step (firmware-core imports this module, so reading its list while this module loads could
 * run before it is ready).
 */
export const DEMO_JOB_STEPS = Object.freeze([
  "QUEUED", "PREPARING", "COMMAND_SENT", "ACKED", "DOWNLOADING", "TRANSFERRED", "RECONNECTING", "VERIFYING", "SUCCESS",
]);

function versionParts(v) {
  return String(v ?? "").split(".").map((x) => Number.parseInt(x, 10) || 0);
}

/** -1, 0 or 1 when dotted version `a` is older than, the same as or newer than `b` ("1.0.66" is older than "1.0.111"). */
export function compareVersions(a, b) {
  const [x, y] = [versionParts(a), versionParts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

/** The firmware profile of the demo data with this id; throws like the backend when there is none. */
export function demoProfileOf(data, id) {
  const profile = data.firmware.profiles.find((p) => p.id === id);
  if (!profile) throw new Error("firmware profile not found");
  return profile;
}

/**
 * Makes `profileId` the target: marks that profile as selected and gives every device, hidden ones too, the
 * target and the update, downgrade or none that goes with its version. Call it again with the current target
 * after a profile became ready or a device changed version.
 */
export function demoSetTarget(data, profileId) {
  const target = demoProfileOf(data, profileId);
  data.firmware.target_profile = target.id;
  for (const p of data.firmware.profiles) p.selected = p.id === target.id;
  for (const d of [...data.devices, ...data.removed]) {
    const order = compareVersions(d.firmware_version, target.version);
    d.firmware_target = { profile_id: target.id, version: target.version, label: target.label, kind: target.kind, ready: target.ready };
    d.firmware_action = order === 0 ? null : order > 0 ? "downgrade" : "update";
    d.firmware_build_current = order === 0;
  }
}

function demoJobRunning(job) {
  return DEMO_JOB_STEPS.includes(job.state) && job.state !== "SUCCESS";
}

/** The job of the device with this MAC that has not finished yet, or null. */
export function demoRunningJob(data, mac) {
  return data.firmware.jobs.find((j) => j.mac === mac && demoJobRunning(j)) ?? null;
}

/**
 * Queues an update of an online device to `profileId` at time `now`, like `POST api/devices/<mac>/ota`: the new
 * job is first in the list, and a device with a running job gets that job back. The job is marked `demo_live`,
 * which makes demoAdvanceJob move it on; the jobs that came with the demo data stay as they are.
 */
export function demoQueueJob(data, mac, profileId, now) {
  const device = data.devices.find((d) => d.mac === mac);
  if (!device) throw new Error("device not found");
  if (device.online !== true) throw new Error("device offline");
  const target = demoProfileOf(data, profileId);
  const running = demoRunningJob(data, mac);
  if (running) return running;
  const job = {
    id: demoHex(`${mac}-${now}`, 32),
    mac,
    from_version: device.firmware_version,
    profile_id: target.id,
    target_version: target.version,
    firmware_sha256: target.sha256,
    state: "QUEUED",
    detail: null,
    queued_at: now,
    started_at: null,
    updated_at: now,
    completed_at: null,
    demo_live: true,
  };
  data.firmware.jobs.unshift(job);
  return job;
}

/**
 * Moves the oldest running `demo_live` job one state on at time `now`, like the backend's one-at-a-time worker.
 * At SUCCESS the device reports the new version. Returns the job, or null when none is running.
 */
export function demoAdvanceJob(data, now) {
  const live = data.firmware.jobs.filter((j) => j.demo_live === true && demoJobRunning(j));
  live.sort((a, b) => a.queued_at - b.queued_at);
  const job = live[0];
  if (!job) return null;
  job.state = DEMO_JOB_STEPS[DEMO_JOB_STEPS.indexOf(job.state) + 1];
  job.updated_at = now;
  job.started_at ??= now;
  if (job.state === "SUCCESS") {
    job.completed_at = now;
    job.detail = `목표 버전 ${job.target_version} 확인`;
    const device = data.devices.find((d) => d.mac === job.mac);
    if (device) {
      device.firmware_version = job.target_version;
      demoSetTarget(data, data.firmware.target_profile);
    }
  }
  return job;
}

/** Moves the times of the demo jobs and firmware files by `seconds`, so "N s ago" looks like a live backend. */
export function demoShiftFirmwareTimes(data, seconds) {
  for (const job of data.firmware.jobs) {
    for (const key of ["queued_at", "started_at", "updated_at", "completed_at"]) if (typeof job[key] === "number") job[key] += seconds;
  }
  for (const p of data.firmware.profiles) {
    p.created_at += seconds;
    p.updated_at += seconds;
  }
}

// ---- Demo devices: what the backend does for the device window and the hidden devices ----
// Like the firmware functions above, they change the demo data they are given in place and take the time from the caller.

/** The device of the demo data with this MAC (hidden devices are not included); throws like the backend when there is none. */
function demoDeviceOf(data, mac) {
  const device = data.devices.find((d) => d.mac === mac);
  if (!device) throw new Error("device not found");
  return device;
}

/**
 * Stores the three measurement settings like `PUT api/devices/<mac>/diagnostics`; a key left out keeps its value.
 * A measurement that is turned on gets a first value, and one that is turned off loses it, as in the backend.
 */
export function demoSetDiagnostics(data, mac, body, now) {
  const device = demoDeviceOf(data, mac);
  const old = device.diagnostics;
  const voltage = body.voltage_enabled ?? old.voltage_enabled;
  const rssi = body.rssi_enabled ?? old.rssi_enabled;
  const interval = Number(body.poll_interval ?? old.poll_interval);
  if (typeof voltage !== "boolean" || typeof rssi !== "boolean") throw new Error("voltage_enabled/rssi_enabled must be boolean");
  if (!DIAG_INTERVALS.includes(interval)) throw new Error(`diagnostic poll_interval must be one of ${DIAG_INTERVALS.join(",")}`);
  const next = { ...old, voltage_enabled: voltage, rssi_enabled: rssi, poll_interval: interval };
  const seed = Number.parseInt(mac.slice(-2), 16); // a sample value that depends only on the strip
  if (!voltage) {
    delete next.voltage_mv;
    delete next.voltage_updated_at;
  } else if (next.voltage_mv === undefined) {
    next.voltage_mv = 220000 + (seed % 20) * 100;
    next.voltage_updated_at = now;
  }
  if (!rssi) {
    delete next.rssi_dbm;
    delete next.rssi_updated_at;
  } else if (next.rssi_dbm === undefined) {
    next.rssi_dbm = -50 - (seed % 30);
    next.rssi_updated_at = now;
  }
  device.diagnostics = next;
  return { ok: true, diagnostics: { voltage_enabled: voltage, rssi_enabled: rssi, poll_interval: interval } };
}

/** Reads the Child Lock mask again like `POST api/devices/<mac>/childlock/refresh`: the strip is in sync afterwards. */
export function demoRereadLock(data, mac) {
  const device = demoDeviceOf(data, mac);
  if (device.childlock_supported !== true) throw new Error("Child Lock requires firmware 1.0.111");
  if (device.online !== true) throw new Error("device offline");
  if (!Number.isInteger(device.childlock_mask)) device.childlock_mask = 0;
  device.childlock_verified = true;
  device.childlock_synced = true;
  return { ok: true, state: "confirmed", mask: device.childlock_mask };
}

/** Shows a hidden device on the dashboard again, like `POST api/devices/<mac>/restore`. */
export function demoRestore(data, mac) {
  const at = data.removed.findIndex((d) => d.mac === mac);
  if (at === -1) throw new Error("device not found");
  const [device] = data.removed.splice(at, 1);
  const back = { ...device, removed: false, removed_at: null };
  data.devices.push(back);
  return { ok: true, device: back };
}

/** Deletes a hidden device's records for good, like `POST api/devices/<mac>/delete`; the backend only does it for a hidden one. */
export function demoPurge(data, mac) {
  const at = data.removed.findIndex((d) => d.mac === mac);
  if (at === -1) {
    if (data.devices.some((d) => d.mac === mac)) throw new Error("기록 완전 삭제는 먼저 숨긴 장치에서만 할 수 있습니다");
    throw new Error("device not found");
  }
  data.removed.splice(at, 1);
  return { ok: true, deleted: true, mac };
}

const DEMO_LOG_ROWS = [
  ["INFO", "other", "backend version=0.2.11 console_level=INFO ui/file capture=DEBUG"],
  ["INFO", "other", "MTTL UP backend TCP 0.0.0.0:10086 / Web HTTP 0.0.0.0:8080 / OTA HTTP 0.0.0.0:10080 / poll=5s"],
  ["INFO", "ha", "mqtt connected host=192.0.2.10 port=1883"],
  ["INFO", "connection", "connect peer=192.0.2.21"],
  ["DEBUG", "wire", "RX 0a1b2c3d4e5f up:bootinfo:1.0.111"],
  ["INFO", "connection", "identified 0a1b2c3d4e5f peer=192.0.2.21 session=demo-4e5f removed=False"],
  ["INFO", "childlock", "TX childlock mac=0a1b2c3d4e5f wire=up:childlock"],
  ["INFO", "childlock", "RX childlock mac=0a1b2c3d4e5f wire=up:childlock:4"],
  ["INFO", "childlock", "childlock connect sync mac=0a1b2c3d4e5f result={'ok': True, 'mask': 4}"],
  ["INFO", "connection", "connect peer=192.0.2.22"],
  ["INFO", "connection", "identified 0a1b2c3d4e60 peer=192.0.2.22 session=demo-4e60 removed=False"],
  ["INFO", "connection", "connect peer=192.0.2.23"],
  ["INFO", "connection", "identified 0a1b2c3d4e61 peer=192.0.2.23 session=demo-4e61 removed=False"],
  ["DEBUG", "wire", "TX 0a1b2c3d4e5f up:getinfo"],
  ["DEBUG", "wire", "RX 0a1b2c3d4e5f up:getinfo:1:1:84300:31"],
  ["DEBUG", "other", "skip periodic poll; recent GETINFO mac=0a1b2c3d4e60"],
  ["INFO", "control", "control start tx=7 source=web mac=0a1b2c3d4e60 selector=2"],
  ["INFO", "control", "control confirmed tx=7 mac=0a1b2c3d4e60 selector=2 observed=1"],
  ["WARNING", "connection", "getinfo timeout mac=0a1b2c3d4e62; reconnecting to resync"],
  ["WARNING", "connection", "invalidate session mac=0a1b2c3d4e62 id=demo-4e62 reason=getinfo timeout abort=True"],
  ["INFO", "connection", "disconnect mac=0a1b2c3d4e62 peer=192.0.2.24"],
  ["INFO", "ota", "firmware prepared locally pid=official-111 source=stock file=official_1.0.111.fwr sha=3f9c1e"],
  ["INFO", "storage", "verified DB backup reason=firmware_target db_sha=9b2e41 buckets=3"],
  ["WARNING", "control", "control busy tx=8 source=ha mac=0a1b2c3d4e5f selector=3"],
  ["ERROR", "ha", "mqtt connection failed: [Errno 111] Connection refused"],
  ["INFO", "ha", "mqtt connected host=192.0.2.10 port=1883"],
  ["DEBUG", "other", "HTTP GET api/devices 200"],
  ["INFO", "control", "physical relay event mac=0a1b2c3d4e61 selector=1 state=0"],
];

/** Sample rows for `logview.html?demo`, shaped like `api/logs` rows. */
export function demoLogs() {
  return DEMO_LOG_ROWS.map(([level, category, message], i) => ({
    seq: i + 1,
    ts: DEMO_NOW - 600 + i * 17.25,
    level,
    logger: "mttl",
    category,
    message,
    thread: "MainThread",
  }));
}
