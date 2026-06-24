import AVFoundation
import React
import UIKit

@objc(StoryahubNativeRecorder)
class StoryahubNativeRecorder: NSObject {
  private static var audioRecorder: AVAudioRecorder?
  private static var recordingURL: URL?
  private static var startedAt: Date?
  private static var wasRecordingBeforeInterruption = false
  private static var observersInstalled = false
  private static var backgroundTask: UIBackgroundTaskIdentifier = .invalid

  @objc static func requiresMainQueueSetup() -> Bool {
    true
  }

  @objc static func installObservers() {
    guard !observersInstalled else { return }
    observersInstalled = true

    NotificationCenter.default.addObserver(
      forName: AVAudioSession.interruptionNotification,
      object: AVAudioSession.sharedInstance(),
      queue: .main
    ) { notification in
      handleInterruption(notification)
    }

    NotificationCenter.default.addObserver(
      forName: AVAudioSession.routeChangeNotification,
      object: AVAudioSession.sharedInstance(),
      queue: .main
    ) { _ in
      resumeRecordingIfNeeded()
    }

    NotificationCenter.default.addObserver(
      forName: UIApplication.didEnterBackgroundNotification,
      object: nil,
      queue: .main
    ) { _ in
      resumeRecordingIfNeeded()
    }

    NotificationCenter.default.addObserver(
      forName: UIApplication.willEnterForegroundNotification,
      object: nil,
      queue: .main
    ) { _ in
      resumeRecordingIfNeeded()
    }
  }

  @objc static func keepAliveIfRecording() {
    resumeRecordingIfNeeded()
  }

  private static func handleInterruption(_ notification: Notification) {
    guard
      let info = notification.userInfo,
      let typeValue = info[AVAudioSessionInterruptionTypeKey] as? UInt,
      let type = AVAudioSession.InterruptionType(rawValue: typeValue)
    else { return }

    switch type {
    case .began:
      wasRecordingBeforeInterruption = audioRecorder?.isRecording ?? false
    case .ended:
      let optionsRaw = info[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
      let options = AVAudioSession.InterruptionOptions(rawValue: optionsRaw)
      if wasRecordingBeforeInterruption || options.contains(.shouldResume) {
        resumeRecordingIfNeeded()
      }
      wasRecordingBeforeInterruption = false
    @unknown default:
      break
    }
  }

  @objc static func resumeRecordingIfNeeded() {
    guard recordingURL != nil, startedAt != nil else { return }
    guard let recorder = audioRecorder else { return }
    if recorder.isRecording { return }

    do {
      try configureSession()
      if recorder.record() {
        NSLog("StoryahubNativeRecorder: recording resumed")
      } else {
        NSLog("StoryahubNativeRecorder: record() returned false on resume")
      }
    } catch {
      NSLog("StoryahubNativeRecorder resume failed: \(error.localizedDescription)")
    }
  }

  private static func configureSession() throws {
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(
      .playAndRecord,
      mode: .default,
      options: [.defaultToSpeaker, .allowBluetooth]
    )
    try session.setActive(true)
  }

  private static func beginBackgroundTaskIfNeeded() {
    if backgroundTask != .invalid { return }
    backgroundTask = UIApplication.shared.beginBackgroundTask {
      endBackgroundTask()
    }
  }

  private static func endBackgroundTask() {
    guard backgroundTask != .invalid else { return }
    UIApplication.shared.endBackgroundTask(backgroundTask)
    backgroundTask = .invalid
  }

  @objc func startRecording(
    _ path: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    AVAudioSession.sharedInstance().requestRecordPermission { granted in
      DispatchQueue.main.async {
        guard granted else {
          reject("permission", "마이크 권한이 거부되었습니다", nil)
          return
        }

        do {
          if let existing = Self.audioRecorder, existing.isRecording {
            reject("start", "이미 녹음 중입니다", nil)
            return
          }

          try Self.configureSession()

          let url = URL(fileURLWithPath: path)
          let directory = url.deletingLastPathComponent()
          try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true
          )

          let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44100,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
          ]

          let recorder = try AVAudioRecorder(url: url, settings: settings)
          guard recorder.prepareToRecord() else {
            reject("start", "녹음 준비에 실패했습니다", nil)
            return
          }
          guard recorder.record() else {
            reject("start", "녹음을 시작할 수 없습니다", nil)
            return
          }

          Self.audioRecorder = recorder
          Self.recordingURL = url
          Self.startedAt = Date()
          Self.installObservers()
          Self.beginBackgroundTaskIfNeeded()

          resolve(path)
        } catch {
          reject("start", error.localizedDescription, error)
        }
      }
    }
  }

  @objc func stopRecording(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      guard let recorder = Self.audioRecorder, let url = Self.recordingURL else {
        reject("stop", "녹음이 시작되지 않았습니다", nil)
        return
      }

      recorder.stop()

      let elapsed = recorder.currentTime
      let fallback = Date().timeIntervalSince(Self.startedAt ?? Date())
      let durationSec = max(1, Int(round(elapsed > 0 ? elapsed : fallback)))

      Self.audioRecorder = nil
      Self.recordingURL = nil
      Self.startedAt = nil
      Self.endBackgroundTask()

      try? AVAudioSession.sharedInstance().setActive(
        false,
        options: .notifyOthersOnDeactivation
      )

      resolve([
        "path": url.path,
        "durationSec": durationSec,
      ])
    }
  }

  @objc func cancelRecording(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      Self.audioRecorder?.stop()
      if let url = Self.recordingURL {
        try? FileManager.default.removeItem(at: url)
      }
      Self.audioRecorder = nil
      Self.recordingURL = nil
      Self.startedAt = nil
      Self.endBackgroundTask()
      try? AVAudioSession.sharedInstance().setActive(
        false,
        options: .notifyOthersOnDeactivation
      )
      resolve(true)
    }
  }

  @objc func isRecording(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(Self.audioRecorder?.isRecording ?? false)
  }

  @objc func keepAliveIfRecording(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    Self.resumeRecordingIfNeeded()
    resolve(true)
  }
}
