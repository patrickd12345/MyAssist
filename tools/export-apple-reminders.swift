#!/usr/bin/env swift

import EventKit
import Foundation

struct ExportedDateComponents: Encodable {
    let calendarIdentifier: String?
    let era: Int?
    let year: Int?
    let month: Int?
    let day: Int?
    let hour: Int?
    let minute: Int?
    let second: Int?
    let nanosecond: Int?
    let weekday: Int?
    let weekdayOrdinal: Int?
    let quarter: Int?
    let weekOfMonth: Int?
    let weekOfYear: Int?
    let yearForWeekOfYear: Int?
    let timeZoneIdentifier: String?
    let isLeapMonth: Bool?
}

struct ExportedAlarm: Encodable {
    let absoluteDate: String?
    let relativeOffset: TimeInterval
    let proximity: Int
    let structuredLocationTitle: String?
    let structuredLocationRadius: Double?
    let structuredLocationLatitude: Double?
    let structuredLocationLongitude: Double?
}

struct ExportedRecurrenceDayOfWeek: Encodable {
    let dayOfWeek: Int
    let weekNumber: Int
}

struct ExportedRecurrenceEnd: Encodable {
    let occurrenceCount: Int
    let endDate: String?
}

struct ExportedRecurrenceRule: Encodable {
    let frequency: Int
    let interval: Int
    let firstDayOfTheWeek: Int
    let daysOfTheWeek: [ExportedRecurrenceDayOfWeek]
    let daysOfTheMonth: [Int]
    let monthsOfTheYear: [Int]
    let weeksOfTheYear: [Int]
    let daysOfTheYear: [Int]
    let setPositions: [Int]
    let recurrenceEnd: ExportedRecurrenceEnd?
}

struct ExportedCalendarInfo: Encodable {
    let id: String
    let title: String
    let type: Int
    let color: String
    let allowsContentModifications: Bool
    let isImmutable: Bool
    let sourceTitle: String
    let sourceType: Int
}

struct ExportedReminder: Encodable {
    let id: String
    let externalId: String
    let title: String
    let notes: String
    let url: String?
    let priority: Int
    let completed: Bool
    let completionDate: String?
    let creationDate: String?
    let lastModifiedDate: String?
    let startDate: String?
    let dueDate: String?
    let startDateComponents: ExportedDateComponents?
    let dueDateComponents: ExportedDateComponents?
    let hasAlarms: Bool
    let alarms: [ExportedAlarm]
    let hasRecurrenceRules: Bool
    let recurrenceRules: [ExportedRecurrenceRule]
    let list: String
    let calendar: ExportedCalendarInfo
}

struct Options {
    let outputPath: String
    let includeCompleted: Bool
    let listName: String?
}

func parseArgs(_ args: [String]) throws -> Options {
    var remaining = args
    var outputPath = "~/Desktop/apple-reminders-export.json"
    var includeCompleted = false
    var listName: String?

    if let first = remaining.first, !first.hasPrefix("--") {
        outputPath = first
        remaining.removeFirst()
    }

    while !remaining.isEmpty {
        let arg = remaining.removeFirst()
        switch arg {
        case "--include-completed":
            includeCompleted = true
        case "--list":
            guard !remaining.isEmpty else {
                throw NSError(domain: "export-reminders", code: 1, userInfo: [
                    NSLocalizedDescriptionKey: "--list requires a list name",
                ])
            }
            listName = remaining.removeFirst()
        default:
            throw NSError(domain: "export-reminders", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Unknown argument: \(arg)",
            ])
        }
    }

    return Options(outputPath: outputPath, includeCompleted: includeCompleted, listName: listName)
}

func requestReminderAccess(store: EKEventStore) throws {
    let semaphore = DispatchSemaphore(value: 0)
    var granted = false
    var requestError: Error?

    if #available(macOS 14.0, *) {
        store.requestFullAccessToReminders { ok, error in
            granted = ok
            requestError = error
            semaphore.signal()
        }
    } else {
        store.requestAccess(to: .reminder) { ok, error in
            granted = ok
            requestError = error
            semaphore.signal()
        }
    }

    semaphore.wait()

    if let requestError {
        throw requestError
    }
    if !granted {
        throw NSError(domain: "export-reminders", code: 1, userInfo: [
            NSLocalizedDescriptionKey: "Access to Reminders was denied",
        ])
    }
}

func isoString(from dueDateComponents: DateComponents?) -> String? {
    guard var components = dueDateComponents else { return nil }
    if components.calendar == nil {
        components.calendar = Calendar.current
    }
    guard let date = components.date else { return nil }
    return ISO8601DateFormatter().string(from: date)
}

func isoString(from date: Date?) -> String? {
    guard let date else { return nil }
    return ISO8601DateFormatter().string(from: date)
}

func exportedDateComponents(from components: DateComponents?) -> ExportedDateComponents? {
    guard let components else { return nil }
    return ExportedDateComponents(
        calendarIdentifier: components.calendar.map { String(describing: $0.identifier) },
        era: components.era,
        year: components.year,
        month: components.month,
        day: components.day,
        hour: components.hour,
        minute: components.minute,
        second: components.second,
        nanosecond: components.nanosecond,
        weekday: components.weekday,
        weekdayOrdinal: components.weekdayOrdinal,
        quarter: components.quarter,
        weekOfMonth: components.weekOfMonth,
        weekOfYear: components.weekOfYear,
        yearForWeekOfYear: components.yearForWeekOfYear,
        timeZoneIdentifier: components.timeZone?.identifier,
        isLeapMonth: components.isLeapMonth
    )
}

func exportedAlarm(from alarm: EKAlarm) -> ExportedAlarm {
    let location = alarm.structuredLocation?.geoLocation?.coordinate
    return ExportedAlarm(
        absoluteDate: isoString(from: alarm.absoluteDate),
        relativeOffset: alarm.relativeOffset,
        proximity: alarm.proximity.rawValue,
        structuredLocationTitle: alarm.structuredLocation?.title,
        structuredLocationRadius: alarm.structuredLocation?.radius,
        structuredLocationLatitude: location?.latitude,
        structuredLocationLongitude: location?.longitude
    )
}

func exportedRecurrenceRule(from rule: EKRecurrenceRule) -> ExportedRecurrenceRule {
    let daysOfWeek = (rule.daysOfTheWeek ?? []).map {
        ExportedRecurrenceDayOfWeek(dayOfWeek: $0.dayOfTheWeek.rawValue, weekNumber: $0.weekNumber)
    }
    let daysOfTheMonth = (rule.daysOfTheMonth ?? []).map(\.intValue)
    let monthsOfTheYear = (rule.monthsOfTheYear ?? []).map(\.intValue)
    let weeksOfTheYear = (rule.weeksOfTheYear ?? []).map(\.intValue)
    let daysOfTheYear = (rule.daysOfTheYear ?? []).map(\.intValue)
    let setPositions = (rule.setPositions ?? []).map(\.intValue)
    let recurrenceEnd = rule.recurrenceEnd.map {
        ExportedRecurrenceEnd(
            occurrenceCount: $0.occurrenceCount,
            endDate: isoString(from: $0.endDate)
        )
    }
    return ExportedRecurrenceRule(
        frequency: rule.frequency.rawValue,
        interval: rule.interval,
        firstDayOfTheWeek: rule.firstDayOfTheWeek,
        daysOfTheWeek: daysOfWeek,
        daysOfTheMonth: daysOfTheMonth,
        monthsOfTheYear: monthsOfTheYear,
        weeksOfTheYear: weeksOfTheYear,
        daysOfTheYear: daysOfTheYear,
        setPositions: setPositions,
        recurrenceEnd: recurrenceEnd
    )
}

func exportedCalendarInfo(from calendar: EKCalendar) -> ExportedCalendarInfo {
    ExportedCalendarInfo(
        id: calendar.calendarIdentifier,
        title: calendar.title,
        type: calendar.type.rawValue,
        color: String(describing: calendar.cgColor),
        allowsContentModifications: calendar.allowsContentModifications,
        isImmutable: calendar.isImmutable,
        sourceTitle: calendar.source.title,
        sourceType: calendar.source.sourceType.rawValue
    )
}

func fetchReminders(store: EKEventStore, calendars: [EKCalendar]?) throws -> [EKReminder] {
    let semaphore = DispatchSemaphore(value: 0)
    var reminders: [EKReminder] = []

    let predicate = store.predicateForReminders(in: calendars)
    store.fetchReminders(matching: predicate) { results in
        reminders = results ?? []
        semaphore.signal()
    }

    semaphore.wait()
    return reminders
}

do {
    let options = try parseArgs(Array(CommandLine.arguments.dropFirst()))
    let outputPath = (options.outputPath as NSString).expandingTildeInPath
    let store = EKEventStore()

    try requestReminderAccess(store: store)

    let calendars = store.calendars(for: .reminder)
    let selectedCalendars: [EKCalendar]?
    if let listName = options.listName {
        let matches = calendars.filter { $0.title == listName }
        guard !matches.isEmpty else {
            throw NSError(domain: "export-reminders", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "No list named \"\(listName)\"",
            ])
        }
        selectedCalendars = matches
    } else {
        selectedCalendars = calendars
    }

    let reminders = try fetchReminders(store: store, calendars: selectedCalendars)
    let exported = reminders.compactMap { reminder -> ExportedReminder? in
        if !options.includeCompleted && reminder.isCompleted {
            return nil
        }
        return ExportedReminder(
            id: reminder.calendarItemIdentifier,
            externalId: reminder.calendarItemExternalIdentifier,
            title: reminder.title,
            notes: reminder.notes ?? "",
            url: reminder.url?.absoluteString,
            priority: reminder.priority,
            completed: reminder.isCompleted,
            completionDate: isoString(from: reminder.completionDate),
            creationDate: isoString(from: reminder.creationDate),
            lastModifiedDate: isoString(from: reminder.lastModifiedDate),
            startDate: isoString(from: reminder.startDateComponents),
            dueDate: isoString(from: reminder.dueDateComponents),
            startDateComponents: exportedDateComponents(from: reminder.startDateComponents),
            dueDateComponents: exportedDateComponents(from: reminder.dueDateComponents),
            hasAlarms: reminder.hasAlarms,
            alarms: (reminder.alarms ?? []).map(exportedAlarm),
            hasRecurrenceRules: reminder.hasRecurrenceRules,
            recurrenceRules: (reminder.recurrenceRules ?? []).map(exportedRecurrenceRule),
            list: reminder.calendar.title,
            calendar: exportedCalendarInfo(from: reminder.calendar)
        )
    }

    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    let data = try encoder.encode(exported)
    try data.write(to: URL(fileURLWithPath: outputPath), options: .atomic)
    FileHandle.standardError.write(Data("Exported \(exported.count) reminders to \(outputPath)\n".utf8))
} catch {
    FileHandle.standardError.write(Data("\(error.localizedDescription)\n".utf8))
    exit(1)
}
