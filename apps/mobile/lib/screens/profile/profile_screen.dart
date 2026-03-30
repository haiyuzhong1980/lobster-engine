import 'package:flutter/material.dart';

import 'package:tangping_lobster/theme/app_theme.dart';

/// 我的龙虾 — The owner's personal lobster profile and stats.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [AppColors.backgroundDark, Color(0xFF112E33)],
            ),
          ),
          child: const SafeArea(
            child: Center(
              child: Text(
                '我的龙虾',
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
