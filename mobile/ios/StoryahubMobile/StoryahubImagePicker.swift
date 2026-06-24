import AVFoundation
import Photos
import PhotosUI
import React
import UIKit
import UniformTypeIdentifiers

@objc(StoryahubImagePicker)
class StoryahubImagePicker: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate, PHPickerViewControllerDelegate, UIDocumentPickerDelegate {
  private var resolve: RCTPromiseResolveBlock?
  private var reject: RCTPromiseRejectBlock?
  private var picker: UIImagePickerController?
  private var multiResolve: RCTPromiseResolveBlock?
  private var multiReject: RCTPromiseRejectBlock?
  private var docResolve: RCTPromiseResolveBlock?
  private var docReject: RCTPromiseRejectBlock?

  @objc static func requiresMainQueueSetup() -> Bool {
    true
  }

  @objc func pickFromCamera(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      self.presentPicker(sourceType: .camera, resolve: resolve, reject: reject)
    }
  }

  @objc func pickFromLibrary(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      self.presentPicker(sourceType: .photoLibrary, resolve: resolve, reject: reject)
    }
  }

  @objc func pickMultipleFromLibrary(
    _ maxCount: NSNumber,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      self.presentMultiPicker(maxCount: max(1, maxCount.intValue), resolve: resolve, reject: reject)
    }
  }

  @objc func pickDocument(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      self.presentDocumentPicker(resolve: resolve, reject: reject)
    }
  }

  private func presentDocumentPicker(
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    if self.resolve != nil || self.multiResolve != nil || self.docResolve != nil {
      reject("busy", "이미 파일 선택 중입니다", nil)
      return
    }

    guard let presenter = Self.topViewController() else {
      reject("presenter", "화면을 찾을 수 없습니다", nil)
      return
    }

    self.docResolve = resolve
    self.docReject = reject

    let types: [UTType] = [.pdf, .image, .movie, .audio, .spreadsheet, .presentation, .text, .data, .content]
    let picker = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: true)
    picker.allowsMultipleSelection = false
    picker.delegate = self
    presenter.present(picker, animated: true)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    controller.dismiss(animated: true) {
      StoryahubNativeRecorder.keepAliveIfRecording()
      self.docReject?("cancelled", "cancelled", nil)
      self.cleanupDoc()
    }
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    controller.dismiss(animated: true) {
      StoryahubNativeRecorder.keepAliveIfRecording()

      guard let url = urls.first else {
        self.docReject?("cancelled", "cancelled", nil)
        self.cleanupDoc()
        return
      }

      let accessed = url.startAccessingSecurityScopedResource()
      defer {
        if accessed { url.stopAccessingSecurityScopedResource() }
      }

      let filename = url.lastPathComponent.isEmpty ? "document-\(Int(Date().timeIntervalSince1970))" : url.lastPathComponent
      let dest = (NSTemporaryDirectory() as NSString).appendingPathComponent(filename)

      do {
        if FileManager.default.fileExists(atPath: dest) {
          try FileManager.default.removeItem(atPath: dest)
        }
        try FileManager.default.copyItem(at: url, to: URL(fileURLWithPath: dest))
        let mime = Self.mimeForFilename(filename)
        self.docResolve?([
          "path": dest,
          "mime": mime,
          "filename": filename,
        ])
      } catch {
        self.docReject?("save", error.localizedDescription, error)
      }

      self.cleanupDoc()
    }
  }

  private func cleanupDoc() {
    docResolve = nil
    docReject = nil
  }

  private static func mimeForFilename(_ filename: String) -> String {
    let ext = (filename as NSString).pathExtension.lowercased()
    switch ext {
    case "pdf": return "application/pdf"
    case "jpg", "jpeg": return "image/jpeg"
    case "png": return "image/png"
    case "heic": return "image/heic"
    case "webp": return "image/webp"
    case "gif": return "image/gif"
    case "mp4", "m4v": return "video/mp4"
    case "mov": return "video/quicktime"
    case "mp3": return "audio/mpeg"
    case "m4a": return "audio/mp4"
    case "wav": return "audio/wav"
    case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    case "xls": return "application/vnd.ms-excel"
    case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    case "ppt": return "application/vnd.ms-powerpoint"
    case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    case "doc": return "application/msword"
    case "txt": return "text/plain"
    default: return "application/octet-stream"
    }
  }

  private func presentMultiPicker(
    maxCount: Int,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    if self.resolve != nil || self.multiResolve != nil {
      reject("busy", "이미 사진 선택 중입니다", nil)
      return
    }

    guard #available(iOS 14, *) else {
      reject("unavailable", "다중 선택을 지원하지 않는 iOS 버전입니다", nil)
      return
    }

    let openPicker = {
      guard let presenter = Self.topViewController() else {
        reject("presenter", "화면을 찾을 수 없습니다", nil)
        return
      }

      self.multiResolve = resolve
      self.multiReject = reject

      var config = PHPickerConfiguration(photoLibrary: .shared())
      config.filter = .images
      config.selectionLimit = maxCount

      let picker = PHPickerViewController(configuration: config)
      picker.delegate = self
      presenter.present(picker, animated: true)
    }

    let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
    switch status {
    case .authorized, .limited:
      openPicker()
    case .notDetermined:
      PHPhotoLibrary.requestAuthorization(for: .readWrite) { newStatus in
        DispatchQueue.main.async {
          if newStatus == .authorized || newStatus == .limited {
            openPicker()
          } else {
            reject("permission", "사진 접근 권한이 거부되었습니다", nil)
          }
        }
      }
    default:
      reject("permission", "사진 접근 권한이 거부되었습니다", nil)
    }
  }

  @available(iOS 14, *)
  func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    picker.dismiss(animated: true) {
      StoryahubNativeRecorder.keepAliveIfRecording()

      guard let resolve = self.multiResolve else {
        self.cleanupMulti()
        return
      }

      if results.isEmpty {
        self.multiReject?("cancelled", "cancelled", nil)
        self.cleanupMulti()
        return
      }

      let group = DispatchGroup()
      var items: [[String: Any]] = []
      var firstError: Error?
      let lock = NSLock()

      for (index, result) in results.enumerated() {
        group.enter()
        result.itemProvider.loadObject(ofClass: UIImage.self) { object, error in
          defer { group.leave() }

          if let error = error {
            lock.lock()
            if firstError == nil { firstError = error }
            lock.unlock()
            return
          }

          guard let image = object as? UIImage else {
            lock.lock()
            if firstError == nil {
              firstError = NSError(domain: "StoryahubImagePicker", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "사진을 불러올 수 없습니다",
              ])
            }
            lock.unlock()
            return
          }

          let data = Self.jpegData(from: image)
          let filename = "photo-\(Int(Date().timeIntervalSince1970))-\(index).jpg"
          let path = (NSTemporaryDirectory() as NSString).appendingPathComponent(filename)

          do {
            try data.write(to: URL(fileURLWithPath: path))
            lock.lock()
            items.append([
              "path": path,
              "mime": "image/jpeg",
              "filename": filename,
            ])
            lock.unlock()
          } catch {
            lock.lock()
            if firstError == nil { firstError = error }
            lock.unlock()
          }
        }
      }

      group.notify(queue: .main) {
        if items.isEmpty {
          self.multiReject?("image", firstError?.localizedDescription ?? "사진을 불러올 수 없습니다", firstError)
        } else {
          resolve(items)
        }
        self.cleanupMulti()
      }
    }
  }

  private func cleanupMulti() {
    multiResolve = nil
    multiReject = nil
  }

  private func presentPicker(
    sourceType: UIImagePickerController.SourceType,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    if self.resolve != nil {
      reject("busy", "이미 사진 선택 중입니다", nil)
      return
    }

    guard UIImagePickerController.isSourceTypeAvailable(sourceType) else {
      reject("unavailable", "카메라를 사용할 수 없습니다", nil)
      return
    }

    let openPicker = {
      guard let presenter = Self.topViewController() else {
        reject("presenter", "화면을 찾을 수 없습니다", nil)
        return
      }

      self.resolve = resolve
      self.reject = reject

      let picker = UIImagePickerController()
      picker.sourceType = sourceType
      picker.delegate = self
      picker.allowsEditing = false
      if sourceType == .camera {
        picker.cameraDevice = .rear
        picker.cameraCaptureMode = .photo
      }
      self.picker = picker
      presenter.present(picker, animated: true)
    }

    if sourceType == .camera {
      switch AVCaptureDevice.authorizationStatus(for: .video) {
      case .authorized:
        openPicker()
      case .notDetermined:
        AVCaptureDevice.requestAccess(for: .video) { granted in
          DispatchQueue.main.async {
            if granted {
              openPicker()
            } else {
              reject("permission", "카메라 권한이 거부되었습니다", nil)
            }
          }
        }
      default:
        reject("permission", "카메라 권한이 거부되었습니다", nil)
      }
      return
    }

    if #available(iOS 14, *) {
      let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
      switch status {
      case .authorized, .limited:
        openPicker()
      case .notDetermined:
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { newStatus in
          DispatchQueue.main.async {
            if newStatus == .authorized || newStatus == .limited {
              openPicker()
            } else {
              reject("permission", "사진 접근 권한이 거부되었습니다", nil)
            }
          }
        }
      default:
        reject("permission", "사진 접근 권한이 거부되었습니다", nil)
      }
    } else {
      openPicker()
    }
  }

  private static func topViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
    let window = scenes.flatMap { $0.windows }.first { $0.isKeyWindow }
    var root = window?.rootViewController
    while let presented = root?.presentedViewController {
      root = presented
    }
    return root
  }

  func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
    picker.dismiss(animated: true) {
      StoryahubNativeRecorder.keepAliveIfRecording()
      self.reject?("cancelled", "cancelled", nil)
      self.cleanup()
    }
  }

  func imagePickerController(
    _ picker: UIImagePickerController,
    didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
  ) {
    picker.dismiss(animated: true) {
      StoryahubNativeRecorder.keepAliveIfRecording()

      guard let image = info[.originalImage] as? UIImage else {
        self.reject?("image", "사진을 불러올 수 없습니다", nil)
        self.cleanup()
        return
      }

      let data = Self.jpegData(from: image)
      let filename = "photo-\(Int(Date().timeIntervalSince1970)).jpg"
      let path = (NSTemporaryDirectory() as NSString).appendingPathComponent(filename)

      do {
        try data.write(to: URL(fileURLWithPath: path))
        self.resolve?([
          "path": path,
          "mime": "image/jpeg",
          "filename": filename,
        ])
      } catch {
        self.reject?("save", error.localizedDescription, error)
      }

      self.cleanup()
    }
  }

  private func cleanup() {
    resolve = nil
    reject = nil
    picker = nil
  }

  private static func jpegData(
    from image: UIImage,
    maxSide: CGFloat = 2048,
    quality: CGFloat = 0.85
  ) -> Data {
    let size = image.size
    var target = size
    if max(size.width, size.height) > maxSide {
      let scale = maxSide / max(size.width, size.height)
      target = CGSize(width: size.width * scale, height: size.height * scale)
    }
    UIGraphicsBeginImageContextWithOptions(target, true, 1.0)
    image.draw(in: CGRect(origin: .zero, size: target))
    let scaled = UIGraphicsGetImageFromCurrentImageContext()
    UIGraphicsEndImageContext()
    return scaled?.jpegData(compressionQuality: quality) ?? Data()
  }
}
