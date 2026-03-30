/// A single diary entry authored by the lobster AI engine.
class DiaryEntry {
  const DiaryEntry({
    required this.id,
    required this.lobsterId,
    required this.content,
    this.summary,
    this.dominantEmotion,
    this.highlights = const [],
    required this.entryDate,
    required this.generatedAt,
  });

  /// Unique entry ID.
  final String id;

  /// The lobster this entry belongs to.
  final String lobsterId;

  /// Main prose content of the diary entry.
  final String content;

  /// Short one-line summary (used as list item title).
  final String? summary;

  /// Dominant emotion during the period described.
  final String? dominantEmotion;

  /// Notable events that contributed to this entry.
  final List<String> highlights;

  /// ISO-8601 date this diary entry covers (e.g. '2024-06-15').
  final String entryDate;

  /// ISO-8601 timestamp when this entry was generated.
  final String generatedAt;

  DiaryEntry copyWith({
    String? id,
    String? lobsterId,
    String? content,
    String? summary,
    String? dominantEmotion,
    List<String>? highlights,
    String? entryDate,
    String? generatedAt,
  }) {
    return DiaryEntry(
      id: id ?? this.id,
      lobsterId: lobsterId ?? this.lobsterId,
      content: content ?? this.content,
      summary: summary ?? this.summary,
      dominantEmotion: dominantEmotion ?? this.dominantEmotion,
      highlights: highlights ?? this.highlights,
      entryDate: entryDate ?? this.entryDate,
      generatedAt: generatedAt ?? this.generatedAt,
    );
  }

  factory DiaryEntry.fromJson(Map<String, Object?> json) {
    return DiaryEntry(
      id: json['id'] as String? ?? '',
      lobsterId: json['lobsterId'] as String? ?? '',
      content: json['content'] as String? ?? '',
      summary: json['summary'] as String?,
      dominantEmotion: json['dominantEmotion'] as String?,
      highlights: (json['highlights'] as List?)?.cast<String>() ?? const [],
      entryDate: json['entryDate'] as String? ?? '',
      generatedAt: json['generatedAt'] as String? ?? '',
    );
  }

  Map<String, Object?> toJson() {
    return {
      'id': id,
      'lobsterId': lobsterId,
      'content': content,
      if (summary != null) 'summary': summary,
      if (dominantEmotion != null) 'dominantEmotion': dominantEmotion,
      if (highlights.isNotEmpty) 'highlights': highlights,
      'entryDate': entryDate,
      'generatedAt': generatedAt,
    };
  }

  @override
  bool operator ==(Object other) {
    return other is DiaryEntry &&
        other.id == id &&
        other.lobsterId == lobsterId &&
        other.entryDate == entryDate;
  }

  @override
  int get hashCode => Object.hash(id, lobsterId, entryDate);
}

/// Paginated list of diary entries for a lobster.
class DiaryTimeline {
  const DiaryTimeline({
    required this.entries,
    required this.total,
    required this.hasMore,
  });

  /// All returned entries, newest first.
  final List<DiaryEntry> entries;

  /// Total number of entries ever written for this lobster.
  final int total;

  /// Whether there are more entries available beyond this page.
  final bool hasMore;

  factory DiaryTimeline.fromJson(Map<String, Object?> json) {
    final rawEntries = json['entries'] as List? ?? [];
    return DiaryTimeline(
      entries: rawEntries
          .whereType<Map<dynamic, dynamic>>()
          .map((m) => DiaryEntry.fromJson(m.cast<String, Object?>()))
          .toList(),
      total: (json['total'] as num?)?.toInt() ?? 0,
      hasMore: json['hasMore'] as bool? ?? false,
    );
  }

  Map<String, Object?> toJson() {
    return {
      'entries': entries.map((e) => e.toJson()).toList(),
      'total': total,
      'hasMore': hasMore,
    };
  }
}
