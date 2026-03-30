import 'package:freezed_annotation/freezed_annotation.dart';

part 'diary.freezed.dart';
part 'diary.g.dart';

/// A single diary entry authored by the lobster AI engine.
@freezed
class DiaryEntry with _$DiaryEntry {
  const factory DiaryEntry({
    /// Unique entry ID.
    required String id,

    /// The lobster this entry belongs to.
    required String lobsterId,

    /// Main prose content of the diary entry.
    required String content,

    /// Short one-line summary (used as list item title).
    String? summary,

    /// Dominant emotion during the period described.
    String? dominantEmotion,

    /// Notable events that contributed to this entry.
    @Default([]) List<String> highlights,

    /// ISO-8601 date this diary entry covers (e.g. '2024-06-15').
    required String entryDate,

    /// ISO-8601 timestamp when this entry was generated.
    required String generatedAt,
  }) = _DiaryEntry;

  factory DiaryEntry.fromJson(Map<String, Object?> json) =>
      _$DiaryEntryFromJson(json);
}

/// Paginated list of diary entries for a lobster.
@freezed
class DiaryTimeline with _$DiaryTimeline {
  const factory DiaryTimeline({
    /// All returned entries, newest first.
    required List<DiaryEntry> entries,

    /// Total number of entries ever written for this lobster.
    required int total,

    /// Whether there are more entries available beyond this page.
    required bool hasMore,
  }) = _DiaryTimeline;

  factory DiaryTimeline.fromJson(Map<String, Object?> json) =>
      _$DiaryTimelineFromJson(json);
}
