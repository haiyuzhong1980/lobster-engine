import 'package:flutter/material.dart';

import 'package:tangping_lobster/theme/app_theme.dart';
import 'package:tangping_lobster/widgets/ai_guide_bot.dart';

/// 龙虾世界 — The lobster's world view.
///
/// This screen will render scenes, live weather, and the animated lobster.
/// Currently a scaffold placeholder.
class WorldScreen extends StatelessWidget {
  const WorldScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Stack(
          fit: StackFit.expand,
          children: [
            Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [AppColors.backgroundDark, Color(0xFF0D3640)],
                ),
              ),
              child: const SafeArea(
                child: Center(
                  child: Text(
                    '龙虾世界',
                    style: TextStyle(
                      color: AppColors.backgroundLight,
                      fontSize: 24,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ),
            // AI引导bot
            const AIGuideBot(),
          ],
        ),
      );
}
