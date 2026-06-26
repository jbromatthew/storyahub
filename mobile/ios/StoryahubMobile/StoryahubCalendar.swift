import EventKit
import React
import UIKit

@objc(StoryahubCalendar)
class StoryahubCalendar: NSObject {
  private let store = EKEventStore()
  private let workQueue = DispatchQueue(label: "com.storyahub.calendar", qos: .userInitiated)
  private let storyahubCalendarTitle = "Storyahub"

  @objc static func requiresMainQueueSetup() -> Bool {
    false
  }

  private func finishResolve(_ resolve: @escaping RCTPromiseResolveBlock, _ value: Any) {
    DispatchQueue.main.async { resolve(value) }
  }

  private func finishReject(_ reject: @escaping RCTPromiseRejectBlock, _ code: String, _ message: String, _ error: Error? = nil) {
    DispatchQueue.main.async { reject(code, message, error) }
  }

  private func requestAccess(
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock,
    work: @escaping () -> Void
  ) {
    if #available(iOS 17.0, *) {
      store.requestFullAccessToEvents { granted, error in
        if let error {
          self.finishReject(reject, "calendar_denied", error.localizedDescription, error)
          return
        }
        if !granted {
          self.finishReject(reject, "calendar_denied", "캘린더 접근 권한이 필요합니다")
          return
        }
        self.workQueue.async { work() }
      }
    } else {
      store.requestAccess(to: .event) { granted, error in
        if let error {
          self.finishReject(reject, "calendar_denied", error.localizedDescription, error)
          return
        }
        if !granted {
          self.finishReject(reject, "calendar_denied", "캘린더 접근 권한이 필요합니다")
          return
        }
        self.workQueue.async { work() }
      }
    }
  }

  private func isoDate(_ raw: Any?) -> Date? {
    guard let s = raw as? String, !s.isEmpty else { return nil }
    let fmt = ISO8601DateFormatter()
    fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = fmt.date(from: s) { return d }
    fmt.formatOptions = [.withInternetDateTime]
    return fmt.date(from: s)
  }

  private func isoString(_ date: Date) -> String {
    let fmt = ISO8601DateFormatter()
    fmt.formatOptions = [.withInternetDateTime]
    return fmt.string(from: date)
  }

  private func storyahubMarker(_ id: String) -> String {
    "[storyahub:\(id)]"
  }

  private func parseStoryahubId(_ notes: String?) -> String? {
    guard let notes, let range = notes.range(of: #"\[storyahub:([a-zA-Z0-9]+)\]"#, options: .regularExpression) else {
      return nil
    }
    let token = String(notes[range])
    return token
      .replacingOccurrences(of: "[storyahub:", with: "")
      .replacingOccurrences(of: "]", with: "")
  }

  private func stripStoryahubMarker(_ notes: String?) -> String? {
    guard var notes else { return nil }
    notes = notes.replacingOccurrences(of: #"\[storyahub:[a-zA-Z0-9]+\]"#, with: "", options: .regularExpression)
    let trimmed = notes.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }

  private func appendStoryahubMarker(notes: String?, storyahubId: String) -> String {
    let base = stripStoryahubMarker(notes) ?? ""
    let marker = storyahubMarker(storyahubId)
    if base.isEmpty { return marker }
    return "\(base)\n\(marker)"
  }

  private func storyahubCalendar() throws -> EKCalendar {
    if let existing = store.calendars(for: .event).first(where: { $0.title == storyahubCalendarTitle }) {
      return existing
    }
    let cal = EKCalendar(for: .event, eventStore: store)
    cal.title = storyahubCalendarTitle
    cal.cgColor = UIColor.systemBlue.cgColor
    if let source = store.defaultCalendarForNewEvents?.source ?? store.sources.first(where: { $0.sourceType == .local }) {
      cal.source = source
    } else if let source = store.sources.first {
      cal.source = source
    } else {
      throw NSError(domain: "StoryahubCalendar", code: 1, userInfo: [NSLocalizedDescriptionKey: "캘린더 소스를 찾을 수 없습니다"])
    }
    try store.saveCalendar(cal, commit: true)
    return cal
  }

  private func eventPayload(_ event: EKEvent) -> [String: Any?] {
    [
      "eventKitId": event.eventIdentifier,
      "storyahubId": parseStoryahubId(event.notes),
      "title": event.title ?? "일정",
      "startsAt": isoString(event.startDate),
      "endsAt": isoString(event.endDate),
      "place": event.location,
      "notes": stripStoryahubMarker(event.notes),
      "calendarTitle": event.calendar.title,
    ]
  }

  @objc(fetchEvents:resolve:reject:)
  func fetchEvents(
    _ range: NSDictionary,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    requestAccess(resolve: resolve, reject: reject) {
      guard let from = self.isoDate(range["from"]), let to = self.isoDate(range["to"]) else {
        self.finishReject(reject, "calendar_bad_range", "날짜 범위가 올바르지 않습니다")
        return
      }
      let predicate = self.store.predicateForEvents(withStart: from, end: to, calendars: nil)
      let events = self.store.events(matching: predicate)
      let payload = events.map { self.eventPayload($0) }
      self.finishResolve(resolve, payload)
    }
  }

  @objc(exportEvents:resolve:reject:)
  func exportEvents(
    _ rawEvents: NSArray,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    requestAccess(resolve: resolve, reject: reject) {
      do {
        let calendar = try self.storyahubCalendar()
        var added = 0
        var updated = 0
        var skipped = 0
        var mappings: [[String: String]] = []

        for case let raw as NSDictionary in rawEvents {
          let storyahubId = (raw["id"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
          let title = (raw["title"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "일정"
          guard let startsAt = self.isoDate(raw["startsAt"]) else {
            skipped += 1
            continue
          }
          let endsAt = self.isoDate(raw["endsAt"]) ?? startsAt.addingTimeInterval(3600)
          let place = raw["place"] as? String
          let notes = raw["notes"] as? String
          let eventKitId = raw["eventKitId"] as? String

          var event: EKEvent?
          if let eventKitId, let existing = self.store.event(withIdentifier: eventKitId) {
            event = existing
          } else if !storyahubId.isEmpty {
            let predicate = self.store.predicateForEvents(
              withStart: startsAt.addingTimeInterval(-86400),
              end: endsAt.addingTimeInterval(86400),
              calendars: [calendar]
            )
            event = self.store.events(matching: predicate).first { ev in
              self.parseStoryahubId(ev.notes) == storyahubId
            }
          }

          let isNew = event == nil
          let ekEvent = event ?? EKEvent(eventStore: self.store)
          ekEvent.calendar = calendar
          ekEvent.title = title
          ekEvent.startDate = startsAt
          ekEvent.endDate = endsAt
          ekEvent.location = place
          if !storyahubId.isEmpty {
            ekEvent.notes = self.appendStoryahubMarker(notes: notes, storyahubId: storyahubId)
          } else {
            ekEvent.notes = notes
          }

          try self.store.save(ekEvent, span: .thisEvent, commit: false)
          if isNew { added += 1 } else { updated += 1 }
          if !storyahubId.isEmpty, let newId = ekEvent.eventIdentifier {
            mappings.append(["id": storyahubId, "eventKitId": newId])
          }
        }

        try self.store.commit()
        self.finishResolve(resolve, ["added": added, "updated": updated, "skipped": skipped, "mappings": mappings])
      } catch {
        self.finishReject(reject, "calendar_export_failed", error.localizedDescription, error)
      }
    }
  }
}
