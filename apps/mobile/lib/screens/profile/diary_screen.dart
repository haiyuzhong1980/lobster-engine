import 'package:flutter/material.dart';

import 'package:tangping_lobster/theme/app_theme.dart';

/// Displays the lobster's AI-generated diary timeline.
class DiaryScreen extends StatelessWidget {
  const DiaryScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('龙虾日记')),
        body: const Center(
          child: Text(
            '日记时光轴',
            style: TextStyle(color: AppColors.backgroundLight),
          ),
        ),
      );
}
