// ignore_for_file: lines_longer_than_80_chars

/// BLE configuration constants for the Tangping Lobster proximity system.
///
/// All UUIDs follow the canonical 8-4-4-4-12 format.
/// The service UUID is derived from the 128-bit base UUID with the vendor
/// identifier `TPLS` (Tangping Lobster Service) encoded in bytes 12–13.
library;

// ---------------------------------------------------------------------------
// Service & characteristic UUIDs
// ---------------------------------------------------------------------------

/// Canonical 128-bit service UUID used in [FlutterBluePlus.startScan] and
/// in BLE advertisements.
///
/// Derived from the Bluetooth SIG base UUID with the ASCII codes for 'tpls'
/// (Tangping Lobster Service) occupying bytes 0–1 (0x7074 = 'tp',
/// 0x6c73 = 'ls').  Any device advertising this UUID is treated as a
/// potential encounter peer.
const String kServiceUuid = '00007074-6c73-1000-8000-00805f9b34fb';

/// Alias kept for external consumers that reference the longer name.
const String kTangpingServiceUuid = kServiceUuid;

/// Characteristic that carries the lobster-id payload (read / notify).
const String kLobsterIdCharacteristicUuid =
    '00007075-6c73-1000-8000-00805f9b34fb';

/// Characteristic that carries the geohash of the broadcaster's last known
/// position (read / notify).  Used as a GPS-based encounter fallback.
const String kGeohashCharacteristicUuid =
    '00007076-6c73-1000-8000-00805f9b34fb';

// ---------------------------------------------------------------------------
// Scanning parameters
// ---------------------------------------------------------------------------

/// How often (in milliseconds) [BleService] refreshes the nearby-lobsters
/// list.  Balances discovery latency against battery usage.
const int kScanWindowMs = 2000;

/// Gap between scan windows in milliseconds.  Duty-cycling at 2 s on /
/// 3 s off gives ~40 % radio utilisation — a good battery/latency trade-off.
const int kScanIntervalMs = 3000;

/// Maximum age of a [NearbyLobster] entry before it is considered stale
/// and pruned from the active map.
const Duration kStaleTimeout = Duration(seconds: 30);

// ---------------------------------------------------------------------------
// Encounter detection thresholds
// ---------------------------------------------------------------------------

/// Minimum continuous dwell time before an encounter is reported to the
/// backend.  Prevents transient walk-bys from generating spurious events.
const Duration kEncounterMinDwell = Duration(seconds: 5);

/// Maximum estimated distance (metres) for an encounter to be counted.
/// Derived from the path-loss model at the [kBleNValue] and typical indoor
/// signal levels.
const double kEncounterMaxDistanceMetres = 50.0;

// ---------------------------------------------------------------------------
// RSSI → distance model parameters
// ---------------------------------------------------------------------------

/// Reference RSSI (dBm) measured at exactly 1 metre from the transmitter
/// in free-space conditions.  Calibrate per hardware if needed.
const int kTxPowerDbm = -59;

/// Path-loss exponent.  2.0 = free space; 2.5–3.0 = typical indoor.
/// Using 2.5 as a conservative default for mixed indoor/outdoor scenarios.
const double kBleNValue = 2.5;

// ---------------------------------------------------------------------------
// Advertising parameters
// ---------------------------------------------------------------------------

/// Advertising interval in milliseconds.  250 ms is the lowest value most
/// Android hosts permit in background mode without requiring a foreground
/// service.
const int kAdvertiseIntervalMs = 250;

/// Maximum length in bytes of the manufacturer-specific data payload.
/// The lobster-id (UUID v4 as hex string, 32 bytes) is truncated or padded
/// to fit within this budget.
const int kManufacturerDataMaxBytes = 20;
