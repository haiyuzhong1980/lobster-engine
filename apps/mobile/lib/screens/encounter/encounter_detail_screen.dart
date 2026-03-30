import 'package:flutter/material.dart';

import 'package:tangping_lobster/theme/app_theme.dart';

/// Detailed view of a single encounter event.
class EncounterDetailScreen extends StatelessWidget {
  const EncounterDetailScreen({super.key, required this.encounterId});

  final String encounterId;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('偶遇详情')),
        body: Center(
          child: Text(
            '偶遇 ID: $encounterId',
            style: const TextStyle(color: AppColors.backgroundLight),
          ),
        ),
      );
}
