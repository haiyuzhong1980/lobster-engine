import 'package:flutter/material.dart';

import 'package:tangping_lobster/theme/app_theme.dart';

/// Detail view for a specific scene in the lobster world.
class SceneDetailScreen extends StatelessWidget {
  const SceneDetailScreen({super.key, required this.sceneId});

  final String sceneId;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text('Scene: $sceneId')),
        body: Center(
          child: Text(
            '场景详情: $sceneId',
            style: const TextStyle(color: AppColors.backgroundLight),
          ),
        ),
      );
}
