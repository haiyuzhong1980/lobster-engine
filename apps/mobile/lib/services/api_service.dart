import 'package:dio/dio.dart';

import 'package:tangping_lobster/models/activity.dart';
import 'package:tangping_lobster/models/diary.dart';
import 'package:tangping_lobster/models/emotion_state.dart';
import 'package:tangping_lobster/models/encounter.dart';
import 'package:tangping_lobster/models/lobster_state.dart';
import 'package:tangping_lobster/models/personality_dna.dart';
import 'package:tangping_lobster/models/social_relation.dart';
import 'package:tangping_lobster/models/weather.dart';

/// Response from the personality endpoint.
typedef PersonalityResponse = PersonalityDna;

/// Typed exception thrown when the gateway returns an error body.
class ApiException implements Exception {
  const ApiException({
    required this.statusCode,
    required this.message,
    this.path,
  });

  final int statusCode;
  final String message;
  final String? path;

  @override
  String toString() => 'ApiException($statusCode): $message${path != null ? ' [$path]' : ''}';
}

/// REST client for all Lobster Engine Gateway endpoints.
///
/// Throws [ApiException] on non-2xx responses.
/// Throws [DioException] on transport-level errors (timeout, no connection).
class ApiService {
  ApiService({String? baseUrl})
      : _dio = Dio(
          BaseOptions(
            baseUrl: baseUrl ?? 'http://localhost:3000',
            connectTimeout: const Duration(seconds: 10),
            receiveTimeout: const Duration(seconds: 10),
            headers: {'Content-Type': 'application/json'},
          ),
        ) {
    _dio.interceptors.add(_ErrorInterceptor());
  }

  final Dio _dio;

  // -------------------------------------------------------------------------
  // Auth helpers
  // -------------------------------------------------------------------------

  /// Attach a bearer token to all subsequent requests.
  void setBearerToken(String token) {
    _dio.options.headers['Authorization'] = 'Bearer $token';
  }

  /// Remove the bearer token (e.g. on logout).
  void clearBearerToken() {
    _dio.options.headers.remove('Authorization');
  }

  // -------------------------------------------------------------------------
  // Lobster endpoints
  // -------------------------------------------------------------------------

  /// Register a new lobster with the given [name] and [ownerId].
  Future<LobsterState> registerLobster(
    String name,
    String ownerId,
  ) async {
    final response = await _dio.post<Map<String, Object?>>(
      '/lobsters',
      data: {'name': name, 'ownerId': ownerId},
    );
    return LobsterState.fromJson(_requireData(response));
  }

  /// Fetch the full state of lobster [id].
  Future<LobsterState> getLobsterState(String id) async {
    final response = await _dio.get<Map<String, Object?>>('/lobsters/$id');
    return LobsterState.fromJson(_requireData(response));
  }

  /// Report a detected physical activity for [lobsterId].
  ///
  /// [type] — activity type string (matches [SensorActivityType] enum name).
  /// [confidence] — ML model confidence 0.0–1.0.
  /// [metadata] — optional raw sensor data.
  Future<ActivityResponse> reportActivity(
    String lobsterId,
    String type,
    double confidence, {
    Map<String, Object>? metadata,
  }) async {
    final response = await _dio.post<Map<String, Object?>>(
      '/lobsters/$lobsterId/activity',
      data: {
        'type': type,
        'confidence': confidence,
        if (metadata != null) 'metadata': metadata,
      },
    );
    return ActivityResponse.fromJson(_requireData(response));
  }

  /// Trigger an emotion change on lobster [lobsterId] via [trigger].
  ///
  /// [trigger] — e.g. 'weather_change', 'encounter', 'gift_received'.
  Future<EmotionState> triggerEmotion(
    String lobsterId,
    String trigger,
  ) async {
    final response = await _dio.post<Map<String, Object?>>(
      '/lobsters/$lobsterId/emotion',
      data: {'trigger': trigger},
    );
    return EmotionState.fromJson(_requireData(response));
  }

  /// Fetch the personality DNA for lobster [lobsterId].
  Future<PersonalityResponse> getPersonality(String lobsterId) async {
    final response = await _dio.get<Map<String, Object?>>(
      '/lobsters/$lobsterId/personality',
    );
    return PersonalityDna.fromJson(_requireData(response));
  }

  /// Fetch the most recent diary entry for lobster [lobsterId].
  ///
  /// Returns null if no diary has been generated yet.
  Future<DiaryEntry?> getDiary(String lobsterId) async {
    final response = await _dio.get<Map<String, Object?>>(
      '/lobsters/$lobsterId/diary/latest',
    );
    final data = response.data;
    if (data == null || data.isEmpty) return null;
    return DiaryEntry.fromJson(data);
  }

  /// Fetch diary timeline (paginated) for lobster [lobsterId].
  Future<DiaryTimeline> getDiaryTimeline(
    String lobsterId, {
    int page = 1,
    int limit = 20,
  }) async {
    final response = await _dio.get<Map<String, Object?>>(
      '/lobsters/$lobsterId/diary',
      queryParameters: {'page': page, 'limit': limit},
    );
    return DiaryTimeline.fromJson(_requireData(response));
  }

  // -------------------------------------------------------------------------
  // Weather endpoints
  // -------------------------------------------------------------------------

  /// Fetch current weather and the lobster engine effect for a location.
  Future<WeatherResponse> getWeather(double lat, double lon) async {
    final response = await _dio.get<Map<String, Object?>>(
      '/weather',
      queryParameters: {'lat': lat, 'lon': lon},
    );
    return WeatherResponse.fromJson(_requireData(response));
  }

  // -------------------------------------------------------------------------
  // Encounter endpoints
  // -------------------------------------------------------------------------

  /// Report that lobster [reporterId] encountered [peerId].
  Future<EncounterReportResult> reportEncounter(
    String reporterId,
    String peerId,
    String method, {
    int? rssi,
    String? geoHash,
  }) async {
    final response = await _dio.post<Map<String, Object?>>(
      '/encounters',
      data: {
        'reporterId': reporterId,
        'peerId': peerId,
        'method': method,
        if (rssi != null) 'rssi': rssi,
        if (geoHash != null) 'geoHash': geoHash,
      },
    );
    return EncounterReportResult.fromJson(_requireData(response));
  }

  /// Fetch encounter history for lobster [lobsterId].
  Future<List<EncounterRecord>> getEncounterHistory(
    String lobsterId, {
    int page = 1,
    int limit = 50,
  }) async {
    final response = await _dio.get<List<Object?>>(
      '/lobsters/$lobsterId/encounters',
      queryParameters: {'page': page, 'limit': limit},
    );
    final list = response.data ?? [];
    return list
        .whereType<Map<String, Object?>>()
        .map(EncounterRecord.fromJson)
        .toList();
  }

  // -------------------------------------------------------------------------
  // Social endpoints
  // -------------------------------------------------------------------------

  /// Fetch all social relations for lobster [lobsterId].
  Future<List<SocialRelation>> getRelations(String lobsterId) async {
    final response = await _dio.get<List<Object?>>(
      '/lobsters/$lobsterId/relations',
    );
    final list = response.data ?? [];
    return list
        .whereType<Map<String, Object?>>()
        .map(SocialRelation.fromJson)
        .toList();
  }

  /// Send a gift of [giftType] from [senderId] to [receiverId].
  ///
  /// [cost] is deducted from the sender's shell balance.
  Future<GiftResult> sendGift(
    String senderId,
    String receiverId,
    String giftType,
    int cost,
  ) async {
    final response = await _dio.post<Map<String, Object?>>(
      '/social/gifts',
      data: {
        'senderId': senderId,
        'receiverId': receiverId,
        'giftType': giftType,
        'cost': cost,
      },
    );
    return GiftResult.fromJson(_requireData(response));
  }

  /// Confirm / reciprocate a relation between [lobsterId] and [peerId].
  Future<ConfirmResult> confirmRelation(
    String lobsterId,
    String peerId,
  ) async {
    final response = await _dio.post<Map<String, Object?>>(
      '/lobsters/$lobsterId/relations/confirm',
      data: {'peerId': peerId},
    );
    return ConfirmResult.fromJson(_requireData(response));
  }

  /// Fetch active group effects for a geographic area.
  ///
  /// [geoHash] — optional geohash to filter results to a specific region.
  Future<List<GroupEffect>> getGroups({String? geoHash}) async {
    final response = await _dio.get<List<Object?>>(
      '/social/groups',
      queryParameters: {
        if (geoHash != null) 'geoHash': geoHash,
      },
    );
    final list = response.data ?? [];
    return list
        .whereType<Map<String, Object?>>()
        .map(GroupEffect.fromJson)
        .toList();
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /// Extracts and validates the response body as a non-null map.
  Map<String, Object?> _requireData(Response<Map<String, Object?>> response) {
    final data = response.data;
    if (data == null) {
      throw const ApiException(
        statusCode: 200,
        message: 'Empty response body from server',
      );
    }
    return data;
  }
}

/// Interceptor that converts DioException error responses into [ApiException].
class _ErrorInterceptor extends Interceptor {
  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final response = err.response;
    if (response != null) {
      final body = response.data;
      final message = _extractMessage(body) ?? err.message ?? 'Unknown error';
      handler.reject(
        DioException(
          requestOptions: err.requestOptions,
          error: ApiException(
            statusCode: response.statusCode ?? 0,
            message: message,
            path: err.requestOptions.path,
          ),
          type: err.type,
          response: response,
        ),
      );
      return;
    }
    handler.next(err);
  }

  String? _extractMessage(Object? body) {
    if (body is Map<String, Object?>) {
      final msg = body['message'] ?? body['error'];
      if (msg is String) return msg;
    }
    return null;
  }
}
