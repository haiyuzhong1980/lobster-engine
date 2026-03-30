import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:tangping_lobster/services/api_service.dart';

@GenerateMocks([Dio])
import 'api_service_test.mocks.dart';

void main() {
  group('ApiException', () {
    test('toString includes status code and message', () {
      const ex = ApiException(statusCode: 404, message: 'Not found', path: '/lobsters/x');
      expect(ex.toString(), contains('404'));
      expect(ex.toString(), contains('Not found'));
      expect(ex.toString(), contains('/lobsters/x'));
    });

    test('toString without path omits bracket section', () {
      const ex = ApiException(statusCode: 500, message: 'Server error');
      expect(ex.toString(), isNot(contains('[')));
    });
  });

  group('ApiService constructor', () {
    test('creates with default base URL', () {
      expect(() => ApiService(), returnsNormally);
    });

    test('creates with custom base URL', () {
      expect(() => ApiService(baseUrl: 'http://10.0.2.2:3000'), returnsNormally);
    });
  });
}
