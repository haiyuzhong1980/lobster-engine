import 'package:flutter/material.dart';

import 'package:tangping_lobster/theme/app_theme.dart';

/// Displays the lobster's social relations and bond tiers.
class SocialScreen extends StatelessWidget {
  const SocialScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('社交关系')),
        body: const Center(
          child: Text(
            '龙虾朋友圈',
            style: TextStyle(color: AppColors.backgroundLight),
          ),
        ),
      );
}
