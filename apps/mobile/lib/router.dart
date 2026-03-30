import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import 'package:tangping_lobster/screens/world/world_screen.dart';
import 'package:tangping_lobster/screens/encounter/encounter_screen.dart';
import 'package:tangping_lobster/screens/profile/profile_screen.dart';
import 'package:tangping_lobster/screens/world/scene_detail_screen.dart';
import 'package:tangping_lobster/screens/encounter/encounter_detail_screen.dart';
import 'package:tangping_lobster/screens/profile/diary_screen.dart';
import 'package:tangping_lobster/screens/profile/personality_screen.dart';
import 'package:tangping_lobster/screens/profile/social_screen.dart';
import 'package:tangping_lobster/widgets/shell/app_shell.dart';

part 'router.g.dart';

/// Route path constants — single source of truth.
abstract final class AppRoutes {
  // Shell tabs
  static const String world = '/world';
  static const String encounter = '/encounter';
  static const String profile = '/profile';

  // World sub-routes
  static const String sceneDetail = '/world/scene/:sceneId';

  // Encounter sub-routes
  static const String encounterDetail = '/encounter/:encounterId';

  // Profile sub-routes
  static const String diary = '/profile/diary';
  static const String personality = '/profile/personality';
  static const String social = '/profile/social';
}

/// Index of each shell tab for the bottom navigation bar.
abstract final class _ShellTabIndex {
  static const int world = 0;
  static const int encounter = 1;
  static const int profile = 2;
}

@riverpod
GoRouter appRouter(AppRouterRef ref) => GoRouter(
      initialLocation: AppRoutes.world,
      debugLogDiagnostics: false,
      routes: [
        StatefulShellRoute.indexedStack(
          builder: (context, state, navigationShell) =>
              AppShell(navigationShell: navigationShell),
          branches: [
            // --- Tab 0: 龙虾世界 ---
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: AppRoutes.world,
                  pageBuilder: (context, state) => const NoTransitionPage(
                    child: WorldScreen(),
                  ),
                  routes: [
                    GoRoute(
                      path: 'scene/:sceneId',
                      pageBuilder: (context, state) {
                        final sceneId =
                            state.pathParameters['sceneId'] ?? '';
                        return MaterialPage(
                          key: state.pageKey,
                          child: SceneDetailScreen(sceneId: sceneId),
                        );
                      },
                    ),
                  ],
                ),
              ],
            ),

            // --- Tab 1: 偶遇广场 ---
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: AppRoutes.encounter,
                  pageBuilder: (context, state) => const NoTransitionPage(
                    child: EncounterScreen(),
                  ),
                  routes: [
                    GoRoute(
                      path: ':encounterId',
                      pageBuilder: (context, state) {
                        final encounterId =
                            state.pathParameters['encounterId'] ?? '';
                        return MaterialPage(
                          key: state.pageKey,
                          child:
                              EncounterDetailScreen(encounterId: encounterId),
                        );
                      },
                    ),
                  ],
                ),
              ],
            ),

            // --- Tab 2: 我的龙虾 ---
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: AppRoutes.profile,
                  pageBuilder: (context, state) => const NoTransitionPage(
                    child: ProfileScreen(),
                  ),
                  routes: [
                    GoRoute(
                      path: 'diary',
                      pageBuilder: (context, state) => MaterialPage(
                        key: state.pageKey,
                        child: const DiaryScreen(),
                      ),
                    ),
                    GoRoute(
                      path: 'personality',
                      pageBuilder: (context, state) => MaterialPage(
                        key: state.pageKey,
                        child: const PersonalityScreen(),
                      ),
                    ),
                    GoRoute(
                      path: 'social',
                      pageBuilder: (context, state) => MaterialPage(
                        key: state.pageKey,
                        child: const SocialScreen(),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ],
    );
