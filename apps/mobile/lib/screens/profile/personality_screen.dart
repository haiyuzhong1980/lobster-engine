import 'package:flutter/material.dart';

import 'package:tangping_lobster/theme/app_theme.dart';

/// Displays the lobster's personality DNA and archetype visualisation.
class PersonalityScreen extends StatelessWidget {
  const PersonalityScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('性格基因')),
        body: const Center(
          child: Text(
            '性格 DNA',
            style: TextStyle(color: AppColors.backgroundLight),
          ),
        ),
      );
}
