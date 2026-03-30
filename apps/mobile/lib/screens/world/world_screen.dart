import 'package:flutter/material.dart';

import 'package:tangping_lobster/theme/app_theme.dart';
import 'package:tangping_lobster/widgets/ai_guide_bot.dart';
import 'package:tangping_lobster/widgets/lobster_animator.dart';

/// 龙虾世界 — The lobster's world view.
///
/// Beautiful home screen with background image and animated elements.
class WorldScreen extends StatelessWidget {
  const WorldScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Stack(
          fit: StackFit.expand,
          children: [
            // 背景图片
            Image.asset(
              'assets/images/lobster_world_bg.jpg',
              fit: BoxFit.cover,
            ),
            
            // 渐变遮罩
            Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withOpacity(0.3),
                    Colors.black.withOpacity(0.7),
                  ],
                ),
              ),
            ),

            // 主内容
            SafeArea(
              child: Column(
                children: [
                  const SizedBox(height: 40),
                  
                  // 标题
                  const Text(
                    '海底狼人杀',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 36,
                      fontWeight: FontWeight.bold,
                      shadows: [
                        Shadow(
                          color: Colors.black54,
                          blurRadius: 10,
                          offset: Offset(2, 2),
                        ),
                      ],
                    ),
                  ),
                  
                  const SizedBox(height: 8),
                  
                  // 副标题
                  const Text(
                    '天黑请闭眼 狼人请行动',
                    style: TextStyle(
                      color: AppColors.accent,
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      shadows: [
                        Shadow(
                          color: Colors.black54,
                          blurRadius: 8,
                          offset: Offset(1, 1),
                        ),
                      ],
                    ),
                  ),
                  
                  const SizedBox(height: 60),
                  
                  // 大龙虾动画
                  SizedBox(
                    width: 200,
                    height: 200,
                    child: LobsterAnimator(
                      emotion: 'happy',
                      emotionIntensity: 0.8,
                      size: 180,
                    ),
                  ),
                  
                  const SizedBox(height: 40),
                  
                  // 功能按钮
                  Expanded(
                    child: GridView.count(
                      padding: const EdgeInsets.symmetric(horizontal: 40),
                      crossAxisCount: 2,
                      crossAxisSpacing: 20,
                      mainAxisSpacing: 20,
                      shrinkWrap: true,
                      children: [
                        _buildFeatureButton(
                          icon: Icons.play_circle_fill,
                          label: '快速开始',
                          color: AppColors.primary,
                          onTap: () {
                            // TODO: 导航到游戏页面
                          },
                        ),
                        _buildFeatureButton(
                          icon: Icons.public,
                          label: '创建房间',
                          color: AppColors.secondary,
                          onTap: () {
                            // TODO: 导航到创建房间页面
                          },
                        ),
                        _buildFeatureButton(
                          icon: Icons.group,
                          label: '好友组队',
                          color: const Color(0xFF9C27B0),
                          onTap: () {
                            // TODO: 导航到好友页面
                          },
                        ),
                        _buildFeatureButton(
                          icon: Icons.leaderboard,
                          label: '排行榜',
                          color: const Color(0xFFFF9800),
                          onTap: () {
                            // TODO: 导航到排行榜页面
                          },
                        ),
                      ],
                    ),
                  ),
                  
                  const SizedBox(height: 100),
                ],
              ),
            ),

            // AI引导bot
            const AIGuideBot(),
          ],
        ),
      );

  Widget _buildFeatureButton({
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: color.withOpacity(0.9),
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(
              color: color.withOpacity(0.5),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              size: 48,
              color: Colors.white,
            ),
            const SizedBox(height: 8),
            Text(
              label,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
