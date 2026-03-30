// ignore_for_file: lines_longer_than_80_chars

/// Pure-Dart geohash encoder.
///
/// Encodes a (latitude, longitude) coordinate pair into a geohash string at a
/// given precision (number of base-32 characters).  Precision 6 covers cells
/// of approximately 1.2 km × 0.6 km — sufficient for GPS-based encounter
/// fallback where we only need city-block granularity.
///
/// Reference: https://en.wikipedia.org/wiki/Geohash
library;

// Base-32 character alphabet defined by the geohash specification.
const String _kBase32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/// Encodes [latitude] and [longitude] into a geohash string.
///
/// [precision] controls the number of output characters:
/// - 1  → ~5000 km × 5000 km
/// - 4  → ~40 km × 20 km
/// - 6  → ~1.2 km × 0.6 km  (default, good for encounter fallback)
/// - 8  → ~38 m × 19 m
/// - 12 → sub-metre
///
/// Throws an [ArgumentError] when [precision] is outside 1–12 or the
/// coordinates are out of the valid WGS-84 range.
String encodeGeohash(
  double latitude,
  double longitude, {
  int precision = 6,
}) {
  if (precision < 1 || precision > 12) {
    throw ArgumentError.value(
      precision,
      'precision',
      'must be between 1 and 12 inclusive',
    );
  }
  if (latitude < -90 || latitude > 90) {
    throw ArgumentError.value(latitude, 'latitude', 'must be in [-90, 90]');
  }
  if (longitude < -180 || longitude > 180) {
    throw ArgumentError.value(
      longitude,
      'longitude',
      'must be in [-180, 180]',
    );
  }

  final buffer = StringBuffer();

  // Interleaved binary encoding: odd bits → longitude, even bits → latitude.
  var minLat = -90.0;
  var maxLat = 90.0;
  var minLon = -180.0;
  var maxLon = 180.0;

  var isLon = true; // start with longitude
  var bits = 0;
  var bitsLeft = 5; // 5 bits per base-32 character

  while (buffer.length < precision) {
    if (isLon) {
      final mid = (minLon + maxLon) / 2;
      if (longitude >= mid) {
        bits = (bits << 1) | 1;
        minLon = mid;
      } else {
        bits = bits << 1;
        maxLon = mid;
      }
    } else {
      final mid = (minLat + maxLat) / 2;
      if (latitude >= mid) {
        bits = (bits << 1) | 1;
        minLat = mid;
      } else {
        bits = bits << 1;
        maxLat = mid;
      }
    }
    isLon = !isLon;
    bitsLeft--;

    if (bitsLeft == 0) {
      buffer.write(_kBase32[bits]);
      bits = 0;
      bitsLeft = 5;
    }
  }

  return buffer.toString();
}

/// Decodes a geohash string into a [GeohashBounds] bounding box.
///
/// Returns the centre latitude/longitude and the error margins of the cell.
///
/// Throws a [FormatException] when [hash] contains characters outside the
/// base-32 alphabet.
GeohashBounds decodeGeohash(String hash) {
  if (hash.isEmpty) {
    throw const FormatException('geohash must not be empty');
  }

  var minLat = -90.0;
  var maxLat = 90.0;
  var minLon = -180.0;
  var maxLon = 180.0;
  var isLon = true;

  for (final char in hash.split('')) {
    final index = _kBase32.indexOf(char);
    if (index == -1) {
      throw FormatException('invalid geohash character: "$char"');
    }
    for (var bit = 4; bit >= 0; bit--) {
      final bitVal = (index >> bit) & 1;
      if (isLon) {
        final mid = (minLon + maxLon) / 2;
        if (bitVal == 1) {
          minLon = mid;
        } else {
          maxLon = mid;
        }
      } else {
        final mid = (minLat + maxLat) / 2;
        if (bitVal == 1) {
          minLat = mid;
        } else {
          maxLat = mid;
        }
      }
      isLon = !isLon;
    }
  }

  return GeohashBounds(
    minLat: minLat,
    maxLat: maxLat,
    minLon: minLon,
    maxLon: maxLon,
  );
}

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

/// The bounding box of a decoded geohash cell plus its centre coordinates.
class GeohashBounds {
  /// Creates a [GeohashBounds].
  const GeohashBounds({
    required this.minLat,
    required this.maxLat,
    required this.minLon,
    required this.maxLon,
  });

  /// Southern boundary of the cell in degrees.
  final double minLat;

  /// Northern boundary of the cell in degrees.
  final double maxLat;

  /// Western boundary of the cell in degrees.
  final double minLon;

  /// Eastern boundary of the cell in degrees.
  final double maxLon;

  /// Latitude of the cell centre.
  double get centreLat => (minLat + maxLat) / 2;

  /// Longitude of the cell centre.
  double get centreLon => (minLon + maxLon) / 2;

  /// Half the height of the cell in degrees (latitude error margin).
  double get latError => (maxLat - minLat) / 2;

  /// Half the width of the cell in degrees (longitude error margin).
  double get lonError => (maxLon - minLon) / 2;

  @override
  String toString() =>
      'GeohashBounds('
      'lat: [$minLat, $maxLat], '
      'lon: [$minLon, $maxLon], '
      'centre: ($centreLat, $centreLon))';
}
