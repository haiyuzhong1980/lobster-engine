import 'package:flutter/material.dart';

import 'package:tangping_lobster/theme/app_theme.dart';

/// 偶遇广场 — Encounter plaza where nearby lobsters appear.
class EncounterScreen extends StatelessWidget {
  const EncounterScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFF1E6A73), AppColors.backgroundDark],
            ),
          ),
          child: const SafeArea(
            child: Center(
              child: Text(
                '偶遇广场',
                style: TextStyle(
                  color: AppColors.backgroundLight,
                  fontSize: 24,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ),
      );
}
