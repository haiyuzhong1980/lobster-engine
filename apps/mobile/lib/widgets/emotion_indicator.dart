import 'dart:ui';

import 'package:flutter/material.dart';

/// Display metadata for a single emotion state.
@immutable
class _EmotionMeta {
  final String emoji;
  final Color color;
  final String label;
  final String quote;

  const _EmotionMeta({
    required this.emoji,
    required this.color,
    required this.label,
    required this.quote,
  });
}

/// Frosted-glass bottom card that communicates the lobster's current emotional
/// state with an emoji, Chinese label, action description, and a short quote.
///
/// Falls back gracefully when an unknown [emotion] key is passed.
class EmotionIndicator extends StatelessWidget {
  final String emotion;
  final String actionDescription;

  const EmotionIndicator({
    super.key,
    required this.emotion,
    required this.actionDescription,
  });

  // ---------------------------------------------------------------------------
  // Emotion display table
  // ---------------------------------------------------------------------------

  static const Map<String, _EmotionMeta> _display = {
    'happy': _EmotionMeta(
      emoji: '😊',
      color: Color(0xFFFFE66D),
      label: '开心',
      quote: '今天也是快乐的一天~',
    ),
    'sleepy': _EmotionMeta(
      emoji: '😴',
      color: Color(0xFF8D99AE),
      label: '困困',
      quote: '困意袭来，躺平最香…',
    ),
    'curious': _EmotionMeta(
      emoji: '🤔',
      color: Color(0xFF4ECDC4),
      label: '好奇',
      quote: '这是什么？那是什么？',
    ),
    'hungry': _EmotionMeta(
      emoji: '😋',
      color: Color(0xFFE87461),
      label: '饿了',
      quote: '肚子咕咕叫，快给我吃的！',
    ),
    'warm': _EmotionMeta(
      emoji: '🥰',
      color: Color(0xFFFF6B6B),
      label: '温暖',
      quote: '暖洋洋的，被爱包围中。',
    ),
    'proud': _EmotionMeta(
      emoji: '😤',
      color: Color(0xFFFFE66D),
      label: '傲娇',
      quote: '才、才不是因为喜欢你才这样的。',
    ),
    'surprised': _EmotionMeta(
      emoji: '🫨',
      color: Color(0xFF4ECDC4),
      label: '惊讶',
      quote: '嗯？！这也太意外了吧！',
    ),
    'zen': _EmotionMeta(
      emoji: '🧘',
      color: Color(0xFF95E1D3),
      label: '禅定',
      quote: '万物皆空，随遇而安。',
    ),
    'chill': _EmotionMeta(
      emoji: '😌',
      color: Color(0xFF4ECDC4),
      label: '躺平',
      quote: '人生苦短，躺平享乐。',
    ),
    'stressed': _EmotionMeta(
      emoji: '😰',
      color: Color(0xFF8D99AE),
      label: '焦虑',
      quote: '好多事情要做…先躺一会儿。',
    ),
    'lonely': _EmotionMeta(
      emoji: '🥺',
      color: Color(0xFFB9D7EA),
      label: '孤单',
      quote: '好寂寞，有人陪我玩吗？',
    ),
    'focused': _EmotionMeta(
      emoji: '🎯',
      color: Color(0xFFFFE66D),
      label: '专注',
      quote: '全神贯注，心无旁骛。',
    ),
    'excited': _EmotionMeta(
      emoji: '🤩',
      color: Color(0xFFFF6B6B),
      label: '兴奋',
      quote: '哇哦！！太刺激了！！',
    ),
  };

  static const _EmotionMeta _fallback = _EmotionMeta(
    emoji: '😌',
    color: Color(0xFF4ECDC4),
    label: '状态未知',
    quote: '龙虾正在思考人生…',
  );

  static _EmotionMeta _resolve(String key) => _display[key] ?? _fallback;

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final meta = _resolve(emotion);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.12),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: Colors.white.withOpacity(0.22),
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                // Emotion emoji badge
                _EmojiBadge(emoji: meta.emoji, color: meta.color),
                const SizedBox(width: 14),
                // Text column
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _LabelRow(label: meta.label, color: meta.color),
                      const SizedBox(height: 3),
                      _ActionText(text: actionDescription),
                      const SizedBox(height: 5),
                      _QuoteText(text: meta.quote),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Sub-widgets
// ---------------------------------------------------------------------------

class _EmojiBadge extends StatelessWidget {
  final String emoji;
  final Color color;

  const _EmojiBadge({required this.emoji, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 52,
      height: 52,
      decoration: BoxDecoration(
        color: color.withOpacity(0.20),
        shape: BoxShape.circle,
        border: Border.all(color: color.withOpacity(0.45), width: 1.5),
      ),
      alignment: Alignment.center,
      child: Text(emoji, style: const TextStyle(fontSize: 26)),
    );
  }
}

class _LabelRow extends StatelessWidget {
  final String label;
  final Color color;

  const _LabelRow({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 6,
          height: 6,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 6),
        Text(
          label,
          style: TextStyle(
            color: color,
            fontSize: 15,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
          ),
        ),
      ],
    );
  }
}

class _ActionText extends StatelessWidget {
  final String text;

  const _ActionText({required this.text});

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        color: Colors.white,
        fontSize: 13,
        fontWeight: FontWeight.w500,
        letterSpacing: 0.2,
      ),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
    );
  }
}

class _QuoteText extends StatelessWidget {
  final String text;

  const _QuoteText({required this.text});

  @override
  Widget build(BuildContext context) {
    return Text(
      '"$text"',
      style: TextStyle(
        color: Colors.white.withOpacity(0.60),
        fontSize: 11,
        fontStyle: FontStyle.italic,
        height: 1.4,
      ),
      maxLines: 2,
      overflow: TextOverflow.ellipsis,
    );
  }
}
