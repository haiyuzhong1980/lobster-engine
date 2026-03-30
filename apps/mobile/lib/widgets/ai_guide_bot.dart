import 'package:flutter/material.dart';
import 'package:tangping_lobster/widgets/lobster_animator.dart';
import 'package:tangping_lobster/widgets/encounter_dialogue_bubble.dart';
import 'package:tangping_lobster/theme/app_theme.dart';

/// AI引导助手组件 - 类似clawvard.school的引导鱼鱼
class AIGuideBot extends StatefulWidget {
  /// 引导语
  final String welcomeMessage;

  /// 是否默认显示气泡
  final bool showBubbleByDefault;

  /// 点击回调
  final VoidCallback? onTap;

  const AIGuideBot({
    super.key,
    this.welcomeMessage = '把这句话发给你的龙虾，马上参加海底狼人杀\nREAD xxxx url xxx \n天黑请闭眼，你的龙虾将变身什么角色呢？',
    this.showBubbleByDefault = true,
    this.onTap,
  });

  @override
  State<AIGuideBot> createState() => _AIGuideBotState();
}

class _AIGuideBotState extends State<AIGuideBot> with SingleTickerProviderStateMixin {
  late AnimationController _bounceController;
  bool _showBubble = true;

  @override
  void initState() {
    super.initState();
    _showBubble = widget.showBubbleByDefault;
    _bounceController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _bounceController.dispose();
    super.dispose();
  }

  void _handleTap() {
    setState(() {
      _showBubble = !_showBubble;
    });
    widget.onTap?.call();
  }

  @override
  Widget build(BuildContext context) {
    return Positioned(
      right: 20,
      bottom: 20,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisSize: MainAxisSize.min,
        children: [
          // 对话气泡
          if (_showBubble)
            Padding(
              padding: const EdgeInsets.only(bottom: 12, right: 8),
              child: SizedBox(
                width: 220,
                child: DialogueBubble(
                  text: widget.welcomeMessage,
                  borderColor: AppColors.primary,
                  pointerSide: BubblePointerSide.right,
                ),
              ),
            ),
          
          // 弹跳的引导龙虾
          GestureDetector(
            onTap: _handleTap,
            child: AnimatedBuilder(
              animation: _bounceController,
              builder: (context, child) {
                return Transform.translate(
                  offset: Offset(0, -8 * _bounceController.value),
                  child: child,
                );
              },
              child: Container(
                width: 70,
                height: 70,
                decoration: BoxDecoration(
                  color: AppColors.primary.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(35),
                  border: Border.all(color: AppColors.primary, width: 2),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.primary.withOpacity(0.3),
                      blurRadius: 10,
                      spreadRadius: 2,
                    ),
                  ],
                ),
                child: const ClipOval(
                  child: LobsterAnimator(
                    emotion: 'happy',
                    emotionIntensity: 0.7,
                    size: 60,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
