import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:tangping_lobster/router.dart';
import 'package:tangping_lobster/theme/app_theme.dart';

/// Root widget of the 躺平龙虾 app.
///
/// Connects Riverpod state, routing via GoRouter, and the app theme.
class TangpingLobsterApp extends ConsumerWidget {
  const TangpingLobsterApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);

    return MaterialApp.router(
      title: '躺平龙虾',
      debugShowCheckedModeBanner: false,
      theme: buildLightTheme(),
      darkTheme: buildDarkTheme(),
      themeMode: ThemeMode.dark,
      routerConfig: router,
    );
  }
}
